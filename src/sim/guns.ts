// Guns (PLAN.md M5, research/mechanics/gun-*): two hands (LMB front, RMB back), free aim,
// screen-space hitscan, magazine + one spare (throw & scavenge), dry click then throw when
// empty, reload, pick-up from the floor, split aim. Numbers live in src/data/weapons.ts.
import { aimRig } from '../anim/aim';
import { flatness } from '../anim/skeleton';
import { isMelee, MELEE } from '../data/melee';
import { GUNS, isWeapon, WEAPONS, type WeaponDef } from '../data/weapons';
import { project, type ScreenPoint, scaleAt } from '../render/camera';
import { type Actor, alive, type Hand, newHand } from './actor';
import type { PlayerCommand } from './command';
import { castRay, type Surface } from './hitscan';
import { dropHeld } from './items';
import { disarm, pullable, startAction } from './melee';
import type { World } from './world';

/** One bullet's path for the effects: tracer end, what it hit, blood behind a body hit. */
export interface ShotRay {
  end: ScreenPoint;
  surface?: Surface | 'flesh' | 'metal';
  /** World point of a wall/floor/prop impact (bullet hole) or of the splatter behind a body hit. `metal` = a weapon shot out of a hand. */
  impact?: { x: number; y: number; z: number; surface: Surface };
}

/** A gun's state and def, if this hand holds a gun. */
function gunIn(h: Hand | null): { h: Hand; w: WeaponDef } | undefined {
  return h && isWeapon(h.item) ? { h, w: WEAPONS[h.item] } : undefined;
}

/** Default aim when there's no cursor: straight ahead at chest height. */
function aimPoint(a: Actor, cmd: PlayerCommand, hand: 0 | 1, world: World): ScreenPoint {
  if (hand === 1 && cmd.split) {
    const t = splitTarget(world, a);
    if (t) return project(t.pos.x, t.pos.y + 0.75, t.pos.z);
  }
  if (cmd.aim) return cmd.aim;
  return project(a.pos.x + a.facing * 3, a.pos.y + 0.55, a.pos.z);
}

/**
 * Split aim (gun-dual-wield): the back hand locks onto the nearest living enemy on the other
 * side of the body from the cursor.
 */
export function splitTarget(world: World, a: Actor): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (o === a || !o.ai || !alive(o) || o.entering || (o.pos.x - a.pos.x) * a.facing > 0) continue;
    const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}

/** Can aim and fire: standing or in the air, not lying, prone or knocked about. */
function canShoot(a: Actor): boolean {
  return (a.state === 'free' || a.state === 'attack') && flatness(a.pose.root) < 0.5 && a.body.state !== 'diving';
}

/** Every tick for an actor in control: aim, fire, dry click, throw, reload, pick up. */
export function stepHands(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  a.walkFactor = 1;
  const kick = (a.pose.kick ??= [0, 0]);
  kick[0] = Math.max(0, kick[0] - dt * 0.6);
  kick[1] = Math.max(0, kick[1] - dt * 0.6);
  if (cmd.aim || a.hands.some((h) => gunIn(h))) {
    a.pose.aim = aimPoint(a, cmd, 0, world);
    a.pose.aimB = aimPoint(a, cmd, 1, world);
  }
  const dual = !!gunIn(a.hands[0]) && !!gunIn(a.hands[1]);
  for (const i of [0, 1] as const) {
    const g = gunIn(a.hands[i]);
    if (!g) continue;
    const { h, w } = g;
    h.cooldown = Math.max(0, h.cooldown - dt);
    if (h.reload > 0) {
      h.reload = Math.max(0, h.reload - dt);
      if (h.reload === 0) {
        h.ammo = w.mag;
        h.spare = Math.max(0, h.spare - 1);
        world.events.emit('reload', { actorId: a.id, hand: i, phase: 'end', weapon: w.id, ...a.pos });
      }
      continue;
    }
    const pressed = !!cmd.press?.[i], held = !!cmd.hold?.[i];
    if (h.ammo > 0) {
      // (tolerance: summing 1/60 s ticks drifts, and the measured SMG rate is exactly 6 ticks)
      if ((w.auto ? held || pressed : pressed) && h.cooldown <= 1e-6 && canShoot(a)) fire(world, a, i, h, w, dual);
      if (held && w.firingWalk < 1) a.walkFactor = w.firingWalk;
    } else if (pressed) {
      // gun-empty-throw: one dry click, then the next press throws the gun
      if (!h.clicked) {
        h.clicked = true;
        world.events.emit('dryFire', { actorId: a.id, hand: i, weapon: w.id, ...a.pos });
      } else throwGun(world, a, i, cmd);
    }
  }
  if (cmd.reload) startReload(world, a, dual);
  if (cmd.throwGun) {
    // Q throws the front-most item: a melee weapon in front is thrown by src/sim/melee.ts
    const front = a.hands[0];
    const i = gunIn(front) ? 0 : !front && gunIn(a.hands[1]) ? 1 : -1;
    if (i >= 0) throwGun(world, a, i as 0 | 1, cmd);
  }
  // players only for now: armed grunts pick weapons up in M7
  if (a.playerIndex !== undefined && (cmd.pickup || (!a.hands[0] && !a.hands[1]))) pickUp(world, a, !!cmd.pickup, cmd);
}

