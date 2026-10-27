// Guns (PLAN.md M5, research/mechanics/gun-*): two hands (LMB front, RMB back), free aim,
// screen-space hitscan, magazine + one spare (throw & scavenge), dry click then throw when
// empty, reload, pick-up from the floor, split aim. Numbers live in src/data/weapons.ts.
import { aimRig } from '../anim/aim';
import { flatness } from '../anim/skeleton';
import { isMelee, MELEE } from '../data/melee';
import { GUNS, isWeapon, WEAPONS, type WeaponDef } from '../data/weapons';
import { TUNING } from '../data/tuning';
import { project, type ScreenPoint, scaleAt } from '../render/camera';
import { type Actor, alive, type Hand, newHand } from './actor';
import type { PlayerCommand } from './command';
import { castRay, type Surface } from './hitscan';
import { wardBlocked } from './boss';
import { dropHeld, type Item, throwToDepth } from './items';
import { shootCables } from './elevator';
import { disarm, pullable, startAction } from './melee';
import type { World } from './world';

/** One bullet's path for the effects: tracer end, what it hit, blood behind a body hit. */
export interface ShotRay {
  end: ScreenPoint;
  surface?: Surface | 'flesh' | 'metal' | 'ward';
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

/** Lying on the belly after a dive, in control (crawling too): the guns aim from down there. */
export function shootsProne(a: Actor): boolean {
  // M18 carry-spin: swung round by the ankles, the partner shoots like from the belly
  if (a.carried === 'spin') return true;
  return a.state === 'free' && a.body.state === 'prone' && !a.pose.dead;
}

/** Can aim and fire: standing, in the air, or prone (playtest 2026-10-27); not knocked about. */
function canShoot(a: Actor): boolean {
  if (shootsProne(a)) return true;
  return (a.state === 'free' || a.state === 'attack') && flatness(a.pose.root) < 0.5 && a.body.state !== 'diving';
}

/**
 * M10b over-the-shoulder (ep3 f6660-f6710): the enemy in melee contact right behind you, within
 * TUNING.juggle.backReach. RMB shoots him without turning.
 */
export function behindContact(world: World, a: Actor): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (o === a || !alive(o) || o.kind === 'hero' || o.grabbedBy !== undefined || o.state === 'grabbed') continue;
    if (Math.abs(o.pos.z - a.pos.z) > TUNING.melee.depthBand * 1.6) continue;
    const d = (a.pos.x - o.pos.x) * a.facing; // > 0: behind
    if (d < 0.05 || d > TUNING.juggle.backReach || d >= bestD) continue;
    best = o;
    bestD = d;
  }
  return best;
}

