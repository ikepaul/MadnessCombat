import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { DeathTimer, FixedClock } from '../src/sim/clock';
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

  it('M14b one clock change: the menu halts everything, F4 eats hit-stop, hit-stop is real time in slow-mo, the death wait holds', () => {
    // the pause menu: no ticks, F4 included; the debug pause apart from it
    const c = new FixedClock();
    let steps = 0;
    c.pausedByMenu = true;
    c.stepOnce();
    expect(c.advance(1, () => steps++)).toBe(0);
    expect(c.halted).toBe(true);
    expect(c.realTime).toBe(0);
    c.pausedByMenu = false;
    c.paused = true;
    expect(c.halted).toBe(true);
    // F4 inside a 0.2 s hit-stop: 12 frozen ticks before the world moves (STB-10)
    c.hitStop(0.2);
    for (let i = 0; i < 12; i++) { c.stepOnce(); c.advance(1 / 60, () => steps++); }
    expect(steps).toBe(1); // 13 presses (one queued under the menu): 12 frozen ticks, then one step
    expect(c.frozen).toBe(false);
    c.stepOnce(); c.advance(1 / 60, () => steps++);
    expect(steps).toBe(2);
    c.paused = false;
    // VIS-10: a 4-tick stop asked inside the kill cam's 0.3x is 1 scaled tick (~3 real ticks, not 13)
    const k = new FixedClock();
    k.feelScale = 0.3;
    k.hitStop(4 / 60);
    let frozenFrames = 0;
    for (let i = 0; i < 60 && (k.frozen || i === 0); i++) { if (k.frozen) frozenFrames++; k.advance(1 / 60, () => undefined); }
    expect(frozenFrames).toBeLessThanOrEqual(4);
    expect(k.realTime).toBeGreaterThan(0);
    // STB-07 / UXS-14: the restart wait holds while halted, resets on a revive, a key skips it after 0.8 s
    const d = new DeathTimer(2, 0.8);
    expect(d.update(1.5, { dead: true, halted: false, anyKey: false })).toBe(false);
    expect(d.update(5, { dead: true, halted: true, anyKey: false })).toBe(false);
    expect(d.t).toBe(1.5);
    expect(d.update(0.1, { dead: false, halted: false, anyKey: false })).toBe(false);
    expect(d.t).toBe(0);
    expect(d.update(0.5, { dead: true, halted: false, anyKey: true })).toBe(false);
    expect(d.update(0.4, { dead: true, halted: false, anyKey: true })).toBe(true);
  });
});
