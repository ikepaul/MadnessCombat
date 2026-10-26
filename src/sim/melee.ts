// Melee weapons, throwables, grenades and disarms (PLAN.md M6, research/mechanics/melee-weapons,
// melee-environment-weapon, throw-knives, throw-grenade, combat-disarm). The combat state machine
// (src/sim/combat.ts) starts these actions in the `attack` state; this file runs them.
import { aimRig } from '../anim/aim';
import { flatness, rootToWorld } from '../anim/skeleton';
import { sampleClip } from '../anim/clips';
import { DISARM, GRENADE, isMelee, MELEE, type MeleeDef, THROWN } from '../data/melee';
import { isWeapon, WEAPONS } from '../data/weapons';
import { project, type ScreenPoint, scaleAt, unprojectFloor } from '../render/camera';
import { type Actor, alive, type AttackKind, type HeldItem, newHand } from './actor';
import { applyHit, setClip } from './combat';
import type { PlayerCommand } from './command';
import { explode } from './explosives';
import { dropHeld, type Item, lobVelocity, spawnItem } from './items';
import type { World } from './world';

const F = 1 / 30;

/** The M6 actions that run in the `attack` state. */
export const ACTION_KINDS: AttackKind[] = ['swing', 'thrust', 'toss', 'lob', 'pull', 'steal'];

export function meleeIn(a: Actor, i: 0 | 1): MeleeDef | undefined {
  const h = a.hands[i];
  return h && isMelee(h.item) ? MELEE[h.item] : undefined;
}

const gunIn = (a: Actor, i: 0 | 1) => { const h = a.hands[i]; return !!h && isWeapon(h.item); };

/** Holding the street sign (or another two-handed weapon). */
export function holdsLong(a: Actor): boolean {
  return !!meleeIn(a, 0)?.twoHanded;
}

/** Startup / active / recovery of an M6 action (s). */
export function actionTiming(kind: AttackKind, weapon?: string): { startup: number; active: number; recovery: number } {
  const d = weapon && isMelee(weapon) ? MELEE[weapon] : MELEE.knife;
  switch (kind) {
    case 'swing': return { startup: d.startup, active: d.active, recovery: d.recovery };
    // the long-weapon thrust: quicker out than the sweep, a long recovery (invented)
    case 'thrust': return { startup: 5 * F, active: 4 * F, recovery: 7 * F };
    case 'toss': return { startup: THROWN.windup, active: 0, recovery: THROWN.recovery };
    case 'lob': return { startup: GRENADE.lobWindup, active: 0, recovery: GRENADE.lobRecovery };
    case 'pull': return { startup: THROWN.pull, active: 0, recovery: 3 * F };
    case 'steal': return { startup: DISARM.steal, active: 0, recovery: 3 * F };
    default: return { startup: 0, active: 0, recovery: 0 };
  }
}

const CLIP: Partial<Record<AttackKind, string>> = { thrust: 'thrust', toss: 'throwOne', lob: 'lob', pull: 'pull', steal: 'steal' };

function clipFor(kind: AttackKind, weapon?: string): string {
  if (kind === 'swing') return weapon === 'knife' ? 'stab' : weapon && isMelee(weapon) && MELEE[weapon].twoHanded ? 'swingLong' : 'swing';
  return CLIP[kind] ?? 'idle';
}

/** Enter the attack state for an M6 action. */
export function startAction(world: World, a: Actor, kind: AttackKind, cmd: Pick<PlayerCommand, 'aim' | 'face'>, extra: { hand?: 0 | 1; itemId?: number; targetId?: number; fuse?: number } = {}): void {
  const weapon = extra.hand !== undefined ? a.hands[extra.hand]?.item ?? undefined : undefined;
  if (cmd.face) a.facing = cmd.face;
  else if (cmd.aim && (kind === 'toss' || kind === 'lob')) {
    const [sx] = project(a.pos.x, a.pos.y + 0.5, a.pos.z);
    if (Math.abs(cmd.aim[0] - sx) > 4) a.facing = cmd.aim[0] > sx ? 1 : -1;
  }
  a.state = 'attack';
  a.stateT = 0;
  a.attack = { kind, heavy: false, t: 0, done: false, hand: extra.hand, hits: [], aim: cmd.aim, weapon: weapon ?? undefined, itemId: extra.itemId, targetId: extra.targetId, fuse: extra.fuse };
  if (kind === 'toss' || kind === 'lob' || kind === 'pull' || kind === 'steal') a.body.vel = { x: 0, y: 0, z: 0 };
  setClip(a, clipFor(kind, weapon ?? undefined));
  if (kind === 'pull') {
    const it = world.items.find((i) => i.id === extra.itemId);
    if (it) world.events.emit('pull', { actorId: a.id, itemId: it.id, phase: 'start', item: it.kind, ...a.pos });
  }
}

