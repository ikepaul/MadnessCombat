import Phaser from 'phaser';
import { PALETTES, type PaletteId, STAGE_PALETTE } from '../data/palettes';
import { TEST_ROOM } from '../data/rooms/testRoom';
import { bindDebugKeys } from '../input/debugKeys';
import { PlayerInput } from '../input/playerInput';
import '../labs/movementLabs';
import { getLab, type Lab } from '../labs/registry';
import { CanvasLayer } from '../render/canvasLayer';
import { paintBall, paintCannon } from '../render/canvas/cannonPainter';
import { paintCharacter } from '../render/canvas/characterPainter';
import { paintRoom, paintTable } from '../render/canvas/roomPainter';
import { PostFx } from '../render/post';
import { Vfx } from '../render/vfx';
import { createActor } from '../sim/actor';
import { FixedClock } from '../sim/clock';
import { World } from '../sim/world';

export interface GameSceneData {
  lab?: string;
  palette?: PaletteId;
}

/** Runs the fixed-step world and draws it: baked room layer, dynamic actor layer, post FX. */
export class GameScene extends Phaser.Scene {
  world!: World;
  clock!: FixedClock;
  paletteId: PaletteId = 'neutral';
  overlay = false;
  lab?: Lab;
  /** Cannon hits on the player since the scene started (dodge labs). */
  cannonHits = 0;
  private roomLayer!: CanvasLayer;
  private actorLayer!: CanvasLayer;
  private post!: PostFx;
  private vfx!: Vfx;
  private input_!: PlayerInput;

  constructor() {
    super('game');
  }

  create(data: GameSceneData): void {
    this.clock = new FixedClock();
    this.world = new World(TEST_ROOM);
    this.paletteId = data.palette ?? 'neutral';
    this.cannonHits = 0;

    this.lab = data.lab ? getLab(data.lab) : undefined;
    if (this.lab) this.lab.setup(this.world);
    else this.setupTestRoom();

    this.roomLayer = new CanvasLayer(this, 'layer-room', 0);
    this.actorLayer = new CanvasLayer(this, 'layer-actors', 10);
    this.post = new PostFx(this);
    this.vfx = new Vfx(this.world);
    this.input_ = new PlayerInput(this);
    this.world.events.on('roomChanged', () => this.bakeRoom());
    this.world.events.on('cannonHit', () => this.cannonHits++);
    this.bakeRoom();

    bindDebugKeys(this, {
      toggleOverlay: () => (this.overlay = !this.overlay),
      toggleSlowMo: () => (this.clock.timeScale = this.clock.timeScale === 1 ? 0.25 : 1),
      togglePause: () => (this.clock.paused = !this.clock.paused),
      stepFrame: () => this.clock.stepOnce(),
      setPalette: (i) => this.setPalette(STAGE_PALETTE[i]),
      togglePost: () => this.post.setEnabled(!this.post.enabled),
    });
    this.scene.launch('ui');
  }

  setPalette(id: PaletteId): void {
    this.paletteId = id;
    this.bakeRoom();
  }

  /** Default route: the style-frame room with the player and the M0 cast as scenery. */
  private setupTestRoom(): void {
    const zombie = createActor('zombie', 2.95, 9.85, -1);
    const shooter = createActor('grunt', 1.85, 10.3, -1, { held: 'pistol' });
    const baton = createActor('grunt', -2.9, 8.95, 1, { held: 'baton' });
    const corpse = createActor('grunt', 0.15, 8.25, 1, { lying: true, dead: true });
    const hero = createActor('hero', -0.7, 8.75, 1);
    shooter.pose.aimAt = hero.pos;
    this.world.actors.push(shooter, zombie, baton, corpse, hero);
    this.world.player = hero;
  }

  private bakeRoom(): void {
    this.roomLayer.clear();
    paintRoom(this.roomLayer.ctx, this.world.room, PALETTES[this.paletteId]);
    this.roomLayer.upload();
  }

  update(_time: number, delta: number): void {
    const cmd = this.input_.read();
    // keep an edge latched until a tick actually consumes it
    this.world.command = { ...cmd, jump: this.world.command.jump || cmd.jump, dive: this.world.command.dive || cmd.dive };
    const steps = this.clock.advance(delta / 1000, () => this.world.step());
    if (steps > 0 || this.world.command.jump || this.world.command.dive) this.input_.consumeEdges();
    this.render();
    this.post.update();
  }

  /** Draw actors, props, cannons and balls far-to-near, then particles. */
  private render(): void {
    const pal = PALETTES[this.paletteId];
    const ctx = this.actorLayer.ctx;
    this.actorLayer.clear();
    const list: { z: number; draw: () => void }[] = [];
    for (const a of this.world.actors) list.push({ z: a.pos.z, draw: () => paintCharacter(ctx, a, pal, this.world.time) });
    for (const p of this.world.room.props) list.push({ z: p.z0, draw: () => paintTable(ctx, p, pal) });
    for (const c of this.world.cannons) list.push({ z: c.z, draw: () => paintCannon(ctx, c) });
    for (const b of this.world.balls) list.push({ z: b.z - 0.01, draw: () => paintBall(ctx, b) });
    list.sort((a, b) => b.z - a.z);
    for (const d of list) d.draw();
    this.vfx.draw(ctx);
    this.actorLayer.upload();
  }
}
