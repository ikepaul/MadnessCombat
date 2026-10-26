// Spawn points and wave scripts (PLAN.md M3, research/mechanics/enemy-spawning). A wave is a
// list of (delay, spawn point, enemy type, weapon) entries; it trickles in, holding back while
// too many are alive, and the next wave starts once the alive count drops below its threshold.
import { TUNING } from '../data/tuning';
import { type ActorKind, alive, createActor, type HeldItem } from './actor';
import { gruntBrain, newAiState } from './ai';
import type { World } from './world';

const W = TUNING.waves;

/** Screen edge (walk in from off-screen) or a door in the room (opens 0.3 s first). */
export type SpawnPoint =
  | { id: string; kind: 'edge'; side: -1 | 1; z: number }
  | { id: string; kind: 'door'; door: number };

/** [delay after the previous entry (s), spawn point id, enemy type, weapon] */
export type WaveEntry = [number, string, ActorKind, HeldItem];

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
  private pendingDoors: { door: number; t: number; kind: ActorKind; held: HeldItem }[] = [];

  constructor(readonly script: RoomScript, startWave = 0) {
    this.wave = startWave - 1;
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
    const [, spawnId, kind, held] = w.entries[this.entry];
    this.spawn(world, spawnId, kind, held);
    this.entry++;
    this.timer = w.entries[this.entry]?.[0] ?? 0;
  }

  private spawn(world: World, spawnId: string, kind: ActorKind, held: HeldItem): void {
    const sp = this.script.spawns.find((s) => s.id === spawnId);
    if (!sp) throw new Error(`unknown spawn point ${spawnId}`);
    this.spawned++;
    if (sp.kind === 'door') {
      // enemy-spawning: the door opens visibly ~0.3 s before anyone steps through
      world.openDoor(sp.door);
      this.pendingDoors.push({ door: sp.door, t: W.doorOpen, kind, held });
      return;
    }
    const x = sp.side * (world.room.halfWidth + W.edgeOffset);
    spawnEnemy(world, kind, held, x, sp.z);
  }

  private stepDoors(world: World, dt: number): void {
    for (const d of this.pendingDoors) {
      d.t -= dt;
      if (d.t > 0) continue;
      const door = world.room.doors[d.door];
      const side = door.wall === 'left' ? -1 : 1;
      spawnEnemy(world, d.kind, d.held, side * (world.room.halfWidth + 0.2), (door.z0 + door.z1) / 2);
    }
    this.pendingDoors = this.pendingDoors.filter((d) => d.t > 0);
  }
}

export function spawnEnemy(world: World, kind: ActorKind, held: HeldItem, x: number, z: number) {
  const a = createActor(kind, x, z, x > 0 ? -1 : 1, { held });
  a.ai = newAiState(world);
  a.brain = gruntBrain(world);
  a.entering = Math.abs(x) > world.room.halfWidth - TUNING.move.radius;
  world.actors.push(a);
  world.events.emit('spawn', { actorId: a.id, x, y: 0, z });
  return a;
}
