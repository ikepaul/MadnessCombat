import { lyingAt, rootToWorld, STANDING } from '../anim/skeleton';
import { TUNING } from '../data/tuning';
import { type Actor, type ActorKind, alive, createActor, type Vec3 } from './actor';
import { type Ball, type Cannon, stepCannons } from './cannon';
import { applyHit, stepActor } from './combat';
import { clearEdges, IDLE_COMMAND, type PlayerCommand } from './command';
import { assignTokens } from './ai';
import { EventBus, type HitKind } from './events';
import { type Item, type ItemKind, spawnItem, stepItems } from './items';
import type { RoomDef } from './room';
import type { WaveDirector } from './waves';

/** Door animation state: `open` 0 (closed) .. 1 (open), moving toward `target`. */
export interface DoorState { open: number; target: 0 | 1; hold: number }

/** The simulation state. Stepped only by FixedClock, at 60 Hz. */
export class World {
  readonly events = new EventBus();
  readonly actors: Actor[] = [];
  items: Item[] = [];
  readonly dt = 1 / TUNING.simHz;
  tick = 0;
  /** The actor driven by player commands. */
  player?: Actor;
  /** Command for the next tick; edges (jump/dive/attack/grab) are cleared after use. */
  command: PlayerCommand = { ...IDLE_COMMAND };
  cannons: Cannon[] = [];
  balls: Ball[] = [];
  /** Enemies allowed to attack right now (src/sim/ai.ts). */
  readonly tokens = new Set<number>();
  /** Enemy deaths in this room (the kill counter). */
  kills = 0;
  /** Kind of the last enemy killed (the counter turns green for zombies). */
  lastKillKind?: ActorKind;
  /** Attack tokens freed recently, unavailable until these times (TUNING.ai.tokenCooldown). */
  tokenFreeAt: number[] = [];
  /** World time of the last enemy swing (TUNING.ai.swingGap). */
  lastEnemySwing = -Infinity;
  /** The room's wave script, if it has one. */
  director?: WaveDirector;
  doors: DoorState[] = [];
  /** Seeded RNG so the sim stays reproducible in tests. */
  private seed = 0x2f6b1c3d;

  constructor(public room: RoomDef) {
    this.resetDoors();
    // world-kill-counter: every enemy death counts
    this.events.on('kill', (e) => {
      const kind = this.actorById(e.actorId)?.kind;
      if (kind !== 'hero') {
        this.kills++;
        this.lastKillKind = kind;
      }
    });
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
    this.room = room;
    this.resetDoors();
    this.events.emit('roomChanged', { roomId: room.id });
  }

  actorById(id: number): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  hitActor(by: Actor | undefined, target: Actor, kind: HitKind, dirX: number, dirZ: number, at: Vec3): void {
    applyHit(this, by, target, kind, dirX, dirZ, at);
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
    assignTokens(this);
    for (const a of this.actors) {
      if (a.corpse?.phase === 'frozen') continue;
      const cmd = a === this.player ? this.command : a.brain ? a.brain(a, this.dt) : IDLE_COMMAND;
      stepActor(this, a, cmd, this.dt);
    }
    this.command = clearEdges(this.command);
    this.updateHeld();
    this.separate();
    stepItems(this, this.dt);
    stepCannons(this, this.dt);
    this.director?.step(this, this.dt);
    this.stepDoors();
    this.events.emit('tick', { tick: this.tick });
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
    const list = this.actors.filter((a) => (a.state === 'free' || a.state === 'stun' || a.state === 'attack') && a.body.height > 0.9 && a.body.state !== 'diving');
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