/** gun-reload: one hand at a time, only with a spare and only when not dual-wielding (proposal). */
function startReload(world: World, a: Actor, dual: boolean): void {
  if (dual) return;
  for (const i of [0, 1] as const) {
    const g = gunIn(a.hands[i]);
    if (!g || g.h.reload > 0 || g.h.spare <= 0 || g.h.ammo >= g.w.mag) continue;
    g.h.reload = g.w.reload;
    g.h.clicked = false;
    world.events.emit('reload', { actorId: a.id, hand: i, phase: 'start', weapon: g.w.id, ...a.pos });
    return;
  }
}

function fire(world: World, a: Actor, i: 0 | 1, h: Hand, w: WeaponDef, dual: boolean): void {
  const foot = project(a.pos.x, a.pos.y, a.pos.z), s = scaleAt(a.pos.z);
  const target = (i === 0 ? a.pose.aim : a.pose.aimB) ?? project(a.pos.x + a.facing * 3, a.pos.y + 0.55, a.pos.z);
  const rig = aimRig(foot, s, a.facing, i, target, w, a.pose.kick?.[i] ?? 0);
  h.ammo--;
  h.cooldown = w.interval;
  h.clicked = false;
  a.pose.kick![i] = w.recoil;
  // the barrel's direction on screen (local angle, mirrored to the facing side)
  const base = Math.atan2(Math.sin(rig.angle), Math.cos(rig.angle) * a.facing);
  const spread = ((w.spread * (dual && !w.oneHanded ? GUNS.dualLongSpread : 1)) * Math.PI) / 180;
  const rays: ShotRay[] = [];
  // no friendly fire (invented); your own human shield doesn't stop your shots
  const skip = (o: Actor) => o === a || o.grabbedBy === a.id || (a.playerIndex !== undefined && o.playerIndex !== undefined);
  for (let p = 0; p < w.pellets; p++) {
    const ang = base + (world.rng() * 2 - 1) * spread;
    const dir: ScreenPoint = [Math.cos(ang), Math.sin(ang)];
    const r = castRay(world, rig.muzzle, dir, a.pos.z, skip);
    if (r.disarm) {
      // combat-disarm: the shot hit the weapon in the hand before the body
      disarm(world, a, r.disarm, 'shot', Math.sign(dir[0]) || a.facing);
      rays.push({ end: r.end, surface: 'metal' });
      continue;
    }
    if (r.hit) {
      const o = r.hit.actor;
      const pointBlank = w.pellets > 1 && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < GUNS.pointBlank;
      const damage = r.hit.part === 'head' ? w.damageHead : w.damageBody;
      world.hitBullet(a, o, damage, r.hit.part, Math.sign(dir[0]) || a.facing, pointBlank, { x: o.pos.x, y: o.pos.y + (r.hit.part === 'head' ? 0.79 : 0.4), z: o.pos.z });
      rays.push({ end: r.end, surface: 'flesh', impact: behind(world, r.end, dir, o) });
    } else rays.push({ end: r.end, surface: r.surface, impact: r.world && r.surface && r.surface !== 'sky' ? { ...r.world, surface: r.surface } : undefined });
  }
  world.events.emit('shot', {
    actorId: a.id, hand: i, weapon: w.id, muzzle: rig.muzzle, eject: rig.eject, angle: base, rays,
    suppressed: w.suppressed, x: a.pos.x, y: a.pos.y, z: a.pos.z,
  });
}

