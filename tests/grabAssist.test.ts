// Playtest 2026-10-27: grabs aren't so precise. F takes the nearest target within a radius on
// either side (living enemies first), and an F pressed during a move comes out when it ends.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { type Actor, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { World } from '../src/sim/world';

const Z = 9.2;
function setup() {
  const world = new World({ ...TEST_ROOM, props: [] });
  const hero = createActor('hero', 0, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}
function grunt(world: World, x: number, z = Z, dead = false): Actor {
  const g = createActor('grunt', x, z, -1, dead ? { dead: true } : {});
  if (dead) g.corpse = { phase: 'settled', t: 0, raisable: true, gibbed: false, slumped: false };
  world.actors.push(g);
  return g;
}
function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1) {
  for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); }
}

describe('grab assist', () => {
  it('grabs an enemy behind you and turns to it', () => {
    const { world, hero } = setup();
    const g = grunt(world, -0.9);
    tick(world, { grab: true });
    expect(hero.holding).toEqual({ kind: 'actor', id: g.id });
    expect(hero.facing).toBe(-1);
  });

  it('reaches a little across depth, but not beyond the radius', () => {
    const { world, hero } = setup();
    const near = grunt(world, 0.7, Z + 0.35);
    tick(world, { grab: true });
    expect(hero.holding).toEqual({ kind: 'actor', id: near.id });
    const b = setup();
    grunt(b.world, TUNING.grab.assistRadius + 0.3);
    tick(b.world, { grab: true });
    expect(b.hero.holding).toBeUndefined();
  });

  it('a living enemy comes before a nearer body', () => {
    const { world, hero } = setup();
    grunt(world, 0.3, Z, true);
    const live = grunt(world, 0.95);
    tick(world, { grab: true });
    expect(hero.holding).toEqual({ kind: 'actor', id: live.id });
  });

  it('never grabs your co-op partner', () => {
    const { world, hero } = setup();
    world.addPlayer(createActor('hero', 0.5, Z, -1));
    tick(world, { grab: true });
    expect(hero.holding).toBeUndefined();
  });

  it('F pressed during a punch grabs as soon as the punch ends', () => {
    const { world, hero } = setup();
    const g = grunt(world, 1.0);
    tick(world, { attack: 'light', face: 1 });
    expect(hero.state).toBe('attack');
    tick(world, {}, 12);
    tick(world, { grab: true });
    let held = false;
    for (let i = 0; i < 40 && !held; i++) { tick(world); held = hero.holding?.id === g.id || g.state === 'grabbed'; }
    expect(held).toBe(true);
  });
});
