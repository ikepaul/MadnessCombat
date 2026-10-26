// Loose items: weapons knocked out of hands (move-knockdown-getup) and severed heads
// (melee-decapitation). They stay in the room (world-persistence-decals). Pick-up with E
// arrives in M5; heads can already be grabbed and thrown (F).
import { GRAVITY, TUNING } from '../data/tuning';
import { type ActorKind, newId, type Vec3 } from './actor';
import { clamp } from './collision';
import type { World } from './world';

export type ItemKind = 'head' | 'pistol' | 'baton';

export interface Item {
  id: number;
  kind: ItemKind;
  /** Whose head (colour). */
  skin: ActorKind;
  pos: Vec3;
  vel: Vec3;
  angle: number;
  spin: number;
  state: 'air' | 'floor' | 'held';
  heldBy?: number;
  thrownBy?: number;
  hit: number[];
}

export function spawnItem(world: World, kind: ItemKind, skin: ActorKind, pos: Vec3, vel: Vec3, spin: number): Item {
  const item: Item = { id: newId(), kind, skin, pos: { ...pos }, vel: { ...vel }, angle: 0, spin, state: 'air', hit: [] };
  world.items.push(item);
  world.events.emit('itemDrop', { itemId: item.id, ...item.pos });
  return item;
}

/** Knocked out of the hand: flies 0.5-1 H in `dir` (move-knockdown-getup). */
export function dropHeld(world: World, kind: Exclude<ItemKind, 'head'>, from: Vec3, dir: number): Item {
  const [d0, d1] = TUNING.hit.dropDistance;
  const dist = d0 + world.rng() * (d1 - d0);
  // a lob of airtime T covers dist: T = 2 vy / g
  const vy = 3;
  const t = (2 * vy) / GRAVITY;
  return spawnItem(world, kind, 'grunt', { x: from.x, y: from.y + 0.45, z: from.z }, { x: (dir * dist) / t, y: vy, z: 0 }, dir * 14);
}

export function stepItems(world: World, dt: number): void {
  const room = world.room;
  for (const it of world.items) {
    if (it.state !== 'air') continue;
    it.pos.x += it.vel.x * dt;
    it.pos.z += it.vel.z * dt;
    it.pos.y += it.vel.y * dt - 0.5 * GRAVITY * dt * dt;
    it.vel.y -= GRAVITY * dt;
    it.angle += it.spin * dt;
    const lim = room.halfWidth - 0.1;
    if (Math.abs(it.pos.x) > lim) { it.pos.x = clamp(it.pos.x, -lim, lim); it.vel.x *= -0.4; }
    if (it.pos.z > room.zBack - 0.1 || it.pos.z < room.zFront) { it.pos.z = clamp(it.pos.z, room.zFront, room.zBack - 0.1); it.vel.z *= -0.4; }
    if (it.thrownBy !== undefined) thrownItemHits(world, it);
    if (it.pos.y <= 0 && it.vel.y < 0) {
      it.pos.y = 0;
      it.thrownBy = undefined;
      if (it.vel.y < -2.5) {
        // one bounce, then roll to a stop
        it.vel.y *= -0.3;
        it.vel.x *= 0.5;
        it.vel.z *= 0.5;
        it.spin *= 0.5;
      } else {
        it.state = 'floor';
        it.vel = { x: 0, y: 0, z: 0 };
        it.spin = 0;
        // lie on a side: heads roll to a resting tilt, weapons lie flat
        it.angle = it.kind === 'head' ? Math.round(it.angle / Math.PI) * Math.PI + 0.4 : Math.round(it.angle / Math.PI) * Math.PI;
      }
    }
  }
}

/** A thrown head staggers whoever it hits (melee-decapitation: light knockback, no kill). */
function thrownItemHits(world: World, it: Item): void {
  for (const o of world.actors) {
    if (o.id === it.thrownBy || it.hit.includes(o.id) || o.state === 'dead' || o.state === 'grabbed' || o.state === 'getUp' || o.state === 'downed') continue;
    if (Math.abs(o.pos.z - it.pos.z) > 0.25 || Math.abs(o.pos.x - it.pos.x) > 0.25) continue;
    if (it.pos.y < o.pos.y || it.pos.y > o.pos.y + o.body.height) continue;
    it.hit.push(o.id);
    world.hitActor(world.actorById(it.thrownBy!), o, 'head', Math.sign(it.vel.x) || 1, 0, it.pos);
    it.vel.x *= -0.3;
    it.vel.z *= 0.3;
  }
}
