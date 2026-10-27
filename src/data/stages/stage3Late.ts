// Stage 3 room scripts, second half (PLAN.md M12, research/stages.md Stage 3 rooms 7-11): the
// desert (the squad leader, the arena lock, drop-ins, the blood flood, the zombie mini-boss with the
// sign, the boss's mass raise and the wall blast), the vending room (catch-and-return, the empty
// pistol, the machine, the boss's sword dive and teleport), the console room (the target flees) and
// the final lift room (the bodyguards, the stab from behind, the last stand, the credits).
import { TUNING } from '../tuning';
import { project } from '../../render/camera';
import { type Actor, alive } from '../../sim/actor';
import { dropWall, startLastStand } from '../../sim/arena';
import { type BossState, spawnBossCameo } from '../../sim/boss';
import { die } from '../../sim/combat';
import type { Beat, Seq } from '../../sim/sequencer';
import { openExit, takeExit } from '../../sim/stage';
import type { RoomScript, WaveEntry } from '../../sim/waves';
import type { World } from '../../sim/world';
import { canRaise, raiseCorpse } from '../../sim/zombies';

const dead = (a: Actor) => a.state === 'dead';
const caption = (s: Seq, text: string, seconds = 5) => s.run(function* caption(q: Seq) { yield* q.card(text, seconds, 'caption'); });
const foesLeft = (world: World) => world.actors.filter((a) => (a.ai || a.kind === 'zombie') && alive(a) && !a.koed).length;
const D = TUNING.duel;

/** Timings for the late stage 3 beats. Invented unless noted. */
export const S3B = {
  /** Desert: grunts dropping in from above, one every this long (s). */
  dropGap: 1.0,
  /** Wall blast: the boss's wind-up, and how long you have to hit the wall before the cut (s). */
  blastWindup: 0.5,
  blastWait: 1.4,
  /** Final room: the stab, then the last stand starts after this beat (s). */
  stabBeat: 0.5,
};

/** Raise up to `max` intact corpses near the boss (his raised hand, then they get up). */
function* raise(s: Seq, boss: Actor & { boss: BossState }, max: number): Beat {
  const world = s.world;
  for (let t = 0; t < 0.6; t += world.dt) { boss.pose.cast = t / 0.6; yield; }
  const bodies = world.actors.filter(canRaise).sort((a, b) => Math.abs(a.pos.x - boss.pos.x) - Math.abs(b.pos.x - boss.pos.x)).slice(0, max);
  for (const c of bodies) raiseCorpse(world, c);
  world.events.emit('massRaise', { actorId: boss.id, count: bodies.length, ...boss.pos });
  yield 0.4;
  boss.pose.cast = 0;
}

// ---------- room 7/8: the desert and its box ----------

