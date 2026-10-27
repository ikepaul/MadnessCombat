// M18 co-op moves (design/coop-moves.md): the helpers they share and the moves that aren't part of
// the hit rules in combat.ts. All numbers in TUNING.coop, invented.
import { GRAVITY, TUNING } from '../data/tuning';
import { project, type ScreenPoint, scaleAt } from '../render/camera';
import type { Actor, Vec3 } from './actor';
import type { PlayerCommand } from './command';
import type { Item } from './items';
import type { World } from './world';

const C = TUNING.coop;

/** The other player, if both are in the room and up. */
export function partnerOf(world: World, a: Actor): Actor | undefined {
  if (a.playerIndex === undefined || !world.coop) return undefined;
  return world.activePlayers.find((p) => p !== a);
}

/** `a` and `o` are the two players. */
export const isPartner = (a: Actor | undefined, o: Actor | undefined): boolean =>
  !!a && !!o && a !== o && a.playerIndex !== undefined && o.playerIndex !== undefined;

/**
 * Rule 2 of design/coop-moves.md: "aim at your partner to target your partner". The cursor is on
 * the partner's chest or head (within TUNING.coop.aimSlack, H at his depth).
 */
export function partnerUnderCursor(world: World, a: Actor, aim: ScreenPoint | undefined): Actor | undefined {
  const p = partnerOf(world, a);
  if (!p || !aim) return undefined;
  const s = scaleAt(p.pos.z);
  for (const y of [0.4, 0.79]) {
    const [sx, sy] = project(p.pos.x, p.pos.y + y, p.pos.z);
    if (Math.hypot(aim[0] - sx, aim[1] - sy) <= (0.25 + C.aimSlack) * s) return p;
  }
  return undefined;
}

/** Where a partner's hands are (a pass is aimed there). */
const handsOf = (p: Actor): Vec3 => ({ x: p.pos.x + p.facing * 0.25, y: p.pos.y + 0.6, z: p.pos.z });

// ---------- 3.5 weapon pass ----------

/**
 * Q with the cursor on your partner (within range): the front-most item is lobbed softly to their
 * hands instead of thrown. It flies over enemies (no hits) and M17's auto-catch takes it into a
 * free hand; with both hands full it lands at their feet. True if it passed.
 */
export function tryPass(world: World, a: Actor, cmd: PlayerCommand): boolean {
  if (!cmd.throwGun || (a.state !== 'free' && a.state !== 'attack') || a.holding) return false;
  const mate = partnerUnderCursor(world, a, cmd.aim);
  if (!mate || Math.hypot(mate.pos.x - a.pos.x, mate.pos.z - a.pos.z) > C.pass.range) return false;
  const i: 0 | 1 | undefined = a.hands[0] ? 0 : a.hands[1] ? 1 : undefined;
  if (i === undefined) return false;
  const h = a.hands[i]!;
  a.hands[i] = null;
  if (Math.abs(mate.pos.x - a.pos.x) > 0.05) a.facing = mate.pos.x > a.pos.x ? 1 : -1;
  const from: Vec3 = { x: a.pos.x + a.facing * 0.3, y: a.pos.y + 0.55, z: a.pos.z };
  const it = world.spawnItem(h.item, 'grunt', from, passVelocity(from, mate), a.facing * 8);
  it.thrownBy = a.id;
  it.thrownAt = world.time;
  it.passTo = mate.id;
  it.ammo = h.ammo;
  it.spare = h.spare;
  world.events.emit('throw', { actorId: a.id, itemId: it.id, ...from, vx: it.vel.x, vz: it.vel.z });
  world.events.emit('coopMove', { kind: 'pass', phase: 'start', byId: a.id, partnerId: mate.id, actorId: a.id, ...from });
  return true;
}

/** A lob reaching the partner's hands where they'll be (their motion led by the flight time). */
function passVelocity(from: Vec3, mate: Actor): Vec3 {
  // no free hand to catch it: drop it at their feet instead
  let to = mate.hands[0] && mate.hands[1] ? { x: mate.pos.x - mate.facing * 0.1, y: 0.02, z: mate.pos.z } : handsOf(mate);
  let t = Math.max(0.15, Math.hypot(to.x - from.x, to.z - from.z) / C.pass.speed);
  const v = mate.body.vel;
  to = { x: to.x + v.x * t * C.pass.lead, y: to.y, z: to.z + v.z * t * C.pass.lead };
  t = Math.max(0.15, Math.hypot(to.x - from.x, to.z - from.z) / C.pass.speed);
  return { x: (to.x - from.x) / t, y: (to.y - from.y) / t + 0.5 * GRAVITY * t, z: (to.z - from.z) / t };
}

