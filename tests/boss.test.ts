// M8 stage-1 boss (PLAN.md, research/mechanics/boss-halo): entrance, lightning raise, ward, damage.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { project } from '../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { spawnBoss } from '../src/sim/boss';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { World } from '../src/sim/world';

const B = TUNING.boss;

function setup(heroX = 1.5, bossX = -1.5) {
  const world = new World(STAGE1.rooms.arena.room);
  const hero = createActor('hero', heroX, 9.4, -1);
  world.addPlayer(hero);
  const boss = spawnBoss(world, bossX, 9.4, 1);
  return { world, hero, boss };
}

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); }
}
const secs = (s: number) => Math.round(s * TUNING.simHz);

function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

const head = (a: Actor) => project(a.pos.x, a.pos.y + 0.79 * B.scale, a.pos.z);
const chest = (a: Actor) => project(a.pos.x, a.pos.y + 0.4 * B.scale, a.pos.z);

/** Settle him at his hover height. */
function landed(world: World) { tick(world, {}, secs(B.descend) + 2); }

describe('boss entrance', () => {
  it('floats down from above the frame in 0.67 s and settles at his hover height', () => {
    const world = new World(STAGE1.rooms.arena.room);
    world.addPlayer(createActor('hero', 1.5, 9.4, -1));
    const arrive = record(world, 'bossArrive');
    const boss = spawnBoss(world, -1.5, 9.4, 1);
    expect(boss.pos.y).toBeCloseTo(B.startHeight, 5);
    expect(project(boss.pos.x, boss.pos.y, boss.pos.z)[1]).toBeLessThan(0); // above the screen top
    tick(world, {}, secs(B.descend) - 1);
    expect(arrive.map((e) => e.phase)).toEqual(['descend']);
    tick(world, {}, 2);
    expect(arrive.map((e) => e.phase)).toEqual(['descend', 'land']);
    expect(boss.pos.y).toBeCloseTo(B.hover, 1);
    tick(world, {}, 120);
    expect(boss.pos.y).toBeGreaterThan(B.hover - B.hoverBob - 1e-6);
    expect(boss.pos.y).toBeLessThan(B.hover + B.hoverBob + 1e-6);
  });

  it('faces the nearest player and ignores gravity', () => {
    const { world, boss } = setup(-3, 0);
    landed(world);
    expect(boss.facing).toBe(-1);
    expect(boss.pos.y).toBeGreaterThan(0.05);
  });
});

describe('lightning raise', () => {
  it('telegraphs with his hand, then a bolt raises an intact corpse; at most 2 zombies at a time', () => {
    const { world, hero } = setup(3.2, -2);
    world.spawnCorpses(4);
    const casts = record(world, 'bossCast'), bolts = record(world, 'lightning'), rises = record(world, 'zombieRise');
    landed(world);
    tick(world, {}, secs(B.firstRaise) + 1);
    expect(casts).toHaveLength(1);
    expect(bolts).toHaveLength(0); // still the telegraph
    tick(world, {}, secs(B.castTime));
    expect(bolts).toHaveLength(1);
    expect(rises.filter((e) => e.phase === 'start').map((e) => e.actorId)).toEqual([bolts[0].targetId]);
    expect(bolts[0].targetId).toBe(casts[0].targetId);
    // keep the hero alive and the zombies standing: count raises over a long time
    for (let i = 0; i < secs(30); i++) { tick(world); hero.hp = hero.maxHp; }
    const zombies = world.actors.filter((a) => a.kind === 'zombie' && alive(a));
    expect(zombies.length).toBe(B.maxZombies);
    expect(bolts.length).toBe(B.maxZombies);
  });

  it("doesn't raise gibbed corpses, and casts nothing with none left", () => {
    const { world } = setup();
    world.spawnCorpses(2);
    for (const a of world.actors) if (a.corpse) a.corpse.gibbed = true;
    const casts = record(world, 'bossCast');
    landed(world);
    tick(world, {}, secs(5));
    expect(casts).toHaveLength(0);
  });
});

describe('ward and damage', () => {
  it('comes up when a gun faces him, blocks head shots from the front for ~1 s, then a window', () => {
    const { world, hero, boss } = setup();
    hero.hands[0] = newHand('pistol', 99, 0);
    const wards = record(world, 'ward'), blocked = record(world, 'wardHit'), hits = record(world, 'hit');
    landed(world);
    expect(wards.map((w) => w.up)).toEqual([true]);
    tick(world, { press: [true, false], aim: head(boss) });
    expect(blocked).toHaveLength(1);
    expect(hits).toHaveLength(0);
    expect(boss.hp).toBe(B.hp);
    tick(world, {}, secs(B.wardUp));
    expect(wards.map((w) => w.up)).toEqual([true, false]);
    // the window: a head shot lands
    tick(world, { press: [true, false], aim: head(boss) });
    expect(boss.hp).toBe(B.hp - 1);
    // and after the window it comes up again
    tick(world, {}, secs(B.wardWindow) + 1);
    expect(wards.map((w) => w.up)).toEqual([true, false, true]);
  });

  it('only head shots hurt him; body shots and punches just flash him', () => {
    const { world, hero, boss } = setup();
    landed(world);
    // no gun yet: no ward
    hero.pos.x = boss.pos.x + 0.5;
    tick(world, { attack: 'heavy', face: -1 }, 1);
    tick(world, {}, 30);
    expect(boss.hp).toBe(B.hp);
    hero.pos.x = 1.5;
    boss.boss!.window = 99; // keep the ward down for this test
    hero.hands[0] = newHand('pistol', 99, 0);
    tick(world, { press: [true, false], aim: chest(boss) });
    tick(world, {}, 20);
    expect(boss.hp).toBe(B.hp);
    for (let k = 0; k < B.hp; k++) { tick(world, { press: [true, false], aim: head(boss) }); tick(world, {}, 20); }
    expect(alive(boss)).toBe(false);
    expect(boss.corpse?.raisable).toBe(false);
    expect(world.kills).toBe(1);
  });

  it('shots from behind pass the ward', () => {
    // the hero in front draws the ward; player 2 shoots from behind (farther away, so he keeps facing the hero)
    const { world, hero, boss } = setup(0, -1.5);
    const partner = createActor('hero', -3.4, 9.4, 1);
    world.addPlayer(partner);
    partner.hands[0] = newHand('pistol', 99, 0);
    hero.hands[0] = newHand('pistol', 99, 0);
    landed(world);
    expect(boss.facing).toBe(1);
    expect(boss.boss!.ward).toBeGreaterThan(0);
    world.commands[1] = { ...IDLE_COMMAND, press: [true, false], aim: head(boss) };
    tick(world);
    expect(boss.hp).toBe(B.hp - 1);
  });

  it("can't be grabbed", () => {
    const { world, hero, boss } = setup();
    landed(world);
    hero.pos.x = boss.pos.x + 0.4;
    tick(world, { grab: true, face: -1 });
    tick(world, {}, 10);
    expect(hero.holding).toBeUndefined();
    expect(boss.grabbedBy).toBeUndefined();
  });
});