function* desert(s: Seq, _entry: string): Beat {
  const world = s.world;
  // the squad leader (shades, the only gun) and his knife squad, in from the right
  s.spawn('grunt', 'pistol', 3.9, 9.2, { variant: 'leader', squad: 'D' });
  yield 0.4;
  for (const [x, z] of [[4.1, 8.7], [4.3, 9.7], [4.0, 10.1], [4.4, 8.4]]) s.spawn('grunt', 'knife', x, z, { squad: 'D' });
  caption(s, 'The leader has the only gun: a thrown knife takes it off him. Then it is fists.', 5);
  yield* s.until(() => foesLeft(world) === 0);

  // world-arena-lock: the walls come down, one at a time
  yield 0.8;
  caption(s, 'Walls! Stay in the middle.', 3);
  for (const side of ['right', 'back', 'left'] as const) {
    const w = dropWall(world, side);
    if (side === 'right') s.spawn('grunt', 'baton', 3.3, 9.3, { face: -1 });
    yield () => w.phase === 'landed';
    yield TUNING.arenaLock.gap;
  }
  // drop-ins from above, and a rifle for you
  for (const p of world.activePlayers) s.drop('rifle', Math.max(-3, Math.min(3, p.pos.x + p.facing * 0.6)), p.pos.z, 2.4);
  caption(s, 'Sealed in. They come from above.', 3);
  for (let i = 0; i < 6; i++) {
    const a = s.spawn('grunt', i % 3 === 1 ? 'pistol' : i % 3 === 2 ? 'knife' : null, -2.6 + i * 1.0, 8.6 + (i % 3) * 0.5, { face: i % 2 ? -1 : 1 });
    a.pos.y = TUNING.stage.skyHeight;
    a.body.state = 'air';
    yield S3B.dropGap;
  }
  yield* s.until(() => foesLeft(world) === 0);
  world.events.emit('bloodFlood', { x: 0, z: 9.3 });

  // boss-clown clip 4: the zombie mini-boss, back on his jetpack with the street sign
  yield 1.0;
  const zb = s.spawn('zombie', 'sign', 0.6, 9.4, { variant: 'riot', face: -1 });
  zb.hp = zb.maxHp = TUNING.zombie.hp;
  zb.pose.green = 1;
  zb.pose.jetpack = true;
  zb.damageScale = D.signArmour;
  zb.pos.y = TUNING.stage.skyHeight;
  zb.body.state = 'air';
  const off = world.events.on('disarm', (e) => { if (e.actorId === zb.id) zb.damageScale = undefined; });
  const offSteal = world.events.on('hit', () => { if (!zb.hands[0] && !zb.hands[1]) zb.damageScale = undefined; });
  caption(s, 'Bullets barely touch him while he holds the sign. Get close and take it: F.', 6);
  yield* s.until(() => dead(zb));
  off();
  offSteal();

  // the boss drops in, raises the dead (~5), shrugs off bullets, and blasts you through the wall
  yield 1.0;
  s.music('boss');
  const boss = spawnBossCameo(world, 2.2, 9.4, -1);
  boss.invulnerable = false; // shots land (wounds) but do nothing: the bullet sponge
  yield* s.until(() => boss.boss.phase === 'cameo');
  yield* raise(s, boss, 5);
  for (const p of world.activePlayers) s.drop('axe', Math.max(-3, Math.min(3, p.pos.x + p.facing * 0.5)), p.pos.z, 2.4);
  caption(s, 'Bullets do nothing to him. The axe is for them.', 4);
  yield* s.until(() => !world.actors.some((a) => a.kind === 'zombie' && alive(a)), 40);
  // the wall blast: palm out, and you go through the right wall
  const p = world.activePlayers[0];
  if (!p) return;
  for (let t = 0; t < S3B.blastWindup; t += world.dt) { boss.pose.push = t / S3B.blastWindup; yield; }
  let hitWall = false;
  const offWall = world.events.on('wallHit', (e) => { if (e.actorId === p.id) hitWall = true; });
  world.events.emit('bossFling', { actorId: boss.id, targetId: p.id, dir: 1, ...boss.pos });
  for (const h of world.activePlayers) world.hitActor(boss, h, 'fling', 1, 0, { x: h.pos.x, y: h.pos.y + 0.6, z: h.pos.z });
  yield* s.until(() => hitWall, S3B.blastWait);
  offWall();
  world.events.emit('wallBlast', { x: world.room.halfWidth, y: 1, z: p.pos.z });
  takeExit(world, 'blast');
}

// ---------- room 9: the vending room ----------

export function vendingGrunts(): RoomScript {
  const entries: WaveEntry[] = [[0.6, 'right', 'grunt', 'knife'], [1.2, 'right', 'grunt', null], [1.0, 'right', 'grunt', 'knife'], [1.0, 'right', 'grunt', 'baton']];
  return { spawns: [{ id: 'right', kind: 'door', door: 0 }], waves: [{ id: 'vending', threshold: 0, maxAlive: 3, entries }] };
}

