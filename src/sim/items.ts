// Loose items: weapons knocked out of hands (move-knockdown-getup, gun-pickup-drop), severed
// heads (melee-decapitation), thrown weapons (gun-empty-throw, throw-knives), grenades
// (throw-grenade) and the planted street sign (melee-environment-weapon). They stay in the
// room (world-persistence-decals). Guns keep their ammo on the floor (an empty gun stays empty).
// Thrown blades that hit stick in the body or the wall until pulled out again (throw-knives).
import { rootToWorld } from '../anim/skeleton';
import { GRENADE, isMelee, MELEE, THROWN } from '../data/melee';
import { GRAVITY, TUNING } from '../data/tuning';
import { type Actor, type ActorKind, alive, type HeldItem, newHand, newId, type Vec3 } from './actor';
import { project } from '../render/camera';
import { clamp } from './collision';
import { explode } from './explosives';
import { rayVsActor } from './hitscan';
import type { World } from './world';

export type ItemKind = 'head' | 'grenade' | 'boombox' | Exclude<HeldItem, null>;

/** Floor items that can't go into a hand: heads, grenades (the pocket), the boombox (M8 ending). */
export const notHoldable = (k: ItemKind): k is 'head' | 'grenade' | 'boombox' => k === 'head' || k === 'grenade' || k === 'boombox';