/**
 * LMB / RMB / Q with a melee weapon in hand (free state, on the ground). LMB uses the front hand,
 * RMB the back hand; a knife stabs up close and is thrown at range (ep3); the long weapon sweeps
 * on LMB and thrusts on RMB; Q throws the front-most melee weapon. Returns true if it acted.
 */
export function startMeleeAction(world: World, a: Actor, cmd: PlayerCommand): boolean {
  if (a.body.state !== 'ground' || a.holding) return false;
  const d0 = meleeIn(a, 0), d1 = meleeIn(a, 1);
  if (cmd.throwGun) {
    const i = d0 ? 0 : !gunIn(a, 0) && d1 ? 1 : -1;
    if (i >= 0) { startAction(world, a, 'toss', cmd, { hand: i as 0 | 1 }); return true; }
  }
  if (!cmd.attack) return false;
  const lmb = cmd.attack === 'light';
  if (d0?.twoHanded) { startAction(world, a, lmb ? 'swing' : 'thrust', cmd, { hand: 0 }); return true; }
  const i: 0 | 1 = lmb ? 0 : 1;
  const d = i === 0 ? d0 : d1;
  if (!d) return false;
  if (d.id === 'knife' && !swingTargets(world, a, d, d.reach, []).length) { startAction(world, a, 'toss', cmd, { hand: i }); return true; }
  startAction(world, a, 'swing', cmd, { hand: i });
  return true;
}

/** Standing targets a swing of `def` reaches (nearest first). */
function swingTargets(world: World, a: Actor, def: MeleeDef, reach: number, already: number[]): Actor[] {
  return world.actors
    .filter((o) => {
      if (o === a || !alive(o) || already.includes(o.id)) return false;
      if (o.state === 'grabbed' || o.state === 'getUp' || o.state === 'downed' || o.state === 'down') return false;
      if (a.playerIndex !== undefined && o.playerIndex !== undefined) return false; // no friendly fire in co-op
      const ahead = (o.pos.x - a.pos.x) * a.facing;
      if (ahead < -0.1 || ahead > reach || Math.abs(o.pos.z - a.pos.z) > def.depthBand) return false;
      return o.pos.y <= a.pos.y + 1 && o.pos.y + o.body.height >= a.pos.y + 0.2;
    })
    .sort((p, q) => Math.abs(p.pos.x - a.pos.x) - Math.abs(q.pos.x - a.pos.x));
}