function* vending(s: Seq, _entry: string): Beat {
  const world = s.world;
  // your empty pistol on the floor (a grunt picks it up and finds it empty)
  const empty = s.drop('pistol', -1.6, 9.0, 0);
  empty.ammo = 0;
  empty.spare = 0;
  yield 1.0;
  caption(s, 'A thrown knife: F just before it hits catches it. Throw one of them into the machine.', 6);
  yield* s.waves(vendingGrunts());
  yield* s.until(() => foesLeft(world) === 0);

  // the boss flies in through the hole, raises two, and draws a sword
  yield 0.8;
  const boss = spawnBossCameo(world, -2.6, 9.3, 1);
  boss.invulnerable = false;
  yield* s.until(() => boss.boss.phase === 'cameo');
  yield* raise(s, boss, 2);
  for (const p of world.activePlayers) s.drop('smg', Math.max(-3, Math.min(3, p.pos.x - p.facing * 0.5)), p.pos.z, 2.4);
  caption(s, 'He dives with a sword. Get out of the way, and hit him three times.', 5);
  // one hit counts per dive (playtest: an SMG burst landed all three at once and he was gone in a second)
  let hits = 0, scored = false;
  const off = world.events.on('hit', (e) => {
    if (scored || e.actorId !== boss.id || (e.kind !== 'bullet' && e.kind !== 'gun' && e.kind !== 'knife')) return;
    scored = true;
    hits++;
  });
  while (hits < D.hitsToTeleport) {
    const p = world.activePlayers[0];
    if (!p) break;
    scored = false;
    yield* swordDive(s, boss, p);
    yield D.recover;
  }
  off();
  caption(s, 'Hurt, he folds into himself and is gone.', 3);
  yield 0.4;
  // damaged enough: he implodes away
  world.events.emit('teleport', { actorId: boss.id, ...boss.pos });
  if (world.actors.includes(boss)) world.actors.splice(world.actors.indexOf(boss), 1);
  s.music(null);
  yield* s.until(() => !world.actors.some((a) => a.kind === 'zombie' && alive(a)), 30);
  world.openDoor(0);
  world.doors[0].hold = Infinity;
  openExit(world, 'east-door');
}

/** boss-halo clip 7: rise with the sword (the telegraph), then a fast dive at where you stand. */
function* swordDive(s: Seq, boss: Actor & { boss: BossState }, p: Actor): Beat {
  const world = s.world;
  boss.pose.sword = true;
  world.events.emit('swordDive', { actorId: boss.id, phase: 'windup', ...boss.pos });
  const y0 = boss.pos.y;
  for (let t = 0; t < D.windup; t += world.dt) { boss.pos.y = y0 + (t / D.windup) * 0.9; boss.facing = p.pos.x >= boss.pos.x ? 1 : -1; yield; }
  const from = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z }, to = { x: p.pos.x, z: p.pos.z };
  world.events.emit('swordDive', { actorId: boss.id, phase: 'dive', ...boss.pos });
  for (let t = 0; t <= D.dive; t += world.dt) {
    const u = Math.min(1, t / D.dive);
    boss.pos.x = from.x + (to.x - from.x) * u;
    boss.pos.z = from.z + (to.z - from.z) * u;
    boss.pos.y = from.y + (TUNING.boss.hover - from.y) * u;
    yield;
  }
  // whoever is still where he aimed is cut
  for (const h of world.activePlayers) {
    if (Math.abs(h.pos.x - boss.pos.x) > 0.6 || Math.abs(h.pos.z - boss.pos.z) > 0.3 || h.state === 'getUp') continue;
    world.hitActor(boss, h, 'slash', boss.facing, 0, { x: h.pos.x, y: h.pos.y + 0.6, z: h.pos.z });
    world.events.emit('swordDive', { actorId: boss.id, phase: 'hit', ...h.pos });
  }
  boss.pose.sword = false;
  boss.pos.y = TUNING.boss.hover;
}

// ---------- room 10: the console room ----------

export function consoleWaves(): RoomScript {
  const kinds = ['pistol', 'baton', 'smg', 'knife', 'pistol', 'baton', 'shotgun', 'pistol', 'axe', 'smg'] as const;
  const entries: WaveEntry[] = kinds.map((k, i) => [i === 0 ? 1.4 : 0.9, i % 2 ? 'right' : 'left', 'grunt', k] as WaveEntry);
  return {
    spawns: [{ id: 'left', kind: 'door', door: 0 }, { id: 'right', kind: 'door', door: 1 }],
    waves: [{ id: 'console', threshold: 0, maxAlive: 4, entries, coop: { maxAlive: 6, entries: [...entries, ...entries.slice(0, 4)] } }],
  };
}

function* consoleRoom(s: Seq, _entry: string): Beat {
  const world = s.world;
  const target = s.place('grunt', 2.4, 10.1, -1, 'pistol');
  target.variant = 'target';
  target.invulnerable = true;
  caption(s, 'There he goes again.', 3);
  s.run(function* flee(q: Seq) {
    world.openDoor(1);
    yield* q.moveTo(target, world.room.halfWidth - 0.35, 8.95, 3);
    yield* q.moveTo(target, 3.9, 8.95, 1.5);
    if (world.actors.includes(target)) world.actors.splice(world.actors.indexOf(target), 1);
    world.events.emit('targetFled', { actorId: target.id, ...target.pos });
  });
  yield 1.5;
  yield* s.waves(consoleWaves());
  yield* s.until(() => foesLeft(world) === 0);
  world.openDoor(1);
  world.doors[1].hold = Infinity;
  openExit(world, 'east-door');
}

