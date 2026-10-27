// Stage 2 room scripts (PLAN.md M9, research/stages.md Stage 2 rooms 1-6, research/episodes/
// ep2-log.md). Each runs while the players are in its room (src/sim/stage.ts); they place the
// guards, the target and the mini-boss, run the door waves and open the way on.
import { lyingAt } from '../../anim/skeleton';
import { TUNING } from '../tuning';
import { type Actor, alive } from '../../sim/actor';
import { bossLeave, spawnBossCameo } from '../../sim/boss';
import { project } from '../../render/camera';
import type { Beat, Seq } from '../../sim/sequencer';
import { openExit } from '../../sim/stage';
import type { RoomScript, SpawnOpts, WaveEntry } from '../../sim/waves';
import type { World } from '../../sim/world';
import { canRaise, raiseCorpse } from '../../sim/zombies';
import { stage2LateScripts } from './stage2Late';

const dead = (a: Actor) => a.state === 'dead';
const unaware = (opts: Partial<SpawnOpts> = {}): SpawnOpts => ({ aware: false, idle: 'stand', ...opts });
const caption = (s: Seq, text: string, seconds = 5) => s.run(function* caption(q: Seq) { yield* q.card(text, seconds, 'caption'); });

/** Timings for the scripted beats. Invented unless noted. */
export const S2 = {
  /** Office: the target fires his wild shot this long after you land (s). */
  wildShot: 0.6,
  /** He runs for the door at this command share (faster than a walk). */
  fleeSpeed: 1,
  /** Pump shotgun drops after this many office kills (research/stages.md room 5). */
  shotgunAfter: 5,
  /** The boss looks in from the right door this long at the end of the office (s). */
  peek: 1.8,
  /** Corridor: a beat between the mini-boss's death and the boss coming through the wall (s). */
  bossAfter: 1.2,
};

/** Room 1, the outside wall: one smoking guard, back turned; the wire from behind. */
function* wall(s: Seq, _entry: string): Beat {
  const world = s.world;
  if (world.kills === 0 && !world.flags.has('s2-title')) {
    world.flags.add('s2-title');
    s.lockInput(true);
    yield* s.card('STAGE 2', 1.8);
    s.lockInput(false);
  }
  s.spawn('grunt', 'pistol', 0.7, 9.1, unaware({ idle: 'smoke', face: 1 }));
  caption(s, 'A guard, smoking. Sneak up behind him and press E: with empty hands, the wire.', 6);
}

/** Room 2, the corner + ladder: one guard facing your way. Peek, suppressed head shot, climb. */
function* corner(s: Seq, _entry: string): Beat {
  const world = s.world;
  for (const p of world.players) if (!p.hands[0] && !p.hands[1]) { s.giveItem(p, 'pistolSuppressed'); p.hands[0]!.spare = 2; }
  const g = s.spawn('grunt', 'pistol', 1.7, 9.55, unaware({ face: -1 }));
  caption(s, 'The suppressed pistol (LMB). A head shot from here, and nobody hears a thing.');
  yield* s.until(() => dead(g) || g.ai?.aware !== false, 30);
  caption(s, 'The ladder: stand at it and press E to climb.', 4);
}

/** Room 3, rooftop A: two SMG guards by a box. Slip behind it, lean out, head shots. */
function* roofA(s: Seq, _entry: string): Beat {
  s.spawn('grunt', 'smg', 1.8, 9.45, unaware({ idle: 'chat', face: -1 }));
  s.spawn('grunt', 'smg', 2.5, 9.95, unaware({ idle: 'smoke', face: -1 }));
  yield 1.2;
  caption(s, 'The tracker (top right): the target is ahead and below. The box is cover.');
}

/** Room 4, rooftop B: three guards (one unarmed), a grenade, and the spot right above him. */
function* roofB(s: Seq, _entry: string): Beat {
  const world = s.world;
  s.spawn('grunt', null, 0.2, 9.9, unaware({ idle: 'patrol', patrol: [-0.6, 1.6], face: 1 }));
  s.spawn('grunt', 'pistol', 2.4, 9.0, unaware({ face: 1 }));
  s.spawn('grunt', 'smg', 2.8, 10.1, unaware({ idle: 'smoke', face: -1 }));
  s.drop('grenade', -2.2, 8.75, 0);
  // once the tracker's blip sits in the middle: the hint
  const b = world.room.breach!;
  yield* s.until(() => world.players.some((p) => p.pos.x > b.x0 - 0.6 && p.pos.x < b.x1 + 0.6), 90);
  caption(s, "He's right below. Cook a grenade (G) over the marked spot, then step back.", 6);
}

