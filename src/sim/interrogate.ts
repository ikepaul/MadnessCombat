// Hold-up, interrogation and knockout (PLAN.md M10, research/mechanics/world-interrogate-knockout):
// when the last enemy left in a room is unarmed and a player with a gun stands close, facing him,
// he gives up (hands up, sweating). E next to him plays a short pictogram exchange (no words: a
// photo of the target, "?", a shrug) and the gun butt knocks him out. He's out of the fight, alive.
import { TUNING } from '../data/tuning';
import { isWeapon } from '../data/weapons';
import { type Actor, alive } from './actor';
import { setClip } from './combat';
import type { Beat, Seq } from './sequencer';
import type { World } from './world';

const I = TUNING.interrogate;

const armed = (a: Actor) => a.hands.some((h) => !!h && isWeapon(h.item));

/** The one who would put his hands up right now, if the hold-up rule holds. */
export function holdUpCandidate(world: World): { foe: Actor; by: Actor } | undefined {
  const foes = world.actors.filter((a) => a.ai && alive(a) && !a.entering && a.kind === 'grunt' && !a.koed);
  if (foes.length !== 1) return undefined;
  // nobody else still on the way in
  if (world.director && world.director.state !== 'done' && !world.director.allSpawned(world)) return undefined;
  const o = foes[0];
  if (o.hands[0] || o.hands[1] || o.surrendered || o.state !== 'free') return undefined;
  const by = world.activePlayers.find((p) => armed(p) && p.state === 'free' && Math.abs(o.pos.x - p.pos.x) <= I.holdUpRange &&
    Math.abs(o.pos.z - p.pos.z) <= 0.6 && Math.sign(o.pos.x - p.pos.x) === p.facing);
  return by ? { foe: o, by } : undefined;
}

/** Hands up: he stops fighting and faces whoever holds him. */
export function surrender(world: World, o: Actor, event: 'holdUp' | 'surrender' = 'holdUp'): void {
  o.surrendered = true;
  o.pose.handsUp = true;
  o.pose.sweat = true;
  o.attack = undefined;
  if (o.ai) { o.ai.aimT = undefined; o.pose.telegraph = undefined; }
  setClip(o, 'handsUp');
  world.events.emit(event, { actorId: o.id, ...o.pos });
}

/** E pressed by `p` this tick (consumed so it doesn't also pick something up). */
export function usePressed(world: World, p: Actor): boolean {
  const cmd = world.commands[p.playerIndex!];
  if (!cmd?.pickup) return false;
  world.commands[p.playerIndex!] = { ...cmd, pickup: false };
  return true;
}

/**
 * A room script helper: watch for the hold-up; once he gives up, wait for E next to him, then the
 * interrogation and the knockout. Returns when he's out (or dead).
 */
export function* holdUps(s: Seq): Beat {
  const world = s.world;
  let foe: Actor | undefined;
  for (;;) {
    const c = holdUpCandidate(world);
    if (c) { foe = c.foe; surrender(world, foe); break; }
    yield;
  }
  // E next to him; if someone shoots him instead, that's that
  let by: Actor | undefined;
  yield () => {
    if (!alive(foe)) return true;
    by = world.activePlayers.find((p) => Math.abs(p.pos.x - foe!.pos.x) <= I.talkRange && Math.abs(p.pos.z - foe!.pos.z) <= 0.5 && usePressed(world, p));
    return !!by;
  };
  if (!alive(foe) || !by) return;
  yield* interrogate(s, by, foe);
}

/** The exchange and the knockout (input locked). */
export function* interrogate(s: Seq, p: Actor, o: Actor): Beat {
  const world = s.world;
  s.lockInput(true);
  p.facing = o.pos.x >= p.pos.x ? 1 : -1;
  o.facing = (-p.facing) as 1 | -1;
  world.events.emit('speech', { actorId: p.id, icon: 'photo', seconds: I.bubble, ...p.pos });
  yield I.bubble;
  world.events.emit('speech', { actorId: o.id, icon: 'shrug', seconds: I.bubble, ...o.pos });
  yield I.bubble;
  world.events.emit('speech', { actorId: p.id, icon: 'question', seconds: I.bubble * 0.7, ...p.pos });
  yield I.bubble * 0.7;
  // the gun butt
  yield* s.act(p, { attack: 'heavy', face: p.facing });
  yield 0.15;
  if (alive(o)) {
    knockOut(world, o, p);
  }
  yield 0.6;
  s.lockInput(false);
}

/** Out cold: down for good, no longer an enemy (but not dead: he doesn't count as a kill). */
export function knockOut(world: World, o: Actor, by: Actor): void {
  world.hitActor(by, o, 'heavy', by.facing, 0, { x: o.pos.x, y: o.pos.y + 0.75, z: o.pos.z }, 'head');
  o.hp = Math.max(1, o.hp);
  o.koed = true;
  o.surrendered = false;
  o.pose.handsUp = false;
  o.pose.sweat = false;
  o.pose.dazed = true;
  o.ai = undefined;
  o.brain = undefined;
  world.tokens.delete(o.id);
  world.events.emit('knockout', { actorId: o.id, ...o.pos });
}