/** Every tick for an actor in control: aim, fire, dry click, throw, reload, pick up. True if RMB went to an over-the-shoulder shot. */
export function stepHands(world: World, a: Actor, cmd: PlayerCommand, dt: number): boolean {
  a.walkFactor = 1;
  const kick = (a.pose.kick ??= [0, 0]);
  kick[0] = Math.max(0, kick[0] - dt * 0.6);
  kick[1] = Math.max(0, kick[1] - dt * 0.6);
  if (cmd.aim || a.hands.some((h) => gunIn(h))) {
    a.pose.aim = aimPoint(a, cmd, 0, world);
    a.pose.aimB = aimPoint(a, cmd, 1, world);
  }
  const dual = !!gunIn(a.hands[0]) && !!gunIn(a.hands[1]);
  // M10b over-the-shoulder: RMB with an enemy in contact behind you fires backward, without turning
  let backShot = false;
  if (cmd.press?.[1] && a.playerIndex !== undefined && canShoot(a)) {
    const o = behindContact(world, a);
    const i = gunIn(a.hands[1]) ? 1 : gunIn(a.hands[0]) ? 0 : -1;
    const g = i >= 0 ? gunIn(a.hands[i as 0 | 1]) : undefined;
    if (o && g && g.h.ammo > 0 && g.h.reload === 0 && g.h.cooldown <= 1e-6) {
      const target = project(o.pos.x, o.pos.y + 0.79, o.pos.z);
      a.pose.backShot = { hand: i as 0 | 1, until: world.time + 0.3, target };
      world.hitVia = 'style';
      fire(world, a, i as 0 | 1, g.h, g.w, dual, { target, rigHand: 1, at: o.id });
      world.hitVia = undefined;
      if (o.state === 'dead') world.events.emit('fatality', { actorId: o.id, kind: 'backshot', ...o.pos });
      backShot = true;
    }
  }
  if (cmd.fireMode) switchFireMode(world, a);
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
    const pressed = !!cmd.press?.[i] && !(backShot && i === 1), held = !!cmd.hold?.[i] && !(backShot && i === 1);
    if (h.ammo > 0) {
      // (tolerance: summing 1/60 s ticks drifts, and the measured SMG rate is exactly 6 ticks)
      if ((w.auto && !h.semi ? held || pressed : pressed) && h.cooldown <= 1e-6 && canShoot(a)) fire(world, a, i, h, w, dual);
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
  // players also walk over weapons with a free hand (M17); grunts pick up when their brain says so (M7)
  if (a.playerIndex !== undefined ? cmd.pickup || !a.hands[0] || !a.hands[1] : cmd.pickup) pickUp(world, a, !!cmd.pickup, cmd);
  return backShot;
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

/** `over` (M10b over-the-shoulder): aim at this point from the back shoulder; the actor `at` takes it in the head, point blank. */
function fire(world: World, a: Actor, i: 0 | 1, h: Hand, w: WeaponDef, dual: boolean, over?: { target: ScreenPoint; rigHand: 0 | 1; at: number }): void {
  const foot = project(a.pos.x, a.pos.y, a.pos.z), s = scaleAt(a.pos.z);
  const target = over?.target ?? (i === 0 ? a.pose.aim : a.pose.aimB) ?? project(a.pos.x + a.facing * 3, a.pos.y + 0.55, a.pos.z);
  const rig = aimRig(foot, s, a.facing, over?.rigHand ?? i, target, w, a.pose.kick?.[i] ?? 0, shootsProne(a) ? a.pose.root : undefined);
  h.ammo--;
  h.cooldown = w.interval;
  h.clicked = false;
  a.pose.kick![i] = w.recoil;
  // the barrel's direction on screen (local angle, mirrored to the facing side)
  const base = Math.atan2(Math.sin(rig.angle), Math.cos(rig.angle) * a.facing);
  const spread = ((w.spread * (dual && !w.oneHanded ? GUNS.dualLongSpread : 1) * (h.semi ? GUNS.semiSpread : 1)) * Math.PI) / 180;
  const rays: ShotRay[] = [];
  // no friendly fire (invented); your own human shield doesn't stop your shots
  const skip = (o: Actor) => o === a || o.grabbedBy === a.id || (a.playerIndex !== undefined && o.playerIndex !== undefined);
  for (let p = 0; p < w.pellets; p++) {
    const ang = base + (world.rng() * 2 - 1) * spread;
    const dir: ScreenPoint = [Math.cos(ang), Math.sin(ang)];
    // point blank: the barrel can reach past a body right in front of you, so the hit test starts
    // back along the barrel (behind the grip); the tracer still starts at the muzzle
    const back = (w.length + 0.2) * scaleAt(a.pos.z);
    const r = castRay(world, [rig.muzzle[0] - dir[0] * back, rig.muzzle[1] - dir[1] * back], dir, a.pos.z, skip, rig.muzzle);
    if (r.hit && r.hit.t < back) r.end = rig.muzzle;
    // M10 world-destructible: the elevator cables take shots that cross them
    if (world.elevator && a.playerIndex !== undefined) shootCables(world, rig.muzzle, r.end);
    if (r.ward) {
      // M8: stopped on the boss's ward, sparks fly off it
      world.events.emit('wardHit', { actorId: r.ward.id, at: r.end });
      wardBlocked(r.ward);
      rays.push({ end: r.end, surface: 'ward' });
      continue;
    }
    if (r.disarm) {
      // combat-disarm: the shot hit the weapon in the hand before the body
      disarm(world, a, r.disarm, 'shot', Math.sign(dir[0]) || a.facing);
      rays.push({ end: r.end, surface: 'metal' });
      continue;
    }
    if (r.hit) {
      const o = r.hit.actor;
      // M10b: the one behind you takes it in the head, point blank; a juggled grunt is all head (he's spinning)
      const backTarget = over?.at === o.id;
      const part = backTarget || (o.flight?.juggle && o.flight.phase === 'air') ? 'head' : r.hit.part;
      const pointBlank = backTarget || (w.pellets > 1 && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < GUNS.pointBlank);
      const damage = part === 'head' ? w.damageHead : w.damageBody;
      world.hitBullet(a, o, damage, part, Math.sign(dir[0]) || a.facing, pointBlank, { x: o.pos.x, y: o.pos.y + (part === 'head' ? 0.79 : 0.4), z: o.pos.z });
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
  // M17: thrown at an enemy at another depth, it flies to his depth
  const vel = throwToDepth(world, a, from, cmd.aim, GUNS.throwSpeed) ?? { x: dx * GUNS.throwSpeed, y: dy * GUNS.throwSpeed, z: 0 };
  const it = world.spawnItem(h.item, 'grunt', from, vel, Math.sign(vel.x || dx) * 22);
  it.thrownBy = a.id;
  it.thrownAt = world.time;
  it.straight = 0.6;
  it.ammo = h.ammo;
  it.spare = h.spare;
  world.events.emit('throw', { actorId: a.id, itemId: it.id, ...from, vx: vel.x, vz: vel.z });
}

/** M17 (design/qol-pass.md): what E (or walking over something) would do right now. */
export interface PickupPlan {
  /** `pocket` = a grenade into the pocket. */
  verb: 'take' | 'swap' | 'pull' | 'pocket';
  item: Item;
  /** Hand it goes into (`swap`: the smart pick); 'both' = a two-handed weapon (or one held). */
  hand: 0 | 1 | 'both';
  /** What leaves the hands. */
  replaces: Hand[];
}

/** A gun with nothing left in it (auto pickup and auto catch skip these). */
export function emptyGun(kind: string, ammo?: number, spare?: number): boolean {
  return isWeapon(kind) && (ammo ?? WEAPONS[kind].mag) <= 0 && (spare ?? 1) <= 0;
}

/** Smart swap (M17): the hand to give up for a new item: an empty gun first, then the emptier gun, then a melee weapon; ties go to the front. */
export function swapHand(a: Actor): 0 | 1 {
  const score = (h: Hand | null): number => {
    if (!h) return -1;
    if (isWeapon(h.item)) { const m = WEAPONS[h.item].mag; return (h.ammo + h.spare * m) / (2 * m); }
    return TUNING.qol.meleeSwapScore;
  };
  return score(a.hands[1]) < score(a.hands[0]) ? 1 : 0;
}

/**
 * gun-pickup-drop + M17: what E would take (or `walkOver`: what walking over picks up). One plan for
 * the sim and the E prompt. Order: a stuck blade / the planted sign to pull, then the nearest floor
 * item. Walking over takes only with a free hand: anything with both hands empty, a loaded gun into
 * the one empty hand; never an empty gun or your own gun you just threw.
 */
export function pickupPlan(world: World, a: Actor, walkOver = false): PickupPlan | undefined {
  // M8: the boombox takes the front hand; nothing else is picked up while carrying it
  if (a.holding || a.state !== 'free' || a.cook !== undefined || a.carry) return undefined;
  const free = (!a.hands[0] ? 1 : 0) + (!a.hands[1] ? 1 : 0);
  if (walkOver && (free === 0 || isLong(a))) return undefined;
  if (!walkOver) {
    const stuck = pullable(world, a);
    if (stuck) return { verb: 'pull', item: stuck, hand: !a.hands[0] ? 0 : 1, replaces: [] };
  }
  const reach = walkOver ? GUNS.pickupRange * 0.6 : GUNS.pickupRange;
  let best: Item | undefined, bestD = Infinity;
  for (const it of world.items) {
    // the boombox is the players' (M8 ending), nobody else's
    if (it.state !== 'floor' || it.locked || it.kind === 'head' || (it.kind === 'boombox' && a.playerIndex === undefined) || (it.kind === 'grenade' && it.live)) continue;
    if (walkOver) {
      if (emptyGun(it.kind, it.ammo, it.spare)) continue;
      if (it.ownedBy === a.id && world.time - (it.ownedAt ?? -Infinity) < TUNING.qol.ownThrowIgnore) continue;
      // one hand full: only a loaded gun fills the other (decided with the user)
      if (free === 1 && !isWeapon(it.kind)) continue;
    }
    const d = Math.hypot(it.pos.x - a.pos.x, (it.pos.z - a.pos.z) * 1.5);
    if (d <= reach && d < bestD) { best = it; bestD = d; }
  }
  if (!best) return undefined;
  const it = best;
  if (it.kind === 'grenade') return { verb: 'pocket', item: it, hand: 0, replaces: [] };
  // the boombox always takes the front hand (no choice to make)
  if (it.kind === 'boombox') return { verb: 'take', item: it, hand: 0, replaces: a.hands[0] ? [a.hands[0]] : [] };
  const long = isMelee(it.kind) && MELEE[it.kind].twoHanded;
  // a two-handed weapon takes both hands; anything picked up while holding one replaces it
  if (long || isLong(a)) {
    const held = a.hands.filter((h): h is Hand => !!h);
    return { verb: held.length ? 'swap' : 'take', item: it, hand: 'both', replaces: held };
  }
  if (free > 0) return { verb: 'take', item: it, hand: !a.hands[0] ? 0 : 1, replaces: [] };
  const hand = swapHand(a);
  return { verb: 'swap', item: it, hand, replaces: [a.hands[hand]!] };
}

/** Carry out a plan; `hand` overrides the smart pick of a swap (hold E + LMB / RMB). */
export function takePlan(world: World, a: Actor, plan: PickupPlan, cmd: PlayerCommand, hand?: 0 | 1, auto = false): void {
  const it = plan.item;
  if (plan.verb === 'pull') { startAction(world, a, 'pull', cmd, { itemId: it.id }); return; }
  world.items = world.items.filter((x) => x !== it);
  if (it.kind === 'grenade') {
    a.grenades++;
    world.events.emit('pickup', { actorId: a.id, itemId: it.id, hand: 0, item: it.kind, auto, ...a.pos });
    return;
  }
  if (it.kind === 'boombox') {
    // carried by the handle in the front hand: whatever was there goes on the floor
    const old = a.hands[0];
    if (old) { dropHeld(world, old.item, a.pos, a.facing * 0.3, { ammo: old.ammo, spare: old.spare }); a.hands[0] = null; }
    a.carry = 'boombox';
    world.events.emit('pickup', { actorId: a.id, itemId: it.id, hand: 0, item: it.kind, auto, ...a.pos });
    return;
  }
  const slot: 0 | 1 = plan.hand === 'both' ? 0 : hand ?? plan.hand;
  for (const i of plan.hand === 'both' ? [0, 1] as const : [slot]) {
    const old = a.hands[i];
    if (old) dropHeld(world, old.item, a.pos, a.facing * 0.3, { ammo: old.ammo, spare: old.spare });
    a.hands[i] = null;
  }
  a.hands[slot] = newHand(it.kind as Exclude<typeof it.kind, 'head'>, it.ammo, it.spare);
  // M14 gun-fire-mode: a rifle a player picks up starts on single shot (B for full auto)
  if (a.playerIndex !== undefined && isWeapon(it.kind) && WEAPONS[it.kind].modes) a.hands[slot]!.semi = true;
  world.events.emit('pickup', { actorId: a.id, itemId: it.id, hand: slot, item: it.kind, auto, ...a.pos });
}

/**
 * gun-pickup-drop: E takes the nearest weapon on the floor into a free hand (or swaps the worse
 * hand, M17); walking over one picks it up when a hand is free (loaded guns only into the second
 * hand). M6: E pulls a stuck blade or the planted sign out (0.5 s; with empty hands also by standing
 * on it), and grenades on the floor go into the pocket.
 */
function pickUp(world: World, a: Actor, pressed: boolean, cmd: PlayerCommand): void {
  if (!pressed) {
    // throw-knives: standing still on a stuck blade with empty hands pulls it out
    if (!a.hands[0] && !a.hands[1] && Math.hypot(cmd.moveX, cmd.moveZ) < 0.1) {
      const stuck = pullable(world, a);
      if (stuck?.state === 'stuck' && a.state === 'free' && !a.holding && a.cook === undefined && !a.carry) { startAction(world, a, 'pull', cmd, { itemId: stuck.id }); return; }
    }
    const plan = pickupPlan(world, a, true);
    if (plan) takePlan(world, a, plan, cmd, undefined, true);
    return;
  }
  const plan = pickupPlan(world, a);
  if (plan) takePlan(world, a, plan, cmd);
}

/**
 * M17 hold E and click: with both hands full, E waits. A click while it's held swaps that hand (and
 * isn't a shot or a punch); letting go takes the smart pick. With a free hand E acts on press as before.
 * Returns the command with the spent inputs removed.
 */
export function stepUse(world: World, a: Actor, cmd: PlayerCommand): PlayerCommand {
  if (a.playerIndex === undefined) return cmd;
  if (a.useHeldAt === undefined) {
    if (!cmd.pickup) return cmd;
    const plan = pickupPlan(world, a);
    if (plan?.verb !== 'swap' || plan.hand === 'both') return cmd;
    a.useHeldAt = world.time;
    return { ...cmd, pickup: false };
  }
  const plan = pickupPlan(world, a);
  if (plan?.verb !== 'swap' || plan.hand === 'both') { a.useHeldAt = undefined; return { ...cmd, pickup: false }; }
  const click = cmd.press?.[0] ? 0 : cmd.press?.[1] ? 1 : undefined;
  if (click !== undefined || !cmd.useHeld) {
    a.useHeldAt = undefined;
    takePlan(world, a, plan, cmd, click);
  }
  return { ...cmd, pickup: false, attack: null, press: [false, false], hold: [false, false] };
}

/** M14 gun-fire-mode: B flips the selector on the first hand holding a gun that has one (front hand first). */
function switchFireMode(world: World, a: Actor): void {
  for (const i of [0, 1] as const) {
    const g = gunIn(a.hands[i]);
    if (!g || !g.w.modes) continue;
    g.h.semi = !g.h.semi;
    world.events.emit('fireMode', { actorId: a.id, hand: i, weapon: g.w.id, semi: g.h.semi, ...a.pos });
    return;
  }
}

const isLong = (a: Actor) => { const h = a.hands[0]; return !!h && isMelee(h.item) && MELEE[h.item].twoHanded; };
