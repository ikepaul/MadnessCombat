// Playtest 2026-10-27: dive in mid-air = a flying kick.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { createActor } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import { World } from '../src/sim/world';

function setup(enemyX?: number) {
  const world = new World({ ...TEST_ROOM, props: [] });
  const hero = createActor('hero', -2, 9.2, 1);
  world.addPlayer(hero);
  const g = enemyX === undefined ? undefined : createActor('grunt', enemyX, 9.2, -1);
  if (g) world.actors.push(g);
  // jump, then dive near the top of it
  world.command = { ...IDLE_COMMAND, jump: true, face: 1 };
  world.step();
  world.command = { ...IDLE_COMMAND, face: 1 };
  for (let i = 0; i < 12; i++) world.step();
  world.command = { ...IDLE_COMMAND, dive: true, face: 1 };
  world.step();
  world.command = { ...IDLE_COMMAND, face: 1 };
  return { world, hero, g };
}

describe('flying kick', () => {
  it('a dive in the air lunges forward with the foot out and lands on its feet', () => {
    const { world, hero } = setup();
    expect(hero.body.kick).toBe(true);
    expect(hero.pose.clip).toBe('kick');
    const x0 = hero.pos.x;
    for (let i = 0; i < 60 && hero.body.state === 'air'; i++) world.step();
    expect(hero.body.state).toBe('ground');
    expect(hero.body.kick).toBe(false);
    expect(hero.pos.x - x0).toBeGreaterThan(0.8);
  });

  it('knocks down the first enemy it meets and bounces off', () => {
    const { world, hero, g } = setup(-0.6);
    let hit = false;
    for (let i = 0; i < 60 && hero.body.state === 'air'; i++) { world.step(); if (g!.state !== 'free') hit = true; }
    expect(hit).toBe(true);
    expect(['knockback', 'down', 'dead']).toContain(g!.state);
    expect(hero.pos.x).toBeLessThan(g!.pos.x);
  });

  it('a dive on the ground is still a dive', () => {
    const world = new World({ ...TEST_ROOM, props: [] });
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    world.command = { ...IDLE_COMMAND, dive: true, moveX: 1 };
    world.step();
    expect(hero.body.state).toBe('diving');
    expect(hero.body.kick).toBeFalsy();
  });
});
