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
