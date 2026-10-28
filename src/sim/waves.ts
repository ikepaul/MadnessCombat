// Spawn points and wave scripts (PLAN.md M3, research/mechanics/enemy-spawning). A wave is a
// list of (delay, spawn point, enemy type, weapon) entries; it trickles in, holding back while
// too many are alive, and the next wave starts once the alive count drops below its threshold.
// Spawn variety (TUNING.waves.variety, playtest 2026-10-27): unless a wave is `exact`, its entries
// come in seeded groups spread over the room's spawn points, sometimes one from behind the player.
import { TUNING } from '../data/tuning';
import { type Actor, type ActorKind, alive, createActor, type HeldItem } from './actor';
import { type AiState, gruntBrain, newAiState } from './ai';
import { bossHp, DIFFICULTY, type Difficulty } from './difficulty';
import type { World } from './world';

const W = TUNING.waves;

/** Screen edge (walk in from off-screen) or a door in the room (opens 0.3 s first). */
export type SpawnPoint =
  | { id: string; kind: 'edge'; side: -1 | 1; z: number }
  | { id: string; kind: 'door'; door: number };

/**
 * M7 options for an entry: a variant (squad leader, bodyguard, VIP); a squad name tying a leader
 * or VIP to its members/guards (spawn the leader or VIP first); unaware placement for stealth.
 */
export interface SpawnOpts {
  variant?: Actor['variant'];
  squad?: string;
  aware?: false;
  idle?: AiState['idle'];
  patrol?: [number, number];
  face?: 1 | -1;
  /** M14 world-crowd-dancefloor: grunts with the same crowd name are alerted together. */
  crowd?: string;
  /** M8: a job instead of the usual fight (wave B's cannoneer). */
  role?: AiState['role'];
}

/** [delay after the previous entry (s), spawn point id, enemy type, weapon, options] */
export type WaveEntry = [number, string, ActorKind, HeldItem, SpawnOpts?];

export interface WaveDef {
  id: string;
  /** Starts once fewer than this many enemies are alive (the first wave starts at once). */
  threshold: number;
  /** Entries wait while this many enemies are alive (keeps it a trickle). invented per wave */
  maxAlive: number;
  entries: WaveEntry[];
  /** Keep the scripted order, delays and spawn points (no spawn variety). */
  exact?: true;
  /** Co-op (2 players): replaces maxAlive / entries. invented per wave */
  coop?: { maxAlive: number; entries: WaveEntry[] };
}

type PlayedWave = { maxAlive: number; entries: WaveEntry[] };

/** The wave as played with this many players, at the world's difficulty. */
function forPlayers(w: WaveDef, world: World): PlayedWave {
  const base = world.players.length > 1 && w.coop ? w.coop : w;
  return scaled(base, world.difficulty);
}

const scaledWaves = new WeakMap<PlayedWave, Map<Difficulty, PlayedWave>>();

/**
 * Difficulty: entries thinned out or repeated (src/sim/difficulty.ts). Leaders, VIPs, mini-bosses
 * and jobs (variant or role) always come once; unaware guards are never doubled (they'd stand in
 * each other). A dropped entry's delay carries over to the next one; copies follow 0.4 s apart.
 */
function scaled(w: PlayedWave, d: Difficulty): PlayedWave {
  if (d === 'pro') return w;
  let byD = scaledWaves.get(w);
  if (!byD) scaledWaves.set(w, (byD = new Map()));
  let out = byD.get(d);
  if (out) return out;
  const m = DIFFICULTY[d].enemies;
  const entries: WaveEntry[] = [];
  let carry = 0;
  let plain = 0;
  for (const e of w.entries) {
    const [delay, , , , opts] = e;
    const key = !!(opts?.variant || opts?.role);
    let n = key ? 1 : Math.round((plain + 1) * m) - Math.round(plain * m);
    if (!key) plain++;
    if (opts?.aware === false) n = Math.min(n, 1);
    if (n === 0) { carry += delay; continue; }
    entries.push([delay + carry, ...e.slice(1)] as WaveEntry);
    carry = 0;
    for (let k = 1; k < n; k++) entries.push([0.4, ...e.slice(1)] as WaveEntry); // invented
  }
  // more at once on the harder settings
  out = { maxAlive: m > 1 ? Math.ceil(w.maxAlive * Math.sqrt(m)) : w.maxAlive, entries };
  byD.set(d, out);
  return out;
}

