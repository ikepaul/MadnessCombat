import Phaser from 'phaser';
import { PALETTES, type PaletteId, paletteStage, STAGE_BLOOD, STAGE_PALETTE } from '../data/palettes';
import { TEST_ROOM } from '../data/rooms/testRoom';
import { bindDebugKeys } from '../input/debugKeys';
import { PlayerInput } from '../input/playerInput';
import '../labs/aiLabs';
import '../labs/gunLabs';
import '../labs/meleeLabs';
import '../labs/throwLabs';
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
import { GunFx } from '../render/gunFx';
import { WEAPON_IDS, WEAPONS } from '../data/weapons';
import { lyingAt } from '../anim/skeleton';
import { type Actor, createActor } from '../sim/actor';
import { FixedClock } from '../sim/clock';
import { hasEdges, mergeEdges } from '../sim/command';
import { WaveDirector } from '../sim/waves';
import { World } from '../sim/world';
import { STAGE1, type StageRoomId } from '../data/stages/stage1';
import { coopLink, type CoopLink } from '../net/link';
import { applySnapshot, type Snapshot, SnapshotWriter } from '../net/snapshot';
import { paintReviveBar, paintReviveCircle } from '../render/canvas/revivePainter';
import { hookWorldAudio } from '../audio/hooks';
import { audio } from '../audio/mixer';
import { MusicSystem } from '../audio/music';
import { FeelDirector } from '../feel/feel';
import { FeelFx } from '../render/feelFx';
import { cycleEffects, saveSettings, SETTINGS } from '../settings';

/** One music system for the game (survives room restarts). */
let music: MusicSystem | undefined;
/** Guest: the host's first snapshot of a new session, applied after the scene restarts. */
let pendingFull: Snapshot | undefined;

export interface GameSceneData {
  lab?: string;
  palette?: PaletteId;
  /** `?room=test`: the style-frame room with the M0 cast (look check). */
  testRoom?: boolean;
  /** Stage route `?stage=1&room=arena&wave=A` (the default). */
  stage?: 1;
  room?: StageRoomId;
  wave?: string;
  /** Co-op (PLAN.md M4b): this laptop hosts the game, or joins as player 2. */
  coop?: 'host' | 'guest';
}

