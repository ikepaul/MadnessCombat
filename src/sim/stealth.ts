// Stealth (PLAN.md M7, research/mechanics/melee-stealth-kill, move-drop-from-above): enemies are
// unaware or alert. Unaware ones stand, smoke or patrol facing a fixed way; they notice a player
// in front of them, unsuppressed gunshots and explosions anywhere in the room, and loud deaths
// nearby. E behind an unaware enemy (or landing next to one from above) is a silent takedown:
// knife 0.6 s, or the wire 1.5 s with both hands empty. Nobody hears it.
import { TUNING } from '../data/tuning';
import { isWeapon, WEAPONS } from '../data/weapons';
import { type Actor, alive } from './actor';
import { applyHit, enter } from './combat';
import type { PlayerCommand } from './command';
import { startAction } from './melee';
import type { World } from './world';

const S = TUNING.stealth;

export function takedownTiming(weapon?: string): { startup: number; active: number; recovery: number } {
  return { startup: weapon === 'wire' ? S.wire : S.knife, active: 0, recovery: 0.25 };
}

export const unaware = (o: Actor) => !!o.ai && o.ai.aware === false && alive(o) && (o.state === 'free' || o.state === 'attack');

/** The unaware enemy `a` could take down from behind right now (nearest), if any. */
export function takedownTarget(world: World, a: Actor): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (o === a || !unaware(o) || o.takenBy !== undefined) continue;
    const dx = o.pos.x - a.pos.x;
    // behind: on the side the enemy's back is turned to
    if (dx * o.facing <= 0.05 || Math.abs(dx) > S.reach || Math.abs(o.pos.z - a.pos.z) > S.depthBand) continue;
    if (Math.abs(o.pos.y - a.pos.y) > 0.3) continue;
    if (Math.abs(dx) < bestD) { best = o; bestD = Math.abs(dx); }
  }
  return best;
}

/** E behind an unaware enemy: start the takedown. Returns true if it started. */
export function tryTakedown(world: World, a: Actor, cmd: PlayerCommand): boolean {
  if (!cmd.pickup || a.playerIndex === undefined || a.holding || a.body.state !== 'ground') return false;
  const o = takedownTarget(world, a);
  if (!o) return false;
  startTakedown(world, a, o);
  return true;
}

/** Wire with both hands empty, otherwise the knife (melee-stealth-kill). */
function startTakedown(world: World, a: Actor, o: Actor, knife = false): void {
  const wire = !knife && !a.hands[0] && !a.hands[1];
  a.facing = (o.pos.x > a.pos.x ? 1 : -1) as 1 | -1;
  startAction(world, a, 'takedown', { face: a.facing }, { targetId: o.id, weapon: wire ? 'wire' : 'knife' });
  o.takenBy = a.id;
  o.state = 'stun';
  o.stateT = 0;
  o.stunFor = Infinity;
  o.attack = undefined;
  o.body.vel = { x: 0, y: 0, z: 0 };
  o.pose.clip = 'takenDown';
  o.pose.clipT = 0;
  world.events.emit('takedown', { actorId: a.id, targetId: o.id, how: wire ? 'wire' : 'knife', phase: 'start', ...o.pos });
}

/** Runs in the attacker's `attack` state: hold the victim, then the silent kill. */
export function stepTakedown(world: World, a: Actor, start: boolean): void {
  const atk = a.attack!;
  const o = atk.targetId !== undefined ? world.actorById(atk.targetId) : undefined;
  if (!o || !alive(o)) { atk.done = true; return; }
  if (atk.done) return;
  // the victim is held right in front, facing away
  const gap = atk.weapon === 'wire' ? 0.3 : 0.38;
  o.pos.x = a.pos.x + a.facing * gap;
  o.pos.z = a.pos.z + 0.004;
  o.facing = a.facing;
  if (!start) return;
  atk.done = true;
  o.takenBy = undefined;
  // the knife goes in at the neck; the wire leaves no wound
  applyHit(world, a, o, 'takedown', a.facing, 0, { x: o.pos.x, y: o.pos.y + 0.7, z: o.pos.z }, atk.weapon === 'wire' ? 'head' : 'body');
  world.events.emit('takedown', { actorId: a.id, targetId: o.id, how: atk.weapon === 'wire' ? 'wire' : 'knife', phase: 'kill', ...o.pos });
}

