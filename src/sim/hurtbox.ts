// Hurtboxes (PLAN.md M2): head ellipse + body capsule in actor-local H, carried by the root
// transform, so a prone or lying body has a lying hurtbox. Melee tests a fist circle against
// them; M5 projects the same shapes to the screen for bullets.
import { worldToRoot } from '../anim/skeleton';
import type { Actor } from './actor';

/** Measured head 0.45 x 0.40 H at 0.79 H (design/art-direction.md). */
export const HEAD = { x: 0.01, y: -0.79, rx: 0.2, ry: 0.225 };
/** Body tube 0.30 -> 0.40 H wide, hem at 0.045 H: a capsule along the body axis. */
export const BODY = { y0: -0.13, y1: -0.5, r: 0.18 };

export type HurtPart = 'head' | 'body';

/**
 * Does a circle at world (x, y) with radius `r` touch the actor's hurtboxes (ignoring depth)?
 * Returns the part hit, head first.
 */
export function circleHits(a: Actor, x: number, y: number, r: number): HurtPart | null {
  const [lx, ly] = worldToRoot(a.pose.root, a.facing, x - a.pos.x, y - a.pos.y);
  if (!a.pose.headless) {
    const ex = (lx - HEAD.x) / (HEAD.rx + r), ey = (ly - HEAD.y) / (HEAD.ry + r);
    if (ex * ex + ey * ey <= 1) return 'head';
  }
  const cy = Math.max(BODY.y1, Math.min(BODY.y0, ly));
  if (Math.hypot(lx, ly - cy) <= BODY.r + r) return 'body';
  return null;
}

