// M14 world-destructible (ep4 2:29, the boss smashing the club's door in): a door bursts off its
// frame, the slab flies into the room upright for a moment, crushing whoever stands in its path
// (ep4: the cowering grunt behind it), then lands flat on the floor and stays there.
import { type Actor, alive } from './actor';
import { applyHit } from './combat';
import type { SlabDef } from './room';
import type { World } from './world';

/** The slab's flight: speed into the room (H/s) and airtime (s); then it lies 0.06 H thick. invented */
export const SLAB = { speed: 6, airtime: 0.35, thickness: 0.12, lying: 0.06 } as const;

/** Smash door `i` in from outside: the doorway stays open, the slab flies in. `by` = who did it. */
export function smashDoor(world: World, i: number, by?: Actor): void {
  const d = world.room.doors[i], state = world.doors[i];
  if (!d || d.smashed) return;
  d.smashed = true;
  if (state) { state.open = 1; state.target = 1; state.hold = Infinity; }
  const side = d.wall === 'left' ? -1 : 1, x = side * (world.room.halfWidth - SLAB.thickness);
  const slab: SlabDef = {
    kind: 'slab', x0: x - SLAB.thickness / 2, x1: x + SLAB.thickness / 2, z0: d.z0, z1: d.z1, top: d.height,
    fly: { dir: (-side) as 1 | -1, t: 0, length: d.height }, byId: by?.id,
  };
  world.room.props.push(slab);
  world.events.emit('doorSmash', { actorId: by?.id ?? 0, door: i, x, y: d.height / 2, z: (d.z0 + d.z1) / 2 });
}

/** Called from stepProps: a flying slab moves in, crushes, and lands. */
export function stepSlab(world: World, p: SlabDef, dt: number): void {
  const f = p.fly;
  if (!f) return;
  f.t += dt;
  const dx = f.dir * SLAB.speed * dt;
  p.x0 += dx;
  p.x1 += dx;
  const by = p.byId !== undefined ? world.actorById(p.byId) : undefined;
  for (const o of world.actors) {
    if (!alive(o) || o === by || o.kind === 'boss') continue;
    if (o.pos.x < p.x0 - 0.2 || o.pos.x > p.x1 + 0.2 || o.pos.z < p.z0 - 0.15 || o.pos.z > p.z1 + 0.15) continue;
    applyHit(world, by, o, 'wall', f.dir, 0, { x: o.pos.x, y: o.pos.y + 0.6, z: o.pos.z });
  }
  if (f.t < SLAB.airtime) return;
  // down flat, the hinge side toward the wall it came from
  const near = f.dir > 0 ? p.x0 : p.x1;
  p.x0 = Math.min(near, near + f.dir * f.length);
  p.x1 = Math.max(near, near + f.dir * f.length);
  p.top = SLAB.lying;
  p.fly = undefined;
  world.events.emit('slabLand', { x: (p.x0 + p.x1) / 2, y: 0, z: (p.z0 + p.z1) / 2 });
}
