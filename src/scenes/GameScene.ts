import Phaser from 'phaser';
import { PALETTES, type PaletteId, paletteStage, STAGE_BLOOD, STAGE_PALETTE } from '../data/palettes';
import { TEST_ROOM } from '../data/rooms/testRoom';
import { bindDebugKeys } from '../input/debugKeys';
import { PlayerInput } from '../input/playerInput';
import '../labs/aiLabs';
import '../labs/meleeLabs';
import '../labs/movementLabs';
import { getLab, type Lab } from '../labs/registry';
import { CanvasLayer } from '../render/canvasLayer';
import { paintBall, paintCannon } from '../render/canvas/cannonPainter';
import { paintCharacter } from '../render/canvas/characterPainter';
import { paintItem } from '../render/canvas/itemPainter';
import { paintDoor, paintProp, paintRoom } from '../render/canvas/roomPainter';
import { Decals } from '../render/decals';
import { PostFx } from '../render/post';
import { Vfx } from '../render/vfx';
import { lyingAt } from '../anim/skeleton';
import { type Actor, createActor } from '../sim/actor';
import { FixedClock } from '../sim/clock';
import { hasEdges, mergeEdges } from '../sim/command';
import { WaveDirector } from '../sim/waves';
import { World } from '../sim/world';
import { hookWorldAudio } from '../audio/hooks';
import { audio } from '../audio/mixer';
import { MusicSystem } from '../audio/music';
import { FeelDirector } from '../feel/feel';
import { FeelFx } from '../render/feelFx';
import { cycleEffects, saveSettings, SETTINGS } from '../settings';

/** One music system for the game (survives room restarts). */
let music: MusicSystem | undefined;
import { STAGE1, type StageRoomId } from '../data/stages/stage1';

export interface GameSceneData {
  lab?: string;
  palette?: PaletteId;
  /** `?room=test`: the style-frame room with the M0 cast (look check). */
  testRoom?: boolean;
  /** Stage route `?stage=1&room=arena&wave=A` (the default). */
  stage?: 1;
  room?: StageRoomId;
  wave?: string;
}

/** Seconds after the player dies before the room restarts (checkpoint per room, PLAN.md M3). */
const RESTART_DELAY = 2;

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
  feelFx!: FeelFx;
  private vfx!: Vfx;
  private decals!: Decals;
  private input_!: PlayerInput;
  private deadFor = 0;
  private data_: GameSceneData = {};
  /** Stage route info for the HUD (end card target). */
  stageInfo?: { stage: number; room: string; targetBodyCount: number };
  /** Set when the room's wave script is done: the HUD shows the body-count card. */
  cleared = false;

  constructor() {
    super('game');
  }

  /** Stage 1 (neutral palette) has no blood; 2 and 3 do. */
  get blood(): boolean {
    return STAGE_BLOOD[paletteStage(this.paletteId)];
  }

  create(data: GameSceneData): void {
    this.data_ = data;
    this.clock = new FixedClock();
    this.paletteId = data.palette ?? 'neutral';
    this.cannonHits = 0;
    this.deadFor = 0;
    this.cleared = false;
    this.stageInfo = undefined;

    this.lab = data.lab ? getLab(data.lab) : undefined;
    if (this.lab) {
      this.world = new World(TEST_ROOM);
      this.lab.setup(this.world);
    } else if (data.testRoom) {
      this.world = new World(TEST_ROOM);
      this.setupTestRoom();
    } else this.setupStage(data);
    // let the last body land before the end card
    this.world.events.on('roomCleared', () => this.time.delayedCall(1500, () => (this.cleared = true)));

    this.roomLayer = new CanvasLayer(this, 'layer-room', 0);
    this.decalLayer = new CanvasLayer(this, 'layer-decals', 2);
    this.corpseLayer = new CanvasLayer(this, 'layer-corpses', 5);
    this.actorLayer = new CanvasLayer(this, 'layer-actors', 10);
    this.post = new PostFx(this, 'layer-actors');
    // feel layer: sim events -> hit-stop, shake, chromatic, kill cam (+ audio through the engine)
    const engine = audio();
    this.feelFx = new FeelFx(this.cameras.main, this.clock, this.post, engine);
    new FeelDirector(this.world, this.feelFx, () => this.clock.tick * this.clock.dt);
    if (engine) {
      engine.warmUp();
      engine.setRoomReverb(this.world.room.outdoor ? 'outdoor' : 'medium');
      hookWorldAudio(this.world, engine);
      music ??= new MusicSystem(engine);
      void music.setRoom(this.world.room.id);
    }
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
      cycleEffects: () => cycleEffects(),
      toggleMute: () => {
        SETTINGS.master = SETTINGS.master > 0 ? 0 : 0.8;
        saveSettings();
        audio()?.applySettings();
      },
    });
    // end card: Enter fights the room again
    this.input.keyboard?.on('keydown-ENTER', () => this.cleared && this.restart());
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

  /** Restart the room from its start (checkpoint per room; to confirm with the user in M13). */
  restart(): void {
    this.scene.restart({ ...this.data_, palette: this.paletteId });
  }

  /** Stage route: the room, the player in the middle, and the wave script from the chosen wave. */
  private setupStage(data: GameSceneData): void {
    const roomId = data.room && data.room in STAGE1.rooms ? data.room : 'arena';
    const def = STAGE1.rooms[roomId];
    this.world = new World(def.room);
    const hero = createActor('hero', 0, 9.2, 1);
    this.world.actors.push(hero);
    this.world.player = hero;
    const start = Math.max(0, def.script.waves.findIndex((w) => w.id === (data.wave ?? 'A')));
    this.world.director = new WaveDirector(def.script, start);
    this.stageInfo = { stage: STAGE1.stage, room: roomId, targetBodyCount: STAGE1.targetBodyCount };
  }

  /** `?room=test`: the style-frame room with the player and the M0 cast as dummies. */
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
    this.feelFx.update(delta / 1000);
    // music intensity follows the enemies actually in the fight
    music?.setIntensity(this.world.actors.filter((a) => a.ai && a.state !== 'dead' && !a.entering).length);
  }

  /** PLAN.md M3: player death -> restart the room. */
  private watchPlayerDeath(dt: number): void {
    if (this.world.player?.state !== 'dead') return;
    this.deadFor += dt * this.clock.timeScale;
    if (this.deadFor >= RESTART_DELAY) this.restart();
  }

  /** Draw actors, items, props, cannons and balls far-to-near, then particles. */
  private render(): void {
    const pal = PALETTES[this.paletteId];
    const ctx = this.actorLayer.ctx;
    const blood = this.blood;
    const flashes = SETTINGS.effects !== 'off';
    this.actorLayer.clear();
    // doors sit in the side walls, behind everything in the room
    this.world.room.doors.forEach((d, i) => paintDoor(ctx, this.world.room, d, this.world.doors[i]?.open ?? 0, pal));
    this.decals.drawGrowing(ctx);
    const list: { z: number; draw: () => void }[] = [];
    for (const a of this.world.actors) {
      if (a.corpse?.phase === 'frozen') continue;
      // at equal depth the attacker draws in front, so the punching fist is visible
      const bias = a.state === 'attack' ? 0.002 : a.state === 'grabbed' ? -0.001 : 0;
      list.push({ z: a.pos.z - bias, draw: () => paintCharacter(ctx, a, pal, this.world.time, { blood, flashes }) });
    }
    for (const it of this.world.items) list.push({ z: it.pos.z, draw: () => paintItem(ctx, it, pal, blood) });
    for (const p of this.world.room.props) list.push({ z: p.z0, draw: () => paintProp(ctx, p, pal) });
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
