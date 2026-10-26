// Screen-space hitscan (PLAN.md ground rules, decided: "if it looks like a hit, it's a hit").
// A bullet is a 2D ray on screen from the muzzle toward the cursor. Every hurtbox (head circle
// + body capsule, carried by the pose root and scaled by depth) is projected to the screen;
// the first one crossed is hit, whatever its depth. A prop blocks only if the ray crosses its
// screen shape before the target AND it is in front of the target in depth. A miss travels at
// the shooter's depth (a line at constant depth is a straight line on screen, so this is the
// same ray) until it meets a wall, the floor, the ceiling or a prop: that's where the hole goes.
import { rootToWorld } from '../anim/skeleton';
import { CAMERA, project, type ScreenPoint, scaleAt } from '../render/camera';
import type { Actor } from './actor';
import { BODY, HEAD } from './hurtbox';
import type { PropDef, RoomDef } from './room';
import type { World } from './world';

export type Surface = 'wall' | 'floor' | 'ceiling' | 'prop' | 'sky';

export interface ActorHit { actor: Actor; part: 'head' | 'body'; t: number; point: ScreenPoint }

export interface RayResult {
  /** The body hit, if any (after cover). */
  hit?: ActorHit;
  /** Where the tracer ends on screen. */
  end: ScreenPoint;
  /** What the tracer ends on (when no body was hit). */
  surface?: Surface;
  /** World point of the impact (decals, splatter). */
  world?: { x: number; y: number; z: number };
}

/** Ray-vs-circle: smallest t >= 0 where |from + dir t - c| = r. */
function hitCircle(from: ScreenPoint, dir: ScreenPoint, c: ScreenPoint, r: number): number | undefined {
  const fx = from[0] - c[0], fy = from[1] - c[1];
  const b = fx * dir[0] + fy * dir[1], cc = fx * fx + fy * fy - r * r;
  if (cc <= 0) return 0;
  const disc = b * b - cc;
  if (disc < 0) return undefined;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : undefined;
}

/** Ray-vs-segment: t along the ray where it crosses segment p-q. */
function hitSegment(from: ScreenPoint, dir: ScreenPoint, p: ScreenPoint, q: ScreenPoint): number | undefined {
  const ex = q[0] - p[0], ey = q[1] - p[1];
  const den = dir[0] * ey - dir[1] * ex;
  if (Math.abs(den) < 1e-9) return undefined;
  const wx = p[0] - from[0], wy = p[1] - from[1];
  const t = (wx * ey - wy * ex) / den, u = (wx * dir[1] - wy * dir[0]) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : undefined;
}

/** Ray-vs-capsule (two end circles + the two straight sides). */
function hitCapsule(from: ScreenPoint, dir: ScreenPoint, a: ScreenPoint, b: ScreenPoint, r: number): number | undefined {
  const lx = b[0] - a[0], ly = b[1] - a[1], len = Math.hypot(lx, ly) || 1;
  const nx = (-ly / len) * r, ny = (lx / len) * r;
  const ts = [
    hitCircle(from, dir, a, r), hitCircle(from, dir, b, r),
    hitSegment(from, dir, [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]),
    hitSegment(from, dir, [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny]),
  ].filter((t): t is number => t !== undefined);
  return ts.length ? Math.min(...ts) : undefined;
}

/** Local point of an actor -> screen. */
function screenOf(a: Actor, lx: number, ly: number): ScreenPoint {
  const [dx, dy] = rootToWorld(a.pose.root, a.facing, lx, ly);
  return project(a.pos.x + dx, a.pos.y + dy, a.pos.z);
}

/** First crossing of the actor's projected hurtboxes (head first on a tie). */
export function rayVsActor(from: ScreenPoint, dir: ScreenPoint, a: Actor, pad = 0): { t: number; part: 'head' | 'body' } | undefined {
  const s = scaleAt(a.pos.z);
  let best: { t: number; part: 'head' | 'body' } | undefined;
  if (!a.pose.headless) {
    const t = hitCircle(from, dir, screenOf(a, HEAD.x, HEAD.y), ((HEAD.rx + HEAD.ry) / 2 + pad) * s);
    if (t !== undefined) best = { t, part: 'head' };
  }
  const t = hitCapsule(from, dir, screenOf(a, 0, BODY.y0), screenOf(a, 0, BODY.y1), (BODY.r + pad) * s);
  if (t !== undefined && (!best || t < best.t - 1e-6)) best = { t, part: 'body' };
  return best;
}

