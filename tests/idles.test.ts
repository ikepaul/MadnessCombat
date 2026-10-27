// Idle animations (playtest 2026-10-27): deterministic fidgets, the hero only after standing still.
import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '../src/anim/layers';
import { fidgetAt, IDLE } from '../src/anim/idles';
import { createActor } from '../src/sim/actor';
import { newAiState } from '../src/sim/ai';
import { World } from '../src/sim/world';
import { TEST_ROOM } from '../src/data/rooms/testRoom';

describe('idles', () => {
  it('a fidget plays in most slots and is the same for the same id and time', () => {
    let on = 0;
    for (let t = 0; t < 600; t += 0.5) if (fidgetAt(7, t, ['wrist', 'look'])) on++;
    // a fidget covers `length` of each `every` s, in `chance` of the slots
    const share = on / 1200;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(IDLE.length / IDLE.every + 0.05);
    expect(fidgetAt(7, 123.4, ['wrist', 'look'])).toEqual(fidgetAt(7, 123.4, ['wrist', 'look']));
  });

  it('an unaware guard moves while idle; an aware one stands as sampled', () => {
    const world = new World(TEST_ROOM);
    const g = createActor('grunt', 0, 9.2, 1);
    g.ai = { ...newAiState(world), aware: false, idle: 'stand' };
    const pool = ['wrist', 'stretch', 'scratch', 'look', 'shift'] as const;
    let t = 0;
    while (Math.abs((fidgetAt(g.id, t, pool)?.u ?? 0) - 0.5) > 0.1) t += 0.05;
    const idle = JSON.stringify(buildSkeleton(g, t).skeleton);
    g.ai.aware = true;
    expect(JSON.stringify(buildSkeleton(g, t).skeleton)).not.toBe(idle);
  });

  it('the hero only fidgets after standing still', () => {
    const h = createActor('hero', 0, 9.2, 1);
    // a twin without the idle rule (a grunt with no AI) breathes the same way
    const twin = { ...h, kind: 'grunt' } as typeof h;
    const same = (t: number) => JSON.stringify(buildSkeleton(h, t).skeleton) === JSON.stringify(buildSkeleton(twin, t).skeleton);
    for (let t = 1000; t < 1000 + IDLE.heroStill - 0.05; t += 0.05) expect(same(t)).toBe(true);
    let fidgeted = false;
    for (let t = 1000 + IDLE.heroStill; t < 1060; t += 0.05) if (!same(t)) fidgeted = true;
    expect(fidgeted).toBe(true);
    // a step resets it
    h.pos.x += 0.5;
    expect(same(1060.05)).toBe(true);
  });
});
