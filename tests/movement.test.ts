// M1 acceptance tests (PLAN.md): measured values from research/mechanics/move-*.
// Tolerance: +-1 source frame (1/30 s) for timings, +-5% for speeds.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { type Actor, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';

const FRAME = 1 / 30;
const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };

function setup(room: RoomDef = EMPTY, x = -2, z = 9.2): { world: World; hero: Actor } {
  const world = new World(room);
  const hero = createActor('hero', x, z, 1);
  world.actors.push(hero);
  world.player = hero;
  return { world, hero };
}

/** Run ticks with a command; edges only on the first tick. */
function run(world: World, seconds: number, cmd: Partial<PlayerCommand> = {}): void {
  const ticks = Math.round(seconds / world.dt);
  for (let i = 0; i < ticks; i++) {
    world.command = { ...IDLE_COMMAND, ...cmd, jump: i === 0 && !!cmd.jump, dive: i === 0 && !!cmd.dive };
    world.step();
  }
}

function ticksUntil(world: World, pred: () => boolean, max = 600): number {
  for (let i = 1; i <= max; i++) {
    world.command = { ...IDLE_COMMAND };
    world.step();
    if (pred()) return i;
  }
  return -1;
}

describe('walk (move-walk)', () => {
  // the hero's walk speeds are raised well above the measured 0.8 / 1.3 H/s (decided with the user)
  const { walkSpeed, combatWalkSpeed } = TUNING.move.hero;

  it('calm walk speed with no enemies in the room', () => {
    const { world, hero } = setup();
    run(world, 1, { moveX: 1 });
    expect(hero.pos.x - -2).toBeCloseTo(walkSpeed, 1);
  });

  it('combat walk speed when an enemy is in the room', () => {
    const { world, hero } = setup();
    world.actors.push(createActor('grunt', 3, 10, -1));
    run(world, 1, { moveX: 1 });
    expect(hero.pos.x + 2).toBeGreaterThan(combatWalkSpeed * 0.95);
    expect(hero.pos.x + 2).toBeLessThan(combatWalkSpeed * 1.05);
  });

  it('depth moves at 0.6x horizontal speed and stays inside the floor', () => {
    const { world, hero } = setup(EMPTY, 0, 9.0);
    run(world, 1, { moveZ: 1 });
    expect(hero.pos.z - 9.0).toBeCloseTo(walkSpeed * TUNING.move.depthFactor, 2);
    run(world, 20, { moveZ: 1, moveX: 1 });
    expect(hero.pos.z).toBeLessThanOrEqual(EMPTY.zBack);
    expect(hero.pos.x).toBeLessThanOrEqual(EMPTY.halfWidth);
  });

  it('emits a footstep every half stride', () => {
    const { world } = setup();
    let steps = 0;
    world.events.on('footstep', () => steps++);
    const strides = 4;
    run(world, (strides * TUNING.move.strideLength) / walkSpeed, { moveX: 1 }); // 2 steps per stride
    expect(steps).toBeGreaterThanOrEqual(2 * strides - 1);
    expect(steps).toBeLessThanOrEqual(2 * strides);
  });
});