/** Passes home in a little on the partner over the second half of the flight (stepItems). */
export function steerPass(world: World, it: Item, dt: number): void {
  const mate = it.passTo !== undefined ? world.actorById(it.passTo) : undefined;
  if (!mate || it.vel.y > 0 || (mate.hands[0] && mate.hands[1])) return;
  const to = handsOf(mate);
  const dx = to.x - it.pos.x, dz = to.z - it.pos.z, n = Math.hypot(dx, dz);
  if (n < 1e-3) return;
  it.vel.x += (dx / n) * C.pass.homing * dt * 4;
  it.vel.z += (dz / n) * C.pass.homing * dt * 4;
}

// ---------- 3.8 hero toss, 3.9 carry-spin ----------

/** F with the cursor on your partner and both your hands empty: lift them overhead. True if lifted. */
export function tryLift(world: World, a: Actor, aim: ScreenPoint | undefined): boolean {
  const p = partnerUnderCursor(world, a, aim);
  if (!p || a.hands[0] || a.hands[1] || a.holding || a.carried || p.holding || p.carried) return false;
  if ((p.state !== 'free' && p.state !== 'attack') || p.body.state !== 'ground' || a.body.state !== 'ground') return false;
  const G = TUNING.grab;
  if (Math.abs(p.pos.x - a.pos.x) > G.assistRadius || Math.abs(p.pos.z - a.pos.z) > G.assistDepth) return false;
  if (Math.abs(p.pos.x - a.pos.x) > 0.02) a.facing = p.pos.x > a.pos.x ? 1 : -1;
  p.attack = undefined;
  p.cook = undefined;
  p.state = 'grabbed';
  p.stateT = 0;
  p.grabbedBy = a.id;
  p.carried = 'overhead';
  a.holding = { kind: 'actor', id: p.id };
  world.events.emit('grab', { actorId: a.id, targetId: p.id, ...p.pos });
  world.events.emit('coopMove', { kind: 'lift', phase: 'start', byId: a.id, partnerId: p.id, actorId: p.id, ...p.pos });
  return true;
}

/** Put a carried partner down on their feet (hop off, the carrier hit, the spin's time up). */
export function setDown(world: World, p: Actor): void {
  const c = p.grabbedBy !== undefined ? world.actorById(p.grabbedBy) : undefined;
  if (c?.holding?.kind === 'actor' && c.holding.id === p.id) c.holding = undefined;
  if (c) c.spin = undefined;
  p.grabbedBy = undefined;
  p.carried = undefined;
  p.state = 'free';
  p.stateT = 0;
  p.pos.y = c?.pos.y ?? 0;
  p.body.state = 'ground';
  p.body.stateTime = 0;
  p.body.vel = { x: 0, y: 0, z: 0 };
  p.body.height = 1;
  p.pose.root = { r: 0, tx: 0, ty: 0, sx: 1, sy: 1 };
  p.pose.clip = 'idle';
  world.events.emit('land', { actorId: p.id, ...p.pos, fallSpeed: 2 });
}

/**
 * Throw a carried partner as a flying-kick missile along (dx, dz) at `speed`: i-frames, every enemy
 * the kick meets is floored (no bounce off the first), lands on their feet.
 */
export function launchToss(world: World, c: Actor, p: Actor, dx: number, dz: number, speed: number): void {
  const n = Math.hypot(dx, dz) || 1;
  dx /= n; dz /= n;
  setDown(world, p);
  p.pos = { x: c.pos.x + dx * 0.4, y: c.pos.y + C.toss.launchY, z: c.pos.z + dz * 0.4 };
  if (Math.abs(dx) > 0.05) p.facing = dx > 0 ? 1 : -1;
  const b = p.body;
  b.state = 'air';
  b.stateTime = 0;
  b.vel = { x: dx * speed, y: C.toss.vy, z: dz * speed };
  b.takeoff = { x: b.vel.x, z: b.vel.z };
  b.kick = true;
  b.swept = [];
  p.tossT = 0;
  world.events.emit('throw', { actorId: c.id, targetId: p.id, ...p.pos, vx: b.vel.x, vz: b.vel.z });
  world.events.emit('coopMove', { kind: 'toss', phase: 'start', byId: c.id, partnerId: p.id, actorId: p.id, ...p.pos });
}

/** A tossed partner in flight: the input is locked, the toss ends on landing (or after maxFlight). */
export function stepTossed(p: Actor, dt: number): void {
  if (p.tossT === undefined) return;
  p.tossT += dt;
  if ((p.body.state !== 'air' && p.tossT > 0.05) || p.tossT > C.toss.maxFlight) { p.tossT = undefined; p.body.kick = false; }
}

/**
 * The carried partner's own input: Space hops off, F (overhead) starts the spin. Spinning, their
 * guns fire only out to the side they're on. Returns the command their hands may use.
 */