/** Office door waves (research/stages.md room 5): baton and pistol grunts from both doors, ~16. */
export function officeWaves(): RoomScript {
  const entries: WaveEntry[] = Array.from({ length: 16 }, (_, i) => [i === 0 ? 1.2 : 0.9 + (i % 3) * 0.3, i % 2 ? 'right' : 'left', 'grunt', i % 3 === 2 ? 'pistol' : 'baton'] as WaveEntry);
  const coop: WaveEntry[] = [...entries, ...entries.slice(0, 6)];
  return {
    spawns: [{ id: 'left', kind: 'door', door: 0 }, { id: 'right', kind: 'door', door: 1 }],
    waves: [{ id: 'office', threshold: 0, maxAlive: 4, entries, coop: { maxAlive: 6, entries: coop } }],
  };
}

/**
 * Room 5, the target's office (entered through the hole): the target fires one wild shot that
 * kills his own guard (ep2 1:05) and runs out of the left door. Door waves, the pump shotgun, and
 * the boss looking in from the right door at the end (stalking). Then the left door opens.
 */
function* office(s: Seq, _entry: string): Beat {
  const world = s.world;
  // behind his desk (the desk spans z 9.9-10.4)
  const target = placeTarget(s, -1.3, 10.47, 1);
  const guard = s.spawn('grunt', 'pistol', -2.3, 9.0, { face: 1 });
  s.spawn('grunt', 'baton', 2.7, 9.6, { face: -1 });
  yield S2.wildShot;
  // the panicked shot: aimed at the intruder, it finds his own man (friendly fire)
  if (alive(guard)) {
    target.facing = guard.pos.x < target.pos.x ? -1 : 1;
    yield* s.act(target, { press: [true, false], aim: project(guard.pos.x, guard.pos.y + 0.79, guard.pos.z), face: target.facing });
  }
  caption(s, 'He ran. After him: through the door on the left, once the way is clear.', 4);
  s.run(function* flee(q: Seq) { yield* runOff(q, target, -3.9, 8.95, 0); });

  const kills0 = world.kills;
  const waves = s.run(function* waves(q: Seq) { yield* q.waves(officeWaves()); });
  yield* s.until(() => world.kills - kills0 >= S2.shotgunAfter || waves.done);
  for (const p of world.activePlayers) s.drop('shotgun', Math.max(-3, Math.min(3, p.pos.x + p.facing * 0.6)), p.pos.z, 2.4);
  caption(s, 'A pump shotgun.', 3);
  yield* s.join(waves);
  yield* s.until(() => !world.actors.some((a) => a.ai && alive(a)));

  // the boss looks in from the right door, then he's gone (stalking, boss-halo)
  yield 1.0;
  world.openDoor(1);
  const peek = spawnBossCameo(world, 3.3, 9.05, -1);
  peek.boss.phase = 'cameo';
  peek.pos.y = TUNING.boss.hover;
  yield S2.peek;
  world.actors.splice(world.actors.indexOf(peek), 1);
  world.events.emit('bossArrive', { actorId: peek.id, phase: 'leave', ...peek.pos });
  yield 0.6;
  world.openDoor(0);
  world.doors[0].hold = Infinity;
  openExit(world, 'west-door');
}

/** The target (style frame "Stage 2 cast" B): a bureaucrat with a pistol. Can't be hurt yet. */
export function placeTarget(s: Seq, x: number, z: number, facing: 1 | -1): Actor {
  const a = s.place('grunt', x, z, facing, 'pistol');
  a.variant = 'target';
  a.invulnerable = true;
  return a;
}

/** Run `a` out through the door at (x, z) (door index `door`), then he's gone. */
function* runOff(s: Seq, a: Actor, x: number, z: number, door: number): Beat {
  const world = s.world;
  world.openDoor(door);
  yield* s.moveTo(a, Math.sign(x) * (world.room.halfWidth - 0.35), z, 4);
  yield* s.moveTo(a, x, z, 1.5);
  const i = world.actors.indexOf(a);
  if (i >= 0) world.actors.splice(i, 1);
  world.events.emit('targetFled', { actorId: a.id, ...a.pos });
}

/** Corridor waves: shotgun grunts first, then the mini-boss and his squad, then stragglers. */
export function corridorShotguns(): RoomScript {
  return { spawns: CORRIDOR_SPAWNS, waves: [{ id: 'shotguns', threshold: 0, maxAlive: 3, entries: [[0.8, 'left', 'grunt', 'shotgun'], [1.2, 'left', 'grunt', 'shotgun'], [1.0, 'left', 'grunt', 'sawedoff']], coop: { maxAlive: 4, entries: [[0.8, 'left', 'grunt', 'shotgun'], [1.0, 'left', 'grunt', 'shotgun'], [1.0, 'left', 'grunt', 'sawedoff'], [0.8, 'left', 'grunt', 'shotgun']] } }] };
}
export function corridorSquad(): RoomScript {
  const entries: WaveEntry[] = [
    [0.6, 'left', 'grunt', 'rifle', { variant: 'riot', squad: 'riot' }],
    [0.5, 'left', 'grunt', 'knife', { squad: 'riot' }],
    [0.5, 'left', 'grunt', 'baton', { squad: 'riot' }],
    [0.5, 'left', 'grunt', 'knife', { squad: 'riot' }],
  ];
  return { spawns: CORRIDOR_SPAWNS, waves: [{ id: 'squad', threshold: 0, maxAlive: 5, entries }] };
}
export function corridorStragglers(): RoomScript {
  return { spawns: CORRIDOR_SPAWNS, waves: [{ id: 'more', threshold: 0, maxAlive: 3, entries: [[1.0, 'left', 'grunt', 'pistol'], [0.9, 'left', 'grunt', 'baton'], [0.9, 'left', 'grunt', 'pistol']] }] };
}
const CORRIDOR_SPAWNS: RoomScript['spawns'] = [{ id: 'left', kind: 'door', door: 0 }];

