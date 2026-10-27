import type { GoreLevel } from './gore';
import { lyingAt, rootToWorld, STANDING } from '../anim/skeleton';
import { TUNING } from '../data/tuning';
import { type Actor, type ActorKind, alive, createActor, type Vec3 } from './actor';
import { type Ball, type Cannon, stepCannons } from './cannon';
import { applyHit, stepActor, stepRevives } from './combat';
import { clearEdges, IDLE_COMMAND, type PlayerCommand } from './command';
import { assignTokens } from './ai';
import { EventBus, type HitKind } from './events';
import { type Item, type ItemKind, spawnItem, stepItems } from './items';
import type { RoomDef } from './room';
import type { WaveDirector } from './waves';
import { stepProps } from './cover';
import { checkHatch, type ElevatorState, stepElevator } from './elevator';
import { type Collapse, type FallingBlock, stepBlocks, stepCollapse } from './improbability';
import { type LastStand, lastStandCommand, type LockWall, stepLastStand, stepLockWalls } from './arena';
import { blastExit, checkExits, type ExitDef, type ExitState, skyLanding, stepTraversal, type Tracker } from './stage';
import { Seq } from './sequencer';
import { isBoss, stepBoss, stepSwept } from './boss';
import { installAlertRules } from './stealth';

/** Props can change in play (a kicked-over table), so each World gets its own copies. */
function ownProps(room: RoomDef): RoomDef {
  return { ...room, props: room.props.map((p) => ({ ...p })), decks: room.decks?.map((d) => ({ ...d, holes: d.holes.map((h) => ({ ...h })) })) };
}

/** Door animation state: `open` 0 (closed) .. 1 (open), moving toward `target`. */
export interface DoorState { open: number; target: 0 | 1; hold: number }

/** The simulation state. Stepped only by FixedClock, at 60 Hz. */
export class World {
  readonly events = new EventBus();
  readonly actors: Actor[] = [];
  items: Item[] = [];
  readonly dt = 1 / TUNING.simHz;
  tick = 0;
  /** Heroes driven by player commands: [0] = single player / co-op host, [1] = co-op player 2. */
  players: Actor[] = [];
  /** Commands for the next tick, one per player; edges (jump/dive/attack/grab) are cleared after use. */
  commands: PlayerCommand[] = [{ ...IDLE_COMMAND }, { ...IDLE_COMMAND }];
  cannons: Cannon[] = [];
  balls: Ball[] = [];
  /** Enemies allowed to attack right now (src/sim/ai.ts). */
  readonly tokens = new Set<number>();
  /** Enemy deaths in this room (the kill counter). */
  kills = 0;
  /** Kind of the last enemy killed (the counter turns green for zombies). */
  lastKillKind?: ActorKind;
  /** Attack tokens freed recently, per player they were aimed at, unavailable until `t` (TUNING.ai.tokenCooldown). */
  tokenFreeAt: { player: number; t: number }[] = [];
  /** World time of the last enemy swing at each player (TUNING.ai.swingGap). */
  lastEnemySwing = new Map<number, number>();
  /** The room's wave script, if it has one. */
  director?: WaveDirector;
  doors: DoorState[] = [];
  /** Seeded RNG so the sim stays reproducible in tests. */
  private seed = 0x2f6b1c3d;

  /** M9 room graph (src/sim/stage.ts): the current room's exits, the one taken, the wipe running. */
  exits: ExitState[] = [];
  exitTaken?: ExitDef;
  transition = false;
  /** M12: the arena lock's walls and the last stand (src/sim/arena.ts). */
  lockWalls: LockWall[] = [];
  lastStand?: LastStand;
  /** M11: improbability mode (src/sim/improbability.ts), the arena collapse, falling blocks. */
  physics: 'normal' | 'improbable' = 'normal';
  /** Thrown weapons hitting a co-op ally (the friendly-fire setting): full damage, a knockdown only, or nothing. */
  friendlyThrow: 'damage' | 'knockdown' | 'through' = 'damage';
  /** Stage 3 is gorier (src/sim/gore.ts). */
  gore: GoreLevel = 'normal';
  collapse?: Collapse;
  blocks: FallingBlock[] = [];
  /** M10: the elevator cab's state while in that room (src/sim/elevator.ts). */
  elevator?: ElevatorState;
  /** One-off story flags (a title card shown once per stage, not again after a checkpoint restart). */
  readonly flags = new Set<string>();
  /** Tracker HUD blip for this room (world-objective-radar). */
  tracker?: Tracker;
  /** The stage's id for the current room (rooms share ids across stages only by accident). */
  roomId?: string;
  /** Co-op guest: a puppet of the host's world (never steps; replayed events must not run sim rules). */
  puppet = false;
  /** PLAN.md M7: grenades the enemies may still lob this encounter (one per wave). */
  enemyGrenades = 1;
  /** M8 scripted beats: the running scripts and their commands (src/sim/sequencer.ts). */
  readonly seq: Seq = new Seq(this);
  /** Commands scripts give actors, by actor id; they replace the brain or the player's input. */
  readonly scripted = new Map<number, PlayerCommand>();
  /** Cutscene: players' input is ignored (scripted commands still apply). */
  inputLocked = false;

