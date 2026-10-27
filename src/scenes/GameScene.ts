import { toggleTuningPanel } from '../dev/tuningPanel';
import Phaser from 'phaser';
import { raiseAll } from '../sim/zombies';
import { PALETTES, type PaletteId, paletteStage, STAGE_BLOOD, STAGE_PALETTE } from '../data/palettes';
import { TEST_ROOM } from '../data/rooms/testRoom';
import { bindDebugKeys } from '../input/debugKeys';
import { PlayerInput } from '../input/playerInput';
import '../labs/aiLabs';
import '../labs/bossLabs';
import '../labs/hazardLabs';
import '../labs/enemyLabs';
import '../labs/stage2Labs';
import '../labs/stage3Labs';
import '../labs/gunLabs';
import '../labs/meleeLabs';
import '../labs/throwLabs';
import '../labs/movementLabs';
import '../labs/comboLabs';
import '../labs/qolLabs';
import '../labs/coopLabs';
import '../labs/stage4Labs';
import { getLab, type Lab } from '../labs/registry';
import { CanvasLayer } from '../render/canvasLayer';
import { paintBall, paintCannon } from '../render/canvas/cannonPainter';
import { paintCharacter } from '../render/canvas/characterPainter';
import { paintBoss } from '../render/canvas/bossPainter';
import { paintItem } from '../render/canvas/itemPainter';
import { paintGrenadeMarker } from '../render/canvas/markerPainter';
import { GRENADE } from '../data/melee';
import { lobTarget } from '../sim/melee';
import { pickupPlan } from '../sim/guns';
import { type BotState, newBotState, partnerCommand } from '../dev/partnerBot';
import { paintDoor, paintProp, paintRoom } from '../render/canvas/roomPainter';
import { paintLockShadow, paintLockWall, paintTank } from '../render/canvas/sceneryPainter';
import { TUNING } from '../data/tuning';
import { Decals } from '../render/decals';
import { PostFx } from '../render/post';
import { Vfx } from '../render/vfx';
import { GunFx } from '../render/gunFx';
import { isWeapon, WEAPON_IDS, WEAPONS } from '../data/weapons';
import { lyingAt } from '../anim/skeleton';
import { type Actor, alive, createActor, meleeBand } from '../sim/actor';
import { snapTarget } from '../sim/combat';
import { FixedClock } from '../sim/clock';
import { hasEdges, mergeEdges } from '../sim/command';
import { WaveDirector } from '../sim/waves';
import { World } from '../sim/world';
import { STAGE1, type StageRoomId } from '../data/stages/stage1';
import { STAGE1_BEATS, type Stage1Beat, stage1From } from '../data/stages/stage1Script';
import { STAGE2 } from '../data/stages/stage2';
import { STAGE3 } from '../data/stages/stage3';
import { outOfSight, type StageDef, stageRunner } from '../sim/stage';
import { coopLink, type CoopLink } from '../net/link';
import { applySnapshot, type Snapshot, SnapshotWriter } from '../net/snapshot';
import { paintReviveBar, paintReviveCircle } from '../render/canvas/revivePainter';
import { hookWorldAudio } from '../audio/hooks';
import { audio } from '../audio/mixer';
import { MusicSystem } from '../audio/music';
import { BoomboxSource } from '../audio/boombox';
import { FeelDirector } from '../feel/feel';
import { FeelFx } from '../render/feelFx';
import { inkWipe } from '../ui/transition';
import { cycleEffects, effectLevel, saveSettings, SETTINGS } from '../settings';
import { LAST_STAGE, PROGRESS, saveCheckpoint, stageFinished } from '../progress';
import type { UIScene } from './UIScene';

/** One music system for the game (survives room restarts). */
let music: MusicSystem | undefined;
/** The current scene's boombox source (M8). */
let boombox: BoomboxSource | undefined;
/** Guest: the host's first snapshot of a new session, applied after the scene restarts. */
let pendingFull: Snapshot | undefined;