/**
 * Room 6, the corridor (ep2 1:39-2:19): shotgun grunts, then the mini-boss (riot helmet, rifle)
 * walks in with his squad: steal his rifle (F). Then the boss comes in, flings you across the
 * corridor and raises the dead (up to 8), and leaves. The rifle against the horde, a few more
 * grunts, and the far door opens on to the elevator (M10).
 */
function* corridor(s: Seq, _entry: string): Beat {
  const world = s.world;
  // the target's guards who didn't make it this far
  for (const [x, z, r] of [[-1.6, 9.5, -1], [0.4, 8.6, 1], [1.5, 9.6, -1]] as const) {
    const c = s.place('grunt', x, z, r > 0 ? 1 : -1);
    c.state = 'dead';
    c.hp = 0;
    c.pose.dead = true;
    c.corpse = { phase: 'settled', t: 0, raisable: true, gibbed: false, slumped: false };
    c.pose.root = lyingAt((r * Math.PI) / 2);
    c.pose.clip = 'lying';
    c.pose.clipT = 1;
  }
  yield* s.waves(corridorShotguns());
  const squad = s.run(function* squad(q: Seq) { yield* q.waves(corridorSquad()); });
  yield* s.until(() => world.actors.some((a) => a.variant === 'riot'));
  caption(s, 'He leads with the rifle. Get close and take it off him (F).', 5);
  const riot = world.actors.find((a) => a.variant === 'riot')!;
  yield* s.until(() => dead(riot));
  yield S2.bossAfter;
  yield* bossInterruption(s);
  yield* s.join(squad);
  yield* s.until(() => !world.actors.some((a) => (a.ai || a.kind === 'zombie') && alive(a)));
  yield* s.waves(corridorStragglers());
  world.openDoor(0);
  world.doors[0].hold = Infinity;
  openExit(world, 'west-door');
  caption(s, 'The lift is that way.', 3);
}

/**
 * boss-halo clip 5 (ep2 1:59-2:06): he drops in, flings the nearest player across the room into
 * the wall (~3.6 H in ~0.33 s), raises every intact corpse (at most 8) and rises away.
 */
export function* bossInterruption(s: Seq): Beat {
  const world = s.world, F = TUNING.boss.fling, R = TUNING.boss.massRaise;
  const p = world.activePlayers[0];
  const side = p && p.pos.x < 0 ? 1 : -1;
  s.music('boss');
  const boss = spawnBossCameo(world, side * 2.4, 9.2, (-side) as 1 | -1);
  yield* s.until(() => boss.boss.phase === 'cameo');
  // the fling: palm out, then whoever is nearest flies into the far wall
  const target = nearest(world, boss);
  boss.pose.push = 0;
  for (let t = 0; t < F.windup; t += world.dt) { boss.pose.push = t / F.windup; yield; }
  if (target && alive(target)) {
    const dir = (target.pos.x >= boss.pos.x ? 1 : -1) as 1 | -1;
    world.events.emit('bossFling', { actorId: boss.id, targetId: target.id, dir, ...boss.pos });
    world.hitActor(boss, target, 'fling', dir, 0, { x: target.pos.x, y: target.pos.y + 0.6, z: target.pos.z });
  }
  yield 0.6;
  boss.pose.push = 0;
  // the mass raise: hand up, then every intact corpse (nearest first, at most 8) gets up
  for (let t = 0; t < R.cast; t += world.dt) { boss.pose.cast = t / R.cast; yield; }
  const bodies = world.actors.filter(canRaise).sort((a, b) => Math.abs(a.pos.x - boss.pos.x) - Math.abs(b.pos.x - boss.pos.x)).slice(0, R.max);
  for (const c of bodies) raiseCorpse(world, c);
  world.events.emit('massRaise', { actorId: boss.id, count: bodies.length, ...boss.pos });
  yield 0.5;
  bossLeave(world, boss);
  s.music(null);
  caption(s, 'They are getting up again. Keep the rifle on them.', 4);
}

function nearest(world: World, a: Actor): Actor | undefined {
  return world.activePlayers.slice().sort((p, q) => Math.abs(p.pos.x - a.pos.x) - Math.abs(q.pos.x - a.pos.x))[0];
}

export const stage2Scripts = { wall, corner, roofA, roofB, office, corridor, ...stage2LateScripts };
