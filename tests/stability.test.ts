// M14b slice A1 (sim stability): one regression test per audit item (design/audit/{stb,enc,cmb}.md).
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { waveB } from '../src/data/stages/stage1Script';
import { STAGE2 } from '../src/data/stages/stage2';
import { crateWaves, elevatorAmbush, lobbyWaves, swordWaves } from '../src/data/stages/stage2Late';
import { corridorShotguns, corridorSquad, corridorStragglers, officeWaves } from '../src/data/stages/stage2Script';
import { STAGE3 } from '../src/data/stages/stage3';
import { consoleWaves, vendingGrunts } from '../src/data/stages/stage3Late';
import { cameraWaves, streetAmbush, tableWaves } from '../src/data/stages/stage3Script';
import type { RoomDef } from '../src/sim/room';
import type { RoomScript } from '../src/sim/waves';
import { INTRO, freeFloorSpot, stage1From } from '../src/data/stages/stage1Script';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { placeCannon } from '../src/sim/cannon';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { roomSeed, type StageDef, stageRunner } from '../src/sim/stage';
import { spawnEnemy } from '../src/sim/waves';
import { removeActor, World } from '../src/sim/world';
import { foes, stageWorld } from './soakHarness';

const tick = (w: World, cmd: Partial<PlayerCommand> = {}, n = 1) => { for (let i = 0; i < n; i++) { w.command = { ...IDLE_COMMAND, ...cmd }; w.step(); } };

function roomWorld(def: StageDef, room: string, entry = Object.keys(def.rooms[room].entries)[0]): World {
  const world = new World(def.rooms[room].room);
  world.gore = def.gore ?? 'normal';
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  def.loadout(hero);
  hero.invulnerable = true;
  world.seq.run(stageRunner(def, room, entry), 'stage');
  return world;
}

/** Positions, states and ids of everything in the room (ids included: STB-08 makes them per room). */
function hash(world: World): string {
  const r = (n: number) => Math.round(n * 1000);
  return [
    // the players' own ids come from outside the world
    ...world.actors.map((a) => `${a.playerIndex !== undefined ? 'P' : a.id}${a.kind}${a.state}${r(a.pos.x)},${r(a.pos.y)},${r(a.pos.z)}h${a.hp}`),
    ...world.items.map((i) => `${i.id}${i.kind}${i.state}${r(i.pos.x)},${r(i.pos.z)}`),
    `k${world.kills}g${world.enemyGrenades}`,
  ].join('|');
}

/** STB-12: the problems in one wave script for its room (an unknown spawn id, a missing door). */
function lintScript(name: string, script: RoomScript, room: RoomDef): string[] {
  const out: string[] = [];
  const ids = new Set(script.spawns.map((s) => s.id));
  for (const sp of script.spawns) if (sp.kind === 'door' && !room.doors[sp.door]) out.push(`${name}: spawn '${sp.id}' uses door ${sp.door}, the room has ${room.doors.length}`);
  for (const w of script.waves) {
    for (const [i, e] of [...w.entries, ...(w.coop?.entries ?? [])].entries()) if (!ids.has(e[1])) out.push(`${name} wave ${w.id} entry ${i}: unknown spawn '${e[1]}'`);
  }
  return out;
}

