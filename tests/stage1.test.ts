// M8 stage 1 script (PLAN.md): the intro beat, and the stage running headless to its end card
// with a scripted bot (sequencer + waves don't deadlock).
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { INTRO, stage1 } from '../src/data/stages/stage1Script';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { World } from '../src/sim/world';

function setup() {
  const world = new World(STAGE1.rooms.arena.room);
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  world.seq.run(stage1);
  return { world, hero };
}

const npc = (world: World, v: Actor['variant']) => world.actors.find((a) => a.variant === v)!;

/** Walk up to `t` on its depth and jab it whenever in reach: real inputs, like a player. */
function brawl(hero: Actor, t: Actor, tick: number): PlayerCommand {
  const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z, face = (dx >= 0 ? 1 : -1) as 1 | -1;
  const inReach = Math.abs(dx) <= TUNING.melee.range - 0.1 && Math.abs(dz) <= TUNING.melee.depthBand * 0.5;
  if (inReach) return { ...IDLE_COMMAND, face, attack: hero.state === 'free' && tick % 6 === 0 ? 'light' : null };
  const d = Math.hypot(dx, dz);
  return { ...IDLE_COMMAND, face, moveX: dx / d, moveZ: dz / d };
}

describe('stage 1 intro', () => {
  it('places the boombox NPC with his boombox and the dancer, and holds the hero during the title card', () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox'), dancer = npc(world, 'dancer');
    expect(bb.carry).toBe('boombox');
    expect(bb.ai).toBeUndefined();
    expect(dancer.ai).toBeUndefined();
    expect(hero.pos.x).toBeCloseTo(INTRO.hero.x, 5);
    world.command = { ...IDLE_COMMAND, moveX: 1 };
    for (let i = 0; i < 60; i++) world.step();
    expect(hero.pos.x).toBeCloseTo(INTRO.hero.x, 5); // the title card is up
  });

  it('walking up to the music gets you punched flat; you get up and take him out; the boombox drops', () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox');
    let knocked = false, hpAfterPunch = -1;
    for (let i = 0; i < 60 * 20 && alive(bb); i++) {
      world.command = brawl(hero, bb, i);
      world.step();
      hero.hp = Math.max(hero.hp, 1); // the bot never dies here; we look at the punch, not the bot's skill
      if (!knocked && hero.state === 'knockback') { knocked = true; hpAfterPunch = hero.hp; }
    }
    expect(knocked).toBe(true);
    expect(hpAfterPunch).toBe(hero.maxHp - 1);
    expect(alive(bb)).toBe(false);
    expect(world.kills).toBe(1);
    for (let i = 0; i < 60; i++) world.step();
    expect(bb.carry).toBeUndefined();
    const box = world.items.find((it) => it.kind === 'boombox');
    expect(box?.state).toBe('floor');
  });

  it("the boombox can't be picked up into a hand", () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox');
    world.hitActor(hero, bb, 'wall', 1, 0, bb.pos);
    for (let i = 0; i < 90; i++) world.step();
    const box = world.items.find((it) => it.kind === 'boombox')!;
    hero.pos = { ...hero.pos, x: box.pos.x, z: box.pos.z };
    world.command = { ...IDLE_COMMAND, pickup: true };
    world.step();
    expect(hero.hands[0]).toBeNull();
    expect(world.items.includes(box)).toBe(true);
  });
});

describe('stage 1 headless', () => {
  it('runs from the intro through wave A to the end card without deadlocking', () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox');
    const cleared: number[] = [], waves: string[] = [], music: (string | null)[] = [];
    world.events.on('roomCleared', (e) => cleared.push(e.kills));
    world.events.on('waveStart', (e) => waves.push(e.wave));
    world.events.on('music', (e) => music.push(e.cue));
    for (let i = 0; i < 60 * 240 && cleared.length === 0; i++) {
      // the bot: brawl the boombox NPC, then "kill all" whoever walks on screen (as in the M3 wave test)
      world.command = alive(bb) ? brawl(hero, bb, i) : { ...IDLE_COMMAND };
      world.step();
      hero.hp = hero.maxHp;
      if (!alive(bb)) for (const a of world.actors) if (a.ai && alive(a) && !a.entering) world.hitActor(hero, a, 'wall', 1, 0, a.pos);
    }
    expect(waves).toEqual(['A']);
    expect(music).toEqual(['riot']);
    // the boombox NPC + wave A's 18 grunts; the dancer lives
    expect(cleared).toEqual([1 + 18]);
    expect(alive(npc(world, 'dancer'))).toBe(true);
    expect(world.seq.busy).toBe(false);
  });
});
