// Difficulty setting: enemies per room and boss health scale with Noob / Pro / Hacker / Notch.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { alive, createActor } from '../src/sim/actor';
import { spawnBoss } from '../src/sim/boss';
import { IDLE_COMMAND } from '../src/sim/command';
import { DIFFICULTIES, type Difficulty, spawnCount } from '../src/sim/difficulty';
import { Seq } from '../src/sim/sequencer';
import { WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

const ARENA = STAGE1.rooms.arena;

/** Wave A of the arena with a scripted kill-all: how many enemies spawned. */
function waveSpawns(difficulty: Difficulty): number {
  const world = new World(ARENA.room);
  world.difficulty = difficulty;
  const hero = createActor('hero', 0, 9.2, 1);
  world.actors.push(hero);
  world.player = hero;
  world.director = new WaveDirector(ARENA.script);
  let cleared = false, spawns = 0;
  world.events.on('roomCleared', () => (cleared = true));
  world.events.on('spawn', () => spawns++);
  for (let i = 0; i < 60 * 300 && !cleared; i++) {
    world.command = { ...IDLE_COMMAND };
    world.step();
    hero.hp = hero.maxHp;
    for (const a of world.actors) if (a.ai && alive(a) && !a.entering) world.hitActor(hero, a, 'wall', 1, 0, a.pos);
  }
  expect(cleared).toBe(true);
  return spawns;
}

describe('difficulty', () => {
  it('Pro is the room as designed; Noob halves it, Hacker and Notch add more', () => {
    const [noob, pro, hacker, notch] = DIFFICULTIES.map(waveSpawns);
    expect(pro).toBe(18);
    expect(noob).toBeLessThan(pro);
    expect(noob).toBeGreaterThanOrEqual(pro * 0.4);
    expect(hacker).toBeGreaterThan(pro);
    expect(notch).toBeGreaterThanOrEqual(pro * 2.2);
  });

  it('spreads the copies evenly and keeps the first enemy on Noob', () => {
    const world = new World(ARENA.room);
    world.difficulty = 'noob';
    expect(spawnCount(world, 0)).toBe(1);
    world.difficulty = 'notch';
    const ten = Array.from({ length: 10 }, (_, i) => spawnCount(world, i)).reduce((a, b) => a + b);
    expect(ten).toBe(25);
  });

  it('scripted fights get extra copies on Notch, never fewer on Noob', () => {
    for (const [d, n] of [['noob', 2], ['pro', 2], ['notch', 5]] as const) {
      const world = new World(ARENA.room);
      world.difficulty = d;
      const s = new Seq(world);
      s.spawn('grunt', null, 2, 9.2);
      s.spawn('grunt', null, -2, 9.2);
      expect(world.actors.filter((a) => a.ai).length).toBe(n);
    }
  });

  it('boss and mini-boss health scale, Notch the most', () => {
    const hp = (d: Difficulty) => {
      const world = new World(ARENA.room);
      world.difficulty = d;
      const boss = spawnBoss(world, 0, 9.4, 1).maxHp;
      const riot = new Seq(world).spawn('grunt', null, 0, 9.4, { variant: 'riot' }).maxHp;
      return { boss, riot };
    };
    expect(hp('pro')).toEqual({ boss: TUNING.boss.hp, riot: TUNING.ai.riotHp });
    expect(hp('noob').riot).toBeLessThan(TUNING.ai.riotHp);
    expect(hp('hacker').boss).toBeGreaterThan(TUNING.boss.hp);
    expect(hp('notch').boss).toBeGreaterThanOrEqual(TUNING.boss.hp * 3);
    expect(hp('notch').riot).toBeGreaterThanOrEqual(TUNING.ai.riotHp * 3);
  });
});