describe('jump (move-jump)', () => {
  it('airtime 0.63 s and apex 1.15 H', () => {
    const { world, hero } = setup();
    let apex = 0;
    world.command = { ...IDLE_COMMAND, jump: true };
    world.step();
    const t = ticksUntil(world, () => {
      apex = Math.max(apex, hero.pos.y);
      return hero.body.state === 'ground';
    });
    const airtime = (t + 1) * world.dt;
    expect(Math.abs(airtime - TUNING.jump.airtime)).toBeLessThanOrEqual(FRAME);
    expect(Math.abs(apex - 1.15)).toBeLessThanOrEqual(0.05);
  });

  it('the hero steers fully in the air and keeps his momentum with the stick released', () => {
    const { world, hero } = setup();
    run(world, 0.2, { moveX: 1 });
    world.command = { ...IDLE_COMMAND, moveX: 1, jump: true };
    world.step();
    expect(hero.body.vel.x).toBeCloseTo(TUNING.move.hero.walkSpeed * TUNING.jump.hero.airSpeed, 5);
    run(world, 0.25, { moveX: -1 });
    expect(hero.body.state).toBe('air');
    expect(hero.body.vel.x).toBeLessThan(-TUNING.move.hero.walkSpeed); // turned around mid-air
    const v = hero.body.vel.x;
    run(world, 0.1);
    expect(hero.body.vel.x).toBe(v);
  });

  it('enemies keep the small measured air steer', () => {
    const { world } = setup();
    const g = createActor('grunt', 0, 9.3, 1);
    world.actors.push(g);
    g.body.state = 'air';
    g.body.takeoff = { x: 1, z: 0 };
    g.body.vel = { x: 1, y: 2, z: 0 };
    world.scripted.set(g.id, { ...IDLE_COMMAND, moveX: -1 });
    world.step();
    expect(g.body.vel.x).toBeGreaterThan(0);
  });

  it('lands on a 0.5 H prop when the feet clear it, and is blocked by its side otherwise', () => {
    const room: RoomDef = { ...EMPTY, props: [{ kind: 'table', x0: 0, x1: 1.2, z0: 9.0, z1: 9.6, top: 0.5 }] };
    const blocked = setup(room, -0.8, 9.3);
    run(blocked.world, 2, { moveX: 1 });
    expect(blocked.hero.pos.x).toBeLessThan(0);
    const { world, hero } = setup(room, -0.8, 9.3);
    world.actors.push(createActor('grunt', -3, 10, 1)); // combat walk speed for the run-up
    run(world, 0.15, { moveX: 1 });
    run(world, 0.25, { moveX: 1, jump: true });
    run(world, 0.6, { moveX: 0.2 });
    run(world, 0.2);
    expect(hero.body.state).toBe('ground');
    expect(hero.pos.y).toBeCloseTo(0.5, 5);
    // walking off the edge falls back to the floor
    run(world, 2, { moveX: 1 });
    expect(hero.pos.y).toBe(0);
  });

  it('emits jump and land events', () => {
    const { world } = setup();
    const got: string[] = [];
    world.events.on('jump', () => got.push('jump'));
    world.events.on('land', () => got.push('land'));
    run(world, 1, { jump: true });
    expect(got).toEqual(['jump', 'land']);
  });
});

describe('prone (move-prone-dodge)', () => {
  it('drops in <= 0.15 s to a 0.3 H hurtbox and the hero stands up in 0.28 s', () => {
    const { world, hero } = setup();
    world.command = { ...IDLE_COMMAND, dive: true };
    world.step();
    const down = ticksUntil(world, () => hero.body.state === 'prone');
    expect((down + 1) * world.dt).toBeLessThanOrEqual(TUNING.prone.downTime + FRAME);
    expect(hero.body.height).toBeCloseTo(0.3, 5);
    world.command = { ...IDLE_COMMAND, dive: true };
    world.step();
    const up = ticksUntil(world, () => hero.body.state === 'ground');
    expect(Math.abs((up + 1) * world.dt - TUNING.prone.heroUpTime)).toBeLessThanOrEqual(FRAME);
    expect(hero.body.height).toBe(1);
  });

  it('a dive while moving travels about 1 H forward', () => {
    const { world, hero } = setup(EMPTY, -1, 9.2);
    run(world, 0.05, { moveX: 1 });
    const x0 = hero.pos.x;
    world.command = { ...IDLE_COMMAND, moveX: 1, dive: true };
    world.step();
    ticksUntil(world, () => hero.body.state === 'prone');
    expect(hero.pos.x - x0).toBeGreaterThan(0.95);
    expect(hero.pos.x - x0).toBeLessThan(1.1);
  });
});

describe('cannon dodges', () => {
  function cannonWorld() {
    const s = setup(EMPTY, -1.5, 9.2);
    s.world.cannons.push({ x: 2.8, z: 9.2, facing: -1, timer: 0.5 });
    let hits = 0;
    s.world.events.on('cannonHit', () => hits++);
    return { ...s, hits: () => hits };
  }

  it('a standing player gets hit', () => {
    const c = cannonWorld();
    run(c.world, 1.0);
    expect(c.hits()).toBe(1);
  });

  it('the ball passes over a prone player', () => {
    const c = cannonWorld();
    run(c.world, 1.0, { dive: true });
    expect(c.hero.body.state).toBe('prone');
    expect(c.hits()).toBe(0);
  });

  it('the ball passes under a timed jump', () => {
    const c = cannonWorld();
    // ball fires at 0.5 s from x 2.4 and reaches x -1.5 after ~0.15 s; feet clear 0.72 H from ~0.12 s after takeoff
    run(c.world, 0.4);
    run(c.world, 0.6, { jump: true });
    expect(c.hits()).toBe(0);
  });

  it('stepping out of the depth band also dodges', () => {
    const c = cannonWorld();
    run(c.world, 1.0, { moveZ: 1 });
    expect(c.hits()).toBe(0);
  });
});