/** Screen outline of a prop (its front face and top, or the pole's shaft). */
function propOutline(p: PropDef): ScreenPoint[] {
  if (p.kind === 'pole') {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = (p.x1 - p.x0) / 2, top = Math.sin(p.lean) * p.top;
    return [project(cx - w, 0, cz), project(cx + w, 0, cz), project(cx + top + w, p.top, cz), project(cx + top - w, p.top, cz)];
  }
  return [project(p.x0, 0, p.z0), project(p.x1, 0, p.z0), project(p.x1, p.top, p.z0), project(p.x1, p.top, p.z1), project(p.x0, p.top, p.z1), project(p.x0, p.top, p.z0)];
}

function rayVsProp(from: ScreenPoint, dir: ScreenPoint, p: PropDef): number | undefined {
  const pts = propOutline(p);
  let best: number | undefined;
  for (let i = 0; i < pts.length; i++) {
    const t = hitSegment(from, dir, pts[i], pts[(i + 1) % pts.length]);
    if (t !== undefined && (best === undefined || t < best)) best = t;
  }
  return best;
}

/** Screen point -> world point on the plane of constant depth z. */
function unprojectAt(sx: number, sy: number, z: number): { x: number; y: number } {
  return { x: ((sx - CAMERA.centerX) * z) / CAMERA.focal, y: CAMERA.eyeHeight - ((sy - CAMERA.horizonY) * z) / CAMERA.focal };
}

/**
 * Where a ray at constant depth z, starting at screen `from`, meets the room: a side wall,
 * the floor, the ceiling (indoors), a prop spanning that depth, or open sky.
 */
export function planeImpact(room: RoomDef, from: ScreenPoint, dir: ScreenPoint, z: number): { world: { x: number; y: number; z: number }; surface: Surface } {
  const o = unprojectAt(from[0], from[1], z);
  // screen y grows downward; world y grows upward. Same scale on both axes at fixed z.
  const dx = dir[0], dy = -dir[1];
  let best = Infinity, surface: Surface = 'sky';
  const consider = (t: number, s: Surface) => { if (t > 1e-6 && t < best) { best = t; surface = s; } };
  // outdoors there are no walls: the shot flies off the screen
  const side = room.outdoor ? room.halfWidth + 10 : room.halfWidth;
  if (dx !== 0) consider(((dx > 0 ? side : -side) - o.x) / dx, room.outdoor ? 'sky' : 'wall');
  if (dy < 0) consider(-o.y / dy, 'floor');
  if (dy > 0 && !room.outdoor) consider((room.height - o.y) / dy, 'ceiling');
  for (const p of room.props) {
    if (z < p.z0 - 0.1 || z > p.z1 + 0.1) continue;
    // the prop's side profile at this depth: a box x0..x1, 0..top
    for (const x of [p.x0, p.x1]) {
      if (dx === 0) continue;
      const t = (x - o.x) / dx, y = o.y + dy * t;
      if (y >= 0 && y <= p.top) consider(t, 'prop');
    }
    if (dy !== 0) {
      const t = (p.top - o.y) / dy, x = o.x + dx * t;
      if (x >= p.x0 && x <= p.x1) consider(t, 'prop');
    }
  }
  if (!Number.isFinite(best)) best = 40; // straight up into the sky: far enough to leave the screen
  return { world: { x: o.x + dx * best, y: o.y + dy * best, z }, surface };
}

/**
 * Cast one bullet. `shooterZ` = the shooter's depth (misses travel there); `skip` = actors the
 * bullet passes (the shooter, teammates).
 */
export function castRay(world: World, from: ScreenPoint, dir: ScreenPoint, shooterZ: number, skip: (a: Actor) => boolean): RayResult {
  let hit: ActorHit | undefined;
  for (const a of world.actors) {
    if (skip(a) || a.state === 'dead' || a.state === 'downed') continue;
    const h = rayVsActor(from, dir, a);
    if (h && (!hit || h.t < hit.t)) hit = { actor: a, part: h.part, t: h.t, point: [from[0] + dir[0] * h.t, from[1] + dir[1] * h.t] };
  }
  if (hit) {
    // cover: crossed first on screen AND in front of the target in depth
    for (const p of world.room.props) {
      if (p.z0 >= hit.actor.pos.z) continue;
      const t = rayVsProp(from, dir, p);
      if (t !== undefined && t < hit.t) {
        const end: ScreenPoint = [from[0] + dir[0] * t, from[1] + dir[1] * t];
        return { end, surface: 'prop', world: { ...unprojectAt(end[0], end[1], p.z0), z: p.z0 } };
      }
    }
    return { hit, end: hit.point };
  }
  const miss = planeImpact(world.room, from, dir, shooterZ);
  return { end: project(miss.world.x, miss.world.y, miss.world.z), surface: miss.surface, world: miss.world };
}