/** Runs an M6 action's timeline. Called every tick in the attack state. */
export function stepAction(world: World, a: Actor): void {
  const atk = a.attack!;
  const tm = actionTiming(atk.kind, atk.weapon);
  const reached = (t: number, d: number) => t >= d - 1e-6;
  const start = !atk.done && reached(atk.t, tm.startup);
  switch (atk.kind) {
    case 'swing':
    case 'thrust': {
      if (!reached(atk.t, tm.startup) || reached(atk.t, tm.startup + tm.active)) break;
      const def = atk.weapon && isMelee(atk.weapon) ? MELEE[atk.weapon] : undefined;
      if (!def || a.hands[atk.hand ?? 0]?.item !== def.id) { atk.done = true; break; }
      const kind = def.id === 'knife' ? 'stab' : def.edge === 'blade' ? 'slash' : 'smash';
      if (!reached(atk.t - world.dt, tm.startup)) {
        // smear arc + whoosh at the tip on the first active tick
        world.events.emit('punch', { actorId: a.id, x: a.pos.x + a.facing * def.reach * 0.8, y: a.pos.y + 0.6, z: a.pos.z, kind, facing: a.facing });
      }
      if (atk.done) break;
      const reach = atk.kind === 'thrust' ? def.reach + 0.1 : def.reach;
      const targets = swingTargets(world, a, def, reach, atk.hits ?? []);
      for (const o of def.multiHit && atk.kind === 'swing' ? targets : targets.slice(0, 1)) {
        atk.hits!.push(o.id);
        const at = { x: o.pos.x - a.facing * 0.15, y: o.pos.y + 0.6, z: o.pos.z };
        if (atk.kind === 'thrust') {
          const wall = pinSurface(world, a, o);
          if (wall !== undefined && o.kind !== 'hero') { pin(world, a, o, wall); atk.done = true; return; }
          applyHit(world, a, o, 'smash', a.facing, 0, at, 'body');
        } else applyHit(world, a, o, kind, a.facing, 0, at, kind === 'stab' ? 'head' : 'body');
      }
      if (targets.length && !(def.multiHit && atk.kind === 'swing')) atk.done = true;
      break;
    }
    case 'toss':
      if (start) { atk.done = true; tossHeld(world, a, atk.hand ?? 0, atk.aim); }
      break;
    case 'lob': {
      // the fuse keeps burning through the wind-up
      const left = (atk.fuse ?? GRENADE.fuse) - atk.t;
      if (!atk.done && left <= 0) {
        atk.done = true;
        a.pose.grenade = false;
        explode(world, { x: a.pos.x + a.facing * 0.3, y: a.pos.y + 0.5, z: a.pos.z }, a.id);
      } else if (start) { atk.done = true; lobGrenade(world, a, left, atk.aim); }
      break;
    }
    case 'pull':
      if (start) { atk.done = true; finishPull(world, a, atk.itemId!); }
      break;
    case 'steal':
      if (start) { atk.done = true; finishSteal(world, a, atk.targetId!); }
      break;
  }
}

// ---------- throwing ----------

/** throw-knives / melee-weapons: a held weapon flies (almost) straight toward the cursor at the thrower's depth. */
export function tossHeld(world: World, a: Actor, i: 0 | 1, aim?: ScreenPoint): Item | undefined {
  const h = a.hands[i];
  if (!h) return undefined;
  a.hands[i] = null;
  const from = { x: a.pos.x + a.facing * 0.35, y: a.pos.y + 0.62, z: a.pos.z };
  const target = aim ?? project(a.pos.x + a.facing * 3, 0.62, a.pos.z);
  const [fx, fy] = project(from.x, from.y, from.z);
  // screen direction == world direction in the plane of constant depth (y flipped)
  let dx = target[0] - fx, dy = -(target[1] - fy);
  const n = Math.hypot(dx, dy) || 1;
  dx /= n; dy /= n;
  if (Math.abs(dx) < 0.2) dx = a.facing * 0.2;
  const knife = h.item === 'knife';
  const speed = knife ? THROWN.knifeSpeed : THROWN.speed;
  const blade = isMelee(h.item) && MELEE[h.item].edge === 'blade';
  // knives spin end over end; long things tumble slower
  const it = world.spawnItem(h.item, 'grunt', from, { x: dx * speed, y: dy * speed, z: 0 }, Math.sign(dx) * (knife ? 24 : 14));
  it.thrownBy = a.id;
  it.thrownAt = world.time;
  it.straight = THROWN.maxFlight;
  it.drop = blade ? THROWN.gravityShare : 0;
  it.ammo = h.ammo;
  it.spare = h.spare;
  world.events.emit('throw', { actorId: a.id, itemId: it.id, ...from, vx: dx * speed, vz: 0 });
  return it;
}

