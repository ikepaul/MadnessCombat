// Debug cannon for the dodge labs (PLAN.md M1): a ball at chest height, 26 H/s, every 1.3 s.
// The stage-1 boss cannon (M8) builds on this.
import { TUNING } from '../data/tuning';
import type { Actor } from './actor';
import type { World } from './world';

const C = TUNING.cannon;

export interface Cannon { x: number; z: number; facing: 1 | -1; timer: number }
export interface Ball { x: number; y: number; z: number; vx: number }

/** Depth band in which a ball can hit (ball radius + half a body depth). invented */
const DEPTH_BAND = 0.25;
/** Half body width for the ball hit test. measured head/body width ~0.4 H */
const HALF_WIDTH = 0.2;

export function stepCannons(world: World, dt: number): void {
  for (const c of world.cannons) {
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer += C.interval;
      world.balls.push({ x: c.x + c.facing * 0.4, y: C.height, z: c.z, vx: c.facing * C.ballSpeed });
      world.events.emit('cannonFire', { x: c.x, z: c.z });
    }
  }
  const out: Ball[] = [];
  for (const ball of world.balls) {
    const prevX = ball.x;
    ball.x += ball.vx * dt;
    const hit = world.actors.find((a) => !a.pose.dead && sweptHit(a, prevX, ball));
    if (hit) {
      world.events.emit('cannonHit', { actorId: hit.id });
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
