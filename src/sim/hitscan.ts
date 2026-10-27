// Screen-space hitscan (PLAN.md ground rules, decided: "if it looks like a hit, it's a hit").
// A bullet is a 2D ray on screen from the muzzle toward the cursor. Every hurtbox (head circle
// + body capsule, carried by the pose root and scaled by depth) is projected to the screen;
// the first one crossed is hit, whatever its depth. A prop blocks only if the ray crosses its
// screen shape before the target AND it is in front of the target in depth. A miss travels at
// the shooter's depth (a line at constant depth is a straight line on screen, so this is the
// same ray) until it meets a wall, the floor, the ceiling or a prop: that's where the hole goes.
import { rootToWorld } from '../anim/skeleton';
import { CAMERA, project, type ScreenPoint, scaleAt } from '../render/camera';
import type { Actor, Vec3 } from './actor';
import { BODY, HEAD } from './hurtbox';
import { heldWeaponSegment } from './melee';
import { wardPolygon } from './boss';
import type { PropDef, RoomDef } from './room';
import type { World } from './world';

export type Surface = 'wall' | 'floor' | 'ceiling' | 'prop' | 'sky';

export interface ActorHit { actor: Actor; part: 'head' | 'body'; t: number; point: ScreenPoint }

export interface RayResult {
  /** The body hit, if any (after cover). */
  hit?: ActorHit;
  /** combat-disarm: the ray crossed this actor's held weapon before any body (shot out of the hand). */
  disarm?: Actor;
  /** M8: the ray stopped on this boss's ward (from his front side). */
  ward?: Actor;
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
  return rayVsPolygon(from, dir, propOutline(p));
}

/** First crossing of a closed screen polygon's edges. */
function rayVsPolygon(from: ScreenPoint, dir: ScreenPoint, pts: ScreenPoint[]): number | undefined {
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
/** M17: a prop just in front of the shooter, under his muzzle: his own cover, which he fires over (H behind its back face). invented */
export const OWN_COVER = 0.7;

/** Segment p0 -> p1 against a prop's box (slab test): the entry parameter in [0, 1], if it crosses. */
function segVsProp(p0: Vec3, p1: Vec3, p: PropDef): number | undefined {
  let t0 = 0, t1 = 1;
  const lo = [p.x0, 0, p.z0], hi = [p.x1, p.top - 1e-3, p.z1];
  const a = [p0.x, p0.y, p0.z], d = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (a[k] < lo[k] || a[k] > hi[k]) return undefined; continue; }
    let u = (lo[k] - a[k]) / d[k], v = (hi[k] - a[k]) / d[k];
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return undefined;
  }
  return t0;
}

