// Playtest 2026-10-27: crawl on the belly and while downed; shoot from prone.
import { describe, expect, it } from 'vitest';
import { PRONE_ARC, aimRig } from '../src/anim/aim';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { WEAPONS } from '../src/data/weapons';
import { project, scaleAt } from '../src/render/camera';
import { createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { enter } from '../src/sim/combat';
import { World } from '../src/sim/world';

const Z = 9.2;
function proneHero(x = 0) {
  const world = new World({ ...TEST_ROOM, props: [] });
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  world.command = { ...IDLE_COMMAND, dive: true };
  world.step();
  for (let i = 0; i < 20 && hero.body.state !== 'prone'; i++) { world.command = { ...IDLE_COMMAND }; world.step(); }
  expect(hero.body.state).toBe('prone');
  return { world, hero };
}
const tick = (world: World, cmd: Partial<PlayerCommand>, n = 1) => { for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); } };

describe('prone', () => {
  it('crawls on the belly, slowly, and stays down', () => {
    const { world, hero } = proneHero();
    const x0 = hero.pos.x;
    tick(world, { moveX: 1 }, 60);
    expect(hero.body.state).toBe('prone');
    expect(hero.pos.x - x0).toBeCloseTo(TUNING.prone.crawlSpeed, 1);
    expect(hero.body.height).toBeLessThan(0.5);
  });

  it('shoots from the belly and hits the grunt ahead', () => {
    const { world, hero } = proneHero(-1.5);
    hero.hands[0] = newHand('pistol');
    const g = createActor('grunt', 1.0, Z, -1);
    world.actors.push(g);
    const aim = project(1.0, 0.4, Z);
    tick(world, { aim }, 2);
    tick(world, { aim, press: [true, false] });
    tick(world, { aim }, 5);
    expect(g.state).not.toBe('free');
  });

  it("can't aim behind or into the floor while prone", () => {
    const { hero } = proneHero();
    const foot = project(hero.pos.x, 0, Z), s = scaleAt(Z);
    const behind = aimRig(foot, s, 1, 0, project(hero.pos.x - 2, 0.3, Z), WEAPONS.pistol, 0, hero.pose.root);
    expect(behind.flip).toBe(false);
    expect(behind.angle).toBeGreaterThanOrEqual(PRONE_ARC[0]);
    expect(behind.angle).toBeLessThanOrEqual(PRONE_ARC[1]);
  });
});

describe('downed (co-op)', () => {
  it('drags himself along while waiting for a revive', () => {
    const world = new World({ ...TEST_ROOM, props: [] });
    const a = createActor('hero', 0, Z, 1), b = createActor('hero', 2, Z, -1);
    world.addPlayer(a);
    world.addPlayer(b);
    enter(a, 'downed');
    const x0 = a.pos.x;
    for (let i = 0; i < 60; i++) { world.commands = [{ ...IDLE_COMMAND, moveX: -1 }, { ...IDLE_COMMAND }]; world.step(); }
    expect(a.state).toBe('downed');
    expect(x0 - a.pos.x).toBeCloseTo(TUNING.prone.downedCrawlSpeed, 1);
  });
});