/** Room definitions by id, for the guest (the host's snapshot names the room). */
const ROOMS_BY_ID = Object.fromEntries([TEST_ROOM, ...Object.values(STAGE1.rooms).map((r) => r.room)].map((r) => [r.id, r]));

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
  private gunFx!: GunFx;
  private decals!: Decals;
  private input_!: PlayerInput;
  private deadFor = 0;
  private data_: GameSceneData = {};
  /** Stage route info for the HUD (end card target). */
  stageInfo?: { stage: number; room: string; targetBodyCount: number };
  /** Set when the room's wave script is done: the HUD shows the body-count card. */
  cleared = false;
  /** Which player this laptop controls (0 = single player / host, 1 = co-op guest). */
  localPlayer = 0;
  coop?: 'host' | 'guest';
  private link?: CoopLink;
  private snaps?: SnapshotWriter;
  /** Guest: the host session currently shown. */
  private session?: number;

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
    this.coop = data.coop;
    this.localPlayer = data.coop === 'guest' ? 1 : 0;
    this.link = undefined;
    this.snaps = undefined;
    this.session = undefined;

    this.lab = data.lab ? getLab(data.lab) : undefined;
    if (data.coop === 'guest') this.setupGuest();
    else if (this.lab) {
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
    // casings and magazines that land stay on the floor (baked with the decals)
    this.gunFx = new GunFx(this.world, (d) => this.decals.addDebris(d));
    this.input_ = new PlayerInput(this);
    this.world.events.on('roomChanged', () => this.bakeRoom());
    this.world.events.on('cannonHit', () => this.cannonHits++);
    // world-persistence-decals: settled bodies are baked once; picking one up re-bakes the rest
    this.world.events.on('corpseFrozen', (e) => {
      const a = this.world.actorById(e.actorId);
      if (a && !a.corpse?.gibbed) this.paintCorpse(a);
      this.corpseLayer.markDirty();
    });
    this.world.events.on('corpseThawed', () => this.bakeCorpses());
    this.bakeRoom();
    if (data.coop === 'host') this.startHosting();
    if (data.coop === 'guest' && pendingFull) {
      const first = pendingFull;
      pendingFull = undefined;
      this.applySnap(first);
    }

    // the guest's world is a puppet of the host's: time controls stay with the host
    const host = data.coop !== 'guest';
    bindDebugKeys(this, {
      toggleOverlay: () => (this.overlay = !this.overlay),
      toggleSlowMo: () => { if (host) this.clock.timeScale = this.clock.timeScale === 1 ? 0.25 : 1; },
      togglePause: () => { if (host) this.clock.paused = !this.clock.paused; },
      stepFrame: () => { if (host) this.clock.stepOnce(); },
      setPalette: (i) => this.setPalette(STAGE_PALETTE[i]),
      togglePost: () => this.post.setEnabled(!this.post.enabled),
      spawnCorpses: () => { if (host) this.world.spawnCorpses(20); },
      dropGuns: () => { if (host) this.dropGuns(); },
      cycleEffects: () => cycleEffects(),
      toggleMute: () => {
        SETTINGS.master = SETTINGS.master > 0 ? 0 : 0.8;
        saveSettings();
        audio()?.applySettings();
      },
    });
    // end card: Enter fights the room again
    this.input.keyboard?.on('keydown-ENTER', () => this.cleared && host && this.restart());
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

  /** Debug (L): a random loaded gun at each player's feet. */
  private dropGuns(): void {
    for (const p of this.world.players) {
      const kind = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
      const it = this.world.spawnItem(kind, 'grunt', { x: p.pos.x + p.facing * 0.3, y: 0.6, z: p.pos.z }, { x: 0, y: 1, z: 0 }, 6);
      it.ammo = WEAPONS[kind].mag;
      it.spare = 1;
    }
  }

  /** Restart the room from its start (checkpoint per room; to confirm with the user in M13). */
  restart(): void {
    this.scene.restart({ ...this.data_, palette: this.paletteId });
  }

  /** Stage route: the room, the player(s) in the middle, and the wave script from the chosen wave. */
  private setupStage(data: GameSceneData): void {
    const roomId = data.room && data.room in STAGE1.rooms ? data.room : 'arena';
    const def = STAGE1.rooms[roomId];
    this.world = new World(def.room);
    const coop = data.coop === 'host';
    this.world.addPlayer(createActor('hero', coop ? -0.6 : 0, 9.2, 1));
    if (coop) this.world.addPlayer(createActor('hero', 0.6, 9.2, -1));
    const start = Math.max(0, def.script.waves.findIndex((w) => w.id === (data.wave ?? 'A')));
    this.world.director = new WaveDirector(def.script, start);
    this.stageInfo = { stage: STAGE1.stage, room: roomId, targetBodyCount: STAGE1.targetBodyCount };
  }

  /** Co-op host: player 2's inputs come in, a snapshot of the world goes out every frame. */
  private startHosting(): void {
    const link = (this.link = coopLink('host'));
    const snaps = (this.snaps = new SnapshotWriter(this.world, Date.now()));
    link.onInput = (cmd) => (this.world.commands[1] = mergeEdges(this.world.commands[1], cmd));
    // a (re)joining guest gets the whole room first
    link.onPeer = (connected) => { if (connected) snaps.needFull = true; };
  }

  /** Co-op guest: an empty puppet world until the host's first snapshot arrives. */
  private setupGuest(): void {
    this.world = new World(STAGE1.rooms.arena.room);
    const link = (this.link = coopLink('guest'));
    link.onSnap = (s) => this.applySnap(s);
  }

  /** Guest: show the host's world. A new session (the host restarted the room) restarts this scene. */
  private applySnap(s: Snapshot): void {
    if (s.session !== this.session) {
      if (!s.full) return; // wait for the host's full snapshot of the new session
      if (this.session !== undefined) {
        pendingFull = s;
        this.restart();
        return;
      }
      this.session = s.session;
      const room = ROOMS_BY_ID[s.roomId];
      if (room && room.id !== this.world.room.id) this.world.setRoom(room);
    }
    applySnapshot(this.world, s);
    if (s.full) this.bakeCorpses();
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
    const frozen = this.world.actors.filter((a) => a.corpse?.phase === 'frozen' && !a.corpse.gibbed).sort((a, b) => b.pos.z - a.pos.z);
    for (const a of frozen) this.paintCorpse(a);
    this.corpseLayer.upload();
  }

  update(_time: number, delta: number): void {
    if (this.coop === 'guest') {
      // player 2: send this frame's input to the host, draw the host's world
      this.link?.sendInput(this.input_.read());
      this.input_.consumeEdges();
      this.render();
      this.post.update();
      this.feelFx.update(delta / 1000);
      music?.setIntensity(this.world.actors.filter((a) => a.ai && a.state !== 'dead' && !a.entering).length);
      return;
    }
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
    if (this.snaps) {
      if (this.link?.peer && (steps > 0 || this.snaps.needFull)) this.link.sendSnap(this.snaps.take());
      else if (!this.link?.peer) this.snaps.drop();
    }
    this.feelFx.update(delta / 1000);
    // music intensity follows the enemies actually in the fight
    music?.setIntensity(this.world.actors.filter((a) => a.ai && a.state !== 'dead' && !a.entering).length);
  }

  /** PLAN.md M3: player death -> restart the room. Co-op: once nobody is left standing. */
  private watchPlayerDeath(dt: number): void {
    if (this.world.players.length === 0 || this.world.activePlayers.length > 0) return;
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
    // co-op: a subtle circle on the floor around a downed teammate
    for (const p of this.world.players) if (p.state === 'downed') paintReviveCircle(ctx, p);
    const list: { z: number; draw: () => void }[] = [];
    for (const a of this.world.actors) {
      // gibbed bodies are gone (throw-grenade): only the pieces (VFX) remain
      if (a.corpse?.phase === 'frozen' || a.corpse?.gibbed) continue;
      // at equal depth the attacker draws in front, so the punching fist is visible
      const bias = a.state === 'attack' ? 0.002 : a.state === 'grabbed' ? -0.001 : 0;
      list.push({ z: a.pos.z - bias, draw: () => paintCharacter(ctx, a, pal, this.world.time, { blood, flashes }) });
    }
    for (const it of this.world.items) list.push({ z: it.pos.z, draw: () => paintItem(ctx, it, pal, blood, this.world.time) });
    for (const p of this.world.room.props) list.push({ z: p.z0, draw: () => paintProp(ctx, p, pal) });
    for (const c of this.world.cannons) list.push({ z: c.z, draw: () => paintCannon(ctx, c) });
    for (const b of this.world.balls) list.push({ z: b.z - 0.01, draw: () => paintBall(ctx, b) });
    list.sort((a, b) => b.z - a.z);
    for (const d of list) d.draw();
    for (const p of this.world.players) if (p.state === 'downed') paintReviveBar(ctx, p);
    this.vfx.draw(ctx);
    this.gunFx.draw(ctx);
    this.actorLayer.upload();
    this.decalLayer.flush();
    this.corpseLayer.flush();
  }
}
