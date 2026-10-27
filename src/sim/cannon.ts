// Cannons (PLAN.md M1 dodge labs, M8 boss cannon): a ball at chest height, 26 H/s, every 1.3 s.
// The debug cannon fires forever and hurts nobody. A `live` cannon (the stage-1 boss's) can fall
// out of the sky first (world-falling-hazard: shadow, drop, crush, then it stays as terrain),
// fires only while someone mans it, swings its barrel to the target's depth, and its balls
// knock down and kill.
import { TUNING } from '../data/tuning';
import { type Actor, alive } from './actor';
import { applyHit } from './combat';
import type { World } from './world';

const C = TUNING.cannon, CN = TUNING.boss.cannon;

export interface Cannon {
  x: number; z: number; facing: 1 | -1; timer: number;
  /** M8: the boss cannon (balls hurt); `y` = height above its stand while it falls (0 = landed). */
  live?: boolean;
  y?: number;
  /** Falling: seconds since its shadow appeared (it drops after TUNING.boss.cannon.shadow). */
  drop?: { t: number };
  /** Balls left in this volley; it only fires while > 0 (unset = fires forever, the debug cannon). */
  shots?: number;
  /** Who mans it (the boss, a grunt in wave B): his balls don't hit him. */
  byId?: number;
  /** Depth the next ball flies at (the barrel swings toward the target). */
  aimZ?: number;
}
export interface Ball { x: number; y: number; z: number; vx: number; live?: boolean; byId?: number }

/** Depth band in which a ball can hit (ball radius + half a body depth). invented */
const DEPTH_BAND = 0.25;
/** Half body width for the ball hit test. measured head/body width ~0.4 H */
const HALF_WIDTH = 0.2;
/** Footprint of a landed cannon (H): barrel + stand (matches the cannon painter). */
const CANNON_HALF = { x: 0.42, z: 0.22, top: 0.72 };

/** world-falling-hazard: its shadow appears at (x, z) now; it drops after the shadow time. */
export function dropCannon(world: World, x: number, z: number, facing: 1 | -1, byId?: number): Cannon {
  const c: Cannon = { x, z, facing, timer: 0, live: true, y: CN.dropHeight, shots: 0, byId, drop: { t: 0 } };
  world.cannons.push(c);
  world.events.emit('cannonDrop', { x, z, phase: 'shadow' });
  return c;
}

/** A cannon already standing (stage routes that start after the boss): nobody mans it yet. */
export function placeCannon(world: World, x: number, z: number, facing: 1 | -1): Cannon {
  const c: Cannon = { x, z, facing, timer: 0, live: true, y: 0, shots: 0 };
  world.cannons.push(c);
  addProp(world, c);
  return c;
}

/** It lands: whoever is under it is crushed and shoved clear, and it stays as solid ground. */
export function landCannon(world: World, c: Cannon): void {
  const H = CANNON_HALF, lim = world.room.halfWidth - 0.3;
  c.y = 0;
  c.drop = undefined;
  const by = c.byId !== undefined ? world.actorById(c.byId) : undefined;
  for (const o of world.actors) {
    if (o === by || o.swept) continue;
    const dx = o.pos.x - c.x, dz = o.pos.z - c.z;
    if (Math.abs(dz) > Math.max(CN.crushBand, H.z + 0.2)) continue;
    if (alive(o) && Math.abs(dx) <= CN.crushRadius && Math.abs(dz) <= CN.crushBand) applyHit(world, by, o, 'cannon', Math.sign(dx) || c.facing, 0, { x: o.pos.x, y: 0.5, z: o.pos.z });
    // nothing may stay inside the solid footprint: shove it out the nearer side
    if (Math.abs(dx) < H.x + TUNING.move.radius) {
      o.pos.x = Math.max(-lim, Math.min(lim, c.x + (Math.sign(dx) || -c.facing) * (H.x + TUNING.move.radius + 0.02)));
    }
  }
  addProp(world, c);
  world.events.emit('cannonDrop', { x: c.x, z: c.z, phase: 'land' });
  world.events.emit('cameraShake', { px: CN.landShake, seconds: 0.35 });
}

function addProp(world: World, c: Cannon): void {
  const H = CANNON_HALF;
  world.room.props.push({ kind: 'cannon', x0: c.x - H.x, x1: c.x + H.x, z0: c.z - H.z, z1: c.z + H.z, top: H.top });
}

/** Remove a cannon and its prop (labs that drop one after another). */
export function removeCannon(world: World, c: Cannon): void {
  world.cannons = world.cannons.filter((k) => k !== c);
  world.room.props = world.room.props.filter((p) => !(p.kind === 'cannon' && Math.abs((p.x0 + p.x1) / 2 - c.x) < 1e-6 && Math.abs((p.z0 + p.z1) / 2 - c.z) < 1e-6));
}

export function stepCannons(world: World, dt: number): void {
  for (const c of world.cannons) {
    if (c.drop) {
      // shadow first, then the drop
      const t0 = c.drop.t;
      c.drop.t += dt;
      if (c.drop.t < CN.shadow) continue;
      if (t0 < CN.shadow) world.events.emit('cannonDrop', { x: c.x, z: c.z, phase: 'fall' });
      c.y = Math.max(0, (c.y ?? 0) - CN.fallSpeed * dt);
      if (c.y <= 0) landCannon(world, c);
      continue;
    }
    if ((c.y ?? 0) > 0 || (c.shots !== undefined && c.shots <= 0)) continue;
    // a manned cannon fires only while its gunner stands at it, able (hit, knocked down or dead: it stops)
    if (c.byId !== undefined) {
      const m = world.actorById(c.byId);
      if (!m || !alive(m) || (m.kind !== 'boss' && m.state !== 'free' && m.state !== 'attack')) continue;
    }
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer += C.interval;
      if (c.shots !== undefined) c.shots--;
      const z = c.aimZ ?? c.z;
      world.balls.push({ x: c.x + c.facing * 0.4, y: C.height, z, vx: c.facing * C.ballSpeed, live: c.live, byId: c.byId });
      world.events.emit('cannonFire', { x: c.x, z: c.z });
    }
  }
  const out: typeof world.balls = [];
  for (const ball of world.balls) {
    const prevX = ball.x;
    ball.x += ball.vx * dt;
    const hit = world.actors.find((a) => !a.pose.dead && a.id !== ball.byId && a.state !== 'grabbed' && sweptHit(a, prevX, ball));
    if (hit) {
      world.events.emit('cannonHit', { actorId: hit.id });
      if (ball.live) applyHit(world, world.actorById(ball.byId ?? -1), hit, 'cannon', Math.sign(ball.vx), 0, { x: hit.pos.x, y: ball.y, z: hit.pos.z });
      continue;
    }
    if (Math.abs(ball.x) < world.room.halfWidth + 1) out.push(ball);
  }
  world.balls = out;
}

/** Swept test so a fast ball can't tunnel through a body between ticks. */
function sweptHit(a: Actor, prevX: number, ball: Ball): boolean {
  if (Math.abs(a.pos.z - ball.z) > DEPTH_BAND) return false;
  const lo = Math.min(prevX, ball.x) - C.radius, hi = Math.max(prevX, ball.x) + C.radius;
  if (a.pos.x + HALF_WIDTH < lo || a.pos.x - HALF_WIDTH > hi) return false;
  const feet = a.pos.y, top = a.pos.y + a.body.height;
  return ball.y + C.radius > feet && ball.y - C.radius < top;
}
