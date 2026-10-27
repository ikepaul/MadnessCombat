// Cover (PLAN.md M7, research/mechanics/combat-cover): a grunt kicks a table over onto its side
// toward the camera (ep3 0:39-0:41) and hides behind it. The tipped table's top stands upright
// at the old front edge minus its height, so rays from the front stop on it (hitscan cover rule:
// crossed on screen first AND in front in depth).
import type { Actor } from './actor';
import type { TableDef } from './room';
import { stepSlab } from './doorSmash';
import type { World } from './world';

export const COVER = {
  /** Kick wind-up before the table goes over, and the recovery. invented */
  flipKick: 0.3,
  flipRecovery: 0.3,
  /** The tip animation (s). invented */
  tipTime: 0.3,
  /** Board thickness of the tipped top (H). invented */
  thickness: 0.08,
} as const;

/** A table that can still be kicked over: upright, low, with room in front of it. */
export function canFlip(world: World, t: TableDef): boolean {
  return !t.tip && t.top < 0.9 && t.z0 - t.top > world.room.zFront + 0.1;
}

/** Kick prop `index` over toward the camera. */
export function flipTable(world: World, a: Actor, index: number): void {
  const t = world.room.props[index];
  if (!t || t.kind !== 'table' || !canFlip(world, t)) return;
  t.tip = { t: 0, z0: t.z0, z1: t.z1, top: t.top };
  world.events.emit('tableFlip', { actorId: a.id, prop: index, x: (t.x0 + t.x1) / 2, y: 0, z: t.z0 });
}

/** Tip animation; the collision/cover shape switches to the upright top when it lands. */
export function stepProps(world: World, dt: number): void {
  for (const p of world.room.props) {
    // M14: a smashed door's slab in flight
    if (p.kind === 'slab') { stepSlab(world, p, dt); continue; }
    if (p.kind !== 'table' || !p.tip || p.tip.t >= 1) continue;
    p.tip.t = Math.min(1, p.tip.t + dt / COVER.tipTime);
    if (p.tip.t < 1) continue;
    const { z0, z1, top } = p.tip;
    p.z0 = z0 - top;
    p.z1 = z0 - top + COVER.thickness;
    p.top = z1 - z0;
    world.events.emit('tableLand', { x: (p.x0 + p.x1) / 2, y: 0, z: p.z0 });
  }
}