export interface RoomScript {
  spawns: SpawnPoint[];
  waves: WaveDef[];
}

export type DirectorState = 'waiting' | 'running' | 'done';

/** Runs a room's wave script. Stepped by the World every tick. */
export class WaveDirector {
  wave = -1;
  private entry = 0;
  private timer = 0;
  state: DirectorState = 'waiting';
  spawned = 0;
  /** Doors opening for a pending spawn: door index -> seconds until the enemy steps through. */
  private pendingDoors: { door: number; t: number; kind: ActorKind; held: HeldItem; opts?: SpawnOpts }[] = [];

  /** Spawn variety: the current wave's groups (entries in arrival order, the delay before each group). */
  private groups?: { members: WaveEntry[]; gap: number }[];
  private group = 0;
  /** Seconds the ready group has waited for room under maxAlive. */
  private held = 0;
  /** Spawn variety: released group members on their way in (seconds until they appear). */
  private queued: { t: number; sp: SpawnPoint; dz: number; settle: number; e: WaveEntry }[] = [];
  /** Spawn variety: world time each spawn point was last used (least-recently-used spread). */
  private lastUsed = new Map<string, number>();
  private rngState = 0;

  /** `announce`: emit `roomCleared` when done (a stage script's waves leave that to the script). */
  constructor(readonly script: RoomScript, startWave = 0, private announce = true) {
    this.wave = startWave - 1;
  }

  /** Every entry of the current wave has spawned (or come through its door). */
  allSpawned(world: World): boolean {
    const def = this.script.waves[this.wave];
    if (!def || this.pendingDoors.length > 0 || this.queued.length > 0) return false;
    return this.entry >= forPlayers(def, world).entries.length;
  }

  /** Every enemy of the current wave has spawned and none is left alive (the kill cam's "last kill of a wave"). */
  waveFinished(world: World): boolean {
    const def = this.script.waves[this.wave];
    if (!def) return false;
    const w = forPlayers(def, world);
    if (this.entry < w.entries.length || this.pendingDoors.length > 0 || this.queued.length > 0) return false;
    return !world.actors.some((a) => a.ai && alive(a));
  }

  step(world: World, dt: number): void {
    this.stepDoors(world, dt);
    this.stepQueued(world, dt);
    if (this.state === 'done') return;
    const aliveEnemies = world.actors.filter((a) => a.ai && alive(a)).length + this.pendingDoors.length + this.queued.length;
    const waves = this.script.waves;
    if (this.state === 'waiting') {
      const next = waves[this.wave + 1];
      if (!next) {
        if (aliveEnemies === 0) {
          this.state = 'done';
          if (this.announce) world.events.emit('roomCleared', { kills: world.kills });
        }
        return;
      }
      if ((this.wave >= 0 && aliveEnemies >= next.threshold) || this.queued.length > 0) return;
      this.wave++;
      this.entry = 0;
      this.timer = forPlayers(next, world).entries[0]?.[0] ?? 0;
      this.state = 'running';
      this.groups = varied(next) ? this.planGroups(world, next) : undefined;
      if (this.groups) { this.group = 0; this.held = 0; this.timer = this.groups[0]?.gap ?? 0; }
      world.events.emit('waveStart', { wave: next.id });
      return;
    }
    const w = forPlayers(waves[this.wave], world);
    if (this.groups) { this.stepGroups(world, dt, aliveEnemies, w.maxAlive); return; }
    if (this.entry >= w.entries.length) {
      this.state = 'waiting';
      return;
    }
    this.timer -= dt;
    if (this.timer > 0 || aliveEnemies >= w.maxAlive) return;
    const [, spawnId, kind, held, opts] = w.entries[this.entry];
    this.spawn(world, spawnId, kind, held, opts);
    this.entry++;
    this.timer = w.entries[this.entry]?.[0] ?? 0;
  }