/** Blood splatter goes on whatever is behind the target at its depth (wall or floor). */
function behind(world: World, at: ScreenPoint, dir: ScreenPoint, o: Actor): ShotRay['impact'] {
  // continue the ray past the body at the target's depth
  const r = castRay(world, [at[0] + dir[0] * 4, at[1] + dir[1] * 4], dir, o.pos.z, () => true);
  return r.world && r.surface && r.surface !== 'sky' ? { ...r.world, surface: r.surface } : undefined;
}

/** gun-empty-throw: the gun spins straight toward the aim point at the thrower's depth. */
export function throwGun(world: World, a: Actor, i: 0 | 1, cmd: PlayerCommand): void {
  const h = a.hands[i];
  if (!h) return;
  a.hands[i] = null;
  const from = { x: a.pos.x + a.facing * 0.35, y: a.pos.y + 0.6, z: a.pos.z };
  const target = cmd.aim ?? project(a.pos.x + a.facing * 3, 0.6, a.pos.z);
  const [fx, fy] = project(from.x, from.y, from.z);
  // screen direction == world direction in the plane of constant depth (y flipped)
  let dx = target[0] - fx, dy = -(target[1] - fy);
  const n = Math.hypot(dx, dy) || 1;
  dx /= n; dy /= n;
  if (Math.abs(dx) < 0.2) dx = a.facing * 0.2;
  const it = world.spawnItem(h.item, 'grunt', from, { x: dx * GUNS.throwSpeed, y: dy * GUNS.throwSpeed, z: 0 }, Math.sign(dx) * 22);
  it.thrownBy = a.id;
  it.straight = 0.6;
  it.ammo = h.ammo;
  it.spare = h.spare;
  world.events.emit('throw', { actorId: a.id, itemId: it.id, ...from, vx: dx * GUNS.throwSpeed, vz: 0 });
}

/**
 * gun-pickup-drop: E takes the nearest weapon on the floor into a free hand (or swaps the front
 * hand's); with both hands empty, walking over one picks it up (proposal). M6: E pulls a stuck
 * blade or the planted sign out (0.5 s; with empty hands also by standing on it), and grenades
 * on the floor go into the pocket.
 */
function pickUp(world: World, a: Actor, pressed: boolean, cmd: PlayerCommand): void {
  if (a.holding || a.state !== 'free' || a.cook !== undefined) return;
  // throw-knives: pull a stuck blade out (walking over it with empty hands, standing still)
  const still = Math.hypot(cmd.moveX, cmd.moveZ) < 0.1;
  if (pressed || still) {
    const stuck = pullable(world, a);
    if (stuck && (pressed || stuck.state === 'stuck')) { startAction(world, a, 'pull', cmd, { itemId: stuck.id }); return; }
  }
  const reach = pressed ? GUNS.pickupRange : GUNS.pickupRange * 0.6;
  let best: (typeof world.items)[number] | undefined, bestD = Infinity;
  for (const it of world.items) {
    if (it.state !== 'floor' || it.kind === 'head' || (it.kind === 'grenade' && it.live)) continue;
    const d = Math.hypot(it.pos.x - a.pos.x, (it.pos.z - a.pos.z) * 1.5);
    if (d <= reach && d < bestD) { best = it; bestD = d; }
  }
  if (!best) return;
  const it = best;
  world.items = world.items.filter((x) => x !== it);
  if (it.kind === 'grenade') {
    a.grenades++;
    world.events.emit('pickup', { actorId: a.id, itemId: it.id, hand: 0, item: it.kind, ...a.pos });
    return;
  }
  const long = isMelee(it.kind) && MELEE[it.kind].twoHanded;
  // a two-handed weapon takes both hands; anything picked up while holding one replaces it
  const slot: 0 | 1 = long || isLong(a) ? 0 : !a.hands[0] ? 0 : !a.hands[1] ? 1 : 0;
  for (const i of long || isLong(a) ? [0, 1] as const : [slot]) {
    const old = a.hands[i];
    if (old) dropHeld(world, old.item, a.pos, a.facing * 0.3, { ammo: old.ammo, spare: old.spare });
    a.hands[i] = null;
  }
  a.hands[slot] = newHand(it.kind as Exclude<typeof it.kind, 'head' | 'grenade'>, it.ammo, it.spare);
  world.events.emit('pickup', { actorId: a.id, itemId: it.id, hand: slot, item: it.kind, ...a.pos });
}

const isLong = (a: Actor) => { const h = a.hands[0]; return !!h && isMelee(h.item) && MELEE[h.item].twoHanded; };
