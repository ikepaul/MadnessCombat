// Stage 2 room scripts, second half (PLAN.md M10, research/stages.md Stage 2 rooms 7-11): the
// elevator set piece, the sword room, the lobby hold-up, the crate room and the final office with
// the scripted ending (the boss's shot from behind, research/mechanics/world-last-stand).
import { STANDING } from '../../anim/skeleton';
import { TUNING } from '../tuning';
import { project } from '../../render/camera';
import { type Actor, alive } from '../../sim/actor';
import { spawnBossCameo } from '../../sim/boss';
import { crash, openSlot, roof, startElevator } from '../../sim/elevator';
import { holdUps, surrender } from '../../sim/interrogate';
import type { Beat, Seq } from '../../sim/sequencer';
import { openExit, takeExit } from '../../sim/stage';
import type { RoomScript, WaveEntry } from '../../sim/waves';
import type { World } from '../../sim/world';

const EL = TUNING.elevator;
const dead = (a: Actor) => a.state === 'dead';
const caption = (s: Seq, text: string, seconds = 5) => s.run(function* caption(q: Seq) { yield* q.card(text, seconds, 'caption'); });
/** Enemies left in the room (knocked-out ones don't count). */
const foesLeft = (world: World) => world.actors.filter((a) => (a.ai || a.kind === 'zombie') && alive(a) && !a.koed).length;

/** Timings for the late beats. Invented unless noted. */
export const S2B = {
  /** Elevator: the ride before the first thump on the roof (s). */
  firstLanding: 2.0,
  /** A live grenade dropped in through the hole gives this much fuse to throw it back (s). */
  grenadeFuse: 2.4,
  /** Gap between grunts dropping in through the hole (s). */
  dropGap: 1.4,
  /** The cab stops; the doors open after the ding (s). */
  doorsAfterDing: 0.8,
  /** Final office: the target ducks this long, then pops up to shoot (boss-target clip 2: ~1.5 s cycle). */
  duck: 1.0,
  popUp: 0.9,
  /** Ending: the walk up, the pause before the shot, the hold before the card (s). */
  standOff: 0.9,
  shotAfter: 0.6,
  afterShot: 2.2,
};

// ---------- room 7: the elevator ----------

/**
 * world-elevator-fight, in order: the ride; a welder and a gunner land on the roof; the welder cuts
 * a slot (kill him first and there's none); the gunner fires down through it; a grenade drops in
 * (throw it back); three more drop through one at a time; the cab stops, the doors open on a firing
 * line; climb onto the roof through the hatch; shoot the cables; the cab falls with them inside;
 * up the cable to the next floor.
 */