/** throw-grenade: release toward the floor point under the cursor (max GRENADE.maxRange). */
function lobGrenade(world: World, a: Actor, fuse: number, aim?: ScreenPoint): void {
  a.pose.grenade = false;
  const from = { x: a.pos.x + a.facing * 0.3, y: a.pos.y + 0.7, z: a.pos.z };
  let tx = a.pos.x + a.facing * 2, tz = a.pos.z;
  const p = aim ? unprojectFloor(aim[0], aim[1]) : undefined;
  if (p) { tx = p.x; tz = p.z; }
  const dx = tx - from.x, dz = tz - from.z, d = Math.hypot(dx, dz);
  if (d > GRENADE.maxRange) { tx = from.x + (dx / d) * GRENADE.maxRange; tz = from.z + (dz / d) * GRENADE.maxRange; }
  tz = Math.max(world.room.zFront, Math.min(world.room.zBack - 0.15, tz));
  const it = world.spawnItem('grenade', 'grunt', from, lobVelocity(from, tx, tz), Math.sign(tx - from.x || a.facing) * 9);
  it.live = true;
  it.fuse = Math.max(0.05, fuse);
  it.thrownBy = a.id;
  it.thrownAt = world.time;
  world.events.emit('throw', { actorId: a.id, itemId: it.id, ...from, vx: it.vel.x, vz: it.vel.z });
}

/** A held live grenade (picked up from the floor) is lobbed like a cooked one. */
export function lobHeldGrenade(world: World, a: Actor, it: Item, aim?: ScreenPoint): void {
  world.items = world.items.filter((x) => x !== it);
  lobGrenade(world, a, it.fuse ?? GRENADE.fuse, aim);
}

/**
 * G held: pull the pin and cook (the fuse runs); release: lob. Cooking too long blows up in
 * your hand. Needs a free hand and a grenade.
 */
export function stepGrenade(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  if (a.cook !== undefined) {
    a.cook += dt;
    a.pose.grenade = true;
    if (a.cook >= GRENADE.fuse) {
      a.cook = undefined;
      a.pose.grenade = false;
      explode(world, { x: a.pos.x + a.facing * 0.3, y: a.pos.y + 0.5, z: a.pos.z }, a.id);
      return;
    }
    if (!cmd.grenade && a.state === 'free' && a.body.state === 'ground') {
      const fuse = GRENADE.fuse - a.cook;
      a.cook = undefined;
      startAction(world, a, 'lob', cmd, { fuse });
    }
    return;
  }
  if (cmd.grenade && a.grenades > 0 && a.state === 'free' && a.body.state === 'ground' && !a.holding && (!a.hands[0] || !a.hands[1]) && !holdsLong(a)) {
    a.grenades--;
    a.cook = 0;
    a.pose.grenade = true;
    world.events.emit('grenadePin', { actorId: a.id, x: a.pos.x + a.facing * 0.2, y: a.pos.y + 0.6, z: a.pos.z });
  }
}

/** Hit or knocked about while cooking: the live grenade drops at your feet, fuse still running. */
export function dropCooking(world: World, a: Actor): void {
  if (a.cook === undefined && !(a.attack?.kind === 'lob' && !a.attack.done)) return;
  const fuse = a.cook !== undefined ? GRENADE.fuse - a.cook : (a.attack?.fuse ?? GRENADE.fuse) - (a.attack?.t ?? 0);
  a.cook = undefined;
  a.pose.grenade = false;
  const it = spawnItem(world, 'grenade', 'grunt', { x: a.pos.x + a.facing * 0.2, y: a.pos.y + 0.5, z: a.pos.z }, { x: a.facing * 0.5, y: 1, z: 0 }, 6);
  it.live = true;
  it.fuse = fuse;
  it.thrownBy = a.id;
  it.thrownAt = world.time;
}

// ---------- pulling stuck blades and the planted sign ----------

/** A stuck blade or the planted sign within reach, and a hand to take it. */
export function pullable(world: World, a: Actor): Item | undefined {
  if (!a.hands[0] && !a.hands[1]) { /* both free */ } else if (a.hands[0] && a.hands[1]) return undefined;
  let best: Item | undefined, bestD = Infinity;
  for (const it of world.items) {
    if (it.state !== 'stuck' && it.state !== 'planted') continue;
    if (!isMelee(it.kind)) continue;
    if (MELEE[it.kind].twoHanded && (a.hands[0] || a.hands[1])) continue;
    // a blade pinning a body stays in it
    if (it.stuckTo !== undefined && world.actorById(it.stuckTo)?.corpse?.pinned) continue;
    if (it.stuckTo !== undefined && alive(world.actorById(it.stuckTo)!)) continue;
    const d = Math.hypot(it.pos.x - a.pos.x, (it.pos.z - a.pos.z) * 1.5);
    if (d <= THROWN.pullRange && d < bestD) { best = it; bestD = d; }
  }
  return best;
}

