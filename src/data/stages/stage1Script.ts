// Stage 1 as one script (PLAN.md M8, research/stages.md Stage 1, research/episodes/ep1-log.md).
// Beat 1, the intro: the boombox NPC by the pole, the dancer in the background. Walk up to the
// music, get punched flat (teaches the get-up), then take him out (melee tutorial, low sweep).
// Then wave A, a grenade for the body pile, and the boss (entrance, lightning raise, ward so far).
// Later M8 steps add his other moves, wave B and the ending.
import { TUNING } from '../tuning';
import type { Actor } from '../../sim/actor';
import { spawnBoss } from '../../sim/boss';
import type { Seq } from '../../sim/sequencer';
import type { World } from '../../sim/world';
import { STAGE1 } from './stage1';

/** Where everyone starts (H). Our layout: the pole stands right of centre at the back. invented */
export const INTRO = {
  hero: { x: -2.2, z: 9.2 },
  boombox: { x: 1.2, z: 9.5 },
  dancer: { x: 3.0, z: 10.35 },
  /** The boombox NPC throws his punch when the hero walks this close (centre to centre, H): one stride outside punch range, so it lands as he arrives. ep1 f520 */
  trigger: TUNING.melee.range + 0.35,
  /** Sparring: he jabs back at most this often once the fight is on (s). invented */
  jabEvery: 1.2,
  /** Pause after he drops before the riot starts (s). ep1 f610 -> f640 */
  beforeRiot: 1.0,
};

const dist = (a: Actor, b: Actor) => Math.abs(a.pos.x - b.pos.x);
const sameBand = (a: Actor, b: Actor) => Math.abs(a.pos.z - b.pos.z) <= TUNING.melee.depthBand;
const dead = (a: Actor) => a.state === 'dead';
/** Facing from `a` toward `b`. */
const toward = (a: Actor, b: Actor): 1 | -1 => (b.pos.x >= a.pos.x ? 1 : -1);
/** Free to throw a punch (not stunned, down or already swinging). */
const ready = (a: Actor) => a.state === 'free' && a.body.state === 'ground';

/** The NPCs of the intro (exported for tests and the bot). */
export interface IntroCast { boombox: Actor; dancer: Actor }

/** Place the boombox NPC and the dancer. */
export function placeIntroCast(s: Seq): IntroCast {
  const boombox = s.place('grunt', INTRO.boombox.x, INTRO.boombox.z, -1);
  boombox.variant = 'boombox';
  boombox.carry = 'boombox';
  const dancer = s.place('grunt', INTRO.dancer.x, INTRO.dancer.z, -1);
  dancer.variant = 'dancer';
  return { boombox, dancer };
}

/** Beat 1. Returns once the boombox NPC is dead. */
export function* intro(s: Seq, cast: IntroCast) {
  const world = s.world, hero = world.player!, npc = cast.boombox;
  // co-op: player 2 waits at the start beside player 1
  for (const p of world.players) { p.pos.x = INTRO.hero.x - p.playerIndex! * 0.6; p.pos.z = INTRO.hero.z + p.playerIndex! * 0.4; p.facing = 1; }

  s.lockInput(true);
  yield* s.card('STAGE 1', 1.8);
  s.lockInput(false);
  s.run(function* caption(q: Seq) { yield* q.card('Someone is playing music. Go and have a word.', 3.5, 'caption'); });

  // the first punch: as the nearest hero walks up (or swings first), he turns and lands a heavy cross
  const near = () => world.activePlayers.find((p) => sameBand(p, npc) && dist(p, npc) <= INTRO.trigger);
  yield* s.until(() => !!near() || npc.state !== 'free' || dead(npc));
  if (dead(npc)) return;
  const target = near() ?? hero;
  if (ready(npc)) yield* s.act(npc, { attack: 'heavy', face: toward(npc, target) });
  yield* s.until(() => target.state === 'knockback' || target.state === 'getUp' || dead(npc), 1);
  if (!dead(npc)) {
    s.run(function* caption(q: Seq) {
      yield* q.until(() => target.state === 'free' || dead(npc), 3);
      if (!dead(npc)) yield* q.card('Get up and hit back: Ctrl into him for a low sweep, then punch him while he is down.', 5, 'caption');
    });
  }

  // sparring: he jabs back whenever someone stands in reach, until he goes down for good
  let lastJab = world.time;
  while (!dead(npc)) {
    const p = world.activePlayers.find((h) => sameBand(h, npc) && dist(h, npc) <= TUNING.melee.range && h.state === 'free');
    if (p && ready(npc) && world.time - lastJab >= INTRO.jabEvery) {
      lastJab = world.time;
      yield* s.act(npc, { attack: 'light', face: toward(npc, p) });
    } else yield;
  }
}