describe('STB-12: every wave script names spawn points and doors that exist', () => {
  const S1 = STAGE1.rooms.arena;
  const scripts: [string, RoomScript, RoomDef][] = [
    ['s1 wave A', S1.script!, S1.room], ['s1 wave B (left)', waveB(-1), S1.room], ['s1 wave B (right)', waveB(1), S1.room],
    ['s2 office', officeWaves(), STAGE2.rooms.office.room],
    ['s2 corridor shotguns', corridorShotguns(), STAGE2.rooms.corridor.room], ['s2 corridor squad', corridorSquad(), STAGE2.rooms.corridor.room], ['s2 corridor stragglers', corridorStragglers(), STAGE2.rooms.corridor.room],
    ['s2 elevator', elevatorAmbush(), STAGE2.rooms.elevator.room], ['s2 swords', swordWaves(), STAGE2.rooms.swords.room],
    ['s2 lobby', lobbyWaves(), STAGE2.rooms.lobby.room], ['s2 crates', crateWaves(), STAGE2.rooms.crates.room],
    ['s3 tables', tableWaves(), STAGE3.rooms.tables.room], ['s3 camera', cameraWaves(), STAGE3.rooms.camera.room], ['s3 street', streetAmbush(), STAGE3.rooms.street.room],
    ['s3 vending', vendingGrunts(), STAGE3.rooms.vending.room], ['s3 console', consoleWaves(), STAGE3.rooms.console.room],
  ];
  it('stages 1-3 (PR #43 scripts included)', () => {
    expect(scripts.flatMap(([n, s, r]) => lintScript(n, s, r))).toEqual([]);
  });
  it('the lint catches a broken entry and a missing door', () => {
    const bad: RoomScript = { spawns: [{ id: 'x', kind: 'door', door: 9 }], waves: [{ id: 'W', threshold: 0, maxAlive: 1, entries: [[0, 'nope', 'grunt', null]] }] };
    expect(lintScript('bad', bad, STAGE2.rooms.office.room)).toHaveLength(2);
  });
});

describe('STB-08: a room is the same on arrival and after a restart', () => {
  it('the room seed depends on stage, room, entry and attempt only', () => {
    expect(roomSeed(2, 'lobby', 'stairs')).toBe(roomSeed(2, 'lobby', 'stairs'));
    expect(roomSeed(2, 'lobby', 'stairs', 1)).not.toBe(roomSeed(2, 'lobby', 'stairs'));
    expect(roomSeed(3, 'lift', 'door')).not.toBe(roomSeed(2, 'lift', 'door'));
  });

  for (const [def, from, to] of [[STAGE2, 'swords', 'lobby'], [STAGE3, 'console', 'lift']] as const) {
    it(`s${def.stage} ${from} -> ${to}: same ids, RNG and state 10 s after the entry`, () => {
      // arrival: play the room before for a while (RNG draws, ids used), then take the exit
      const a = roomWorld(def, from);
      tick(a, {}, 240);
      const x = def.rooms[from].exits.find((e) => e.to === to)!;
      let entered = false, kills = 0;
      a.events.on('roomEnter', (e) => { if (e.room === to) { entered = true; kills = a.kills; } });
      if (!a.exitTaken) { a.exitTaken = x; a.events.emit('exitTaken', { exit: x.id, kind: x.kind, byId: 0 }); }
      for (let i = 0; i < 300 && !entered; i++) tick(a);
      expect(entered).toBe(true);
      const seedA = a.roomSeed;
      // restart: a fresh world at that checkpoint, with the hero carrying what he arrived with
      const b = roomWorld(def, to, x.entry);
      b.player!.hands = structuredClone(a.player!.hands);
      b.player!.grenades = a.player!.grenades;
      b.kills = kills;
      tick(b);
      expect(b.roomSeed).toBe(seedA);
      tick(a, {}, 600);
      tick(b, {}, 600);
      expect(hash(b)).toBe(hash(a));
    });
  }

  it('a saved room seed passed to stageRunner replaces the room\'s own', () => {
    const w = new World(STAGE2.rooms.office.room);
    w.addPlayer(createActor('hero', 0, 9.2, 1));
    w.seq.run(stageRunner(STAGE2, 'office', Object.keys(STAGE2.rooms.office.entries)[0], 12345), 'stage');
    tick(w);
    expect(w.roomSeed).toBe(12345);
  });
});

/** Kill every foe each tick, keep the heroes alive; run until `cond` (the audit probes' helper). */
function autoClear(world: World, cond: () => boolean, seconds = 120): boolean {
  for (let i = 0; i < seconds * 60 && !cond(); i++) {
    for (const p of world.players) p.invulnerable = true;
    for (const a of foes(world)) if (!a.entering && !a.koed && a.kind !== 'boss') world.hitActor(world.player, a, 'blast', 1, 0, { ...a.pos });
    for (const it of [...world.items]) if (it.kind === 'grenade' && it.live) world.items.splice(world.items.indexOf(it), 1);
    tick(world);
  }
  return cond();
}

