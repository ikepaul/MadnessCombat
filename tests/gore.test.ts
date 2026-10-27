// Extreme gore (playtest 2026-10-27, stage 3): which kills gib or take the head, hands, stains.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { STAGE3 } from '../src/data/stages/stage3';
import { createActor, newHand } from '../src/sim/actor';
import { explode } from '../src/sim/explosives';
import { World } from '../src/sim/world';

function setup(gore: World['gore']) {
  const world = new World({ ...TEST_ROOM, props: [] });
  world.gore = gore;
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  const g = createActor('grunt', 1.0, 9.2, -1);
  world.actors.push(g);
  return { world, hero, g };
}
const chestOf = (a: ReturnType<typeof createActor>) => ({ x: a.pos.x, y: a.pos.y + 0.4, z: a.pos.z });

describe('gore', () => {
  it('stage 3 is extreme', () => {
    expect(STAGE3.gore).toBe('extreme');
  });

  it('extreme: a close shotgun kill gibs, a head shot takes the head', () => {
    const a = setup('extreme');
    a.hero.hands[0] = newHand('shotgun');
    a.world.hitBullet(a.hero, a.g, 99, 'body', 1, false, chestOf(a.g));
    expect(a.g.corpse?.gibbed).toBe(true);
    const b = setup('extreme');
    b.hero.hands[0] = newHand('pistol');
    b.world.hitBullet(b.hero, b.g, 99, 'head', 1, false, chestOf(b.g));
    expect(b.g.pose.headless).toBe(true);
  });

  it('normal: the same shots just kill', () => {
    const a = setup('normal');
    a.hero.hands[0] = newHand('shotgun');
    a.world.hitBullet(a.hero, a.g, 99, 'body', 1, false, chestOf(a.g));
    expect(a.g.state).toBe('dead');
    expect(a.g.corpse?.gibbed).toBe(false);
    const b = setup('normal');
    b.hero.hands[0] = newHand('pistol');
    b.world.hitBullet(b.hero, b.g, 99, 'head', 1, false, chestOf(b.g));
    expect(b.g.pose.headless).toBe(false);
    expect(b.g.pose.lostHands).toBeUndefined();
  });

  it('extreme: a grenade gibs the living next to it', () => {
    const { world, g } = setup('extreme');
    world.events.on('gib', () => {});
    explode(world, { x: g.pos.x, y: 0.1, z: g.pos.z }, undefined);
    expect(g.corpse?.gibbed).toBe(true);
  });

  it('extreme: corpses lose hands over many kills, the killer up close gets bloody', () => {
    let lost = 0;
    const { world, hero } = setup('extreme');
    for (let i = 0; i < 40; i++) {
      const g = createActor('grunt', 1.0, 9.2, -1);
      world.actors.push(g);
      world.hitActor(hero, g, 'heavy', 1, 0, chestOf(g));
      world.hitActor(hero, g, 'heavy', 1, 0, chestOf(g));
      if (g.pose.lostHands) lost++;
    }
    const stain = hero.pose.stain ?? 0;
    expect(lost).toBeGreaterThan(8);
    expect(lost).toBeLessThan(32);
    expect(stain).toBeGreaterThan(0);
  });
});
