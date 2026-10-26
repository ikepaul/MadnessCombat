// Loose items: weapons knocked out of hands (move-knockdown-getup, gun-pickup-drop) and
// severed heads (melee-decapitation). They stay in the room (world-persistence-decals).
// Guns keep their ammo on the floor (an empty gun stays empty, gun-empty-throw). E picks
// them up (src/sim/guns.ts); heads are grabbed and thrown with F.
import { GRAVITY, TUNING } from '../data/tuning';
import { type ActorKind, type HeldItem, newId, type Vec3 } from './actor';
import { project } from '../render/camera';
import { clamp } from './collision';
import { rayVsActor } from './hitscan';
import type { World } from './world';

export type ItemKind = 'head' | Exclude<HeldItem, null>;

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
  /** Guns: rounds left in the magazine and spare magazines. */
  ammo?: number;
  spare?: number;
  /** A thrown gun flying straight (no gravity) at its thrower's depth until it hits or slows. */
  straight?: number;
}

export function spawnItem(world: World, kind: ItemKind, skin: ActorKind, pos: Vec3, vel: Vec3, spin: number): Item {
  const item: Item = { id: newId(), kind, skin, pos: { ...pos }, vel: { ...vel }, angle: 0, spin, state: 'air', hit: [] };
  world.items.push(item);
  world.events.emit('itemDrop', { itemId: item.id, ...item.pos });
  return item;
}

/** Knocked out of the hand: flies 0.5-1 H in `dir` (move-knockdown-getup), keeping its ammo. */
export function dropHeld(world: World, kind: Exclude<ItemKind, 'head'>, from: Vec3, dir: number, ammo?: { ammo: number; spare: number }): Item {
  const [d0, d1] = TUNING.hit.dropDistance;
  const dist = d0 + world.rng() * (d1 - d0);
  // a lob of airtime T covers dist: T = 2 vy / g
  const vy = 3;
  const t = (2 * vy) / GRAVITY;
  const it = spawnItem(world, kind, 'grunt', { x: from.x, y: from.y + 0.45, z: from.z }, { x: (dir * dist) / t, y: vy, z: 0 }, dir * 14);
  if (ammo) { it.ammo = ammo.ammo; it.spare = ammo.spare; }
  return it;
}

export function stepItems(world: World, dt: number): void {
  const room = world.room;
  for (const it of world.items) {
    if (it.state !== 'air') continue;
    const before = project(it.pos.x, it.pos.y, it.pos.z);
    it.pos.x += it.vel.x * dt;
    it.pos.z += it.vel.z * dt;
    if (it.straight !== undefined && it.straight > 0) {
      // gun-empty-throw: a thrown gun flies straight (no drop) for a moment, hitting what it crosses on screen
      it.straight -= dt;
      it.pos.y += it.vel.y * dt;
      thrownGunHits(world, it, before);
      if (it.straight <= 0 || it.pos.y < 0.05) it.straight = undefined;
    } else {
      it.pos.y += it.vel.y * dt - 0.5 * GRAVITY * dt * dt;
      it.vel.y -= GRAVITY * dt;
    }
    it.angle += it.spin * dt;
    const lim = room.halfWidth - 0.1;
    if (Math.abs(it.pos.x) > lim) { it.pos.x = clamp(it.pos.x, -lim, lim); it.vel.x *= -0.4; }
    if (it.pos.z > room.zBack - 0.1 || it.pos.z < room.zFront) { it.pos.z = clamp(it.pos.z, room.zFront, room.zBack - 0.1); it.vel.z *= -0.4; }
    if (it.thrownBy !== undefined && it.kind === 'head') thrownItemHits(world, it);
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

/** Screen-space hit test for a thrown gun between its last and current position (ground rules). */
function thrownGunHits(world: World, it: Item, before: [number, number]): void {
  const now = project(it.pos.x, it.pos.y, it.pos.z);
  const dx = now[0] - before[0], dy = now[1] - before[1], len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const dir: [number, number] = [dx / len, dy / len];
  let best: { a: (typeof world.actors)[number]; part: 'head' | 'body'; t: number } | undefined;
  for (const o of world.actors) {
    if (o.id === it.thrownBy || it.hit.includes(o.id) || o.state === 'dead' || o.state === 'downed' || o.state === 'getUp') continue;
    const h = rayVsActor(before, dir, o, 0.05);
    if (h && h.t <= len && (!best || h.t < best.t)) best = { a: o, part: h.part, t: h.t };
  }
  if (!best) return;
  it.hit.push(best.a.id);
  world.hitActor(world.actorById(it.thrownBy!), best.a, 'gun', Math.sign(it.vel.x) || 1, 0, it.pos, best.part);
  // the gun bounces off and drops
  it.vel.x *= -0.25;
  it.vel.y = 1.5;
  it.straight = undefined;
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