/** Point-in-polygon (screen). */
function insidePolygon(pt: ScreenPoint, pts: ScreenPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * M17 cover (design/qol-pass.md 5): what stops a bullet from `muzzleW` (world) to a point on screen
 * `at` on something at depth `z`. A prop blocks if (1) it isn't the shooter's own cover (right in
 * front of him and under his muzzle: he fires over it), and either (2) it hides that point on screen
 * (in front of it in depth, the point inside its outline: you can't hit what you can't see) or (3)
 * the bullet's path in the world goes through it. Returns the impact on screen and in the world.
 */
function coverBetween(world: World, muzzleW: Vec3, at: ScreenPoint, z: number, from: ScreenPoint, dir: ScreenPoint): { end: ScreenPoint; world: Vec3 } | undefined {
  const target = { ...unprojectAt(at[0], at[1], z), z };
  let best: { d: number; end: ScreenPoint; world: Vec3 } | undefined;
  for (const p of world.room.props) {
    // the boss's cannon is no cover: shots pass under the barrel (ep1 f2469)
    if (p.kind === 'cannon') continue;
    if (muzzleW.z > p.z1 && muzzleW.z - p.z1 <= OWN_COVER && muzzleW.y > p.top) continue;
    let hitW: Vec3 | undefined, end: ScreenPoint | undefined;
    if (p.z0 < z && insidePolygon(at, propOutline(p))) {
      const t = rayVsProp(from, dir, p);
      end = t !== undefined ? [from[0] + dir[0] * t, from[1] + dir[1] * t] : at;
      hitW = { ...unprojectAt(end[0], end[1], p.z0), z: p.z0 };
    } else {
      const t = segVsProp(muzzleW, target, p);
      if (t === undefined) continue;
      hitW = { x: muzzleW.x + (target.x - muzzleW.x) * t, y: muzzleW.y + (target.y - muzzleW.y) * t, z: muzzleW.z + (target.z - muzzleW.z) * t };
      end = project(hitW.x, hitW.y, hitW.z);
    }
    const d = Math.hypot(end[0] - from[0], end[1] - from[1]);
    if (!best || d < best.d) best = { d, end, world: hitW };
  }
  return best;
}

/**
 * Cast one bullet. `shooterZ` = the shooter's depth (misses travel there); `skip` = actors the
 * bullet passes (the shooter, teammates); `muzzle` = the drawn muzzle on screen (M17: the cover
 * test starts there; `from` may be set back along the barrel for point-blank shots).
 */
export function castRay(world: World, from: ScreenPoint, dir: ScreenPoint, shooterZ: number, skip: (a: Actor) => boolean, muzzle: ScreenPoint = from): RayResult {
  const muzzleW: Vec3 = { ...unprojectAt(muzzle[0], muzzle[1], shooterZ), z: shooterZ };
  let hit: ActorHit | undefined;
  let gun: { actor: Actor; t: number } | undefined;
  let ward: { actor: Actor; t: number } | undefined;
  for (const a of world.actors) {
    // M8: the boss's ward stops rays coming at his front (from the side he faces)
    const poly = skip(a) ? [] : wardPolygon(a);
    if (poly.length && Math.sign(from[0] - project(a.pos.x, 0, a.pos.z)[0]) === a.facing) {
      const t = rayVsPolygon(from, dir, poly);
      if (t !== undefined && (!ward || t < ward.t)) ward = { actor: a, t };
    }
    // a corpse held up as a human shield still stops bullets (combat-human-shield)
    if (skip(a) || (a.state === 'dead' && a.grabbedBy === undefined) || a.state === 'downed' || a.invulnerable || a.parked) continue;
    const h = rayVsActor(from, dir, a);
    if (h && (!hit || h.t < hit.t)) hit = { actor: a, part: h.part, t: h.t, point: [from[0] + dir[0] * h.t, from[1] + dir[1] * h.t] };
    // combat-disarm: an enemy's weapon in the hand can be shot out of it (small target)
    if (a.playerIndex === undefined && a.state !== 'dead' && a.grabbedBy === undefined) {
      const w = heldWeaponSegment(a);
      const t = w ? hitCapsule(from, dir, w.p0, w.p1, w.r) : undefined;
      if (t !== undefined && (!gun || t < gun.t)) gun = { actor: a, t };
    }
  }
  if (ward && (!hit || ward.t < hit.t) && (!gun || ward.t < gun.t)) {
    return { ward: ward.actor, end: [from[0] + dir[0] * ward.t, from[1] + dir[1] * ward.t] };
  }
  if (gun && (!hit || gun.t < hit.t - 1e-6)) {
    const end: ScreenPoint = [from[0] + dir[0] * gun.t, from[1] + dir[1] * gun.t];
    if (!coverBetween(world, muzzleW, end, gun.actor.pos.z, from, dir)) return { disarm: gun.actor, end };
  }
  if (hit) {
    // cover (M17): own cover is fired over; a hidden target or a path through a prop is blocked
    const c = coverBetween(world, muzzleW, hit.point, hit.actor.pos.z, from, dir);
    if (c) return { end: c.end, surface: 'prop', world: c.world };
    return { hit, end: hit.point };
  }
  const miss = planeImpact(world.room, from, dir, shooterZ);
  return { end: project(miss.world.x, miss.world.y, miss.world.z), surface: miss.surface, world: miss.world };
}