export interface GameSceneData {
  lab?: string;
  palette?: PaletteId;
  /** `?room=test`: the style-frame room with the M0 cast (look check). */
  testRoom?: boolean;
  /** Stage route `?stage=1&room=arena` (the default: the whole stage from its intro); `&wave=A` starts at that wave. M9: `?stage=2&room=<id>`. */
  stage?: 1 | 2 | 3;
  room?: StageRoomId | string;
  wave?: string;
  /** M13: start from the saved room checkpoint (Continue, a death) or from the stage's start (false). */
  resume?: boolean;
  /** `&beat=riot|grenade|boss|waveB`: start the stage script at that beat (playtesting). */
  beat?: string;
  /** Co-op (PLAN.md M4b): this laptop hosts the game, or joins as player 2. */
  coop?: 'host' | 'guest';
  /** M18 `?coop=bot`: player 2 is the partner bot on this laptop. */
  bot?: boolean;
}

/** Room definitions by id, for the guest (the host's snapshot names the room). */
const ROOMS_BY_ID = Object.fromEntries([TEST_ROOM, ...Object.values(STAGE1.rooms).map((r) => r.room), ...Object.values(STAGE2.rooms).map((r) => r.room), ...Object.values(STAGE3.rooms).map((r) => r.room)].map((r) => [r.id, r]));

/** M9 room-graph stages by number. */
const ROOM_STAGES: Record<number, StageDef> = { 2: STAGE2, 3: STAGE3 };

/**
 * M9 checkpoint per room (decided with the user, M13: dying restarts the room): where the stage
 * was entered last, with each player's loadout and the body count so far. Saved with the progress
 * (src/progress.ts), so "Continue" on the title screen picks up there too.
 */

/**
 * Enemies the music counts: alive, in the room and aware of you. M9: sneaking past unaware guards
 * keeps the music to the bed only; the combat layers come in on the alert.
 */