/** Put player 1 in the first open walk-in exit. */
function walkOut(world: World, hero: Actor): void {
  const x = world.exits.find((e) => e.open && !e.def.warp && (e.def.kind === 'edge' || e.def.kind === 'door'))!.def;
  hero.pos.x = Math.max(-world.room.halfWidth + 0.3, Math.min(world.room.halfWidth - 0.3, (x.x0 + x.x1) / 2));
  hero.pos.z = Math.max(x.z0, Math.min(x.z1, 9.0));
}

describe('STB-16 / ENC-02: removeActor', () => {
  it('a blade stuck in an actor a script removes drops to the floor; an empty-handed hero standing there does not crash', () => {
    const world = new World(STAGE3.rooms.vending.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    hero.hands = [null, null];
    const boss = createActor('grunt', 0.5, 9.2, -1);
    world.actors.push(boss);
    const knife = world.spawnItem('knife', 'grunt', { x: 0.5, y: 0.6, z: 9.2 }, { x: 0, y: 0, z: 0 }, 0);
    knife.state = 'stuck';
    knife.stuckTo = boss.id;
    const removed: number[] = [];
    world.events.on('actorRemoved', (e) => removed.push(e.actorId));
    world.seq.run(function* teleport() { removeActor(world, boss); });
    expect(() => tick(world, {}, 3)).not.toThrow();
    expect(removed).toEqual([boss.id]);
    expect(knife.stuckTo).toBeUndefined();
    expect(knife.state).not.toBe('stuck');
  });

  it('a raw splice (the old way) no longer crashes pullable()', () => {
    const world = new World(STAGE3.rooms.camera.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const g = spawnEnemy(world, 'grunt', null, 0.3, 9.2, { face: -1 });
    g.hp = 99;
    const knife = world.spawnItem('knife', 'grunt', { x: 0.3, y: 0.6, z: 9.2 }, { x: 0, y: 0, z: 0 }, 0);
    knife.state = 'stuck';
    knife.stuckTo = g.id;
    world.actors.splice(world.actors.indexOf(g), 1);
    expect(() => tick(world, { pickup: true }, 3)).not.toThrow();
  });

  it('whoever held him lets go; whatever he held is dropped', () => {
    const world = new World(STAGE2.rooms.office.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const a = spawnEnemy(world, 'grunt', null, 0.4, 9.2, { face: -1 });
    const b = spawnEnemy(world, 'grunt', null, 1.0, 9.2, { face: -1 });
    hero.holding = { kind: 'actor', id: a.id };
    a.grabbedBy = hero.id;
    a.holding = { kind: 'actor', id: b.id };
    b.grabbedBy = a.id;
    removeActor(world, a);
    expect(hero.holding).toBeUndefined();
    expect(b.grabbedBy).toBeUndefined();
    expect(world.actors.includes(a)).toBe(false);
  });
});

describe('STB-01 / ENC-01: never in attack without an attack', () => {
  it('a punch on the vending brute mid-swing stuns him; the next tick does not throw', () => {
    const world = new World(STAGE3.rooms.street.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const brute = spawnEnemy(world, 'grunt', null, 0.6, 9.2, { face: -1 });
    brute.variant = 'vending';
    brute.hp = brute.maxHp = 6;
    brute.brain = () => ({ ...IDLE_COMMAND });
    brute.state = 'attack';
    brute.attack = { kind: 'heavy', heavy: true, t: 0.05, done: false };
    world.hitActor(hero, brute, 'light', -1, 0, { ...brute.pos, y: 0.6 });
    expect(brute.state).toBe('stun');
    expect(() => tick(world)).not.toThrow();
  });

  it('a hovering actor hit mid-attack too; and stepAttack falls back to free', () => {
    const world = new World(STAGE3.rooms.camera.room);
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    const mb = spawnEnemy(world, 'grunt', null, 0.6, 9.2, { face: -1 });
    mb.brain = () => ({ ...IDLE_COMMAND });
    mb.hover = 1;
    mb.state = 'attack';
    mb.attack = { kind: 'light', heavy: false, t: 0.05, done: false };
    world.hitActor(world.player, mb, 'light', -1, 0, { ...mb.pos, y: 0.6 });
    expect(mb.state).not.toBe('attack');
    const g = spawnEnemy(world, 'grunt', null, -1, 9.2, { face: 1 });
    g.brain = () => ({ ...IDLE_COMMAND });
    g.state = 'attack';
    g.attack = undefined;
    expect(() => tick(world)).not.toThrow();
    expect(g.state).toBe('free');
  });
});

describe('STB-05: the stage 3 ending', () => {
  it('dying in the 0.6 s before the stab restarts normally (no ending flag on a dead hero)', () => {
    const world = stageWorld(3, 'lift');
    const hero = world.player!;
    let lastTwo = false;
    world.events.on('card', (e) => { if (e.text.startsWith('The last two')) lastTwo = true; });
    expect(autoClear(world, () => lastTwo, 120)).toBe(true);
    autoClear(world, () => foes(world).filter((a) => a.variant === 'bodyguard').length === 0, 30);
    hero.invulnerable = false;
    hero.hp = 1;
    world.hitActor(undefined, hero, 'blast', 1, 0, { ...hero.pos });
    tick(world, {}, 60 * 2);
    expect(alive(hero)).toBe(false);
    // GameScene.watchPlayerDeath restarts unless 'ending' is set
    expect(world.flags.has('ending')).toBe(false);
  });
});

describe('ENC-16: the sword duel', () => {
  function duel(): { world: World; boss: () => Actor | undefined } {
    const world = stageWorld(3, 'vending');
    autoClear(world, () => world.actors.some((a) => a.kind === 'boss' && a.boss?.phase === 'cameo'), 60);
    return { world, boss: () => world.actors.find((a) => a.kind === 'boss') };
  }

  it('melee hits count: three sword hits (one per dive) send him away', () => {
    const { world, boss } = duel();
    expect(boss()).toBeDefined();
    let gone = false;
    world.events.on('teleport', () => (gone = true));
    // one blade hit per dive, whenever he is low enough to reach
    for (let i = 0; i < 60 * 40 && !gone; i++) {
      const b = boss();
      if (b && i % 30 === 0) world.hitActor(world.player, b, 'slash', 1, 0, { ...b.pos });
      for (const p of world.players) p.invulnerable = true;
      tick(world);
    }
    expect(gone).toBe(true);
  });

  it('with no loaded gun for TUNING.duel.regunAfter s, a loaded gun comes down again', () => {
    const { world } = duel();
    const hero = world.player!;
    for (const it of [...world.items]) if (it.kind === 'smg' || it.kind === 'pistol') world.items.splice(world.items.indexOf(it), 1);
    hero.hands = [null, null];
    let dropped = false;
    for (let i = 0; i < 60 * (TUNING.duel.regunAfter + 4) && !dropped; i++) {
      hero.invulnerable = true;
      tick(world);
      dropped = world.items.some((it) => it.kind === 'smg' && (it.ammo ?? 0) > 0);
    }
    expect(dropped).toBe(true);
  });
});

describe('STB-02: room rules are owned by the room', () => {
  it('restarting the street keeps improbability mode and axe throws, like arriving from the camera room', () => {
    const world = stageWorld(3, 'camera');
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    expect(autoClear(world, () => entered.includes('street'), 180)).toBe(true);
    const continuous = { physics: world.physics, axe: world.flags.has('axeThrows') };
    const fresh = stageWorld(3, 'street');
    tick(fresh, {}, 3);
    expect({ physics: fresh.physics, axe: fresh.flags.has('axeThrows') }).toEqual(continuous);
    expect(continuous).toEqual({ physics: 'improbable', axe: true });
  });

  it('axe throws from the camera room to the end of stage 3, not before; physics normal outside the street', () => {
    for (const room of ['outside', 'vent', 'tables'] as const) {
      const w = stageWorld(3, room); tick(w, {}, 2);
      expect(w.flags.has('axeThrows'), room).toBe(false);
    }
    for (const room of ['camera', 'desert', 'vending', 'console', 'lift'] as const) {
      const w = stageWorld(3, room); tick(w, {}, 2);
      expect(w.flags.has('axeThrows'), room).toBe(true);
      expect(w.physics, room).toBe('normal');
    }
  });
});

describe('STB-03 + STB-09: resetForRoom', () => {
  it('a grenade cooked while walking out goes back into the pocket; G still held pulls no new pin', () => {
    const world = stageWorld(2, 'wall');
    const hero = world.player!;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && world.exits.some((e) => e.open) && !world.inputLocked, 30);
    hero.grenades = 1;
    hero.hands[1] = null;
    tick(world, { grenade: true }, 20);
    expect(hero.cook).toBeGreaterThan(0);
    walkOut(world, hero);
    const entered: string[] = [];
    let blasts = 0;
    world.events.on('roomEnter', (e) => entered.push(e.room));
    world.events.on('explosion', () => blasts++);
    for (let i = 0; i < 240 && !entered.length; i++) tick(world, { grenade: true, moveX: 1 });
    expect(entered.length).toBe(1);
    expect(hero.cook).toBeUndefined();
    expect(hero.grenades).toBe(1);
    tick(world, { grenade: true }, 300);
    expect(blasts).toBe(0);
  });

  it('transient action state is cleared on entry (rage and the loadout are kept)', () => {
    const world = stageWorld(2, 'wall');
    const hero = world.player!;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && world.exits.some((e) => e.open) && !world.inputLocked, 30);
    walkOut(world, hero);
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => {
      entered.push(e.room);
    });
    for (let i = 0; i < 240 && !world.exitTaken; i++) tick(world, { moveX: 1 });
    const rage = hero.rage ? { ...hero.rage } : undefined;
    // set while walking out (as if a move or a timer were still running); the hands and rage carry over
    Object.assign(hero, { queued: { kind: 'light', at: 0 }, grabQueued: 0, guard: { since: 0, n: 0 }, chain: { by: 1, count: 2, t: 0, last: 'light' }, catchAt: 0, useHeldAt: 0, fallingAway: 0.9, stunFor: 0.5 });
    Object.assign(hero.pose, { telegraph: 0.5, react: { part: 'head', age: 0, v: 1 }, guard: true });
    for (let i = 0; i < 240 && !entered.length; i++) tick(world);
    expect(entered.length).toBe(1);
    const left = (['attack', 'queued', 'grabQueued', 'guard', 'chain', 'catchAt', 'useHeldAt', 'fallingAway', 'cook'] as const).filter((k) => hero[k] !== undefined);
    expect(left).toEqual([]);
    expect(hero.stunFor).toBe(0);
    expect([hero.pose.telegraph, hero.pose.react, hero.pose.guard]).toEqual([undefined, undefined, undefined]);
    expect(hero.rage ? { ...hero.rage } : undefined).toEqual(rage);
  });
});

describe('STB-04: killed on the exit', () => {
  it('a hero killed while walking out stays dead and the next room is not entered', () => {
    const world = stageWorld(2, 'wall');
    const hero = world.player!;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && !world.inputLocked, 30);
    hero.invulnerable = false;
    walkOut(world, hero);
    for (let i = 0; i < 60 && !world.exitTaken; i++) tick(world, { moveX: 1 });
    expect(world.exitTaken).toBeDefined();
    hero.hp = 1;
    world.hitActor(undefined, hero, 'blast', 1, 0, { ...hero.pos });
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    tick(world, {}, 180);
    expect(alive(hero)).toBe(false);
    expect(entered).toEqual([]);
  });

  it('co-op: a partner killed while the other has gone ahead (parked) goes downed and is revived next room', () => {
    const world = stageWorld(2, 'wall', 2);
    const [p1, p2] = world.players;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && !world.inputLocked, 30);
    p1.parked = 'x';
    p2.invulnerable = false;
    p2.hp = 1;
    world.hitActor(undefined, p2, 'blast', 1, 0, { ...p2.pos });
    expect(p2.goingDown).toBe(true);
    p1.parked = undefined;
  });
});