export interface Item {
  id: number;
  kind: ItemKind;
  /** Whose head (colour). */
  skin: ActorKind;
  pos: Vec3;
  vel: Vec3;
  /** Screen rotation (canvas: positive = clockwise), weapons drawn pointing +x from the grip. */
  angle: number;
  spin: number;
  /** `stuck` = in a body or a wall (thrown blades, the pinning sign); `planted` = the street sign in the ground. */
  state: 'air' | 'floor' | 'held' | 'stuck' | 'planted';
  heldBy?: number;
  thrownBy?: number;
  hit: number[];
  /** Guns: rounds left in the magazine and spare magazines. */
  ammo?: number;
  spare?: number;
  /** Seconds left of a thrown weapon's flight before it falls normally. */
  straight?: number;
  /** Share of gravity during that flight: 0 for guns (straight), slight for blades. */
  drop?: number;
  /** Grenades: lit (fuse running) and seconds left. */
  live?: boolean;
  fuse?: number;
  /** World time it was thrown (your own throw can be caught back after a moment). */
  thrownAt?: number;
  /** Stuck in this actor at this actor-local point, at this angle relative to the body. */
  stuckTo?: number;
  stuckLocal?: [number, number];
  stuckAngle?: number;
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

/** Screen angle of a world velocity in a plane of constant depth (screen y is down). */
export const flightAngle = (vx: number, vy: number) => Math.atan2(-vy, vx);

export function stepItems(world: World, dt: number): void {
  const room = world.room;
  for (const it of [...world.items]) {
    // throw-grenade: the fuse burns wherever the grenade is (in flight, on the floor, in a hand)
    if (it.kind === 'grenade' && it.live && it.fuse !== undefined) {
      it.fuse -= dt;
      if (it.fuse <= 0) {
        detonate(world, it);
        continue;
      }
    }
    if (it.state === 'stuck') { followStuck(world, it); continue; }
    if (it.state !== 'air') continue;
    // throw-catch-return: F with a free hand snatches a weapon flying past the hands (your own too)
    if (snatch(world, it)) continue;
    const before = project(it.pos.x, it.pos.y, it.pos.z);
    it.pos.x += it.vel.x * dt;
    it.pos.z += it.vel.z * dt;
    if (it.straight !== undefined && it.straight > 0) {
      // a thrown weapon flies (almost) straight for a moment, hitting what it crosses on screen
      it.straight -= dt;
      const g = GRAVITY * (it.drop ?? 0);
      it.pos.y += it.vel.y * dt - 0.5 * g * dt * dt;
      it.vel.y -= g * dt;
      thrownHits(world, it, before);
      if (it.state !== 'air') continue;
      if (it.straight !== undefined && (it.straight <= 0 || it.pos.y < 0.05)) it.straight = undefined;
    } else {
      it.pos.y += it.vel.y * dt - 0.5 * GRAVITY * dt * dt;
      it.vel.y -= GRAVITY * dt;
    }
    it.angle += it.spin * dt;
    const lim = room.halfWidth - 0.1;
    const sticky = it.thrownBy !== undefined && isMelee(it.kind) && MELEE[it.kind].sticks && it.straight !== undefined;
    if (Math.abs(it.pos.x) > lim) {
      // throw-knives: a thrown blade that misses sticks in the wall
      if (sticky && !room.outdoor) { stickInWall(world, it, Math.sign(it.pos.x) * room.halfWidth, it.pos.z); continue; }
      it.pos.x = clamp(it.pos.x, -lim, lim);
      it.vel.x *= -0.4;
    }
    if (it.pos.z > room.zBack - 0.1 || it.pos.z < room.zFront) {
      if (sticky && !room.outdoor && it.pos.z > room.zBack - 0.1) { stickInWall(world, it, it.pos.x, room.zBack); continue; }
      it.pos.z = clamp(it.pos.z, room.zFront, room.zBack - 0.1);
      it.vel.z *= -0.4;
    }
    if (it.thrownBy !== undefined && it.kind === 'head') thrownItemHits(world, it);
    if (it.pos.y <= 0 && it.vel.y < 0) {
      it.pos.y = 0;
      it.thrownBy = undefined;
      it.straight = undefined;
      if (it.vel.y < -2.5) {
        // one bounce, then roll to a stop
        it.vel.y *= -0.3;
        it.vel.x *= 0.5;
        it.vel.z *= 0.5;
        it.spin *= 0.5;
        if (it.kind === 'grenade') world.events.emit('grenadeBounce', { itemId: it.id, ...it.pos });
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

function detonate(world: World, it: Item): void {
  let at = it.pos;
  // a grenade still in someone's hands goes off there
  if (it.state === 'held' && it.heldBy !== undefined) {
    const h = world.actorById(it.heldBy);
    if (h?.holding?.kind === 'item' && h.holding.id === it.id) h.holding = undefined;
    if (h) at = { x: h.pos.x + h.facing * 0.3, y: h.pos.y + 0.5, z: h.pos.z };
  }
  world.items = world.items.filter((x) => x !== it);
  explode(world, at, it.thrownBy);
}

/** Stuck in a body: ride along with it (tumbling corpses carry their knives). */
function followStuck(world: World, it: Item): void {
  if (it.stuckTo === undefined) return;
  const a = world.actorById(it.stuckTo);
  if (!a || a.corpse?.gibbed) { unstick(it); return; }
  const [lx, ly] = it.stuckLocal ?? [0, -0.4];
  const [dx, dy] = rootToWorld(a.pose.root, a.facing, lx, ly);
  it.pos = { x: a.pos.x + dx, y: a.pos.y + dy, z: a.pos.z - 0.002 };
  it.angle = (it.stuckAngle ?? 0) + a.pose.root.r * a.facing;
}

/** Let go of a body (it was blown apart): fall to the floor. */
export function unstick(it: Item): void {
  it.state = 'air';
  it.stuckTo = undefined;
  it.vel = { x: 0, y: 1, z: 0 };
  it.spin = 6;
  it.straight = undefined;
  it.thrownBy = undefined;
}

function stickInWall(world: World, it: Item, x: number, z: number): void {
  it.state = 'stuck';
  it.stuckTo = undefined;
  it.pos = { x: clamp(x, -world.room.halfWidth, world.room.halfWidth), y: it.pos.y, z };
  it.angle = flightAngle(it.vel.x, it.vel.y);
  it.vel = { x: 0, y: 0, z: 0 };
  it.spin = 0;
  it.straight = undefined;
  it.thrownBy = undefined;
  world.events.emit('stick', { itemId: it.id, surface: 'wall', ...it.pos });
}

/** Stick a blade into a body at the point it hit. */
export function stickInBody(world: World, it: Item, o: Actor, part: 'head' | 'body', angle: number): void {
  it.state = 'stuck';
  it.stuckTo = o.id;
  it.stuckLocal = part === 'head' ? [0.06, -0.84] : [0.02, -0.4];
  // relative to the body, so it keeps pointing in when the body falls
  it.stuckAngle = angle - o.pose.root.r * o.facing;
  it.vel = { x: 0, y: 0, z: 0 };
  it.spin = 0;
  it.straight = undefined;
  it.thrownBy = undefined;
  followStuck(world, it);
  world.events.emit('stick', { itemId: it.id, surface: 'flesh', ...it.pos });
}

/** throw-catch-return: F pressed with a free hand just before the object arrives. */
export function canCatch(world: World, o: Actor): boolean {
  return o.catchAt !== undefined && world.time - o.catchAt <= THROWN.catchWindow + 1e-6 && alive(o) && (o.state === 'free' || o.state === 'attack') && (!o.hands[0] || !o.hands[1]);
}

/** A weapon in the air within reach of someone's hands who just pressed F. */
function snatch(world: World, it: Item): boolean {
  if (notHoldable(it.kind)) return false;
  for (const o of world.actors) {
    if (!canCatch(world, o)) continue;
    if (o.id === it.thrownBy && world.time - (it.thrownAt ?? -Infinity) < THROWN.ownCatchDelay) continue;
    const hx = o.pos.x + o.facing * 0.25, hy = o.pos.y + 0.6;
    if (Math.abs(it.pos.z - o.pos.z) > 0.3 || Math.hypot(it.pos.x - hx, it.pos.y - hy) > THROWN.catchReach) continue;
    catchItem(world, o, it);
    return true;
  }
  return false;
}

function catchItem(world: World, o: Actor, it: Item): void {
  const slot = !o.hands[0] ? 0 : 1;
  o.hands[slot] = newHand(it.kind as Exclude<HeldItem, null>, it.ammo, it.spare);
  o.catchAt = undefined;
  world.items = world.items.filter((x) => x !== it);
  world.events.emit('catch', { actorId: o.id, itemId: it.id, item: it.kind, ...it.pos });
}

/**
 * Screen-space hit test for a thrown weapon between its last and current position (ground
 * rules): guns and blunt weapons knock down (a head hit kills, gun-empty-throw), blades kill,
 * knives and axes stick in what they hit (throw-knives). A target ready to catch takes it.
 */
function thrownHits(world: World, it: Item, before: [number, number]): void {
  const now = project(it.pos.x, it.pos.y, it.pos.z);
  const dx = now[0] - before[0], dy = now[1] - before[1], len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const dir: [number, number] = [dx / len, dy / len];
  let best: { a: Actor; part: 'head' | 'body'; t: number } | undefined;
  for (const o of world.actors) {
    if (o.id === it.thrownBy || it.hit.includes(o.id) || o.state === 'dead' || o.state === 'downed' || o.state === 'getUp') continue;
    const h = rayVsActor(before, dir, o, 0.05);
    if (h && h.t <= len && (!best || h.t < best.t)) best = { a: o, part: h.part, t: h.t };
  }
  if (!best) return;
  const o = best.a;
  if (canCatch(world, o)) { catchItem(world, o, it); return; }
  it.hit.push(o.id);
  const by = world.actorById(it.thrownBy!);
  const dirX = Math.sign(it.vel.x) || 1;
  const blade = isMelee(it.kind) && MELEE[it.kind].edge === 'blade';
  if (blade) {
    world.hitActor(by, o, 'knife', dirX, 0, it.pos, best.part);
    if (MELEE[it.kind as keyof typeof MELEE].sticks && o.grabbedBy === undefined) {
      stickInBody(world, it, o, best.part, flightAngle(it.vel.x, it.vel.y));
      return;
    }
  } else world.hitActor(by, o, 'gun', dirX, 0, it.pos, best.part);
  // it bounces off and drops
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

/** Velocity of a lob from `from` landing on the floor point (x, z) (throw-grenade). */
export function lobVelocity(from: Vec3, x: number, z: number): Vec3 {
  const dx = x - from.x, dz = z - from.z, d = Math.hypot(dx, dz);
  const t = GRENADE.lobTime + GRENADE.lobTimePerH * d;
  // land at y = 0 after t: y0 + vy t - g t^2 / 2 = 0
  return { x: dx / t, y: (0.5 * GRAVITY * t * t - from.y) / t, z: dz / t };
}
