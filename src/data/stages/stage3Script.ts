// Stage 3 room scripts, first half (PLAN.md M11, research/stages.md Stage 3 rooms 1-6, research/
// episodes/ep3-log.md): two knives, the vent drop, knife throws, the table room, the camera room
// (the target's button: improbability mode; the floor falls away; the jetpack mini-boss over the
// void; the shove), and the clock-sky toy street (ambush, the falling tank, the street sign, the
// vending-machine brute, the mini-boss pinned to the tank and raised as a zombie).
import { TUNING } from '../tuning';
import { project } from '../../render/camera';
import { type Actor, alive, newHand } from '../../sim/actor';
import { bossHp } from '../../sim/difficulty';
import { dropBlock, flyIn, overVoid, setImprobable, startCollapse } from '../../sim/improbability';
import type { Beat, Seq } from '../../sim/sequencer';
import { openExit, takeExit } from '../../sim/stage';
import type { RoomScript, SpawnOpts, WaveEntry } from '../../sim/waves';
import { removeActor, type World } from '../../sim/world';
import { raiseCorpse } from '../../sim/zombies';
import { stage3LateScripts } from './stage3Late';

const dead = (a: Actor) => a.state === 'dead';
const unaware = (opts: Partial<SpawnOpts> = {}): SpawnOpts => ({ aware: false, idle: 'stand', ...opts });
const caption = (s: Seq, text: string, seconds = 5) => s.run(function* caption(q: Seq) { yield* q.card(text, seconds, 'caption'); });
const foesLeft = (world: World) => world.actors.filter((a) => (a.ai || a.kind === 'zombie') && alive(a) && !a.koed).length;

/** Timings for the stage 3 beats. Invented unless noted. */
export const S3 = {
  /** Camera room: flying enemies killed before the floor cracks. */
  collapseAfter: 4,
  /** The jetpack's bursts: aim telegraph, then the trigger held (s); how many before he runs dry. */
  burstAim: 0.6,
  burstHold: 1.4,
  bursts: 3,
  /** Off over the void, then back through the right door behind you (door telegraph first). */
  awayTime: 1.4,
  doorTelegraph: 0.8,
  /** The shove: you're over the edge after this long; the fall exit follows. */
  shoveFall: 1.3,
  /** Street: ambush kills before the tank comes down. */
  tankAfter: 4,
};

// ---------- room 1: outside ----------

function* outside(s: Seq, _entry: string): Beat {
  const world = s.world;
  if (!world.flags.has('s3-title')) {
    world.flags.add('s3-title');
    s.lockInput(true);
    yield* s.card('STAGE 3', 1.8);
    s.lockInput(false);
  }
  // two guards; one goes inside, the other stays out for a smoke
  const going = s.spawn('grunt', 'pistol', 1.6, 9.6, unaware({ face: 1 }));
  s.spawn('grunt', 'pistol', 0.6, 9.2, unaware({ idle: 'smoke', face: 1 }));
  caption(s, 'Two knives. In through the vent at the far end of the wall (E).', 5);
  yield 1.2;
  if (alive(going) && going.ai?.aware === false) {
    going.ai.role = 'welder'; // (scripted: his brain idles while he walks off)
    yield* s.moveTo(going, 4.3, 9.6, 4);
    if (alive(going)) removeActor(world, going);
  }
}

// ---------- room 2: the vent room ----------

function* vent(s: Seq, _entry: string): Beat {
  const world = s.world;
  // the one right below the vent: landing next to him is the knife kill (move-drop-from-above)
  s.spawn('grunt', 'pistol', -0.55, 9.2, unaware({ face: 1 }));
  s.spawn('grunt', 'pistol', 2.3, 9.0, unaware({ idle: 'smoke', face: 1 }));
  s.spawn('grunt', 'smg', 2.9, 9.8, unaware({ idle: 'chat', face: 1 }));
  s.drop('rifle', 0.9, 9.6, 0);
  yield 1.2;
  caption(s, 'From range, LMB throws a knife. Stand over a stuck one to pull it back out.', 5);
  yield* s.until(() => foesLeft(world) === 0);
  world.openDoor(0);
  world.doors[0].hold = Infinity;
  openExit(world, 'east-door');
}

