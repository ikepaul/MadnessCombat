import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { FixedClock } from '../src/sim/clock';
import { World } from '../src/sim/world';

function run(clock: FixedClock, world: World, seconds: number, frame = 1 / 60): void {
  for (let t = 0; t < seconds - 1e-9; t += frame) clock.advance(frame, () => world.step());
}

describe('FixedClock', () => {
  it('steps the world 60 ticks = 1.0 s of sim time', () => {
    const clock = new FixedClock(), world = new World(TEST_ROOM);
    for (let i = 0; i < 60; i++) clock.advance(1 / 60, () => world.step());
    expect(world.tick).toBe(60);
    expect(world.time).toBeCloseTo(1.0, 10);
  });

  it('is independent of the render frame rate', () => {
    const a = new FixedClock(), wa = new World(TEST_ROOM);
    const b = new FixedClock(), wb = new World(TEST_ROOM);
    run(a, wa, 2, 1 / 144);
    run(b, wb, 2, 1 / 30);
    expect(Math.abs(wa.tick - wb.tick)).toBeLessThanOrEqual(1);
    expect(wa.tick).toBeGreaterThanOrEqual(119);
  });

  it('slow-mo 0.25x runs a quarter of the ticks', () => {
    const clock = new FixedClock(), world = new World(TEST_ROOM);
    clock.timeScale = 0.25;
    run(clock, world, 4);
    expect(world.tick).toBeGreaterThanOrEqual(59);
    expect(world.tick).toBeLessThanOrEqual(60);
  });

  it('hit-stop freezes the world without losing clock time', () => {
    const clock = new FixedClock(), world = new World(TEST_ROOM);
    clock.hitStop(0.1); // 3 frames at 30 fps = 6 ticks
    run(clock, world, 1);
    expect(world.tick).toBeGreaterThanOrEqual(53);
    expect(world.tick).toBeLessThanOrEqual(54);
    expect(clock.tick).toBeGreaterThanOrEqual(59);
  });

  it('pause stops the world; stepOnce advances exactly one tick', () => {
    const clock = new FixedClock(), world = new World(TEST_ROOM);
    clock.paused = true;
    run(clock, world, 1);
    expect(world.tick).toBe(0);
    clock.stepOnce();
    clock.advance(1 / 60, () => world.step());
    expect(world.tick).toBe(1);
  });

  it('a long hitch does not cause a catch-up spiral', () => {
    const clock = new FixedClock(), world = new World(TEST_ROOM);
    clock.advance(5, () => world.step());
    expect(world.tick).toBe(15);
  });
});