export function stepCarried(world: World, p: Actor, cmd: PlayerCommand): PlayerCommand | undefined {
  const c = p.grabbedBy !== undefined ? world.actorById(p.grabbedBy) : undefined;
  if (!c) { setDown(world, p); return undefined; }
  if (cmd.jump) { setDown(world, p); world.events.emit('coopMove', { kind: 'lift', phase: 'end', byId: c.id, partnerId: p.id, actorId: p.id, ...p.pos }); return undefined; }
  if (p.carried === 'overhead') {
    if (cmd.grab) {
      p.carried = 'spin';
      c.spin = { angle: (p.pos.x - c.pos.x) * c.facing >= 0 ? (c.facing > 0 ? 0 : Math.PI) : (c.facing > 0 ? Math.PI : 0), t: 0, hits: [] };
      world.events.emit('coopMove', { kind: 'spin', phase: 'start', byId: c.id, partnerId: p.id, actorId: p.id, ...p.pos });
    }
    return undefined;
  }
  // spinning: shoot out to your side only, and only past the front/back passes
  const th = c.spin?.angle ?? 0, side = Math.cos(th) >= 0 ? 1 : -1;
  const [px] = project(p.pos.x, p.pos.y, p.pos.z);
  const ok = Math.abs(Math.cos(th)) > C.spin.fireCos && !!cmd.aim && (cmd.aim[0] - px) * side > 0;
  if (ok) return cmd;
  const out: ScreenPoint = project(p.pos.x + side * 3, p.pos.y + 0.3, p.pos.z);
  return { ...cmd, aim: out, press: [false, false], hold: [false, false] };
}

/**
 * The carrier's side of the spin (World.updateHeld calls it every tick): the angle turns, the
 * partner's feet sit at the carrier's hands with the body out along the radius, and an unarmed
 * partner floors whoever the swing passes. Ends by itself after TUNING.coop.spin.maxTime.
 */
export function stepSpin(world: World, c: Actor, p: Actor, dt: number): void {
  const S = C.spin, sp = c.spin!;
  sp.t += dt;
  const before = sp.angle;
  sp.angle += ((2 * Math.PI) / S.period) * dt;
  if (Math.floor(sp.angle / (2 * Math.PI)) !== Math.floor(before / (2 * Math.PI))) sp.hits = [];
  if (sp.t >= S.maxTime) { setDown(world, p); return; }
  const cos = Math.cos(sp.angle), sin = Math.sin(sp.angle), side = (cos >= 0 ? 1 : -1) as 1 | -1;
  const room = world.room, lim = room.halfWidth - 0.2;
  p.pos = {
    x: Math.max(-lim, Math.min(lim, c.pos.x + cos * 0.3)),
    y: c.pos.y + 0.35,
    z: Math.max(room.zFront, Math.min(room.zBack - 0.05, c.pos.z + sin * 0.3)),
  };
  p.facing = side;
  c.facing = side;
  // lying out along the radius, foreshortened at the front and back of the turn
  p.pose.root = { r: Math.PI / 2, tx: 0.5, ty: 0.3, sx: Math.max(0.35, Math.abs(cos)), sy: 1 };
  p.pose.clip = 'idle';
  // unarmed: the swung body floors enemies it passes (once a turn each)
  if (p.hands.some((h) => !!h)) return;
  for (const o of world.actors) {
    if (!o.ai || o.state === 'dead' || o.state === 'knockback' || o.state === 'down' || o.state === 'grabbed' || sp.hits.includes(o.id)) continue;
    const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d < S.sweepIn || d > S.sweepOut) continue;
    const da = Math.atan2(Math.sin(Math.atan2(dz, dx) - sp.angle), Math.cos(Math.atan2(dz, dx) - sp.angle));
    if (Math.abs(da) > S.sweepArc) continue;
    sp.hits.push(o.id);
    const tx = -sin, tz = cos;
    world.hitActor(p, o, 'heavy', tx, tz, { x: o.pos.x, y: o.pos.y + 0.6, z: o.pos.z });
    if (o.flight && (o.state as string) !== 'dead') { o.flight.vx = tx * S.sweepSpeed; o.flight.vz = tz * S.sweepSpeed; o.flight.thrownBy = p.id; }
    world.events.emit('coopMove', { kind: 'spin', phase: 'hit', byId: p.id, partnerId: c.id, targetId: o.id, actorId: o.id, ...o.pos });
  }
}

/** The carrier's F / LMB while spinning: the partner leaves along the swing (a toss along the tangent). */
export function releaseSpin(world: World, c: Actor, p: Actor): void {
  const th = c.spin?.angle ?? 0;
  launchToss(world, c, p, -Math.sin(th), Math.cos(th), C.spin.release);
}
