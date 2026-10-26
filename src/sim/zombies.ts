// Zombies (PLAN.md M7, research/mechanics/enemy-zombie): an intact corpse turns green and gets
// up in 1.0 s (ep1 f1485-f1520), shuffles at 0.8 H/s, takes ~3 bullets or 1-3 axe hits, keeps
// going headless for one more hit, and fights in melee (with a melee weapon lying at hand).
// Only the halo boss raises them in the stages (M10+); labs and the debug key raise them here.
import { aboutFeet, rootToWorld, STANDING } from '../anim/skeleton';
import { isMelee } from '../data/melee';
import { TUNING } from '../data/tuning';
import { type Actor, newHand } from './actor';
import { gruntBrain, newAiState } from './ai';
import { enter, setClip } from './combat';
import type { HitKind } from './events';
import type { World } from './world';

const Z = TUNING.zombie;

/** The raise rule: an intact grunt corpse (not gibbed, not headless, not held, not a zombie already). */
export function canRaise(o: Actor): boolean {
  const c = o.corpse;
  return o.state === 'dead' && o.kind === 'grunt' && !!c && c.raisable && !c.gibbed && !c.pinned && !o.pose.headless &&
    c.phase !== 'tumble' && o.grabbedBy === undefined && !o.flight;
}

/** Start raising a corpse (1.0 s); returns false if it can't rise. */
export function raiseCorpse(world: World, o: Actor): boolean {
  if (!canRaise(o)) return false;
  const frozen = o.corpse!.phase === 'frozen';
  o.corpse = undefined;
  o.kind = 'zombie';
  o.state = 'rising';
  o.stateT = 0;
  o.getUpFrom = o.pose.root.r;
  o.hp = o.maxHp = Z.hp;
  o.pose.dead = false;
  o.pose.green = 0;
  o.pose.wounds = [];
  setClip(o, 'lying');
  // a baked corpse has to come off the corpse layer
  if (frozen) world.events.emit('corpseThawed', { actorId: o.id });
  world.events.emit('zombieRise', { actorId: o.id, phase: 'start', ...o.pos });
  return true;
}

/** Debug / lab: raise every corpse that can rise. */
export function raiseAll(world: World): number {
  let n = 0;
  for (const o of world.actors) if (raiseCorpse(world, o)) n++;
  return n;
}

/** The `rising` state: green spreads over the body, then a jerky get-up. */
export function stepRising(world: World, a: Actor): void {
  const u = Math.min(1, a.stateT / Z.rise);
  a.pose.green = Math.min(1, u / 0.6);
  // jerky: the body sits up in three lurches (stepped progress, smoothed a little)
  const steps = 3, k = Math.floor(u * steps) / steps, f = (u * steps) % 1;
  const lurch = k + (f > 0.6 ? (f - 0.6) / 0.4 / steps : 0);
  const e = u < 0.25 ? 0 : Math.min(1, (lurch - 0.25) / 0.75 + 0.1);
  a.pose.root = aboutFeet((a.getUpFrom ?? -Math.PI / 2) * (1 - e));
  if (u < 1) return;
  a.pose.root = { ...STANDING };
  a.pose.green = 1;
  enter(a, 'free');
  a.ai = newAiState(world);
  a.brain = gruntBrain(world);
  // ep3: the zombie clown fights with the street sign it had: a melee weapon at hand is taken up
  const it = world.items.find((i) => i.state === 'floor' && isMelee(i.kind) && Math.hypot(i.pos.x - a.pos.x, i.pos.z - a.pos.z) < Z.weaponReach);
  if (it && !a.hands[0]) {
    world.items = world.items.filter((x) => x !== it);
    a.hands[0] = newHand(it.kind as Parameters<typeof newHand>[0]);
  }
  world.events.emit('zombieRise', { actorId: a.id, phase: 'up', ...a.pos });
}

/** Zombie damage (enemy-zombie): ~3 bullets, 1-3 melee-weapon hits, 6 light punches; blasts kill. */
export function zombieDamage(kind: HitKind, base: number): number {
  if (base >= 99) return 99;
  switch (kind) {
    case 'bullet': return 1;
    case 'slash': case 'smash': case 'stab': case 'knife': return Z.weaponHit;
    case 'light': return 0.5;
    default: return 1;
  }
}

/**
 * A head shot, or a killing blow that would take a grunt's head off: the zombie loses its head
 * and keeps coming for one more hit.
 */
export function zombieLosesHead(world: World, o: Actor, kind: HitKind, part: 'head' | 'body', killed: boolean, dirX: number, dirZ: number): boolean {
  if (o.kind !== 'zombie' || o.pose.headless) return false;
  const headShot = part === 'head' && (kind === 'bullet' || kind === 'gun');
  if (!headShot && !(killed && (kind === 'slash' || kind === 'heavy' || kind === 'uppercut'))) return false;
  o.pose.headless = true;
  o.hp = Z.headlessHp;
  const [hx, hy] = rootToWorld(o.pose.root, o.facing, 0.01, -0.79);
  world.spawnItem('head', o.kind, { x: o.pos.x + hx, y: o.pos.y + hy - 0.2, z: o.pos.z }, { x: dirX * 4, y: 3, z: dirZ * 2 }, dirX * 16);
  world.events.emit('zombieHeadless', { actorId: o.id, ...o.pos });
  return true;
}