  constructor(public room: RoomDef) {
    this.room = ownProps(room);
    this.resetDoors();
    installAlertRules(this);
    this.events.on('explosion', (e) => { if (!this.puppet) blastExit(this, e); });
    this.events.on('land', (e) => { if (!this.puppet) skyLanding(this, e.actorId); });
    this.events.on('waveStart', () => { this.enemyGrenades = 1; });
    // world-kill-counter: every enemy death counts
    this.events.on('kill', (e) => {
      const kind = this.actorById(e.actorId)?.kind;
      if (kind !== 'hero') {
        this.kills++;
        this.lastKillKind = kind;
      }
    });
  }

  /** Player 1 (single player, or the co-op host). */
  get player(): Actor | undefined {
    return this.players[0];
  }

  set player(a: Actor | undefined) {
    if (!a) { this.players = []; return; }
    a.playerIndex = 0;
    this.players[0] = a;
  }

  /** Player 1's command (single player and tests). */
  get command(): PlayerCommand {
    return this.commands[0];
  }

  set command(c: PlayerCommand) {
    this.commands[0] = c;
  }

  /** Add a co-op hero as the next player. */
  addPlayer(a: Actor): void {
    a.playerIndex = this.players.length;
    this.players.push(a);
    if (!this.actors.includes(a)) this.actors.push(a);
  }

  get coop(): boolean {
    return this.players.length > 1;
  }

  /** Players who can fight right now (not dead, not downed). */
  get activePlayers(): Actor[] {
    return this.players.filter((p) => p.state !== 'dead' && p.state !== 'downed');
  }

  private resetDoors(): void {
    this.doors = this.room.doors.map((d) => ({ open: d.open ? 1 : 0, target: d.open ? 1 : 0, hold: Infinity }));
  }

  /** Spawn telegraph: swing a door open; it closes again after TUNING.waves.doorHold. */
  openDoor(i: number): void {
    const d = this.doors[i];
    if (!d) return;
    d.target = 1;
    d.hold = TUNING.waves.doorOpen + TUNING.waves.doorHold;
    this.events.emit('doorOpen', { door: i });
  }

  /** Seconds of world time (hit-stop and pause don't advance it). */
  get time(): number {
    return this.tick / TUNING.simHz;
  }

