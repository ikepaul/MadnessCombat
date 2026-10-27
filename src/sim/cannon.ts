// Cannons (PLAN.md M1 dodge labs, M8 boss cannon): a ball at chest height, 26 H/s, every 1.3 s.
// The debug cannon fires forever and hurts nobody. The stage-1 boss's cannon (`live`) falls out
// of the sky first (shadow, drop, crush; src/sim/boss.ts drives it), fires only while someone
// mans it, swings its barrel to the target's depth, and its balls knock down and kill.
import { TUNING } from '../data/tuning';
import { type Actor, alive } from './actor';
import { applyHit } from './combat';
import type { World } from './world';

const C = TUNING.cannon;

export interface Cannon {
  x: number; z: number; facing: 1 | -1; timer: number;
  /** M8: the boss cannon (balls hurt); `y` = height above its stand while it falls (0 = landed). */
  live?: boolean;
  y?: number;
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

export function stepCannons(world: World, dt: number): void {
  for (const c of world.cannons) {
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
