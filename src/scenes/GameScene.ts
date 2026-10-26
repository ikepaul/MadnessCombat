import Phaser from 'phaser';
import { PALETTES, type PaletteId, paletteStage, STAGE_BLOOD, STAGE_PALETTE } from '../data/palettes';
import { TEST_ROOM } from '../data/rooms/testRoom';
import { bindDebugKeys } from '../input/debugKeys';
import { PlayerInput } from '../input/playerInput';
import '../labs/meleeLabs';
import '../labs/movementLabs';
import { getLab, type Lab } from '../labs/registry';
import { CanvasLayer } from '../render/canvasLayer';
import { paintBall, paintCannon } from '../render/canvas/cannonPainter';
import { paintCharacter } from '../render/canvas/characterPainter';
import { paintItem } from '../render/canvas/itemPainter';
import { paintRoom, paintTable } from '../render/canvas/roomPainter';
import { Decals } from '../render/decals';
import { PostFx } from '../render/post';
import { Vfx } from '../render/vfx';
import { lyingAt } from '../anim/skeleton';
import { type Actor, createActor } from '../sim/actor';
import { FixedClock } from '../sim/clock';
import { hasEdges, mergeEdges } from '../sim/command';
import { World } from '../sim/world';

export interface GameSceneData {
  lab?: string;
  palette?: PaletteId;
}

/** Seconds after the player dies before a lab restarts (M3 adds the real room restart). */
const LAB_RESTART_DELAY = 2;

/**
 * Runs the fixed-step world and draws it: baked room layer, baked decal layer (blood),
 * baked corpse layer (frozen bodies), dynamic actor layer sorted far -> near, post FX.
 */
export class GameScene extends Phaser.Scene {
  world!: World;
  clock!: FixedClock;
  paletteId: PaletteId = 'neutral';
  overlay = false;
  lab?: Lab;
  /** Cannon hits on the player since the scene started (dodge labs). */
  cannonHits = 0;
  private roomLayer!: CanvasLayer;
  private decalLayer!: CanvasLayer;
  private corpseLayer!: CanvasLayer;
  private actorLayer!: CanvasLayer;
  private post!: PostFx;
  private vfx!: Vfx;
  private decals!: Decals;
  private input_!: PlayerInput;
  private deadFor = 0;

  constructor() {
    super('game');
  }

  /** Stage 1 (neutral palette) has no blood; 2 and 3 do. */
  get blood(): boolean {
    return STAGE_BLOOD[paletteStage(this.paletteId)];
  }

  create(data: GameSceneData): void {
    this.clock = new FixedClock();
    this.world = new World(TEST_ROOM);
    this.paletteId = data.palette ?? 'neutral';
    this.cannonHits = 0;
    this.deadFor = 0;

    this.lab = data.lab ? getLab(data.lab) : undefined;
    if (this.lab) this.lab.setup(this.world);
    else this.setupTestRoom();

    this.roomLayer = new CanvasLayer(this, 'layer-room', 0);
    this.decalLayer = new CanvasLayer(this, 'layer-decals', 2);
    this.corpseLayer = new CanvasLayer(this, 'layer-corpses', 5);
    this.actorLayer = new CanvasLayer(this, 'layer-actors', 10);
    this.post = new PostFx(this);
    this.vfx = new Vfx(this.world, () => this.blood);
    this.decals = new Decals(this.world, this.decalLayer, () => this.blood);
    this.input_ = new PlayerInput(this);
    this.world.events.on('roomChanged', () => this.bakeRoom());
    this.world.events.on('cannonHit', () => this.cannonHits++);
    // world-persistence-decals: settled bodies are baked once; picking one up re-bakes the rest
    this.world.events.on('corpseFrozen', (e) => {
      const a = this.world.actorById(e.actorId);
      if (a) this.paintCorpse(a);
      this.corpseLayer.markDirty();
    });
    this.world.events.on('corpseThawed', () => this.bakeCorpses());
    this.bakeRoom();

    bindDebugKeys(this, {
      toggleOverlay: () => (this.overlay = !this.overlay),
      toggleSlowMo: () => (this.clock.timeScale = this.clock.timeScale === 1 ? 0.25 : 1),
      togglePause: () => (this.clock.paused = !this.clock.paused),
      stepFrame: () => this.clock.stepOnce(),
      setPalette: (i) => this.setPalette(STAGE_PALETTE[i]),
      togglePost: () => this.post.setEnabled(!this.post.enabled),
      spawnCorpses: () => this.world.spawnCorpses(20),
    });
    this.scene.launch('ui');
  }