// ---------- room 11: the final lift room ----------

/**
 * The target and two elite bodyguards. Once the guards are down, the boss stabs you from behind
 * and the last stand starts (world-last-stand, decided): ~5 s, you can't move, only aim and fire
 * (behind you too). Two hits put him down, one the target. The stage ends either way: you die,
 * the credits, the body count against 91.
 */
function* lift(s: Seq, _entry: string): Beat {
  const world = s.world;
  const target = s.place('grunt', 2.3, 10.2, -1, 'pistol');
  target.variant = 'target';
  target.invulnerable = true;
  const guards = [[1.3, 9.2, 'smg'], [3.1, 9.2, 'rifle']].map(([x, z, w], i) => {
    const g = s.spawn('grunt', w as 'smg' | 'rifle', x as number, z as number, { variant: 'bodyguard', face: -1 });
    g.hp = g.maxHp = TUNING.ai.bodyguardHits;
    g.ai!.guard = target.id;
    g.ai!.guardSide = i ? 1 : -1;
    return g;
  });
  for (const p of world.activePlayers) s.drop('shotgun', Math.max(-3, Math.min(3, p.pos.x + 0.6)), p.pos.z, 2.4);
  caption(s, 'The last two. A shotgun.', 3);
  yield* s.until(() => guards.every(dead));

  // the stab from behind
  yield 0.6;
  world.flags.add('ending');
  const p = world.activePlayers[0];
  if (!p) return;
  // right behind you, inside the room (with your back to a wall he comes from the other side)
  const lim = world.room.halfWidth - 0.35;
  let bx = p.pos.x - p.facing * 0.7;
  if (Math.abs(bx) > lim) { p.facing = (-p.facing) as 1 | -1; bx = p.pos.x - p.facing * 0.7; }
  const boss = spawnBossCameo(world, Math.max(-lim, Math.min(lim, bx)), p.pos.z, p.facing);
  boss.boss.phase = 'cameo';
  boss.pos.y = TUNING.boss.hover;
  boss.invulnerable = false;
  boss.pose.sword = true;
  world.events.emit('bossArrive', { actorId: boss.id, phase: 'land', ...boss.pos });
  for (const h of world.activePlayers) {
    world.events.emit('stab', { actorId: boss.id, targetId: h.id, ...h.pos });
    h.hp = 1;
  }
  yield S3B.stabBeat;
  target.invulnerable = false;
  startLastStand(world);
  // the music drops out: the heartbeat and the drone only
  s.music(null);
  caption(s, 'Five seconds. Him behind you, then the target.', 4);
  let bossHits = 0;
  const off = world.events.on('hit', (e) => {
    if (e.actorId !== boss.id || (e.kind !== 'bullet' && e.kind !== 'gun')) return;
    if (++bossHits >= TUNING.lastStand.bossHits && boss.state !== 'dead') {
      // as the stage-1 boss dies: off his state machine, then down like anyone else
      boss.pose.sword = false;
      boss.pose.cast = 0;
      (boss as Actor).boss = undefined;
      die(world, boss, world.activePlayers[0], 'bullet', 1, 0, false, 'heavy');
    }
  });
  yield () => world.lastStand!.done || (bossHits >= TUNING.lastStand.bossHits && dead(target));
  off();
  world.lastStand!.done = true;
  world.events.emit('lastStand', { phase: 'end' });
  // the end, whatever happened
  for (const h of world.players) {
    if (!alive(h)) continue;
    h.invulnerable = false;
    h.hp = 1;
    world.hitActor(boss, h, 'slash', h.facing, 0, { x: h.pos.x, y: h.pos.y + 0.6, z: h.pos.z });
  }
  s.lockInput(true);
  s.music(null);
  yield 2.2;
  yield* s.card('THANK YOU FOR PLAYING.', 3);
  s.clear();
}

void project;
export const stage3LateScripts = { desert, vending, console: consoleRoom, lift };