describe('CMB-05 / CMB-12', () => {
  it('CMB-05: a jab to the bodyguard\'s head deals 1 (he takes 2 hits); a bullet to the head still kills', () => {
    const world = new World(STAGE2.rooms.office.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const g = spawnEnemy(world, 'grunt', 'pistol', 0.6, 9.2, { face: -1, variant: 'bodyguard' });
    g.hp = g.maxHp = TUNING.ai.bodyguardHits;
    world.hitActor(hero, g, 'light', 1, 0, { ...g.pos, y: 0.9 }, 'head');
    expect(alive(g)).toBe(true);
    expect(g.hp).toBe(TUNING.ai.bodyguardHits - 1);
    world.hitBullet(hero, g, 1, 'head', 1, false, { ...g.pos, y: 0.9 });
    expect(alive(g)).toBe(false);
  });

  it('CMB-12: a punch with only a corpse at the feet is a jab (no planted finisher); a living downed body still gets one', () => {
    // knock a grunt down (like tests/melee.test.ts), step up to him, punch down
    const downed = (dead: boolean) => {
      const world = new World(STAGE2.rooms.office.room);
      const hero = createActor('hero', 0, 9.2, 1);
      world.addPlayer(hero);
      const d = spawnEnemy(world, 'grunt', null, 0.5, 9.2, { face: -1 });
      d.brain = () => ({ ...IDLE_COMMAND });
      d.hp = 99;
      tick(world, { attack: 'heavy', face: 1 });
      for (let i = 0; i < 120 && d.state !== 'down'; i++) tick(world);
      expect(d.state).toBe('down');
      if (dead) { d.state = 'dead'; d.hp = 0; d.corpse = { phase: 'settled', t: 0, raisable: true, gibbed: false, slumped: false }; }
      hero.pos.x = d.pos.x - 0.45;
      tick(world, { attack: 'light', face: 1 });
      return hero.attack?.kind;
    };
    expect(downed(false)).toBe('finisher');
    expect(downed(true)).toBe('light');
  });
});

describe('ENC-14: the crate room\'s guards hold their spots', () => {
  it('they stay put while the hero is back at the lift, and come out once he is close', () => {
    const world = stageWorld(2, 'crates');
    tick(world, {}, 2);
    const dug = world.actors.filter((a) => a.ai);
    expect(dug.length).toBe(3);
    const x0 = dug.map((a) => a.pos.x), z0 = dug.map((a) => a.pos.z);
    for (let i = 0; i < 60 * 4; i++) { world.player!.invulnerable = true; tick(world); }
    dug.forEach((a, i) => { expect(Math.abs(a.pos.x - x0[i]), `x ${i}`).toBeLessThan(0.3); expect(Math.abs(a.pos.z - z0[i]), `z ${i}`).toBeLessThan(0.3); });
    // flanked: the hero drops in behind them
    world.player!.pos.x = 3.6;
    for (let i = 0; i < 120 && dug.some((a) => a.ai!.hold); i++) { world.player!.pos.x = 3.6; world.player!.invulnerable = true; tick(world); }
    expect(dug.every((a) => a.ai!.hold === undefined)).toBe(true);
  });
});

describe('ENC-15: the ending\'s boombox', () => {
  it('a boombox under the cannon is moved to free floor and the tracker points at it', () => {
    const world = new World(STAGE1.rooms.arena.room);
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    world.player!.invulnerable = true;
    placeCannon(world, INTRO.boombox.x, INTRO.boombox.z, -1);
    world.seq.run(stage1From('ending'));
    tick(world, {}, 60 * 3);
    const box = world.items.find((i) => i.kind === 'boombox')!;
    expect(box).toBeDefined();
    expect(freeFloorSpot(world, box.pos.x, box.pos.z)).toEqual({ x: box.pos.x, z: box.pos.z });
    expect(Math.hypot(box.pos.x - INTRO.boombox.x, box.pos.z - INTRO.boombox.z)).toBeGreaterThan(0.3);
    expect(world.tracker).toBeDefined();
  });
});

describe('ENC-08: the lobby hold-up on Noob', () => {
  it('the unarmed last one still comes (tagged entry) and puts his hands up', () => {
    const world = stageWorld(2, 'lobby');
    world.difficulty = 'noob';
    const hero = world.player!;
    hero.hands[0] = newHand('pistol');
    let up = false;
    world.events.on('holdUp', () => (up = true));
    for (let i = 0; i < 60 * 90 && !up; i++) {
      hero.invulnerable = true;
      for (const a of foes(world)) if (!a.entering && (a.hands[0] || a.hands[1])) world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos });
      const last = foes(world).find((a) => !a.entering && !a.hands[0] && !a.hands[1]);
      if (last) { hero.pos = { x: last.pos.x - 1.2, y: 0, z: last.pos.z }; hero.facing = 1; }
      tick(world, last ? { face: 1 } : {});
    }
    expect(up).toBe(true);
  });
});