const activeEnemies = (w: World) => w.actors.filter((a) => a.ai && a.state !== 'dead' && !a.entering && a.ai.aware !== false).length;

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
  /** M18: the partner bot's memory (drives player 2 when no laptop does). */
  bot: BotState = newBotState();
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
    // M13 settings: blood off everywhere, or as each stage has it
    return SETTINGS.blood !== 'off' && STAGE_BLOOD[paletteStage(this.paletteId)];
  }

  create(data: GameSceneData): void {
    this.data_ = data;
    this.clock = new FixedClock();
    this.paletteId = data.palette ?? 'neutral';
    this.cannonHits = 0;
    this.deadFor = 0;
    this.cleared = false;
    this.leaving = false;
    this.stageInfo = undefined;
    this.coop = data.coop;
    this.localPlayer = data.coop === 'guest' ? 1 : 0;
    this.link = undefined;
    this.snaps = undefined;
    this.session = undefined;

    this.lab = data.lab ? getLab(data.lab) : undefined;
    this.bot = newBotState();
    this.bot.task = this.lab?.partnerTask;
    if (data.coop === 'guest') this.setupGuest();
    else if (this.lab) {
      this.world = new World(TEST_ROOM);
      this.lab.setup(this.world);
      if (!data.palette && this.lab.palette) this.paletteId = this.lab.palette;
    } else if (data.testRoom) {
      this.world = new World(TEST_ROOM);
      this.setupTestRoom();
    } else this.setupStage(data);
    // let the last body land before the end card; a finished stage unlocks the next (M13)
    this.world.events.on('roomCleared', () => {
      if (this.stageInfo && !this.lab && !data.testRoom && data.coop !== 'guest') stageFinished(this.stageInfo.stage);
      this.time.delayedCall(1500, () => (this.cleared = true));
    });

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
      this.world.events.on('music', (e) => void music?.setCue(e.cue));
      // M8: the boombox plays from wherever it is (one at a time; the old scene's stops)
      boombox?.dispose();
      boombox = new BoomboxSource(this.world, engine);
    }
    this.vfx = new Vfx(this.world, () => this.blood);
    this.decals = new Decals(this.world, this.decalLayer, () => this.blood);
    // casings and magazines that land stay on the floor (baked with the decals)
    this.gunFx = new GunFx(this.world, (d) => this.decals.addDebris(d));
    this.input_ = new PlayerInput(this);
    this.world.events.on('roomChanged', () => {
      this.decals.clear();
      this.bakeRoom();
      // M9: each room has its own ambience, reverb and music
      if (engine) engine.setRoomReverb(this.world.room.outdoor ? 'outdoor' : 'medium');
      void music?.setRoom(this.world.room.id);
      if (this.snaps) this.snaps.needFull = true;
    });
    this.world.events.on('cannonHit', () => this.cannonHits++);
    // M11: the floor falling away and the vending machine walking off change the room's picture
    this.world.events.on('collapse', (e) => {
      if (e.phase === 'fall') this.decals.dropBeyond(e.x, e.side);
      this.bakeRoom();
    });
    this.world.events.on('bruteWake', () => this.bakeRoom());
    // M12: a landed wall, a smashed vending machine
    this.world.events.on('wallDrop', (e) => { if (e.phase === 'land') this.bakeRoom(); });
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
      raiseAll: () => { if (host) raiseAll(this.world); },
      // M13 playtest pass: every invented number, live (dev builds only)
      toggleTuning: import.meta.env.DEV ? toggleTuningPanel : undefined,
      cycleEffects: () => cycleEffects(),
      toggleMute: () => {
        SETTINGS.master = SETTINGS.master > 0 ? 0 : 0.8;
        saveSettings();
        audio()?.applySettings();
      },
    });
    // end card: Enter goes on to the next stage (after the last one: the credits), R replays this one, Esc to the title
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.cleared || !host || this.lab) return;
      const next = this.nextStage;
      if (next) this.scene.restart({ stage: next, coop: this.data_.coop, resume: false });
      else if (this.stageInfo?.stage === LAST_STAGE && !this.data_.coop) this.toTitle('credits');
      else this.scene.restart({ ...this.data_, resume: false });
    });
    // M18 co-op labs: N hands the partner bot its half of the move
    this.input.keyboard?.on('keydown-N', () => { if (this.lab?.partnerTask) this.bot.cued = true; });
    this.input.keyboard?.on('keydown-R', () => { if (this.cleared && host) this.scene.restart({ ...this.data_, resume: false }); });
    // M13: Esc pauses (the pause menu), or leaves the end card for the title screen
    this.input.keyboard?.on('keydown-ESC', (e: KeyboardEvent) => {
      if (this.cleared) { if (!this.data_.coop) this.toTitle(); return; }
      (this.scene.get('ui') as UIScene).openPause(e);
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

  /** Debug (L): a random loaded gun at each player's feet. */
  /**
   * M17 (design/qol-pass.md 3c): living enemies on the local hero's depth line get a light ring on
   * their shadow, and the one his punch would snap to a brighter one. Off with a gun in each hand.
   */
  private depthRings(): Map<number, 1 | 2> {
    const out = new Map<number, 1 | 2>();
    const me = this.world.players[this.localPlayer];
    if (!me || me.state === 'dead' || me.state === 'downed' || this.world.inputLocked) return out;
    if (me.hands.every((h) => h && isWeapon(h.item))) return out;
    for (const o of this.world.actors) {
      if (o.kind === 'hero' || !o.ai || !alive(o)) continue;
      if (Math.abs(o.pos.z - me.pos.z) <= meleeBand(me) && Math.abs(o.pos.x - me.pos.x) <= 2.5) out.set(o.id, 1);
    }
    const p = this.input.activePointer;
    const t = snapTarget(this.world, me, [p.x, p.y], TUNING.melee.range);
    if (t) out.set(t.id, 2);
    return out;
  }

  /** M17: seconds left on the grenade the hero is about to lob, if any. */
  private grenadeFuse(a: Actor): number | undefined {
    if (a.cook !== undefined) return GRENADE.fuse - a.cook;
    if (a.attack?.kind === 'lob' && !a.attack.done) return (a.attack.fuse ?? GRENADE.fuse) - a.attack.t;
    const h = a.holding?.kind === 'item' ? this.world.items.find((i) => i.id === a.holding!.id) : undefined;
    return h?.kind === 'grenade' && h.live ? h.fuse : undefined;
  }

  private dropGuns(): void {
    for (const p of this.world.players) {
      const kind = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
      const it = this.world.spawnItem(kind, 'grunt', { x: p.pos.x + p.facing * 0.3, y: 0.6, z: p.pos.z }, { x: 0, y: 1, z: 0 }, 6);
      it.ammo = WEAPONS[kind].mag;
      it.spare = 1;
    }
  }

  /** Restart the room from its start (checkpoint per room; to confirm with the user in M13). */
  /**
   * The stage the end card leads on to (stage links before M13's stage select): 1 -> 2 -> 3.
   * Undefined in labs, the test room, and on the last stage built.
   */
  get nextStage(): 2 | 3 | undefined {
    if (this.lab || this.data_.testRoom || !this.stageInfo) return undefined;
    return this.stageInfo.stage === 1 ? 2 : this.stageInfo.stage === 2 ? 3 : undefined;
  }

  /** Restart the room: back to its checkpoint (decided: unlimited tries, the room you died in). */
  restart(): void {
    this.scene.restart({ ...this.data_, palette: this.paletteId, resume: true });
  }

  /** A stage entered from its start or the next stage's link, not a restart after dying (the stage card shows). */
  get freshStart(): boolean {
    return this.data_.resume !== true;
  }

  /** Leave for the title screen (the pause menu, the end card, after the credits), under the ink wipe (revamp F2). */
  toTitle(view?: 'credits'): void {
    const go = () => {
      this.scene.stop('ui');
      this.scene.start('title', { view: view ?? 'main' });
    };
    const ui = this.scene.get('ui');
    if (this.leaving) return;
    this.leaving = true;
    if (ui && this.scene.isActive('ui')) inkWipe(ui, 'out', go);
    else go();
  }

  /** Set while the wipe to the title runs (a second Esc mustn't start another). */
  private leaving = false;

  /** M9: a room-graph stage from its start, a checkpoint, or `&room=`. */
  private setupRoomStage(def: StageDef, data: GameSceneData): void {
    const saved = PROGRESS.checkpoint;
    const cp = data.resume !== false && !data.room && saved?.stage === def.stage && saved.room && def.rooms[saved.room] ? saved : undefined;
    const room = data.room && data.room in def.rooms ? data.room : cp?.room ?? def.start.room;
    const entry = cp?.entry ?? (room === def.start.room ? def.start.entry : Object.keys(def.rooms[room].entries)[0]);
    this.world = new World(def.rooms[room].room);
    this.world.gore = def.gore ?? 'normal';
    const coop = data.coop === 'host' || !!data.bot;
    this.world.addPlayer(createActor('hero', 0, 9.2, 1));
    if (coop) this.world.addPlayer(createActor('hero', 0.6, 9.2, 1));
    this.world.players.forEach((p, i) => {
      def.loadout(p);
      const saved = cp?.players[i];
      if (saved) { p.hands = structuredClone(saved.hands); p.grenades = saved.grenades; }
    });
    if (cp) { this.world.kills = cp.kills; this.world.flags.add(`s${def.stage}-title`); }
    this.world.seq.run(stageRunner(def, room, entry), 'stage');
    if (!data.palette) this.paletteId = def.palette;
    this.stageInfo = { stage: def.stage, room, targetBodyCount: def.targetBodyCount };
    const world = this.world;
    world.events.on('roomEnter', (e) => {
      saveCheckpoint({ stage: e.stage, room: e.room, entry: e.entry, kills: world.kills, players: world.players.map((p) => ({ hands: structuredClone(p.hands), grenades: p.grenades })) });
      if (this.stageInfo) this.stageInfo.room = e.room;
    });
  }

  /** Stage route: the room, the player(s) in the middle, and the wave script from the chosen wave. */
  private setupStage(data: GameSceneData): void {
    const graph = data.stage ? ROOM_STAGES[data.stage] : undefined;
    if (graph) { this.setupRoomStage(graph, data); return; }
    const roomId = (data.room && data.room in STAGE1.rooms ? data.room : 'arena') as StageRoomId;
    const def = STAGE1.rooms[roomId];
    this.world = new World(def.room);
    const coop = data.coop === 'host' || !!data.bot;
    this.world.addPlayer(createActor('hero', coop ? -0.6 : 0, 9.2, 1));
    if (coop) this.world.addPlayer(createActor('hero', 0.6, 9.2, -1));
    // `?wave=A` jumps straight to that wave of the room; otherwise the whole stage runs from its intro (M8)
    if (data.wave) {
      const start = Math.max(0, def.script.waves.findIndex((w) => w.id === data.wave));
      this.world.director = new WaveDirector(def.script, start);
    } else this.world.seq.run(stage1From(data.beat && (STAGE1_BEATS as readonly string[]).includes(data.beat) ? data.beat as Stage1Beat : 'intro'));
    this.stageInfo = { stage: STAGE1.stage, room: roomId, targetBodyCount: STAGE1.targetBodyCount };
  }

  /** Co-op host: player 2's inputs come in, a snapshot of the world goes out every frame. */
  private startHosting(): void {
    const link = (this.link = coopLink('host'));
    const snaps = (this.snaps = new SnapshotWriter(this.world, Date.now(), () => this.paletteId));
    link.onInput = (cmd) => (this.world.commands[1] = mergeEdges(this.world.commands[1], cmd));
    // a (re)joining guest gets the whole room first
    link.onPeer = (connected) => { if (connected) { snaps.needFull = true; snaps.joining = true; } };
  }

  /** Co-op guest: an empty puppet world until the host's first snapshot arrives. */
  private setupGuest(): void {
    this.world = new World(STAGE1.rooms.arena.room);
    this.world.puppet = true;
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
    }
    // M9: the host moved on to another room: start the puppet over in it
    const room = ROOMS_BY_ID[s.roomId];
    if (room && room.id !== this.world.room.id) {
      if (!s.full) return;
      this.world.actors.length = 0;
      this.world.players = [];
      this.world.items = [];
      this.world.setRoom(room);
    }
    applySnapshot(this.world, s);
    // the host's palette: the stage's colours, and whether it shows blood (the guest used to stay 'neutral', without blood)
    if (s.palette && s.palette !== this.paletteId) this.setPalette(s.palette);
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
    paintRoom(this.roomLayer.ctx, this.world.room, PALETTES[this.paletteId], this.world.elevator);
    this.roomLayer.upload();
    this.decals.rebake();
    this.bakeCorpses();
  }

  private paintCorpse(a: Actor): void {
    if (a.kind === 'boss') { paintBoss(this.corpseLayer.ctx, a, { time: 0 }); return; }
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
      music?.setIntensity(activeEnemies(this.world));
      boombox?.update();
      return;
    }
    this.world.friendlyThrow = SETTINGS.friendlyFire;
    // M18: the wishbone tears only where the stage shows blood
    this.world.blood = this.blood;
    // keep an edge latched until a tick actually consumes it
    this.world.command = mergeEdges(this.world.command, this.input_.read());
    const steps = this.clock.advance(delta / 1000, () => {
      // M18: no laptop for player 2 here (`?coop=bot`, the co-op labs): the partner bot plays him
      const p2 = this.world.players[1];
      if (p2 && !this.link) this.world.commands[1] = partnerCommand(this.world, p2, this.bot);
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
    music?.setIntensity(activeEnemies(this.world));
    boombox?.update();
  }

  /** PLAN.md M3: player death -> restart the room. Co-op: once nobody is left standing. */
  private watchPlayerDeath(dt: number): void {
    if (this.world.players.length === 0 || this.world.activePlayers.length > 0) return;
    // co-op: the last one standing went through an exit (his partner comes along, revived)
    if (this.world.players.some((p) => p.parked)) return;
    // M10: the stage 2 ending kills the hero on purpose (world-last-stand): the end card, not a restart
    if (this.world.flags.has('ending') || this.cleared) return;
    this.deadFor += dt * this.clock.timeScale;
    if (this.deadFor >= RESTART_DELAY) this.restart();
  }

  /** Draw actors, items, props, cannons and balls far-to-near, then particles. */
  private render(): void {
    const pal = PALETTES[this.paletteId];
    const ctx = this.actorLayer.ctx;
    const blood = this.blood;
    // M10: the elevator shaft scrolls (and the welder's cut glows): the room layer is live there
    if (this.world.elevator) {
      this.roomLayer.clear();
      paintRoom(this.roomLayer.ctx, this.world.room, PALETTES[this.paletteId], this.world.elevator);
      this.roomLayer.upload();
    }
    const flashes = effectLevel() !== 'off';
    this.actorLayer.clear();
    // doors sit in the side walls, behind everything in the room
    this.world.room.doors.forEach((d, i) => paintDoor(ctx, this.world.room, d, this.world.doors[i]?.open ?? 0, pal));
    this.decals.drawGrowing(ctx);
    // co-op: a subtle circle on the floor around a downed teammate
    for (const p of this.world.players) if (p.state === 'downed') paintReviveCircle(ctx, p);
    const list: { z: number; draw: () => void }[] = [];
    const rings = this.depthRings();
    for (const a of this.world.actors) {
      // gibbed bodies are gone (throw-grenade): only the pieces (VFX) remain
      if (a.corpse?.phase === 'frozen' || a.corpse?.gibbed) continue;
      // co-op: gone ahead up the ladder / into the vent, waiting for the partner
      if (outOfSight(this.world, a)) continue;
      // at equal depth the attacker draws in front, so the punching fist is visible
      const bias = a.state === 'attack' ? 0.002 : a.state === 'grabbed' ? -0.001 : 0;
      const ring = rings.get(a.id);
      list.push({ z: a.pos.z - bias, draw: () => (a.kind === 'boss' ? paintBoss(ctx, a, { time: this.world.time, flashes }) : paintCharacter(ctx, a, pal, this.world.time, { blood, flashes, ring })) });
    }
    // M17: the item the local player's E would take is outlined
    const me = this.world.players[this.localPlayer];
    const target = me && !this.world.inputLocked ? pickupPlan(this.world, me)?.item.id : undefined;
    for (const it of this.world.items) list.push({ z: it.pos.z, draw: () => paintItem(ctx, it, pal, blood, this.world.time, it.id === target) });
    // M17: where the local hero's grenade will land (cooking, winding up the lob, holding a live one)
    const nade = me ? this.grenadeFuse(me) : undefined;
    if (me && nade !== undefined) {
      const p = this.input.activePointer, at = lobTarget(this.world, me, [p.x, p.y]);
      list.push({ z: at.z + 0.5, draw: () => paintGrenadeMarker(ctx, at.x, at.z, nade, this.world.time) });
    }
    for (const p of this.world.room.props) list.push({ z: p.z0, draw: () => paintProp(ctx, p, pal) });
    for (const c of this.world.cannons) list.push({ z: c.z, draw: () => paintCannon(ctx, c) });
    for (const b of this.world.balls) list.push({ z: b.z - 0.01, draw: () => paintBall(ctx, b) });
    // M12 world-arena-lock: a wall's shadow, then the slab coming down
    for (const w of this.world.lockWalls) {
      if (w.phase === 'landed') continue;
      const k = w.phase === 'shadow' ? Math.min(1, w.t / TUNING.arenaLock.shadow) : 1;
      list.push({ z: w.side === 'back' ? this.world.room.zBack : this.world.room.zFront, draw: () => { paintLockShadow(ctx, this.world.room, w.side, k); if (w.phase === 'fall') paintLockWall(ctx, this.world.room, w.side, w.y); } });
    }
    // M11 world-falling-hazard: the tank's shadow grows, then it comes down
    for (const b of this.world.blocks) {
      if (b.phase === 'landed') continue;
      const k = b.phase === 'shadow' ? Math.min(1, b.t / TUNING.fallingBlock.shadow) : 1;
      list.push({ z: b.z, draw: () => paintTank(ctx, b.x, b.z, b.facing, b.y, b.phase === 'shadow', k) });
    }
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
