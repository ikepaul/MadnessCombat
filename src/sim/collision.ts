import { TUNING } from '../data/tuning';
import { inZone, type PropDef, type RoomDef, type Stairs } from './room';

const R = TUNING.move.radius;
/** How far past the side bounds an entering enemy may be. invented */
export const ENTRY_MARGIN = 2.5;

/** Footprint box of a prop, grown by the actor radius. */
function footprint(p: PropDef) {
  return { x0: p.x0 - R, x1: p.x1 + R, z0: p.z0 - R, z1: p.z1 + R, top: p.top };
}

/** M14 move-stairs: how far a step may rise or drop and still be walked (H). invented */
export const STAIR_STEP = 0.3;

/** The staircase under (x, z), if any. */
export function stairsAt(room: RoomDef, x: number, z: number): Stairs | undefined {
  return room.stairs?.find((s) => inZone(s, x, z));
}

/** Floor height of the staircase under (x, z), if any. */
export function stairHeight(room: RoomDef, x: number, z: number): number | undefined {
  const s = stairsAt(room, x, z);
  if (!s) return undefined;
  const u = Math.max(0, Math.min(1, (x - s.x0) / (s.x1 - s.x0)));
  return s.y0 + (s.y1 - s.y0) * u;
}

/** Highest surface at (x, z) that is at or below `feetY` (+ a small step tolerance). */
export function surfaceBelow(room: RoomDef, x: number, z: number, feetY: number): number {
  let best = 0;
  for (const p of room.props) {
    const f = footprint(p);
    if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && f.top <= feetY + 0.02 && f.top > best) best = f.top;
  }
  // M14: a staircase's ramp, a step up or down from the feet
  const sh = stairHeight(room, x, z);
  if (sh !== undefined && sh <= feetY + STAIR_STEP && sh > best) best = sh;
  // M10: decks (the cab roof) hold you up except over their open holes
  for (const d of room.decks ?? []) {
    if (d.y > feetY + 0.02 || d.y <= best || !inZone(d, x, z) || d.holes.some((h) => inZone(h, x, z))) continue;
    best = d.y;
  }
  return best;
}

/**
 * Move from (x, z) by (dx, dz) at height `feetY`: clamps to the floor bounds and slides along
 * props the feet are below the top of (solid sides), axis by axis. `outside` = an enemy still
 * walking in from off-screen or through a door: x may be past the side bounds.
 */
export function moveWithCollision(room: RoomDef, x: number, z: number, dx: number, dz: number, feetY: number, outside = false): { x: number; z: number } {
  const blocked = (nx: number, nz: number) =>
    room.props.some((p) => {
      const f = footprint(p);
      return feetY < f.top - 0.02 && nx > f.x0 && nx < f.x1 && nz > f.z0 && nz < f.z1;
    });
  const hw = outside ? room.halfWidth + ENTRY_MARGIN : room.halfWidth - R;
  let nx = clamp(x + dx, -hw, hw);
  // M11 world-arena-collapse: nobody walks off the edge (only a shove or a flight takes you over)
  if (room.void && !outside) nx = room.void.side < 0 ? Math.max(nx, room.void.x + R) : Math.min(nx, room.void.x - R);
  if (blocked(nx, z)) nx = x;
  let nz = clamp(z + dz, room.zFront, room.zBack - R);
  if (blocked(nx, nz)) nz = z;
  return { x: nx, z: nz };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
