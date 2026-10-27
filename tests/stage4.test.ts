// M14 acceptance (PLAN.md): stage 4's new mechanics.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { applyHit } from '../src/sim/combat';
import { WEAPONS } from '../src/data/weapons';
import type { RoomDef } from '../src/sim/room';
import { spawnEnemy } from '../src/sim/waves';
import { World } from '../src/sim/world';

const Z = 9.2;
const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
function setup(room: RoomDef = EMPTY, x = 0) {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}
const at = (a: Actor, y = 0.6) => ({ x: a.pos.x, y: a.pos.y + y, z: a.pos.z });

describe('enemy-agent', () => {
  const agent = (world: World, x = 1.5) => spawnEnemy(world, 'grunt', 'deagle', x, Z, { variant: 'agent' });

  it('survives two head shots and dies to the third', () => {
    const { world, hero } = setup();
    const a = agent(world);
    expect(a.hp).toBe(TUNING.ai.agent.hp);
    const shot = () => applyHit(world, hero, a, 'bullet', 1, 0, at(a, 0.85), 'head', false, { damage: WEAPONS.pistol.damageHead, pointBlank: false });
    for (let i = 0; i < 2; i++) {
      shot();
      expect(alive(a)).toBe(true);
    }
    shot();
    expect(alive(a)).toBe(false);
  });

  it('carries the heavy pistol in the back hand, so the front hand is free to jab', () => {
    const { world } = setup();
    const a = agent(world);
    expect(a.hands[0]).toBeNull();
    expect(a.hands[1]?.item).toBe('deagle');
  });

  it('blocks the first jab of a chain, and jabs never stun him', () => {
    const { world, hero } = setup();
    const a = agent(world);
    const blocks: number[] = [];
    world.events.on('block', (e) => blocks.push(e.actorId));
    world.hitActor(hero, a, 'light', 1, 0, at(a));
    expect(a.hp).toBe(TUNING.ai.agent.hp);
    expect(blocks).toEqual([a.id]);
    expect(a.state).not.toBe('stun');
    world.hitActor(hero, a, 'light', 1, 0, at(a));
    expect(a.hp).toBeLessThan(TUNING.ai.agent.hp);
    expect(a.state).not.toBe('stun');
  });

  it('blunt weapons hit him twice as hard: two baton blows', () => {
    const { world, hero } = setup();
    const a = agent(world);
    world.hitActor(hero, a, 'smash', 1, 0, at(a));
    expect(alive(a)).toBe(true);
    world.hitActor(hero, a, 'smash', 1, 0, at(a));
    expect(alive(a)).toBe(false);
  });
});

describe('gun-fire-mode', () => {
  const tick = (world: World, cmd: Partial<import('../src/sim/command').PlayerCommand> = {}, n = 1) => {
    for (let i = 0; i < n; i++) { world.command = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false, ...cmd }; world.step(); }
  };
  function withRifle() {
    const { world, hero } = setup();
    const it = world.spawnItem('rifle', 'grunt', { x: hero.pos.x + 0.1, y: 0, z: Z }, { x: 0, y: 0, z: 0 }, 0);
    it.state = 'floor';
    tick(world, { pickup: true });
    return { world, hero };
  }

  it('a rifle a player picks up starts on single shot; B flips it', () => {
    const { world, hero } = withRifle();
    expect(hero.hands[0]?.item).toBe('rifle');
    expect(hero.hands[0]?.semi).toBe(true);
    const flips: boolean[] = [];
    world.events.on('fireMode', (e) => flips.push(e.semi));
    tick(world, { fireMode: true });
    expect(hero.hands[0]?.semi).toBe(false);
    tick(world, { fireMode: true });
    expect(flips).toEqual([false, true]);
  });

  it('single shot fires once per click; full auto keeps firing while held', () => {
    const { world } = withRifle();
    let shots = 0;
    world.events.on('shot', () => shots++);
    tick(world, { press: [true, false], hold: [true, false] });
    tick(world, { hold: [true, false] }, 30);
    expect(shots).toBe(1);
    tick(world, { fireMode: true });
    shots = 0;
    tick(world, { hold: [true, false] }, 30);
    expect(shots).toBeGreaterThan(3);
  });
});

describe('melee-blade-deflect', () => {
  const tick = (world: World, cmd: Partial<import('../src/sim/command').PlayerCommand> = {}, n = 1) => {
    for (let i = 0; i < n; i++) { world.command = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false, ...cmd }; world.step(); }
  };
  function guarded() {
    const { world, hero } = setup(EMPTY, -1);
    hero.hands[0] = { item: 'sword', ammo: 0, spare: 0, cooldown: 0, reload: 0, clicked: false };
    const shooter = spawnEnemy(world, 'grunt', 'smg', 2, Z, {});
    shooter.brain = undefined;
    return { world, hero, shooter };
  }
  const shot = (world: World, shooter: Actor, hero: Actor) =>
    applyHit(world, shooter, hero, 'bullet', -1, 0, at(hero), 'body', false, { damage: 2, pointBlank: false });

  it('holding RMB with a sword raises the guard (and slows the walk) instead of a heavy punch', () => {
    const { world, hero } = guarded();
    tick(world, { hold: [false, true], press: [false, true], attack: 'heavy' });
    expect(hero.guard).toBeDefined();
    expect(hero.state).toBe('free');
    tick(world, {});
    expect(hero.guard).toBeUndefined();
  });

  it('a 10-round burst from the front leaks 2-3 rounds through the guard', () => {
    const { world, hero, shooter } = guarded();
    tick(world, { hold: [false, true] }, 20); // past the parry window
    hero.hp = 99;
    let blocked = 0;
    world.events.on('block', (e) => { if (e.how === 'deflect') blocked++; });
    for (let i = 0; i < 10; i++) { shot(world, shooter, hero); tick(world, { hold: [false, true] }, 6); }
    expect(10 - blocked).toBeGreaterThanOrEqual(2);
    expect(10 - blocked).toBeLessThanOrEqual(3);
  });

  it('a guard raised just before the shot parries it back into the shooter', () => {
    const { world, hero, shooter } = guarded();
    tick(world, { hold: [false, true] });
    const hp = hero.hp;
    shot(world, shooter, hero);
    expect(hero.hp).toBe(hp);
    expect(shooter.hp).toBeLessThan(shooter.maxHp);
  });
});