function finishPull(world: World, a: Actor, itemId: number): void {
  const it = world.items.find((i) => i.id === itemId);
  if (!it || (it.state !== 'stuck' && it.state !== 'planted')) return;
  const slot: 0 | 1 = !a.hands[0] ? 0 : 1;
  if (a.hands[slot]) return;
  a.hands[slot] = newHand(it.kind as Exclude<HeldItem, null>);
  world.items = world.items.filter((x) => x !== it);
  world.events.emit('pull', { actorId: a.id, itemId: it.id, phase: 'end', item: it.kind, ...a.pos });
}

// ---------- disarming (combat-disarm) ----------

/** Knock or shoot the weapon out of `o`'s hand: it spins away and lands nearby, ammo and all. */
export function disarm(world: World, by: Actor | undefined, o: Actor, how: 'knock' | 'shot', dirX: number): void {
  const i: 0 | 1 | undefined = o.hands[0] ? 0 : o.hands[1] ? 1 : undefined;
  if (i === undefined) return;
  const h = o.hands[i]!;
  o.hands[i] = null;
  const it = dropHeld(world, h.item, o.pos, (Math.sign(dirX) || -o.facing) * 1.2, { ammo: h.ammo, spare: h.spare });
  it.vel.y += how === 'shot' ? 2 : 1;
  it.spin *= 1.5;
  world.events.emit('disarm', { actorId: o.id, byId: by?.id ?? 0, how, item: h.item, ...o.pos });
}

/** F on an armed enemy within grab range: steal the weapon (0.4 s). */
export function stealTarget(world: World, a: Actor, o: Actor): boolean {
  if (!alive(o) || o.state === 'grabbed' || o.state === 'down' || o.state === 'knockback' || o.kind === 'hero') return false;
  if (!o.hands[0] && !o.hands[1]) return false;
  if (a.hands[0] && a.hands[1]) return false;
  startAction(world, a, 'steal', {}, { targetId: o.id });
  return true;
}

function finishSteal(world: World, a: Actor, targetId: number): void {
  const o = world.actorById(targetId);
  if (!o || !alive(o) || o.state === 'grabbed' || Math.abs(o.pos.z - a.pos.z) > 0.3 || Math.abs(o.pos.x - a.pos.x) > 1.0) return;
  const i: 0 | 1 | undefined = o.hands[0] ? 0 : o.hands[1] ? 1 : undefined;
  if (i === undefined) return;
  const h = o.hands[i]!;
  const slot: 0 | 1 = !a.hands[0] ? 0 : 1;
  if (a.hands[slot]) return;
  // a two-handed weapon needs both hands: let the other one go
  const otherSlot: 0 | 1 = slot === 0 ? 1 : 0;
  const other = a.hands[otherSlot];
  if (isMelee(h.item) && MELEE[h.item].twoHanded && other) {
    dropHeld(world, other.item, a.pos, -a.facing * 0.5, { ammo: other.ammo, spare: other.spare });
    a.hands[otherSlot] = null;
  }
  o.hands[i] = null;
  a.hands[slot] = { ...h, cooldown: 0, reload: 0, clicked: false };
  // the robbed enemy reels
  o.state = 'stun';
  o.stateT = 0;
  o.stunFor = DISARM.stealStun;
  o.attack = undefined;
  o.pose.lean = -0.3;
  setClip(o, 'stun');
  world.events.emit('disarm', { actorId: o.id, byId: a.id, how: 'steal', item: h.item, ...o.pos });
}

/**
 * The held weapon's shape on screen (shot out of the hand): the barrel from grip to muzzle when
 * aiming a gun, else the item at the hand of the current pose. Small on purpose: needs precision.
 */