  setPalette(id: PaletteId): void {
    this.paletteId = id;
    this.bakeRoom();
  }

  /** Corpses frozen into the baked layer so far. */
  get frozenCorpses(): number {
    return this.world.actors.filter((a) => a.corpse?.phase === 'frozen').length;
  }

  /** Default route: the style-frame room with the player and the M0 cast as dummies. */
  private setupTestRoom(): void {
    const zombie = createActor('zombie', 2.95, 9.85, -1);
    const shooter = createActor('grunt', 1.85, 10.3, -1, { held: 'pistol' });
    const baton = createActor('grunt', -2.9, 8.95, 1, { held: 'baton' });
    const corpse = createActor('grunt', 0.15, 8.25, 1, { dead: true, clip: 'lying', clipT: 1, root: lyingAt(-Math.PI / 2), wounds: [[0.12, -0.84]] });
    const hero = createActor('hero', -0.7, 8.75, 1);
    shooter.pose.aimAt = hero.pos;
    this.world.actors.push(shooter, zombie, baton, corpse, hero);
    this.world.player = hero;
  }

  private bakeRoom(): void {
    this.roomLayer.clear();
    paintRoom(this.roomLayer.ctx, this.world.room, PALETTES[this.paletteId]);
    this.roomLayer.upload();
    this.decals.rebake();
    this.bakeCorpses();
  }

  private paintCorpse(a: Actor): void {
    paintCharacter(this.corpseLayer.ctx, a, PALETTES[this.paletteId], 0, { blood: this.blood });
  }

  /** Repaint every frozen corpse, far to near. */
  private bakeCorpses(): void {
    this.corpseLayer.clear();
    const frozen = this.world.actors.filter((a) => a.corpse?.phase === 'frozen').sort((a, b) => b.pos.z - a.pos.z);
    for (const a of frozen) this.paintCorpse(a);
    this.corpseLayer.upload();
  }

  update(_time: number, delta: number): void {
    // keep an edge latched until a tick actually consumes it
    this.world.command = mergeEdges(this.world.command, this.input_.read());
    const steps = this.clock.advance(delta / 1000, () => {
      this.world.step();
      this.lab?.step?.(this.world);
    });
    if (steps > 0 || hasEdges(this.world.command)) this.input_.consumeEdges();
    this.watchPlayerDeath(delta / 1000);
    this.render();
    this.post.update();
  }

  private watchPlayerDeath(dt: number): void {
    if (!this.lab || this.world.player?.state !== 'dead') return;
    this.deadFor += dt * this.clock.timeScale;
    if (this.deadFor >= LAB_RESTART_DELAY) this.scene.restart({ lab: this.lab.slug, palette: this.paletteId });
  }

  /** Draw actors, items, props, cannons and balls far-to-near, then particles. */
  private render(): void {
    const pal = PALETTES[this.paletteId];
    const ctx = this.actorLayer.ctx;
    const blood = this.blood;
    this.actorLayer.clear();
    this.decals.drawGrowing(ctx);
    const list: { z: number; draw: () => void }[] = [];
    for (const a of this.world.actors) {
      if (a.corpse?.phase === 'frozen') continue;
      // at equal depth the attacker draws in front, so the punching fist is visible
      const bias = a.state === 'attack' ? 0.002 : a.state === 'grabbed' ? -0.001 : 0;
      list.push({ z: a.pos.z - bias, draw: () => paintCharacter(ctx, a, pal, this.world.time, { blood }) });
    }
    for (const it of this.world.items) list.push({ z: it.pos.z, draw: () => paintItem(ctx, it, pal, blood) });
    for (const p of this.world.room.props) list.push({ z: p.z0, draw: () => paintTable(ctx, p, pal) });
    for (const c of this.world.cannons) list.push({ z: c.z, draw: () => paintCannon(ctx, c) });
    for (const b of this.world.balls) list.push({ z: b.z - 0.01, draw: () => paintBall(ctx, b) });
    list.sort((a, b) => b.z - a.z);
    for (const d of list) d.draw();
    this.vfx.draw(ctx);
    this.actorLayer.upload();
    this.decalLayer.flush();
    this.corpseLayer.flush();
  }
}