function* elevator(s: Seq, _entry: string): Beat {
  const world = s.world, deck = roof(world)!, el = world.room.elevator!;
  world.flags.delete('slotOpen');
  const st = startElevator(world);
  caption(s, 'Going up.', 2);
  yield S2B.firstLanding;

  // two land on the roof
  const welder = s.spawn('grunt', null, el.slot.x0 - 0.15, 8.85, { face: 1 });
  welder.variant = 'welder';
  welder.ai!.role = 'welder';
  const gunner = s.spawn('grunt', 'smg', -1.55, 9.2, { face: 1 });
  gunner.ai!.role = 'roof';
  for (const a of [welder, gunner]) { a.pos.y = deck.y + 2.2; a.body.state = 'air'; }
  world.events.emit('roofLanding', { x: 0, y: deck.y, z: 9 });
  caption(s, 'Something landed on the roof.', 3);
  yield* s.until(() => dead(welder) || (welder.body.state === 'ground' && welder.pos.y >= deck.y - 0.05), 3);

  // enemy-welder: ~2.7 s to cut the slot; killing him stops it
  if (!dead(welder)) {
    world.events.emit('weld', { actorId: welder.id, phase: 'start', ...welder.pos });
    welder.pose.welding = true;
    for (let t = 0; t < EL.cut && !dead(welder); t += world.dt) { st.cut = t / EL.cut; yield; }
    welder.pose.welding = false;
    st.cut = undefined;
    if (dead(welder)) world.events.emit('weld', { actorId: welder.id, phase: 'stop', ...welder.pos });
    else {
      openSlot(world);
      world.flags.add('slotOpen');
      world.events.emit('weld', { actorId: welder.id, phase: 'done', ...welder.pos });
      welder.ai!.role = undefined;
      caption(s, 'He cut a hole: the gunner fires down through it. Shoot up at him.', 4);
    }
  }
  // no slot: the gunner comes down through the hatch instead
  if (!world.flags.has('slotOpen') && alive(gunner)) {
    gunner.ai!.role = undefined;
    gunner.pos.x = (el.hatch.x0 + el.hatch.x1) / 2;
    gunner.pos.z = (el.hatch.z0 + el.hatch.z1) / 2;
  }
  yield* s.until(() => dead(gunner), 8);
  if (alive(gunner)) gunner.ai!.role = undefined;

  // a grenade drops in through the hole: grab it and throw it back
  const hole = world.flags.has('slotOpen') ? el.slot : el.hatch;
  const hx = (hole.x0 + hole.x1) / 2, hz = (hole.z0 + hole.z1) / 2;
  const g = world.spawnItem('grenade', 'grunt', { x: hx, y: deck.y - 0.05, z: hz }, { x: 0, y: 0, z: 0 }, 5);
  g.live = true;
  g.fuse = S2B.grenadeFuse;
  world.events.emit('grenadePin', { actorId: 0, x: hx, y: deck.y, z: hz });
  caption(s, 'Grenade! Grab it (F) and throw it back up.', 3);
  yield S2B.grenadeFuse + 0.4;

  // three more drop through, one at a time
  for (const held of [null, 'baton', null] as const) {
    const a = s.spawn('grunt', held, hx, hz, { face: 1 });
    a.pos.y = deck.y + 1.2;
    a.body.state = 'air';
    yield* s.until(() => dead(a), S2B.dropGap * 2);
    yield S2B.dropGap * 0.5;
  }
  yield* s.until(() => foesLeft(world) === 0, 20);

  // the cab stops: ding, the doors open on a firing line
  st.phase = 'stopped';
  st.speed = 0;
  world.events.emit('elevator', { phase: 'stop' });
  yield S2B.doorsAfterDing;
  world.openDoor(0);
  world.doors[0].hold = Infinity;
  const ambush = s.run(function* ambush(q: Seq) { yield* q.waves(elevatorAmbush()); });
  st.cableLocked = false;
  world.flags.add('ambush');
  caption(s, 'Get out of the line of fire: up through the hatch (E under it). Then shoot the cables.', 6);
  yield () => st.phase === 'falling' || ambush.done && foesLeft(world) === 0;
  if ((st.phase as string) !== 'falling') {
    // they're all dead before the cables went: the cab goes anyway (the way on is up the cable)
    caption(s, 'Now the cables. Shoot them from the roof.', 4);
    yield () => st.phase === 'falling';
  }
  s.cameraShake(8, EL.fallTime);
  yield EL.fallTime;
  crash(world, world.activePlayers[0]);
  s.cameraShake(20, 0.5);
  ambush.cancel();
  yield 0.4;
  if (!world.coop) { takeExit(world, 'cable'); return; }
  // co-op: each climbs the cable himself, the first waits up there for the other
  openExit(world, 'cable');
  caption(s, 'Up the cable: E at it. Both of you.', 4);
}

/** The door ambush (world-elevator-fight step 5): gunmen stepping into the cab. */
export function elevatorAmbush(): RoomScript {
  const entries: WaveEntry[] = [[0.3, 'door', 'grunt', 'pistol'], [0.5, 'door', 'grunt', 'smg'], [0.6, 'door', 'grunt', 'pistol'], [0.6, 'door', 'grunt', 'baton'], [0.7, 'door', 'grunt', 'pistol']];
  return { spawns: [{ id: 'door', kind: 'door', door: 0 }], waves: [{ id: 'ambush', threshold: 0, maxAlive: 5, exact: true, entries }] };
}

// ---------- room 8: the sword room ----------

/** Blades from the left door and the lift (research/stages.md room 8); one is left dazed; two shotguns. */
export function swordWaves(): RoomScript {
  const kinds = ['knife', 'sword', 'scimitar', 'knife', 'sword', 'axe', 'scimitar', 'knife', 'sword', 'knife'] as const;
  const entries: WaveEntry[] = kinds.map((k, i) => [i === 0 ? 1.0 : 0.9 + (i % 3) * 0.25, i % 3 === 1 ? 'lift' : 'left', 'grunt', k] as WaveEntry);
  return {
    spawns: [{ id: 'left', kind: 'door', door: 0 }, { id: 'lift', kind: 'door', door: 1 }],
    waves: [{ id: 'swords', threshold: 0, maxAlive: 4, entries, coop: { maxAlive: 6, entries: [...entries, ...entries.slice(0, 4)] } }],
  };
}