export function heldWeaponSegment(a: Actor): { p0: ScreenPoint; p1: ScreenPoint; r: number } | undefined {
  const h = a.hands[0];
  if (!h) return undefined;
  const s = scaleAt(a.pos.z), foot = project(a.pos.x, a.pos.y, a.pos.z);
  if (isWeapon(h.item)) {
    const w = WEAPONS[h.item];
    const target = a.pose.aim ?? (a.pose.aimAt ? project(a.pose.aimAt.x, a.pose.aimAt.y, a.pose.aimAt.z) : undefined);
    if (target && flatness(a.pose.root) < 0.5) {
      const rig = aimRig(foot, s, a.facing, 0, target, w, a.pose.kick?.[0] ?? 0);
      const grip: ScreenPoint = [foot[0] + rig.hand[0] * s * a.facing, foot[1] + rig.hand[1] * s];
      return { p0: grip, p1: rig.muzzle, r: DISARM.weaponRadius * s };
    }
  }
  const sk = sampleClip(a.pose.clip, a.pose.clipT);
  const len = isWeapon(h.item) ? WEAPONS[h.item].length : isMelee(h.item) ? MELEE[h.item].length : 0.3;
  const hx = sk.handF[0] + sk.item[0], hy = sk.handF[1] + sk.item[1], ang = sk.item[2];
  const toScreen = (lx: number, ly: number): ScreenPoint => {
    const [dx, dy] = rootToWorld(a.pose.root, a.facing, lx, ly);
    return project(a.pos.x + dx, a.pos.y + dy, a.pos.z);
  };
  return { p0: toScreen(hx, hy), p1: toScreen(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len), r: DISARM.weaponRadius * s };
}

// ---------- pinning (melee-environment-weapon) ----------

/** The x of a wall or solid prop just behind `o` in the push direction, close enough to pin against. */
function pinSurface(world: World, a: Actor, o: Actor): number | undefined {
  const f = a.facing, room = world.room, near = 0.6;
  if (!room.outdoor) {
    const wall = f * room.halfWidth;
    if ((wall - o.pos.x) * f >= 0 && (wall - o.pos.x) * f <= near) return wall;
  }
  for (const p of room.props) {
    // only tall solid things (a pole, a block); a table is too low to pin against
    if (p.top < 1 || o.pos.z < p.z0 - 0.25 || o.pos.z > p.z1 + 0.25) continue;
    const face = f > 0 ? p.x0 : p.x1;
    const gap = (face - o.pos.x) * f;
    if (gap >= -0.05 && gap <= near) return face;
  }
  return undefined;
}

/** The thrust runs `o` through and sticks them to the surface; the weapon stays in the body. */
function pin(world: World, a: Actor, o: Actor, surfaceX: number): void {
  const h = a.hands[0];
  applyHit(world, a, o, 'pin', a.facing, 0, { x: o.pos.x, y: o.pos.y + 0.55, z: o.pos.z }, 'body');
  if (o.state !== 'dead' || !o.corpse) return;
  o.flight = undefined;
  o.pos.x = surfaceX - a.facing * 0.22;
  o.pos.y = 0;
  o.facing = (-a.facing) as 1 | -1;
  o.pose.root = { r: 0, tx: 0, ty: 0, sx: 1, sy: 1 };
  o.pose.groundY = 0;
  o.corpse.phase = 'settled';
  o.corpse.t = 0;
  o.corpse.pinned = true;
  setClip(o, 'pinned');
  world.events.emit('corpseSettled', { actorId: o.id, ...o.pos });
  if (h) {
    a.hands[0] = null;
    const it = spawnItem(world, h.item, 'grunt', o.pos, { x: 0, y: 0, z: 0 }, 0);
    it.state = 'stuck';
    it.stuckTo = o.id;
    it.stuckLocal = [0, -0.48];
    // pointing into the surface (screen space), from the body's frame
    it.stuckAngle = (a.facing > 0 ? 0 : Math.PI) - o.pose.root.r * o.facing;
  }
  world.events.emit('pin', { actorId: a.id, targetId: o.id, ...o.pos });
}
