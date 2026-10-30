// M14b CMB-03: melee-only healing is an F6 switch (TUNING.health.healMeleeOnly); 0 = every kill heals.
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { createActor } from '../src/sim/actor';
import { die } from '../src/sim/combat';
import type { HitKind } from '../src/sim/events';
import { World } from '../src/sim/world';

const H = TUNING.health as { healMeleeOnly: number };

function killWith(kind: HitKind): number {
  const world = new World({ ...TEST_ROOM, props: [] });
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  hero.hp = 1;
  const g = createActor('grunt', 1, 9.2, -1);
  world.actors.push(g);
  die(world, g, hero, kind, 1, 0, false);
  return hero.hp;
}

describe('CMB-03 healing switch', () => {
  const old = TUNING.health.healMeleeOnly;
  afterEach(() => { H.healMeleeOnly = old; });

  it('defaults to the old behaviour: every kill heals', () => {
    expect(TUNING.health.healMeleeOnly).toBe(0);
    for (const k of ['light', 'stab', 'bullet', 'blast', 'knife'] as HitKind[]) expect(killWith(k), k).toBe(2);
  });

  it('switched on, only hand-to-hand kills heal', () => {
    H.healMeleeOnly = 1;
    for (const k of ['light', 'heavy', 'finisher', 'stab', 'smash', 'body', 'takedown'] as HitKind[]) expect(killWith(k), k).toBe(2);
    for (const k of ['bullet', 'blast', 'knife', 'gun', 'cannon'] as HitKind[]) expect(killWith(k), k).toBe(1);
  });
});