describe('move-stairs', () => {
  const STAIRS = { x0: 0, x1: 3, z0: 8.6, z1: 10, y0: 0, y1: 1.2 };
  const ROOM: RoomDef = { ...EMPTY, stairs: [STAIRS] };
  const tick = (world: World, cmd: Partial<import('../src/sim/command').PlayerCommand> = {}, n = 1) => {
    for (let i = 0; i < n; i++) { world.command = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false, ...cmd }; world.step(); }
  };

  it('walking up the staircase raises the feet with it, and back down again', () => {
    const { world, hero } = setup(ROOM, -0.5);
    let x = hero.pos.x;
    for (let i = 0; i < 300 && hero.pos.x < 2.5; i++) { tick(world, { moveX: 1 }); x = hero.pos.x; }
    expect(x).toBeGreaterThan(2);
    expect(hero.pos.y).toBeGreaterThan(0.8);
    expect(hero.body.state).toBe('ground');
    for (let i = 0; i < 300 && hero.pos.x > -0.3; i++) tick(world, { moveX: -1 });
    expect(hero.pos.y).toBeLessThan(0.05);
  });

  it('a body that dies on the stairs ends at the bottom', () => {
    const { world, hero } = setup(ROOM, -2);
    const g = spawnEnemy(world, 'grunt', null, 2, Z, {});
    g.brain = undefined;
    g.pos.y = 0.8;
    world.hitActor(hero, g, 'takedown', 0, 0, at(g));
    tick(world, {}, 300);
    expect(g.corpse?.phase).toBe('frozen');
    expect(g.pos.x).toBeLessThan(0.1);
    expect(g.pos.y).toBeLessThan(0.05);
  });
});

describe('world-crowd-dancefloor', () => {
  const tick = (world: World, n = 1) => { for (let i = 0; i < n; i++) { world.command = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false }; world.step(); } };
  function club(n = 35) {
    const { world, hero } = setup(EMPTY, -3);
    hero.hp = hero.maxHp = 999;
    const crowd = Array.from({ length: n }, (_, i) => spawnEnemy(world, 'grunt', null, -1.5 + (i % 7) * 0.7, 8.4 + Math.floor(i / 7) * 0.4, { aware: false, idle: 'dance', crowd: 'club', face: 1 }));
    const cower = spawnEnemy(world, 'grunt', null, 3.5, 10, { aware: false, idle: 'cower', face: -1 });
    return { world, hero, crowd, cower };
  }

  it('dances until the alarm, then the whole crowd turns at once', () => {
    const { world, hero, crowd } = club();
    tick(world, 5);
    expect(crowd.every((g) => g.pose.dancing)).toBe(true);
    world.hitActor(hero, crowd[20], 'light', 1, 0, at(crowd[20]));
    expect(crowd.every((g) => g.ai!.aware !== false)).toBe(true);
    tick(world, 2);
    expect(crowd.some((g) => g.pose.dancing)).toBe(false);
  });

  it('never has more than 3 grunts swinging at once, and the cowering one never fights', () => {
    const { world, hero, crowd, cower } = club();
    world.hitActor(hero, crowd[0], 'light', 1, 0, at(crowd[0]));
    let most = 0;
    for (let i = 0; i < 60 * 15; i++) { tick(world); most = Math.max(most, world.tokens.size); }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(3);
    expect(world.tokens.has(cower.id)).toBe(false);
    expect(cower.state).not.toBe('attack');
  });
});

describe('armed zombies', () => {
  it("rise with a gun at hand only where the room allows it ('armedZombies')", async () => {
    const { raiseCorpse } = await import('../src/sim/zombies');
    for (const armed of [false, true]) {
      const { world, hero } = setup(EMPTY, -3);
      if (armed) world.flags.add('armedZombies');
      const g = spawnEnemy(world, 'grunt', 'rifle', 1, Z, {});
      world.hitActor(hero, g, 'takedown', 0, 0, at(g));
      for (let i = 0; i < 200; i++) { world.command = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false }; world.step(); }
      for (const it of world.items) { it.pos.x = g.pos.x; it.pos.z = g.pos.z; }
      expect(raiseCorpse(world, g)).toBe(true);
      for (let i = 0; i < 90; i++) { world.command = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false }; world.step(); }
      expect(g.kind).toBe('zombie');
      expect(!!g.hands.find((h) => h?.item === 'rifle')).toBe(armed);
    }
  });
});
