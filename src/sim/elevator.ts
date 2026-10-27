// The elevator set piece (PLAN.md M10, research/mechanics/world-elevator-fight, enemy-welder,
// world-destructible). The cab is the room; its roof is a deck you can stand on. The hatch takes
// you up (E under it) and drops you back in (walk over it). A welder cuts a slot in the roof in
// ~2.7 s (kill him first and there's no slot). The cables over the roof can be shot, but only once
// the door ambush has started and every player is up on the roof: then the cab falls with whoever
// is inside, and the players hang on and climb the cable to the next floor.
import { TUNING } from '../data/tuning';
import { project, type ScreenPoint } from '../render/camera';
import { type Actor, alive } from './actor';
import { setClip } from './combat';
import { inZone, type Zone } from './room';
import type { World } from './world';

const E = TUNING.elevator;

export interface ElevatorState {
  /** Shaft scroll (H): the walls slide by while the cab moves. */
  offset: number;
  /** Cab speed (H/s, + = up). */
  speed: number;
  phase: 'moving' | 'stopped' | 'falling' | 'crashed';
  /** The welder's cut: 0..1 while he works, undefined before / after. */
  cut?: number;
  /** The cables: hits left, and whether they can be broken yet. */
  cableHp: number;
  cableLocked: boolean;
}

/** The room's deck (the cab roof), if it has one. */
export const roof = (world: World) => world.room.decks?.[0];

export function startElevator(world: World): ElevatorState {
  const st: ElevatorState = { offset: 0, speed: E.speed, phase: 'moving', cableHp: E.cableHits, cableLocked: true };
  world.elevator = st;
  world.events.emit('elevator', { phase: 'start' });
  return st;
}

/** Every tick (World.step) in the elevator room: scroll the shaft, the fall, the hatch climb. */
export function stepElevator(world: World, dt: number): void {
  const st = world.elevator;
  if (!st) return;
  st.offset += st.speed * dt;
  if (st.phase === 'falling') {
    st.speed = Math.max(-E.fallSpeed, st.speed - E.fallAccel * dt);
  }
  // E under the hatch: climb up onto the roof
  const deck = roof(world), hatch = world.room.elevator?.hatch;
  if (!deck || !hatch) return;
  for (const p of world.activePlayers) {
    const cmd = world.commands[p.playerIndex!];
    if (!cmd?.pickup || p.traversing || p.state !== 'free' || p.pos.y > 0.05 || !inZone(hatch, p.pos.x, p.pos.z)) continue;
    world.commands[p.playerIndex!] = { ...cmd, pickup: false };
    p.traversing = { kind: 'hatch', t: 0 };
    p.pos.x = (hatch.x0 + hatch.x1) / 2;
    p.pos.z = (hatch.z0 + hatch.z1) / 2;
    setClip(p, 'climb');
    world.events.emit('hatch', { actorId: p.id, phase: 'up', ...p.pos });
  }
}

/** The hatch climb (stepped by the stage's traversal step): up through it, then onto the roof beside it. */
export function stepHatchClimb(world: World, a: Actor, dt: number): void {
  const deck = roof(world), hatch = world.room.elevator?.hatch;
  if (!deck || !hatch) { a.traversing = undefined; return; }
  a.pos.y += E.climbSpeed * dt;
  if (a.pos.y < deck.y) return;
  // step off the hole onto the deck
  a.pos.y = deck.y;
  a.pos.x = hatch.x0 - 0.25;
  a.body.state = 'ground';
  a.body.groundY = deck.y;
  a.pose.groundY = deck.y;
  a.body.vel = { x: 0, y: 0, z: 0 };
  a.traversing = undefined;
  setClip(a, 'idle');
  world.events.emit('land', { actorId: a.id, ...a.pos, fallSpeed: 1 });
}

/** On the roof (feet at the deck). */
export const onRoof = (world: World, a: Actor) => { const d = roof(world); return !!d && a.pos.y >= d.y - 0.05; };

/** The welder's cut finished: the slot is open in the roof. */
export function openSlot(world: World): Zone | undefined {
  const deck = roof(world), slot = world.room.elevator?.slot;
  if (!deck || !slot) return undefined;
  if (!deck.holes.some((h) => h.x0 === slot.x0 && h.z0 === slot.z0)) deck.holes.push({ ...slot });
  world.events.emit('slotCut', { x: (slot.x0 + slot.x1) / 2, y: deck.y, z: (slot.z0 + slot.z1) / 2 });
  return slot;
}

/** The cables on screen: from the roof up past the top of the frame. */
export function cableSegment(world: World): [ScreenPoint, ScreenPoint] | undefined {
  const c = world.room.elevator?.cable, deck = roof(world);
  if (!c || !deck) return undefined;
  return [project(c.x, deck.y + 0.1, c.z), project(c.x, deck.y + 6, c.z)];
}

/** Can the cables be shot right now: the ambush is on and every player is up on the roof. */
export function cablesBreakable(world: World): boolean {
  const st = world.elevator;
  return !!st && !st.cableLocked && st.phase !== 'falling' && st.phase !== 'crashed' && world.activePlayers.every((p) => onRoof(world, p));
}

/**
 * A ray crossed the cables (src/sim/guns.ts, per pellet): one hit off them if they can break.
 * `from`/`end` are the ray's screen points; true if the cables took it.
 */
export function shootCables(world: World, from: ScreenPoint, end: ScreenPoint): boolean {
  const seg = cableSegment(world), st = world.elevator;
  if (!seg || !st || !cross(from, end, seg[0], seg[1])) return false;
  world.events.emit('cableHit', { x: world.room.elevator!.cable.x, y: roof(world)!.y + 0.8, z: world.room.elevator!.cable.z, broke: false });
  if (!cablesBreakable(world)) return true;
  st.cableHp--;
  if (st.cableHp > 0) return true;
  snapCables(world);
  return true;
}

/** world-destructible: the cables part, the cab drops with everyone inside it. */
export function snapCables(world: World): void {
  const st = world.elevator!;
  st.phase = 'falling';
  st.speed = Math.min(st.speed, 0);
  world.events.emit('cableHit', { x: world.room.elevator!.cable.x, y: roof(world)!.y + 0.8, z: world.room.elevator!.cable.z, broke: true });
  world.events.emit('elevator', { phase: 'fall' });
}

/** The cab hits the bottom: whoever is still inside dies (credited to whoever cut the cables). */
export function crash(world: World, by?: Actor): void {
  const st = world.elevator;
  if (!st) return;
  st.phase = 'crashed';
  st.speed = 0;
  for (const a of world.actors) {
    if (a.playerIndex !== undefined || !alive(a) || onRoof(world, a)) continue;
    world.hitActor(by, a, 'cannon', 0, 0, { x: a.pos.x, y: a.pos.y + 0.5, z: a.pos.z });
  }
  world.events.emit('elevator', { phase: 'crash' });
}

/** Segment-vs-segment crossing on screen. */
function cross(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): boolean {
  const o = (p: ScreenPoint, q: ScreenPoint, r: ScreenPoint) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
