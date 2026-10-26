// Pose data model (design/art-direction.md, "Animation"): a pose is a transform per part,
// in actor-local H with -y up and +x toward the facing side, origin between the feet.
// The root transform (lying, prone, spin, squash) is applied on top by the sim state.
// Plain TS: the sim uses the root for hurtboxes, the painter for drawing.

export const PART_NAMES = ['body', 'head', 'handF', 'handB', 'footF', 'footB', 'item'] as const;
export type PartName = (typeof PART_NAMES)[number];

/** [x, y, rotation]. Body/feet/hands/head: part centre (body: its feet anchor). Item: offset from the front hand. */
export type PartXf = [number, number, number];
export type Skeleton = Record<PartName, PartXf>;

/** The style frame's standing pose: every other pose is authored against it. */
export const REST: Skeleton = {
  body: [0, 0, 0],
  head: [0.01, -0.79, 0],
  handF: [0.19, -0.32, 0],
  handB: [-0.17, -0.3, 0],
  footF: [0.08, -0.03, 0],
  footB: [-0.06, -0.03, 0],
  item: [0, 0, -1.2],
};

export function cloneSkeleton(s: Skeleton): Skeleton {
  const out = {} as Skeleton;
  for (const k of PART_NAMES) out[k] = [s[k][0], s[k][1], s[k][2]];
  return out;
}

export function lerpSkeleton(a: Skeleton, b: Skeleton, t: number): Skeleton {
  const out = {} as Skeleton;
  for (const k of PART_NAMES) {
    const p = a[k], q = b[k];
    out[k] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return out;
}

/**
 * Whole-body transform, applied in this order to a local point: rotate by `r` about
 * ROOT_PIVOT (mid-body), translate by (tx, ty), then scale (sx, sy) about the feet. Local
 * y is screen-down (-y = up), so ty > 0 lowers the body.
 */
export interface Root { r: number; tx: number; ty: number; sx: number; sy: number }

export const ROOT_PIVOT: [number, number] = [0, -0.5];

export const STANDING: Root = { r: 0, tx: 0, ty: 0, sx: 1, sy: 1 };

/**
 * Rotation that keeps the feet planted: |r| = pi/2 is flat on the floor (r > 0 face down
 * toward the facing side, r < 0 on the back). Used for prone, dives, sweeps and get-ups.
 * Half body thickness (0.2 H) stays above the floor when flat.
 */
export function aboutFeet(r: number, sy = 1): Root {
  return { r, tx: 0.5 * Math.sin(r), ty: 0.3 * (1 - Math.cos(r)), sx: 1, sy };
}

/** Flat on the floor with the actor position at mid-body (corpses, knockdowns, thrown bodies). */
export function lyingAt(r: number): Root {
  return { r, tx: 0, ty: 0.3 * Math.min(1, Math.abs(Math.sin(r))), sx: 1, sy: 1 };
}

/** Local -> world offset from the actor position: returns [dx, dy] in H (dy up). */
export function rootToWorld(root: Root, facing: 1 | -1, lx: number, ly: number): [number, number] {
  const [px, py] = ROOT_PIVOT;
  const c = Math.cos(root.r), s = Math.sin(root.r);
  const x = (lx - px) * c - (ly - py) * s + px + root.tx;
  const y = (lx - px) * s + (ly - py) * c + py + root.ty;
  return [facing * x * root.sx, -y * root.sy];
}

/** Inverse of rootToWorld. */
export function worldToRoot(root: Root, facing: 1 | -1, dx: number, dy: number): [number, number] {
  const [px, py] = ROOT_PIVOT;
  const x = (dx * facing) / root.sx - root.tx - px;
  const y = -dy / root.sy - root.ty - py;
  const c = Math.cos(root.r), s = Math.sin(root.r);
  return [x * c + y * s + px, -x * s + y * c + py];
}

/** 0 standing .. 1 flat (shadow width, hurtbox height). */
export function flatness(root: Root): number {
  return Math.abs(Math.sin(root.r));
}
