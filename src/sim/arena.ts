// Stage 3's second half (PLAN.md M12): the arena lock (research/mechanics/world-arena-lock: walls
// slam down from the sky one at a time, shadow first, and crush whatever is under them until the
// desert is a sealed box) and the last stand (world-last-stand: stabbed from behind, red bars, you
// can't move but can aim and fire for ~5 s, the backward shot allowed; the stage ends either way).
import { TUNING } from '../data/tuning';
import { type Actor, alive } from './actor';
import { applyHit } from './combat';
import type { World } from './world';

const AL = TUNING.arenaLock, LS = TUNING.lastStand;

export type WallSide = 'right' | 'back' | 'left';
export interface LockWall { side: WallSide; t: number; y: number; phase: 'shadow' | 'fall' | 'landed' }

/** Drop the next wall (shadow first, it lands after AL.shadow s). */
export function dropWall(world: World, side: WallSide): LockWall {
  const w: LockWall = { side, t: 0, y: AL.height, phase: 'shadow' };
  world.lockWalls.push(w);
  world.events.emit('wallDrop', { side, phase: 'shadow' });
  return w;
}

/** All three walls are down: a sealed box (walls stop bodies, the room has a ceiling-less box look). */
export const sealed = (world: World) => world.lockWalls.length >= 3 && world.lockWalls.every((w) => w.phase === 'landed');

export function stepLockWalls(world: World, dt: number): void {
  for (const w of world.lockWalls) {
    if (w.phase === 'landed') continue;
    w.t += dt;
    if (w.phase === 'shadow' && w.t >= AL.shadow) { w.phase = 'fall'; w.t = 0; }
    if (w.phase !== 'fall') continue;
    w.y -= AL.fallSpeed * dt;
    if (w.y > 0) continue;
    w.y = 0;
    w.phase = 'landed';
    landWall(world, w);
  }
}

/** It lands: everything standing where it comes down is crushed. */
function landWall(world: World, w: LockWall): void {
  const r = world.room, band = AL.crushBand;
  for (const o of world.actors) {
    const under = w.side === 'back' ? o.pos.z >= r.zBack - band : w.side === 'right' ? o.pos.x >= r.halfWidth - band : o.pos.x <= -r.halfWidth + band;
    if (!under) continue;
    if (alive(o)) applyHit(world, undefined, o, 'cannon', w.side === 'right' ? -1 : 1, 0, { x: o.pos.x, y: 0.5, z: o.pos.z });
  }
  r.lockWalls = world.lockWalls.filter((x) => x.phase === 'landed').map((x) => x.side);
  // sealed: from now on the walls are walls (bodies slam into them)
  if (sealed(world)) r.outdoor = false;
  world.events.emit('wallDrop', { side: w.side, phase: 'land' });
}

// ---------- the last stand ----------

export interface LastStand { t: number; done: boolean }

/** Stabbed from behind: the players can't move for LS.seconds, only aim and fire. */
export function startLastStand(world: World): LastStand {
  const ls: LastStand = { t: 0, done: false };
  world.lastStand = ls;
  world.events.emit('lastStand', { phase: 'start' });
  return ls;
}

export function stepLastStand(world: World, dt: number): void {
  const ls = world.lastStand;
  if (!ls || ls.done) return;
  ls.t += dt;
  if (ls.t >= LS.seconds) ls.done = true;
}

/** The last stand's hold on a player's command: no moving, jumping, diving or grabbing. */
export function lastStandCommand(a: Actor, cmd: import('./command').PlayerCommand): import('./command').PlayerCommand {
  if (a.playerIndex === undefined) return cmd;
  return { ...cmd, moveX: 0, moveZ: 0, jump: false, dive: false, grab: false, pickup: false };
}