  // ---------- spawn variety ----------

  /** mulberry32 on the director's own state (seeded from the world's RNG at each varied wave's start). */
  private rand(): number {
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private between(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rand();
  }

  /**
   * Cut the wave into groups of groupMin-groupMax (never more than maxAlive) with seeded gaps,
   * scaled by the script's own pace, and shuffle the plain entries inside each group. Entries with
   * options (squads, roles, variants) keep their place; the wave's last entry stays last.
   */
  private planGroups(world: World, def: WaveDef): { members: WaveEntry[]; gap: number }[] {
    this.rngState = (world.rng() * 4294967296) | 0;
    const V = TUNING.waves.variety;
    const { entries, maxAlive } = forPlayers(def, world);
    const pace = entries.length ? Math.min(1.5, Math.max(0.5, entries.reduce((s, e) => s + e[0], 0) / entries.length)) : 1;
    const hi = Math.max(1, Math.min(V.groupMax, maxAlive)), lo = Math.min(hi, V.groupMin);
    const groups: { members: WaveEntry[]; gap: number }[] = [];
    for (let i = 0; i < entries.length;) {
      const n = Math.min(entries.length - i, lo + Math.floor(this.rand() * (hi - lo + 1)));
      const members = entries.slice(i, i + n);
      const free = members.map((e, k) => (plain(e) && i + k !== entries.length - 1 ? k : -1)).filter((k) => k >= 0);
      for (let k = free.length - 1; k > 0; k--) {
        const j = Math.floor(this.rand() * (k + 1));
        [members[free[k]], members[free[j]]] = [members[free[j]], members[free[k]]];
      }
      groups.push({ members, gap: i === 0 ? entries[0][0] : this.between(V.gapMin, V.gapMax) * pace });
      i += n;
    }
    return groups;
  }

  private stepGroups(world: World, dt: number, aliveEnemies: number, maxAlive: number): void {
    const V = TUNING.waves.variety;
    const g = this.groups![this.group];
    if (!g) { this.groups = undefined; this.state = 'waiting'; return; }
    // pressure: (nearly) nobody left standing, the next group hurries
    this.timer -= dt * (aliveEnemies <= V.pressureAlive ? V.pressureRate : 1);
    if (this.timer > 0) return;
    const room = maxAlive - aliveEnemies;
    // the group comes in together: wait for room for all of it, then send whoever fits
    if (room <= 0 || (room < g.members.length && this.held < V.holdMax)) { this.held += dt; return; }
    this.release(world, g.members.splice(0, Math.min(room, g.members.length)));
    this.held = 0;
    if (g.members.length) { this.timer = 0; return; }
    this.group++;
    const next = this.groups![this.group];
    if (next) this.timer = next.gap;
    else { this.groups = undefined; this.state = 'waiting'; }
  }

  /** Send a group: each member's point (spread, clear of the players, maybe a flank), staggered; doors open once. */
  private release(world: World, members: WaveEntry[]): void {
    const V = TUNING.waves.variety;
    const spawns = this.script.spawns;
    const p = world.activePlayers[0] ?? world.players[0];
    const safe = spawns.filter((sp) => !nearPlayer(world, sp));
    const pool = safe.length ? safe : spawns;
    const twoSided = new Set(pool.map((sp) => sideOf(world, sp))).size > 1;
    const flankPts = p && twoSided ? pool.filter((sp) => sideOf(world, sp) === -p.facing) : [];
    const flankAt = flankPts.length && this.rand() < V.flank ? Math.floor(this.rand() * members.length) : -1;
    const split = this.rand() < V.split;
    const used = new Set<string>();
    let prev: SpawnPoint | undefined, shared: SpawnPoint | undefined;
    let t = 0;
    members.forEach((e, k) => {
      let sp: SpawnPoint, lead = 0;
      if (!plain(e)) sp = spawns.find((s) => s.id === e[1]) ?? pool[0];
      else if (k === flankAt) {
        sp = this.leastUsed(flankPts, used);
        lead = V.flankLead;
        const side = sideOf(world, sp);
        world.events.emit('flank', { side, x: side * world.room.halfWidth, y: 1, z: zOf(world, sp) });
      } else if (!split) sp = shared ??= this.leastUsed(pool, new Set());
      else {
        // alternate sides where the room has both
        const other = prev && twoSided ? pool.filter((s) => sideOf(world, s) !== sideOf(world, prev!)) : [];
        sp = this.leastUsed(other.length && this.rand() < 0.6 ? other : pool, used);
      }
      used.add(sp.id);
      prev = sp;
      this.lastUsed.set(sp.id, world.time + k * 0.01);
      if (k > 0) t += this.between(V.jitterMin, V.jitterMax);
      const at = Math.max(t, lead);
      const dz = (this.rand() * 2 - 1) * 0.15;
      const settle = k * V.settleStep;
      if (sp.kind === 'door') {
        // enemy-spawning: the door opens visibly ~0.3 s before anyone steps through, and stays open for the group
        const d = world.doors[sp.door];
        if (d && d.target !== 1) world.openDoor(sp.door);
        if (d) d.hold = Math.max(d.hold, W.doorOpen + at + W.doorHold);
        this.queued.push({ t: W.doorOpen + at, sp, dz, settle, e });
      } else this.queued.push({ t: at, sp, dz, settle, e });
    });
  }

  /** The point used longest ago (unused first), ties broken by the seed; skips `taken` while it can. */
  private leastUsed(pts: SpawnPoint[], taken: Set<string>): SpawnPoint {
    const free = pts.filter((s) => !taken.has(s.id));
    const from = free.length ? free : pts;
    const age = (s: SpawnPoint) => this.lastUsed.get(s.id) ?? -Infinity;
    const oldest = Math.min(...from.map(age));
    const best = from.filter((s) => age(s) <= oldest + 1.5);
    return best[Math.floor(this.rand() * best.length)];
  }

  private stepQueued(world: World, dt: number): void {
    if (!this.queued.length) return;
    for (const q of this.queued) {
      q.t -= dt;
      if (q.t > 0) continue;
      const [, , kind, held, opts] = q.e;
      const sp = q.sp, r = world.room;
      let x: number, z: number;
      if (sp.kind === 'door') {
        const door = r.doors[sp.door];
        x = (door.wall === 'left' ? -1 : 1) * (r.halfWidth + 0.2);
        z = Math.min(door.z1 - 0.1, Math.max(door.z0 + 0.1, (door.z0 + door.z1) / 2 + q.dz));
      } else {
        x = sp.side * (r.halfWidth + W.edgeOffset);
        z = Math.min(r.zBack - 0.2, Math.max(r.zFront + 0.2, sp.z + q.dz));
      }
      this.spawned++;
      this.entry++;
      const a = spawnEnemy(world, kind, held, x, z, opts);
      // a group doesn't all strike or open fire the moment it's in
      a.ai!.cooldown = Math.max(a.ai!.cooldown, q.settle);
    }
    this.queued = this.queued.filter((q) => q.t > 0);
  }

  private spawn(world: World, spawnId: string, kind: ActorKind, held: HeldItem, opts?: SpawnOpts): void {
    const sp = this.script.spawns.find((s) => s.id === spawnId);
    if (!sp) throw new Error(`unknown spawn point ${spawnId}`);
    this.spawned++;
    if (sp.kind === 'door') {
      // enemy-spawning: the door opens visibly ~0.3 s before anyone steps through
      world.openDoor(sp.door);
      this.pendingDoors.push({ door: sp.door, t: W.doorOpen, kind, held, opts });
      return;
    }
    const x = sp.side * (world.room.halfWidth + W.edgeOffset);
    spawnEnemy(world, kind, held, x, sp.z, opts);
  }

  private stepDoors(world: World, dt: number): void {
    for (const d of this.pendingDoors) {
      d.t -= dt;
      if (d.t > 0) continue;
      const door = world.room.doors[d.door];
      const side = door.wall === 'left' ? -1 : 1;
      spawnEnemy(world, d.kind, d.held, side * (world.room.halfWidth + 0.2), (door.z0 + door.z1) / 2, d.opts);
    }
    this.pendingDoors = this.pendingDoors.filter((d) => d.t > 0);
  }
}

/** Spawn variety applies to this wave (the switch is on and the wave isn't exact). */
function varied(def: WaveDef): boolean {
  return TUNING.waves.variety.on > 0 && !def.exact;
}

/** An entry without options: free to move to another point or place in its group. */
function plain(e: WaveEntry): boolean {
  return !e[4] || Object.keys(e[4]).length === 0;
}

function sideOf(world: World, sp: SpawnPoint): -1 | 1 {
  return sp.kind === 'edge' ? sp.side : world.room.doors[sp.door]?.wall === 'left' ? -1 : 1;
}

function zOf(world: World, sp: SpawnPoint): number {
  if (sp.kind === 'edge') return sp.z;
  const d = world.room.doors[sp.door];
  return d ? (d.z0 + d.z1) / 2 : world.room.zFront;
}

/** A player stands right where this point lets someone in. */
function nearPlayer(world: World, sp: SpawnPoint): boolean {
  const x = sideOf(world, sp) * world.room.halfWidth, z = zOf(world, sp);
  return world.activePlayers.some((p) => Math.abs(p.pos.x - x) < TUNING.waves.variety.safeDist && Math.abs(p.pos.z - z) < 1);
}

export function spawnEnemy(world: World, kind: ActorKind, held: HeldItem, x: number, z: number, opts: SpawnOpts = {}) {
  const a = createActor(kind, x, z, opts.face ?? (x > 0 ? -1 : 1), { held });
  a.ai = newAiState(world);
  a.brain = gruntBrain(world);
  a.entering = Math.abs(x) > world.room.halfWidth - TUNING.move.radius;
  applySpawnOpts(world, a, opts);
  world.actors.push(a);
  world.events.emit('spawn', { actorId: a.id, x, y: 0, z });
  return a;
}

/** Squads: the leader or VIP each squad name points to (spawned first). */
const squadHeads = new WeakMap<World, Map<string, number>>();

/** Variant, squad membership and unaware placement (M7). */
export function applySpawnOpts(world: World, a: Actor, opts: SpawnOpts): void {
  const ai = a.ai!;
  a.variant = opts.variant;
  ai.role = opts.role;
  ai.crowd = opts.crowd;
  // enemy-elite-bodyguard: 2 hits (a head shot: 1)
  if (opts.variant === 'bodyguard') a.hp = a.maxHp = TUNING.ai.bodyguardHits;
  // M9 the mini-boss (riot helmet): tougher than a grunt; the steal is the way in (boss-clown)
  if (opts.variant === 'riot') a.hp = a.maxHp = bossHp(world, TUNING.ai.riotHp);
  // M14 enemy-agent: three head shots
  if (opts.variant === 'agent') {
    a.hp = a.maxHp = TUNING.ai.agent.hp;
    // the pistol rides in the back hand, so the front hand is free for his jabs
    if (a.hands[0] && !a.hands[1]) { a.hands[1] = a.hands[0]; a.hands[0] = null; a.pose.heldB = a.pose.held; a.pose.held = null; }
  }
  if (opts.aware === false) {
    ai.aware = false;
    ai.idle = opts.idle ?? 'stand';
    ai.patrol = opts.patrol;
  }
  if (!opts.squad) return;
  let heads = squadHeads.get(world);
  if (!heads) squadHeads.set(world, (heads = new Map()));
  if (opts.variant === 'leader' || opts.variant === 'vip' || opts.variant === 'riot') { heads.set(opts.squad, a.id); return; }
  const head = heads.get(opts.squad);
  if (head === undefined) return;
  if (opts.variant === 'bodyguard') {
    // guards take alternate sides of the VIP
    const taken = world.actors.filter((o) => o.ai?.guard === head).length;
    ai.guard = head;
    ai.guardSide = taken % 2 ? 1 : -1;
  } else ai.leader = head;
}
