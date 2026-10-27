// Stage 3's surreal rules (PLAN.md M11): improbability mode (research/mechanics/world-improbability-
// mode: knockback x2.4, bodies bounce off walls and the ceiling at 0.8, sometimes stick in the
// ceiling, enemies enter flying), the arena collapse (world-arena-collapse: a crack for ~1 s, then
// half the floor falls into the void with everything on it), and falling blocks (world-falling-
// hazard: a shadow first, a crush, then a solid block: our falling tank).
import { lyingAt } from '../anim/skeleton';
import { GRAVITY, TUNING } from '../data/tuning';
import { type Actor, alive } from './actor';
import { applyHit, setClip } from './combat';
import type { World } from './world';

const I = TUNING.improbability, CO = TUNING.collapse, FB = TUNING.fallingBlock;

export const improbable = (world: World) => world.physics === 'improbable';

/** Switch the mode (the target's button in the camera room; off after the street). */
export function setImprobable(world: World, on: boolean): void {
  if (improbable(world) === on) return;
  world.physics = on ? 'improbable' : 'normal';
  world.events.emit('improbability', { on });
}

/** Knockback scale for a hit's flight. */
export const knockbackScale = (world: World) => (improbable(world) ? I.knockback : 1);

/** Wall bounce: how much sideways speed a body keeps (normal mode: it all but stops). */
export const wallRestitution = (world: World) => (improbable(world) ? I.restitution : 0.2);

/**
 * A flying body above the ceiling line (improbability mode, indoors): it bounces back down, or
 * now and then sticks there head-first and stays. Returns true if it stuck.
 */
export function ceilingBounce(world: World, a: Actor): boolean {
  const f = a.flight;
  const top = world.room.height - 0.95;
  if (!f || !improbable(world) || world.room.outdoor || a.pos.y < top || f.vy <= 0) return false;
  const speed = Math.hypot(f.vx, f.vy);
  a.pos.y = top;
  if (speed >= I.stickSpeed && world.rng() < I.stickChance) {
    // head-first into the ceiling: dead, and it stays up there
    a.flight = undefined;
    if (alive(a)) applyHit(world, undefined, a, 'wall', Math.sign(f.vx) || 1, 0, { ...a.pos });
    a.flight = undefined;
    a.pose.root = { ...lyingAt(0), r: Math.PI };
    a.ceilingStuck = true;
    if (a.corpse) { a.corpse.phase = 'settled'; a.corpse.raisable = false; }
    world.events.emit('ceilingStick', { actorId: a.id, ...a.pos });
    return true;
  }
  f.vy = -Math.abs(f.vy) * I.restitution;
  a.pose.squash = 0.35;
  world.events.emit('wallHit', { actorId: a.id, ...a.pos, wall: 'back', speed });
  return false;
}

/** An enemy enters flying out of control from a side (improbability mode). */
export function flyIn(world: World, a: Actor, side: -1 | 1): void {
  const vx = -side * I.flyInSpeed, vy = I.flyInLift, airtime = (2 * vy) / GRAVITY;
  a.entering = false;
  a.pos.x = side * (world.room.halfWidth - 0.25);
  a.pos.y = 1.0;
  a.state = 'knockback';
  a.stateT = 0;
  a.flight = { vx, vz: 0, vy, airtime, r: 0, r0: 0, rTo: -Math.PI / 2 * side, spin: 0, phase: 'air', t: 0, hit: [] };
  setClip(a, 'knockback');
  world.events.emit('flyIn', { actorId: a.id, ...a.pos });
}

// ---------- the arena collapse ----------

export interface Collapse { side: -1 | 1; x: number; t: number; phase: 'crack' | 'fallen' }

/** Start the crack: the `side` half of the floor (x beyond `x` toward that side) goes after ~1 s. */
export function startCollapse(world: World, side: -1 | 1, x = 0): void {
  world.collapse = { side, x, t: 0, phase: 'crack' };
  world.room.crack = { side, x };
  world.events.emit('collapse', { phase: 'crack', side, x });
}

/** On the falling side of the edge. */
export const overVoid = (world: World, x: number) => !!world.room.void && (x - world.room.void.x) * world.room.void.side > 0;