// ---------- room 3: the table room ----------

export function tableWaves(): RoomScript {
  const entries: WaveEntry[] = [[1.0, 'right', 'grunt', 'pistol'], [0.9, 'right', 'grunt', 'baton'], [1.1, 'right', 'grunt', 'rifle'], [0.8, 'right', 'grunt', null], [1.0, 'right', 'grunt', 'pistol'], [0.9, 'right', 'grunt', 'baton']];
  return { spawns: [{ id: 'right', kind: 'door', door: 1 }], waves: [{ id: 'tables', threshold: 0, maxAlive: 3, entries }] };
}

function* tables(s: Seq, _entry: string): Beat {
  const world = s.world;
  // the axe on the floor (an empty-handed grunt goes for it) and a gunner who kicks the table over
  s.drop('axe', -1.0, 8.9, 0);
  const flipper = s.spawn('grunt', 'rifle', 1.0, 10.2, { face: -1 });
  flipper.ai!.flipper = true;
  s.spawn('grunt', null, -0.2, 9.8, { face: -1 });
  caption(s, 'A gun runs dry: press again to throw it. Get up on the table (Space) to fight from above.', 6);
  yield* s.waves(tableWaves());
  yield* s.until(() => foesLeft(world) === 0);
  world.openDoor(1);
  world.doors[1].hold = Infinity;
  openExit(world, 'east-door');
}

// ---------- room 4/5: the camera room ----------

export function cameraWaves(): RoomScript {
  const entries: WaveEntry[] = [[1.0, 'right', 'grunt', 'axe'], [0.8, 'right', 'grunt', 'baton'], [1.0, 'right', 'grunt', 'axe'], [0.9, 'right', 'grunt', 'baton'], [1.1, 'right', 'grunt', 'axe']];
  return { spawns: [{ id: 'right', kind: 'door', door: 1 }], waves: [{ id: 'camera', threshold: 0, maxAlive: 3, entries }] };
}

/**
 * Axe and baton waves; the security camera turns: the target presses the button (a cutscene
 * card). Improbability mode: enemies fly in, bodies bounce. The floor cracks and the left half
 * falls into the void. The jetpack mini-boss rises over it with a machine gun: three bursts
 * (cover or a human shield), he flies off, comes back through the door behind you and shoves you
 * over the edge. That fight can't end in his death (he only flinches).
 */
