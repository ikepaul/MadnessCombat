// Spawn points and wave scripts (PLAN.md M3, research/mechanics/enemy-spawning). A wave is a
// list of (delay, spawn point, enemy type, weapon) entries; it trickles in, holding back while
// too many are alive, and the next wave starts once the alive count drops below its threshold.
import { TUNING } from '../data/tuning';
import { type Actor, type ActorKind, alive, createActor, type HeldItem } from './actor';
import { type AiState, gruntBrain, newAiState } from './ai';
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
  /** Co-op (2 players): replaces maxAlive / entries. invented per wave */
  coop?: { maxAlive: number; entries: WaveEntry[] };
}

/** The wave as played with this many players. */
function forPlayers(w: WaveDef, players: number): { maxAlive: number; entries: WaveEntry[] } {
  return players > 1 && w.coop ? w.coop : w;
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

  constructor(readonly script: RoomScript, startWave = 0) {
    this.wave = startWave - 1;
  }

  /** Every entry of the current wave has spawned (or come through its door). */
  allSpawned(world: World): boolean {
    const def = this.script.waves[this.wave];
    if (!def || this.pendingDoors.length > 0) return false;
    return this.entry >= forPlayers(def, world.players.length).entries.length;
  }

  /** Every enemy of the current wave has spawned and none is left alive (the kill cam's "last kill of a wave"). */
  waveFinished(world: World): boolean {
    const def = this.script.waves[this.wave];
    if (!def) return false;
    const w = forPlayers(def, world.players.length);
    if (this.entry < w.entries.length || this.pendingDoors.length > 0) return false;
    return !world.actors.some((a) => a.ai && alive(a));
  }

  step(world: World, dt: number): void {
    this.stepDoors(world, dt);
    if (this.state === 'done') return;
    const aliveEnemies = world.actors.filter((a) => a.ai && alive(a)).length + this.pendingDoors.length;
    const waves = this.script.waves;
    if (this.state === 'waiting') {
      const next = waves[this.wave + 1];
      if (!next) {
        if (aliveEnemies === 0) {
          this.state = 'done';
          world.events.emit('roomCleared', { kills: world.kills });
        }
        return;
      }
      if (this.wave >= 0 && aliveEnemies >= next.threshold) return;
      this.wave++;
      this.entry = 0;
      this.timer = forPlayers(next, world.players.length).entries[0]?.[0] ?? 0;
      this.state = 'running';
      world.events.emit('waveStart', { wave: next.id });
      return;
    }
    const w = forPlayers(waves[this.wave], world.players.length);
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
  // enemy-elite-bodyguard: 2 hits (a head shot: 1)
  if (opts.variant === 'bodyguard') a.hp = a.maxHp = TUNING.ai.bodyguardHits;
  if (opts.aware === false) {
    ai.aware = false;
    ai.idle = opts.idle ?? 'stand';
    ai.patrol = opts.patrol;
  }
  if (!opts.squad) return;
  let heads = squadHeads.get(world);
  if (!heads) squadHeads.set(world, (heads = new Map()));
  if (opts.variant === 'leader' || opts.variant === 'vip') { heads.set(opts.squad, a.id); return; }
  const head = heads.get(opts.squad);
  if (head === undefined) return;
  if (opts.variant === 'bodyguard') {
    // guards take alternate sides of the VIP
    const taken = world.actors.filter((o) => o.ai?.guard === head).length;
    ai.guard = head;
    ai.guardSide = taken % 2 ? 1 : -1;
  } else ai.leader = head;
}