export function stepCollapse(world: World, dt: number): void {
  const c = world.collapse;
  if (c) {
    c.t += dt;
    if (c.phase === 'crack' && c.t >= CO.crack) {
      c.phase = 'fallen';
      world.room.void = { side: c.side, x: c.x };
      world.room.props = world.room.props.filter((p) => !overVoid(world, (p.x0 + p.x1) / 2));
      world.items = world.items.filter((it) => !overVoid(world, it.pos.x));
      for (const a of world.actors) if (overVoid(world, a.pos.x)) dropIntoVoid(world, a);
      world.events.emit('collapse', { phase: 'fall', side: c.side, x: c.x });
    }
  }
  // whatever is over the void falls out of the room (enemies die; players are the stage's business)
  if (!world.room.void) return;
  const gone: Actor[] = [];
  for (const a of world.actors) {
    if (a.hover !== undefined || a.traversing) continue;
    if (!overVoid(world, a.pos.x)) continue;
    if (a.fallingAway === undefined) dropIntoVoid(world, a);
    a.fallingAway! += dt;
    a.pos.y -= (CO.fallSpeed * a.fallingAway!) * dt;
    if (a.fallingAway! >= CO.fallTime && a.playerIndex === undefined) gone.push(a);
  }
  for (const a of gone) world.actors.splice(world.actors.indexOf(a), 1);
  if (gone.length) world.events.emit('corpseThawed', { actorId: gone[0].id });
}

function dropIntoVoid(world: World, a: Actor): void {
  if (a.fallingAway !== undefined) return;
  a.fallingAway = 0;
  // a body baked into the corpse layer comes off it to fall
  if (a.corpse?.phase === 'frozen') { a.corpse.phase = 'settled'; world.events.emit('corpseThawed', { actorId: a.id }); }
  if (a.playerIndex === undefined && alive(a)) applyHit(world, undefined, a, 'cannon', a.facing, 0, { ...a.pos });
  a.flight = undefined;
  world.events.emit('fellIntoVoid', { actorId: a.id, ...a.pos });
}

// ---------- falling blocks (our tank) ----------

export interface FallingBlock { kind: 'tank'; x: number; z: number; y: number; t: number; phase: 'shadow' | 'fall' | 'landed'; facing: 1 | -1 }

/** world-falling-hazard: its shadow appears at (x, z) now; it drops after FB.shadow s. */
export function dropBlock(world: World, x: number, z: number, facing: 1 | -1 = 1): FallingBlock {
  const b: FallingBlock = { kind: 'tank', x, z, y: FB.height, t: 0, phase: 'shadow', facing };
  world.blocks.push(b);
  world.events.emit('blockDrop', { phase: 'shadow', x, y: 0, z });
  return b;
}

export function stepBlocks(world: World, dt: number): void {
  for (const b of world.blocks) {
    if (b.phase === 'landed') continue;
    b.t += dt;
    if (b.phase === 'shadow' && b.t >= FB.shadow) { b.phase = 'fall'; b.t = 0; }
    if (b.phase !== 'fall') continue;
    b.y -= FB.fallSpeed * dt;
    if (b.y > 0) continue;
    b.y = 0;
    b.phase = 'landed';
    landBlock(world, b);
  }
}

/** It lands: everything under it is crushed, the rest shoved clear, and it stays as a solid block. */
function landBlock(world: World, b: FallingBlock): void {
  const hx = FB.halfX, hz = FB.halfZ, lim = world.room.halfWidth - 0.3;
  for (const o of world.actors) {
    const dx = o.pos.x - b.x, dz = o.pos.z - b.z;
    if (Math.abs(dz) > hz + 0.25 || Math.abs(dx) > hx + 0.25) continue;
    if (alive(o)) applyHit(world, undefined, o, 'cannon', Math.sign(dx) || 1, 0, { x: o.pos.x, y: 0.5, z: o.pos.z });
    o.pos.x = Math.max(-lim, Math.min(lim, b.x + (Math.sign(dx) || 1) * (hx + TUNING.move.radius + 0.02)));
  }
  world.room.props.push({ kind: 'tank', x0: b.x - hx, x1: b.x + hx, z0: b.z - hz, z1: b.z + hz, top: FB.top, facing: b.facing });
  world.events.emit('blockDrop', { phase: 'land', x: b.x, y: 0, z: b.z });
}