function* camera(s: Seq, _entry: string): Beat {
  const world = s.world;
  yield* s.waves(cameraWaves());
  yield* s.until(() => foesLeft(world) === 0);

  // the cutscene: the camera turns; upstairs, the target and his button
  yield 0.6;
  world.events.emit('cameraTurn', { x: world.room.camera!.x, y: world.room.camera!.y, z: world.room.zBack });
  yield 0.8;
  s.lockInput(true);
  yield* s.card('UPSTAIRS, SOMEONE PRESSES A BUTTON.', 2.2);
  s.lockInput(false);
  setImprobable(world, true);
  s.music('improbable');
  caption(s, 'Everything just got a lot less likely.', 3);

  // they come in flying, out of control
  const fly = s.run(function* fly(q: Seq) {
    for (let i = 0; i < 6; i++) {
      const side = (i % 2 ? 1 : -1) as 1 | -1;
      const a = q.spawn('grunt', i === 2 ? 'pistol' : i === 4 ? 'pistol' : null, side * 3.4, 8.7 + (i % 3) * 0.45, { face: (-side) as 1 | -1 });
      flyIn(world, a, side);
      yield 1.1;
    }
  });
  const kills0 = world.kills;
  yield* s.until(() => world.kills - kills0 >= S3.collapseAfter || (fly.done && foesLeft(world) === 0), 30);

  // world-arena-collapse: the crack, then the left half goes
  caption(s, 'The floor is cracking. Get to the right!', 2);
  startCollapse(world, -1, 0);
  yield TUNING.collapse.crack + 0.4;
  const fell = () => world.activePlayers.some((p) => p.fallingAway !== undefined && p.fallingAway > 0.8);
  if (fell()) { takeExit(world, 'void'); return; }

  // the jetpack mini-boss rises out of the void with a machine gun
  for (const p of world.activePlayers) for (const k of [0, 1]) s.drop('pistol', Math.min(3.2, p.pos.x + 0.5 + k * 0.4), p.pos.z, 2.4);
  const boss = jetpackBoss(s, -2.4, 9.2);
  caption(s, 'Over the drop, a machine gun. Get behind the crate, or grab one of them as a shield (pistol in the back hand, F).', 6);
  s.run(function* more(q: Seq) {
    for (let i = 0; i < 2; i++) { const a = q.spawn('grunt', null, 3.4, 8.8 + i * 0.6, { face: -1 }); flyIn(world, a, 1); yield 2.5; }
  });
  for (let b = 0; b < S3.bursts && !fell(); b++) yield* burst(s, boss);
  if (fell()) { takeExit(world, 'void'); return; }

  // dry: off over the void and out of sight...
  boss.hands[0] = null;
  world.events.emit('jetpack', { actorId: boss.id, phase: 'away', ...boss.pos });
  boss.hover = 5;
  yield* s.moveTo(boss, -4.4, 9.2, S3.awayTime);
  boss.pos = { x: 4.3, y: 1.0, z: 8.95 };
  // ...and back in through the door behind you
  world.openDoor(1);
  world.doors[1].hold = Infinity;
  yield S3.doorTelegraph;
  boss.hover = undefined;
  boss.pos.y = 0;
  const p = world.activePlayers[0];
  if (!p) return;
  world.events.emit('jetpack', { actorId: boss.id, phase: 'back', ...boss.pos });
  yield* s.moveTo(boss, Math.min(3.2, p.pos.x + 0.55), p.pos.z, 2.5);
  // the shove: everyone over the edge
  s.lockInput(true);
  yield* s.act(boss, { attack: 'heavy', face: -1 });
  for (const h of world.activePlayers) {
    h.traversing = { kind: 'shoved', t: 0 };
    h.facing = 1;
    world.events.emit('shove', { actorId: boss.id, targetId: h.id, ...h.pos });
  }
  yield S3.shoveFall;
  takeExit(world, 'void');
}

/** The mini-boss on his jetpack (style frame "Stage 3 cast": riot helmet, twin tanks): hovering, can't die here. */
function jetpackBoss(s: Seq, x: number, z: number): Actor {
  const world = s.world;
  const b = s.place('grunt', x, z, 1, 'mg');
  b.variant = 'riot';
  b.protected = true;
  b.pos.y = -1.5;
  b.hover = 1.3;
  b.pose.jetpack = true;
  b.hands[0]!.ammo = 100;
  world.events.emit('jetpack', { actorId: b.id, phase: 'up', ...b.pos });
  return b;
}

/** One burst: the aim telegraph, then the trigger held on the nearest player. */
function* burst(s: Seq, b: Actor): Beat {
  const world = s.world;
  const p = world.activePlayers[0];
  if (!p) return;
  const at = () => project(p.pos.x, p.pos.y + 0.55, p.pos.z);
  b.facing = 1;
  world.events.emit('aimStart', { actorId: b.id, targetId: p.id, weapon: 'mg', ...b.pos });
  for (let t = 0; t < S3.burstAim; t += world.dt) { b.pose.telegraph = t / S3.burstAim; s.steer(b, { aim: at(), face: 1 }); yield; }
  b.pose.telegraph = undefined;
  for (let t = 0; t < S3.burstHold; t += world.dt) { s.steer(b, { aim: at(), face: 1, hold: [true, false], press: [t === 0, false] }); yield; }
  s.release(b);
  yield 0.9;
}

// ---------- room 6: the clock-sky toy street ----------

