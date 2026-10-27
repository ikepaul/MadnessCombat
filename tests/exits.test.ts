// Playtest 2026-10-27: vent exits read as what they are (crawl into a wall vent, leap up into a
// ceiling one) and the HUD knows when E would take an exit.
import { describe, expect, it } from 'vitest';
import { STAGE2 } from '../src/data/stages/stage2';
import { STAGE3 } from '../src/data/stages/stage3';
import { createActor } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import { type StageDef, stageRunner, usableExitAt } from '../src/sim/stage';
import { World } from '../src/sim/world';

function at(def: StageDef, room: string, entry: string, x: number, z: number) {
  const world = new World(def.rooms[room].room);
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  world.seq.run(stageRunner(def, room, entry), 'stage');
  for (let i = 0; i < 3; i++) world.step();
  for (const a of world.actors) if (a !== hero) a.invulnerable = true;
  hero.invulnerable = true;
  hero.pos.x = x;
  hero.pos.z = z;
  world.step();
  return { world, hero };
}

function pressE(world: World, hero: ReturnType<typeof createActor>) {
  for (let i = 0; i < 30 && !hero.traversing; i++) {
    world.command = { ...IDLE_COMMAND, pickup: i % 2 === 0 };
    world.step();
  }
  return hero.traversing?.kind;
}

describe('vent exits', () => {
  it('stage 3 outside: the wall vent shows the prompt and is crawled into', () => {
    const { world, hero } = at(STAGE3, 'outside', 'west', 2.7, 10.1);
    expect(usableExitAt(world, hero)?.id).toBe('vent');
    expect(pressE(world, hero)).toBe('crawlIn');
  });

  it('stage 2 crates: the ceiling vent is a leap up', () => {
    const { world, hero } = at(STAGE2, 'crates', 'lift', -2.3, 9.0);
    expect(usableExitAt(world, hero)?.id).toBe('vent');
    expect(pressE(world, hero)).toBe('leap');
  });

  it('no prompt away from an exit', () => {
    const { world, hero } = at(STAGE3, 'outside', 'west', -1.0, 9.0);
    expect(usableExitAt(world, hero)).toBeUndefined();
  });
});