/** The victim's side: let go if the takedown broke off (the attacker got hit). */
export function checkHeld(world: World, o: Actor): boolean {
  if (o.takenBy === undefined) return false;
  const by = world.actorById(o.takenBy);
  if (by && by.state === 'attack' && by.attack?.kind === 'takedown' && by.attack.targetId === o.id) return true;
  o.takenBy = undefined;
  if (alive(o)) { enter(o, 'free'); alert(world, o); }
  return false;
}

/** move-drop-from-above: a player landing next to an unaware enemy goes straight into the kill. */
function dropKill(world: World, actorId: number): void {
  const a = world.actorById(actorId);
  if (!a || a.playerIndex === undefined || a.state !== 'free' || a.holding) return;
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (!unaware(o) || o.takenBy !== undefined || Math.abs(o.pos.z - a.pos.z) > S.depthBand) continue;
    const d = Math.abs(o.pos.x - a.pos.x);
    if (d <= S.dropReach && d < bestD) { best = o; bestD = d; }
  }
  if (!best) return;
  // land behind him: the drop is a knife kill whatever the hands hold (ep3: both knives)
  startTakedown(world, a, best, true);
}

/** An enemy becomes alert (head snap, "!" mark). */
export function alert(world: World, o: Actor, by?: 'sight' | 'sound'): void {
  if (!o.ai || o.ai.aware !== false || !alive(o)) return;
  o.ai.aware = true;
  o.ai.cooldown = Math.max(o.ai.cooldown, 0.4);
  world.events.emit('alert', { actorId: o.id, ...o.pos });
  // someone who saw the player alerts the guards near him
  if (by === 'sight') for (const n of world.actors) if (n !== o && Math.hypot(n.pos.x - o.pos.x, n.pos.z - o.pos.z) <= S.hearDeath) alert(world, n);
}

function alertAll(world: World): void {
  for (const o of world.actors) alert(world, o);
}

/** A kill made with a suppressed gun in hand (gun-pistol-suppressed: doesn't alert). */
function quietKill(world: World, byId: number, kind: string): boolean {
  if (kind === 'takedown') return true;
  if (kind !== 'bullet') return false;
  const by = world.actorById(byId);
  return !!by && by.hands.some((h) => !!h && isWeapon(h.item) && WEAPONS[h.item].suppressed);
}

/** Hearing: gunshots, explosions and loud deaths (installed once per World). */
export function installAlertRules(world: World): void {
  world.events.on('shot', (e) => { if (!e.suppressed) alertAll(world); });
  world.events.on('explosion', () => alertAll(world));
  world.events.on('kill', (e) => {
    if (quietKill(world, e.byId, e.kind)) return;
    for (const o of world.actors) if (Math.hypot(o.pos.x - e.x, o.pos.z - e.z) <= S.hearDeath) alert(world, o, 'sound');
  });
  world.events.on('land', (e) => dropKill(world, e.actorId));
}

/** Sight check for an unaware enemy (every tick from its brain). */
export function lookOut(world: World, o: Actor, dt: number): void {
  const ai = o.ai!;
  const seen = world.activePlayers.some((p) => {
    const ahead = (p.pos.x - o.pos.x) * o.facing;
    return ahead > 0 && ahead <= S.sight && Math.abs(p.pos.z - o.pos.z) <= S.sightDepth && p.takenBy === undefined;
  });
  ai.noticeT = seen ? (ai.noticeT ?? 0) + dt : 0;
  if (ai.noticeT >= S.notice) alert(world, o, 'sight');
  // hit, knocked about or grabbed: wide awake
  if (o.state !== 'free' && o.state !== 'attack' && o.takenBy === undefined) alert(world, o);
}