export function streetAmbush(): RoomScript {
  const spawns: RoomScript['spawns'] = [
    { id: 'L-front', kind: 'edge', side: -1, z: 8.5 }, { id: 'L-back', kind: 'edge', side: -1, z: 9.9 },
    { id: 'R-front', kind: 'edge', side: 1, z: 8.5 }, { id: 'R-back', kind: 'edge', side: 1, z: 9.9 },
  ];
  const entries: WaveEntry[] = [
    [0.8, 'L-front', 'grunt', 'smg'], [0.1, 'R-back', 'grunt', 'smg'], [1.2, 'R-front', 'grunt', 'pistol'], [0.4, 'L-back', 'grunt', 'smg'],
    [1.4, 'L-front', 'grunt', 'baton'], [0.3, 'R-front', 'grunt', 'smg'], [1.2, 'L-back', 'grunt', 'smg'], [0.6, 'R-back', 'grunt', 'pistol'],
  ];
  return { spawns, waves: [{ id: 'street', threshold: 0, maxAlive: 4, entries, coop: { maxAlive: 6, entries: [...entries, ...entries.slice(0, 4)] } }] };
}

function* street(s: Seq, _entry: string): Beat {
  const world = s.world;
  // the street sign, planted in the pavement (melee-environment-weapon)
  const sign = world.spawnItem('sign', 'grunt', { x: 1.7, y: 0, z: 9.9 }, { x: 0, y: 0, z: 0 }, 0);
  sign.state = 'planted';
  yield 1.4;
  caption(s, 'Both ends of the street. Empty guns: throw them and grab the next.', 4);
  const kills0 = world.kills;
  const ambush = s.run(function* ambush(q: Seq) { yield* q.waves(streetAmbush()); });
  yield* s.until(() => world.kills - kills0 >= S3.tankAfter || ambush.done);
  // world-falling-hazard: a shadow, then the tank
  dropBlock(world, -1.6, 9.6, 1);
  yield* s.join(ambush);
  yield* s.until(() => foesLeft(world) === 0);

  // the vending machine at the back gets up (our "background object comes alive")
  yield 1.0;
  const v = world.room.vending!;
  world.room.vending = undefined;
  world.events.emit('bruteWake', { x: v.x, y: 0, z: v.z });
  const brute = s.spawn('grunt', null, v.x, v.z - 0.05, { face: -1 });
  brute.variant = 'vending';
  brute.hp = brute.maxHp = bossHp(world, TUNING.brute.hp);
  caption(s, 'The vending machine is getting up. The street sign has reach: pull it out (E).', 5);
  yield* s.until(() => dead(brute));

  // the mini-boss drops in with a scimitar: only pinning him to the tank finishes him
  yield 1.0;
  const tank = world.room.props.find((p) => p.kind === 'tank');
  const bx = tank ? (tank.x1 + 0.5) : 0;
  const mb = s.spawn('grunt', 'scimitar', bx, 9.5, { variant: 'riot', face: 1 });
  mb.protected = true;
  mb.pos.y = TUNING.stage.skyHeight;
  mb.body.state = 'air';
  caption(s, 'Him again. Pin him to the tank: the sign, RMB, with his back to it.', 6);
  yield* s.until(() => dead(mb));

  // the cutscene: lightning out of the sky, and he gets up green
  s.lockInput(true);
  yield 0.8;
  // off the tank and laid down, so the bolt can raise him
  mb.flight = undefined;
  mb.pos.y = 0;
  if (mb.corpse) { mb.corpse.pinned = false; mb.corpse.phase = 'settled'; mb.corpse.raisable = true; }
  world.events.emit('lightning', { actorId: 0, targetId: mb.id, from: { x: mb.pos.x - 1, y: 8, z: mb.pos.z }, to: { x: mb.pos.x, y: mb.pos.y + 0.6, z: mb.pos.z } });
  raiseCorpse(world, mb);
  yield TUNING.zombie.rise + 0.6;
  // he flies off on his jetpack (we meet him again in the desert)
  mb.ai = undefined;
  mb.brain = undefined;
  mb.pose.jetpack = true;
  mb.hover = 6;
  world.events.emit('jetpack', { actorId: mb.id, phase: 'away', ...mb.pos });
  yield 1.2;
  removeActor(world, mb);
  s.lockInput(false);
  caption(s, 'He went that way.', 3);
  openExit(world, 'desert');
  yield* s.until(() => !!world.exitTaken);
  setImprobable(world, false);
}

void overVoid;
void newHand;
export const stage3Scripts = { outside, vent, tables, camera, street, ...stage3LateScripts };