  rng(): number {
    // mulberry32
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setRoom(room: RoomDef): void {
    this.room = ownProps(room);
    this.enemyGrenades = 1;
    this.elevator = undefined;
    this.collapse = undefined;
    this.blocks = [];
    this.lockWalls = [];
    this.lastStand = undefined;
    this.resetDoors();
    this.events.emit('roomChanged', { roomId: room.id });
  }

  actorById(id: number): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  hitActor(by: Actor | undefined, target: Actor, kind: HitKind, dirX: number, dirZ: number, at: Vec3, part: 'head' | 'body' = 'body'): void {
    applyHit(this, by, target, kind, dirX, dirZ, at, part);
  }

  /** A bullet hit from `by` (src/sim/guns.ts): weapon damage, flinch or kill, blood. */
  hitBullet(by: Actor, target: Actor, damage: number, part: 'head' | 'body', dirX: number, pointBlank: boolean, at: Vec3): void {
    applyHit(this, by, target, 'bullet', dirX, 0, at, part, false, { damage, pointBlank });
  }

  spawnItem(kind: ItemKind, skin: ActorKind, pos: Vec3, vel: Vec3, spin: number): Item {
    return spawnItem(this, kind, skin, pos, vel, spin);
  }

  /** Debug/lab: drop `n` settled corpses at random floor points (corpse-layer stress test). */
  spawnCorpses(n: number): void {
    const r = this.room;
    for (let i = 0; i < n; i++) {
      const a = createActor('grunt', (this.rng() * 2 - 1) * (r.halfWidth - 0.6), r.zFront + this.rng() * (r.zBack - r.zFront - 0.2), this.rng() < 0.5 ? 1 : -1, { dead: true });
      a.pose.root = lyingAt(this.rng() < 0.7 ? -Math.PI / 2 : Math.PI / 2);
      a.pose.clip = 'lying';
      a.pose.clipT = 1;
      this.actors.push(a);
      this.events.emit('corpseSettled', { actorId: a.id, ...a.pos });
    }
  }

  step(): void {
    this.tick++;
    // scripts first: they react to the last tick and set this tick's scripted commands
    this.seq.step(this.dt);
    assignTokens(this);
    checkExits(this);
    checkHatch(this);
    const gone: Actor[] = [];
    for (const a of this.actors) {
      if (a.corpse?.phase === 'frozen') continue;
      if (a.traversing) { stepTraversal(this, a, this.dt); continue; }
      if (isBoss(a)) { stepBoss(this, a, this.dt); if (a.boss.phase === 'gone') gone.push(a); continue; }
      if (a.swept) { if (stepSwept(this, a as Actor & { swept: NonNullable<Actor['swept']> }, this.dt)) gone.push(a); continue; }
      stepActor(this, a, this.commandFor(a), this.dt);
    }
    // M8: bodies the boss swept off the screen are gone for good
    for (const a of gone) this.actors.splice(this.actors.indexOf(a), 1);
    this.commands = this.commands.map(clearEdges);
    for (const [id, c] of this.scripted) this.scripted.set(id, clearEdges(c));
    stepRevives(this, this.dt);
    this.updateHeld();
    this.separate();
    stepItems(this, this.dt);
    stepCannons(this, this.dt);
    stepProps(this, this.dt);
    stepElevator(this, this.dt);
    stepCollapse(this, this.dt);
    stepBlocks(this, this.dt);
    stepLockWalls(this, this.dt);
    stepLastStand(this, this.dt);
    this.director?.step(this, this.dt);
    this.stepDoors();
    this.events.emit('tick', { tick: this.tick });
  }

  /** A script's command, else the player's input (unless locked), else the brain. */
  private commandFor(a: Actor): PlayerCommand {
    const s = this.scripted.get(a.id);
    if (s) return s;
    if (a.playerIndex !== undefined) {
      if (this.inputLocked) return IDLE_COMMAND;
      const c = this.commands[a.playerIndex] ?? IDLE_COMMAND;
      // M12 the last stand: aim and fire only
      return this.lastStand && !this.lastStand.done ? lastStandCommand(a, c) : c;
    }
    return a.brain ? a.brain(a, this.dt) : IDLE_COMMAND;
  }

  private stepDoors(): void {
    const rate = this.dt / TUNING.waves.doorOpen;
    this.doors.forEach((d, i) => {
      d.open = d.target ? Math.min(1, d.open + rate) : Math.max(0, d.open - rate);
      if (d.target === 1 && d.hold !== Infinity) {
        d.hold -= this.dt;
        if (d.hold <= 0) { d.target = 0; this.events.emit('doorClose', { door: i }); }
      }
    });
  }

  /** Carried bodies and heads hang in front of the holder's hands. */
  private updateHeld(): void {
    for (const a of this.actors) {
      const h = a.holding;
      if (!h) continue;
      const throwing = a.state === 'attack' && a.attack?.kind === 'throw';
      // during the wind-up the load swings back over the shoulder
      const back = throwing ? Math.min(1, a.attack!.t / TUNING.grab.windup) : 0;
      const lx = 0.4 - 0.5 * back, ly = -0.55 - 0.25 * back;
      const [dx, dy] = rootToWorld(a.pose.root, a.facing, lx, ly);
      if (h.kind === 'item') {
        const it = this.items.find((i) => i.id === h.id);
        if (it) it.pos = { x: a.pos.x + dx, y: a.pos.y + dy, z: a.pos.z - 0.01 };
        continue;
      }
      const o = this.actorById(h.id);
      if (!o) { a.holding = undefined; continue; }
      // held by the collar: the body's top sits at the hands
      // just behind the holder in depth, so the holding hands draw over the body
      o.pos = { x: a.pos.x + a.facing * (0.42 - 0.5 * back), y: a.pos.y + 0.12 + 0.3 * back, z: a.pos.z + 0.005 };
      o.facing = (-a.facing) as 1 | -1;
      o.pose.groundY = a.pose.groundY;
      o.pose.root = alive(o) ? { ...STANDING, r: 0.1 } : { ...STANDING, r: 0.35 };
      o.pose.clip = 'grabbed';
    }
  }

  /** Soft push-apart between standing actors on the same depth band. */
  private separate(): void {
    const S = TUNING.separation;
    const list = this.actors.filter((a) => (a.state === 'free' || a.state === 'stun' || a.state === 'attack') && a.body.height > 0.9 && a.body.state !== 'diving' && a.kind !== 'boss');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.pos.z - b.pos.z) > TUNING.melee.depthBand || Math.abs(a.pos.y - b.pos.y) > 0.5) continue;
        const d = b.pos.x - a.pos.x, over = S.distance - Math.abs(d);
        if (over <= 0) continue;
        const push = Math.min(over, S.rate * this.dt) / 2, s = d === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(d);
        const lim = this.room.halfWidth - TUNING.move.radius;
        a.pos.x = Math.max(-lim, Math.min(lim, a.pos.x - s * push));
        b.pos.x = Math.max(-lim, Math.min(lim, b.pos.x + s * push));
      }
    }
  }
}
