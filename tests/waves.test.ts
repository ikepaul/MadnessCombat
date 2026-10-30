// M3 acceptance tests (PLAN.md): the wave script runs to completion headless with a scripted
// "kill all", never more than 3 attackers at once, the kill counter matches the deaths.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { gruntBrain, newAiState } from '../src/sim/ai';
import { IDLE_COMMAND } from '../src/sim/command';
import { type RoomScript, WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

const ARENA = STAGE1.rooms.arena;

function arena(): { world: World; hero: Actor } {
  const world = new World(ARENA.room);
  const hero = createActor('hero', 0, 9.2, 1);
  world.actors.push(hero);
  world.player = hero;
  world.director = new WaveDirector(ARENA.script);
  return { world, hero };
}

function tick(world: World): void {
  world.command = { ...IDLE_COMMAND };
  world.step();
}

const enemies = (world: World) => world.actors.filter((a) => a.ai);

describe('wave script (enemy-spawning)', () => {
  it('wave A runs to completion with a scripted kill-all, and the counter matches', () => {
    const { world } = arena();
    let cleared = false, spawns = 0, deaths = 0;
    world.events.on('roomCleared', () => (cleared = true));
    world.events.on('spawn', () => spawns++);
    world.events.on('kill', () => deaths++);
    for (let i = 0; i < 60 * 120 && !cleared; i++) {
      tick(world);
      // kill whoever made it onto the screen
      for (const a of enemies(world)) if (alive(a) && !a.entering) world.hitActor(world.player, a, 'wall', 1, 0, a.pos);
    }
    expect(cleared).toBe(true);
    expect(spawns).toBe(18);
    expect(deaths).toBe(18);
    expect(world.kills).toBe(18);
    expect(world.director!.state).toBe('done');
  });

  it('trickles: never more than maxAlive enemies at once', () => {
    const { world, hero } = arena();
    let most = 0;
    for (let i = 0; i < 60 * 30; i++) {
      tick(world);
      hero.hp = hero.maxHp;
      most = Math.max(most, enemies(world).filter(alive).length);
    }
    expect(most).toBe(ARENA.script.waves[0].maxAlive);
  });

  it('edge entries walk in from off-screen', () => {
    const { world } = arena();
    let first: Actor | undefined;
    for (let i = 0; i < 60 * 2 && !first; i++) { tick(world); first = enemies(world)[0]; }
    expect(Math.abs(first!.pos.x)).toBeGreaterThan(ARENA.room.halfWidth);
    expect(first!.entering).toBe(true);
    for (let i = 0; i < 60 * 3; i++) tick(world);
    expect(first!.entering).toBe(false);
    expect(Math.abs(first!.pos.x)).toBeLessThan(ARENA.room.halfWidth);
  });

  it('the next wave starts once the alive count drops below its threshold', () => {
    const script: RoomScript = {
      spawns: [{ id: 'L', kind: 'edge', side: -1, z: 9.2 }],
      waves: [
        // exact: this checks the threshold rule tick by tick (no spawn variety)
        { id: 'A', threshold: 0, maxAlive: 9, exact: true, entries: [[0, 'L', 'grunt', null], [0, 'L', 'grunt', null], [0, 'L', 'grunt', null]] },
        { id: 'B', threshold: 2, maxAlive: 9, exact: true, entries: [[0, 'L', 'grunt', null]] },
      ],
    };
    const world = new World(ARENA.room);
    world.director = new WaveDirector(script);
    const started: string[] = [];
    world.events.on('waveStart', (e) => started.push(e.wave));
    for (let i = 0; i < 10; i++) tick(world);
    expect(started).toEqual(['A']);
    const [a, b] = enemies(world);
    world.hitActor(undefined, a, 'wall', 1, 0, a.pos);
    for (let i = 0; i < 10; i++) tick(world);
    expect(started).toEqual(['A']); // 2 alive, not below 2
    world.hitActor(undefined, b, 'wall', 1, 0, b.pos);
    for (let i = 0; i < 10; i++) tick(world);
    expect(started).toEqual(['A', 'B']);
  });

  it('a door spawn opens the door 0.3 s before the enemy steps through', () => {
    const script: RoomScript = { spawns: [{ id: 'D', kind: 'door', door: 1 }], waves: [{ id: 'A', threshold: 0, maxAlive: 9, entries: [[0, 'D', 'grunt', null]] }] };
    const world = new World(TEST_ROOM);
    world.director = new WaveDirector(script);
    let openedAt = -1, spawnedAt = -1;
    world.events.on('doorOpen', () => (openedAt = world.time));
    world.events.on('spawn', () => (spawnedAt = world.time));
    for (let i = 0; i < 60; i++) tick(world);
    expect(openedAt).toBeGreaterThanOrEqual(0);
    expect(spawnedAt - openedAt).toBeCloseTo(TUNING.waves.doorOpen, 1);
    expect(world.doors[1].open).toBe(1);
    for (let i = 0; i < 120; i++) tick(world);
    expect(world.doors[1].open).toBe(0);
  });
});

describe('grunt AI (enemy-grunt-unarmed)', () => {
  it('never more than 3 grunts attacking at once, and they do attack', () => {
    const { world, hero } = arena();
    let most = 0, punches = 0;
    world.events.on('punch', (e) => e.actorId !== hero.id && punches++);
    for (let i = 0; i < 60 * 40; i++) {
      tick(world);
      hero.hp = hero.maxHp; // a punching bag that never dies
      const attacking = enemies(world).filter((a) => a.state === 'attack').length;
      most = Math.max(most, attacking, world.tokens.size);
    }
    expect(most).toBeLessThanOrEqual(3);
    expect(most).toBeLessThanOrEqual(TUNING.ai.maxAttackers);
    expect(punches).toBeGreaterThan(10);
  });

  it('a token holder swings every 0.6-1.0 s', () => {
    const { world, hero } = arena();
    world.director = undefined;
    const g = createActor('grunt', 1.2, 9.2, -1);
    g.ai = newAiState(world);
    g.brain = gruntBrain(world);
    world.actors.push(g);
    const times: number[] = [];
    world.events.on('punch', (e) => e.actorId === g.id && times.push(world.time));
    for (let i = 0; i < 60 * 10; i++) {
      tick(world);
      // the hero stands still and is never knocked about
      hero.hp = hero.maxHp;
      if (hero.state !== 'free') { hero.state = 'free'; hero.pose.root = { r: 0, tx: 0, ty: 0, sx: 1, sy: 1 }; hero.flight = undefined; hero.pos = { x: 0, y: 0, z: 9.2 }; }
    }
    expect(times.length).toBeGreaterThan(5);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const [i0, i1] = TUNING.ai.attackInterval;
    const swing = (6 + 3 + 8) / 30; // a heavy swing is the longest a grunt is busy
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(i0 - 1 / 30);
      expect(gap).toBeLessThanOrEqual(Math.max(i1, swing) + 0.25);
    }
  });

  it('grunts without a token wait on the ring, 1.5-2.5 H away', () => {
    const { world, hero } = arena();
    for (let i = 0; i < 60 * 20; i++) {
      tick(world);
      hero.hp = hero.maxHp;
      // M14b: kept in the middle (a heavy into the corner leaves no room for a ring on that side)
      if (hero.state !== 'free') { hero.state = 'free'; hero.pose.root = { r: 0, tx: 0, ty: 0, sx: 1, sy: 1 }; hero.flight = undefined; hero.pos = { x: 0, y: 0, z: 9.2 }; }
    }
    const waiting = enemies(world).filter((a) => alive(a) && !a.entering && !world.tokens.has(a.id) && a.state === 'free');
    expect(waiting.length).toBeGreaterThan(0);
    for (const a of waiting) {
      const d = Math.abs(a.pos.x - hero.pos.x);
      expect(d).toBeGreaterThan(TUNING.ai.waitRing[0] - 0.6);
    }
  });
});