function* swords(s: Seq, _entry: string): Beat {
  const world = s.world;
  caption(s, 'Blades. A punch can knock one out of a hand.', 4);
  const kills0 = world.kills;
  let dazedSet = false, inSoFar = 0;
  const off = world.events.on('spawn', (e) => {
    // the fifth one in gets knocked silly instead of killed (research/stages.md: one grunt left dazed);
    // counted here, by arrival, so groups and the difficulty's copies don't move it (ENC-07)
    if (dazedSet || ++inSoFar !== 5) return;
    const a = world.actorById(e.actorId);
    if (a) { a.dazeOnDefeat = true; dazedSet = true; }
  });
  const waves = s.run(function* waves(q: Seq) { yield* q.waves(swordWaves()); });
  yield* s.until(() => world.kills - kills0 >= 4 || waves.done);
  // a second shotgun: dual shotguns
  for (const p of world.activePlayers) for (const k of [0, 1]) s.drop('shotgun', Math.max(-3, Math.min(3, p.pos.x + p.facing * (0.6 + k * 0.4))), p.pos.z, 2.4);
  caption(s, 'Two shotguns. One in each hand.', 3);
  yield* s.join(waves);
  yield* s.until(() => foesLeft(world) === 0);
  off();
  world.openDoor(1);
  world.doors[1].hold = Infinity;
  openExit(world, 'lift');
  caption(s, 'The lift: stand in it and press E.', 4);
}

// ---------- room 9: the lobby ----------

/** Out of the lift into fire from both doors; the last one is unarmed (the hold-up). */
export function lobbyWaves(): RoomScript {
  const entries: WaveEntry[] = [
    [0.4, 'left', 'grunt', 'pistol'], [0.1, 'right', 'grunt', 'pistol'], [1.0, 'left', 'grunt', 'baton'], [0.3, 'right', 'grunt', 'smg'],
    [1.2, 'left', 'grunt', 'pistol'], [0.4, 'right', 'grunt', 'baton'], [1.0, 'left', 'grunt', 'shotgun'],
    // the last one in carries nothing: hold him up
    [1.6, 'right', 'grunt', null, { keep: true }],
  ];
  return {
    spawns: [{ id: 'left', kind: 'door', door: 0 }, { id: 'right', kind: 'door', door: 1 }],
    waves: [{ id: 'lobby', threshold: 0, maxAlive: 4, entries }],
  };
}

function* lobby(s: Seq, _entry: string): Beat {
  const world = s.world;
  caption(s, 'Both ways at once: hold Shift to aim the second gun at the other side.', 4);
  s.run(function* hold(q: Seq) {
    yield* holdUps(q);
  });
  s.run(function* hint(q: Seq) {
    let up = false;
    const off = world.events.on('holdUp', () => (up = true));
    yield* q.until(() => up, 600);
    off();
    if (up) yield* q.card('He has nothing. Keep the gun on him, walk up and press E.', 5, 'caption');
  });
  yield* s.waves(lobbyWaves());
  yield* s.until(() => foesLeft(world) === 0);
  world.openDoor(1);
  world.doors[1].hold = Infinity;
  openExit(world, 'lift');
  caption(s, 'The lift again (E).', 3);
}

// ---------- room 10: the crate room ----------

/** Waves from the right door and the lift behind you (research/stages.md room 10). */
export function crateWaves(): RoomScript {
  const entries: WaveEntry[] = [[0.6, 'right', 'grunt', 'pistol'], [0.4, 'lift', 'grunt', 'baton'], [0.9, 'right', 'grunt', 'smg'], [0.8, 'lift', 'grunt', 'pistol'], [1.0, 'right', 'grunt', 'baton'], [0.9, 'lift', 'grunt', 'pistol']];
  return {
    spawns: [{ id: 'lift', kind: 'door', door: 0 }, { id: 'right', kind: 'door', door: 1 }],
    waves: [{ id: 'crates', threshold: 0, maxAlive: 3, entries }],
  };
}

function* crates(s: Seq, _entry: string): Beat {
  const world = s.world;
  // dug in behind the crate, facing the lift
  const dug = [[2.45, 9.25], [2.9, 9.6], [3.2, 9.05]].map(([x, z], i) => s.spawn('grunt', i === 1 ? 'rifle' : 'pistol', x, z, { face: -1 }));
  // ENC-14: they hold their spots (ai.hold) until flanked through the vent or rushed
  for (const g of dug) g.ai!.hold = { x: g.pos.x, z: g.pos.z, face: -1 };
  caption(s, 'Dug in behind the crate. Back off, or go round: the vent overhead (E under it).', 6);
  yield* s.until(() => dug.every(dead), 90);
  caption(s, 'Behind you!', 2);
  for (const p of world.activePlayers) for (const k of [0, 1]) s.drop('pistol', Math.max(-3, Math.min(3, p.pos.x + p.facing * (0.5 + 0.4 * k))), p.pos.z, 2.4);
  yield* s.waves(crateWaves());
  yield* s.until(() => foesLeft(world) === 0);
  world.openDoor(1);
  world.doors[1].hold = Infinity;
  openExit(world, 'east-door');
  caption(s, 'He is through that door.', 3);
}

// ---------- room 11: the final office ----------