/** The boombox falls where he dropped and keeps playing (picked up in the ending). */
export function dropBoombox(world: World, npc: Actor): void {
  if (npc.carry !== 'boombox') return;
  npc.carry = undefined;
  const dir = -npc.facing;
  world.spawnItem('boombox', 'grunt', { x: npc.pos.x + npc.facing * 0.25, y: 0.35, z: npc.pos.z - 0.05 }, { x: dir * 0.6, y: 1.5, z: 0 }, 0);
}

/** Beat 3 timings and placement. */
export const GRENADE_BEAT = {
  /** Breather after the last riot grunt drops, before the grenade comes in (s). invented */
  pause: 1.0,
  /** It falls in from this high (H), so the drop itself is the telegraph. invented */
  dropHeight: 2.6,
  /** In front of the hero, this far (H). invented */
  ahead: 0.7,
  /** Move on anyway if nobody throws it (s), so the stage can't stall here. invented */
  timeout: 25,
  /** Explosion -> the boss appears (s). ep1 f1400 -> f1420 */
  after: 0.6,
};

/**
 * Beat 3 (research/stages.md, ep1 0:44-0:48): a grenade drops in front of each hero. Pick it up,
 * cook it and lob it onto the bodies: every corpse it gibs is one the boss can't raise next.
 */
export function* grenadeBeat(s: Seq) {
  const world = s.world, G = GRENADE_BEAT;
  yield G.pause;
  const lim = world.room.halfWidth - 0.3;
  for (const p of world.activePlayers) {
    const x = Math.max(-lim, Math.min(lim, p.pos.x + p.facing * G.ahead));
    s.drop('grenade', x, p.pos.z, G.dropHeight);
  }
  s.run(function* caption(q: Seq) { yield* q.card('A grenade. Pick it up (E), hold G to cook it, let go over the bodies.', 5, 'caption'); });
  let boom = false;
  const off = world.events.on('explosion', () => (boom = true));
  yield* s.until(() => boom, G.timeout);
  off();
  if (boom) yield G.after;
}

/** Beat 4 placement and timings. */
export const BOSS_BEAT = {
  /** He comes down on the far side from the hero (ep1: far left of the hero by the tree). */
  x: 2.4,
  z: 9.6,
  /** ep1: the hero pulls the SMG once the first zombie is up (f1599, ~1.6 s after the bolt). Waits this long for a bolt (s). invented */
  boltWait: 8,
  /** Bolt -> the SMG lands (s): the zombie is up. ep1 f1500 -> f1599 */
  smgAfterBolt: 1.6,
};

/**
 * Beat 4 (research/stages.md, ep1 0:47-1:24), first part: the boss floats down, raises the dead
 * with lightning and blocks frontal fire with his ward. An SMG drops in once the first zombie is
 * up. Shoot him in the head when the ward is down. (His other moves join in later M8 steps.)
 */
export function* bossFight(s: Seq) {
  const world = s.world, B = BOSS_BEAT;
  const side = (world.player?.pos.x ?? 0) > 0 ? -1 : 1;
  s.music('boss');
  const boss = spawnBoss(world, side * B.x, B.z, -side as 1 | -1);
  yield* s.until(() => boss.boss?.phase === 'fight' || dead(boss));

  // his first raise (a strike at a hero doesn't count)
  let bolted = false;
  const off = world.events.on('zombieRise', (e) => { if (e.phase === 'start') bolted = true; });
  yield* s.until(() => bolted || dead(boss), B.boltWait);
  off();
  if (bolted) yield B.smgAfterBolt;
  const lim = world.room.halfWidth - 0.3;
  for (const p of world.activePlayers) s.drop('smg', Math.max(-lim, Math.min(lim, p.pos.x + p.facing * 0.6)), p.pos.z, GRENADE_BEAT.dropHeight);
  s.run(function* caption(q: Seq) { yield* q.card('An SMG. His ward stops shots from the front: hit him in the head when it drops.', 5, 'caption'); });

  yield* s.until(() => dead(boss));
  // whatever he raised still has to go down
  yield* s.until(() => !world.actors.some((a) => a.kind === 'zombie' && !dead(a)));
}

/** The whole stage, beat by beat. */
export function* stage1(s: Seq) {
  const cast = placeIntroCast(s);
  // he lets go of the boombox the moment he dies, whatever killed him
  const off = s.world.events.on('kill', (e) => { if (e.actorId === cast.boombox.id) { dropBoombox(s.world, cast.boombox); off(); } });
  yield* intro(s, cast);
  yield INTRO.beforeRiot;

  // beat 2: the riot (wave A)
  s.music('riot');
  yield* s.waves(STAGE1.rooms.arena.script);

  // beat 3: blow up the pile
  yield* grenadeBeat(s);

  // beat 4: the boss
  yield* bossFight(s);
  s.clear();
}
