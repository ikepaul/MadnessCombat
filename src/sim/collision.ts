import { TUNING } from '../data/tuning';
import type { PropDef, RoomDef } from './room';

const R = TUNING.move.radius;

/** Footprint box of a prop, grown by the actor radius. */
function footprint(p: PropDef) {
  return { x0: p.x0 - R, x1: p.x1 + R, z0: p.z0 - R, z1: p.z1 + R, top: p.top };
}

/** Highest surface at (x, z) that is at or below `feetY` (+ a small step tolerance). */
export function surfaceBelow(room: RoomDef, x: number, z: number, feetY: number): number {
  let best = 0;
  for (const p of room.props) {
    const f = footprint(p);
    if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && f.top <= feetY + 0.02 && f.top > best) best = f.top;
  }
  return best;
}

/**
 * Move from (x, z) by (dx, dz) at height `feetY`: clamps to the floor bounds and slides along
 * props the feet are below the top of (solid sides), axis by axis.
 */
export function moveWithCollision(room: RoomDef, x: number, z: number, dx: number, dz: number, feetY: number): { x: number; z: number } {
  const blocked = (nx: number, nz: number) =>
    room.props.some((p) => {
      const f = footprint(p);
      return feetY < f.top - 0.02 && nx > f.x0 && nx < f.x1 && nz > f.z0 && nz < f.z1;
    });
  let nx = clamp(x + dx, -room.halfWidth + R, room.halfWidth - R);
  if (blocked(nx, z)) nx = x;
  let nz = clamp(z + dz, room.zFront, room.zBack - R);
  if (blocked(nx, nz)) nz = z;
  return { x: nx, z: nz };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