/**
 * boss-target clip 2: the target ducks behind his desk and pops up to shoot every ~1.5 s, with two
 * bodyguards. Hits only make him flinch: shoot the pistol out of his hand. He gives up, sweating;
 * the ending plays (world-last-stand, ep2): the boss appears behind you and shoots. Our own card.
 */
function* final(s: Seq, _entry: string): Beat {
  const world = s.world;
  const target = s.place('grunt', 2.1, 10.35, -1, 'pistol');
  target.variant = 'target';
  target.protected = true;
  const guards = [[1.0, 9.15, 'smg'], [3.2, 9.15, 'rifle']].map(([x, z, w], i) => {
    const g = s.spawn('grunt', w as 'smg' | 'rifle', x as number, z as number, { variant: 'bodyguard', face: -1 });
    g.hp = g.maxHp = TUNING.ai.bodyguardHits;
    g.ai!.guard = target.id;
    g.ai!.guardSide = i ? 1 : -1;
    return g;
  });
  caption(s, 'There he is. He only pops up to shoot: knock the gun out of his hand.', 5);
  let disarmed = false;
  const off = world.events.on('disarm', (e) => { if (e.actorId === target.id) disarmed = true; });
  const peek = s.run(function* peek(q: Seq) { yield* peekAndShoot(q, target, () => disarmed); });
  yield* s.until(() => disarmed);
  off();
  peek.cancel();
  stand(target);
  surrender(world, target, 'surrender');
  caption(s, 'He gives up.', 3);
  // his guards fight on until they're down
  yield* s.until(() => guards.every(dead));
  yield* ending(s, target);
}

function duck(a: Actor): void {
  a.pose.ducked = true;
  a.pose.root = { ...STANDING, ty: 0.42, sy: 0.92 };
}
function stand(a: Actor): void {
  a.pose.ducked = false;
  a.pose.root = { ...STANDING };
}

/** Duck behind the desk, pop up, a short telegraph, a shot at the nearest player; repeat. */
function* peekAndShoot(s: Seq, a: Actor, stop: () => boolean): Beat {
  const world = s.world;
  for (;;) {
    duck(a);
    s.steer(a, { aim: project(a.pos.x - 1, 0.2, a.pos.z), face: -1 });
    yield S2B.duck;
    if (stop()) return;
    stand(a);
    const p = world.activePlayers[0];
    if (!p) { yield; continue; }
    const at = () => project(p.pos.x, p.pos.y + 0.55, p.pos.z);
    a.facing = p.pos.x < a.pos.x ? -1 : 1;
    s.steer(a, { aim: at(), face: a.facing });
    a.pose.telegraph = 0;
    world.events.emit('aimStart', { actorId: a.id, targetId: p.id, weapon: 'pistol', ...a.pos });
    for (let t = 0; t < TUNING.ai.ranged.telegraph; t += world.dt) {
      if (stop()) { a.pose.telegraph = undefined; return; }
      a.pose.telegraph = t / TUNING.ai.ranged.telegraph;
      s.steer(a, { aim: at(), face: a.facing });
      yield;
    }
    a.pose.telegraph = undefined;
    if (a.hands[0]) yield* s.act(a, { press: [true, false], aim: at(), face: a.facing });
    yield Math.max(0, S2B.popUp - TUNING.ai.ranged.telegraph);
    s.release(a);
  }
}

/** The ending (world-last-stand, ep2): walk up to him, the boss behind you, one shot. */
function* ending(s: Seq, target: Actor): Beat {
  const world = s.world;
  const p = world.activePlayers[0];
  if (!p) return;
  world.flags.add('ending');
  s.lockInput(true);
  s.music(null);
  yield* s.moveTo(p, target.pos.x - 1.25, target.pos.z - 0.6, 3);
  p.facing = 1;
  s.steer(p, { aim: project(target.pos.x, target.pos.y + 0.6, target.pos.z), face: 1 });
  yield S2B.standOff;
  // he's there, right behind you
  const boss = spawnBossCameo(world, p.pos.x - 0.95, p.pos.z, 1);
  boss.boss.phase = 'cameo';
  boss.pos.y = TUNING.boss.hover;
  world.events.emit('bossArrive', { actorId: boss.id, phase: 'land', ...boss.pos });
  yield S2B.shotAfter;
  boss.pose.cast = 1;
  for (const h of world.players) {
    world.events.emit('bossShot', { actorId: boss.id, targetId: h.id, ...boss.pos });
    h.hp = 1;
    h.invulnerable = false;
    world.hitBullet(boss, h, 4, 'head', 1, false, { x: h.pos.x, y: h.pos.y + 0.79, z: h.pos.z });
  }
  s.release(p);
  yield S2B.afterShot;
  // our own card (not the episode's wording)
  yield* s.card('LESSON: ALWAYS CHECK BEHIND YOU.', 3.2);
  s.clear();
}

export const stage2LateScripts = { elevator, swords, lobby, crates, final };
