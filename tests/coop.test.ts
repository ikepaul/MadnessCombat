// Co-op milestone (PLAN.md M4b): two heroes, grunts fight the nearest standing player with
// attack tokens per player, a hero out of lives goes down in a revive circle, a teammate
// standing in it for 5 s revives them, stepping out drains it fast.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { gruntBrain, newAiState } from '../src/sim/ai';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

const ARENA = STAGE1.rooms.arena;

function coop(x1 = -1, x2 = 1): { world: World; p1: Actor; p2: Actor } {
  const world = new World(ARENA.room);
  const p1 = createActor('hero', x1, 9.2, 1);
  const p2 = createActor('hero', x2, 9.2, -1);
  world.addPlayer(p1);
  world.addPlayer(p2);
  return { world, p1, p2 };
}

function tick(world: World, n = 1, c1: Partial<PlayerCommand> = {}, c2: Partial<PlayerCommand> = {}): void {
  for (let i = 0; i < n; i++) {
    world.commands = [{ ...IDLE_COMMAND, ...c1 }, { ...IDLE_COMMAND, ...c2 }];
    world.step();
  }
}

function grunt(world: World, x: number, z = 9.2): Actor {
  const g = createActor('grunt', x, z, -1);
  g.ai = newAiState(world);
  g.brain = gruntBrain(world);
  world.actors.push(g);
  return g;
}

/** Take a hero out of lives the way a grunt would, knocked toward `dir` (away from the teammate). */
function knockOut(world: World, p: Actor, dir: 1 | -1 = -1): void {
  p.hp = 1;
  world.hitActor(undefined, p, 'heavy', dir, 0, p.pos);
}

describe('two players', () => {
  it('each hero follows its own commands', () => {
    const { world, p1, p2 } = coop();
    tick(world, 30, { moveX: -1 }, { moveX: 1 });
    expect(p1.pos.x).toBeLessThan(-1.3);
    expect(p2.pos.x).toBeGreaterThan(1.3);
    expect(p1.playerIndex).toBe(0);
    expect(p2.playerIndex).toBe(1);
  });

  it('a kill heals the hero who made it, not the other one', () => {
    const { world, p1, p2 } = coop();
    p1.hp = 1;
    p2.hp = 1;
    const g = grunt(world, 2);
    g.hp = 1;
    world.hitActor(p2, g, 'light', 1, 0, g.pos);
    expect(p2.hp).toBe(2);
    expect(p1.hp).toBe(1);
  });
});

describe('grunt AI in co-op', () => {
  it('each grunt fights the nearest standing player', () => {
    const { world, p1, p2 } = coop(-2, 2);
    const left = grunt(world, -2.8), right = grunt(world, 2.8);
    tick(world, 2);
    expect(left.ai!.target).toBe(p1.id);
    expect(right.ai!.target).toBe(p2.id);
  });

  it('attack tokens are per player: at most 2 on each, never more than 3 swinging at one player', () => {
    const { world, p1, p2 } = coop(-1.5, 1.5);
    world.director = new WaveDirector(ARENA.script);
    let mostOnOne = 0;
    for (let i = 0; i < 60 * 40; i++) {
      tick(world);
      for (const p of [p1, p2]) { p.hp = p.maxHp; }
      for (const p of [p1, p2]) {
        const on = [...world.tokens].filter((id) => world.actorById(id)?.ai?.target === p.id).length;
        mostOnOne = Math.max(mostOnOne, on);
      }
    }
    expect(mostOnOne).toBeLessThanOrEqual(TUNING.ai.maxAttackers);
    expect(world.tokens.size).toBeLessThanOrEqual(2 * TUNING.ai.maxAttackers);
  });

  it('grunts leave a downed hero alone and go for the other one', () => {
    const { world, p1, p2 } = coop(-1, 1);
    const g = grunt(world, -1.6);
    tick(world, 2);
    expect(g.ai!.target).toBe(p1.id);
    knockOut(world, p1);
    tick(world, 60);
    expect(p1.state).toBe('downed');
    expect(g.ai!.target).toBe(p2.id);
  });

  it('co-op wave A brings 27 grunts, 6 alive at most', () => {
    const { world, p1, p2 } = coop();
    world.director = new WaveDirector(ARENA.script);
    let most = 0, spawns = 0;
    world.events.on('spawn', () => spawns++);
    for (let i = 0; i < 60 * 200 && world.director.state !== 'done'; i++) {
      tick(world);
      p1.hp = p2.hp = 3;
      const enemies = world.actors.filter((a) => a.ai && alive(a));
      most = Math.max(most, enemies.length);
      for (const a of enemies) if (!a.entering && world.tick % 30 === 0) world.hitActor(p1, a, 'wall', 1, 0, a.pos);
    }
    expect(spawns).toBe(27);
    expect(most).toBeLessThanOrEqual(6);
  });
});

describe('down and revive (decided: stand in the circle for 5 s)', () => {
  it('a hero out of lives goes down instead of dying while the teammate stands', () => {
    const { world, p1 } = coop();
    let downs = 0;
    world.events.on('playerDown', () => downs++);
    knockOut(world, p1);
    tick(world, 60);
    expect(p1.state).toBe('downed');
    expect(downs).toBe(1);
    // nobody can hurt a downed hero
    world.hitActor(undefined, p1, 'heavy', 1, 0, p1.pos);
    expect(p1.state).toBe('downed');
  });

  it('alone (single player), running out of lives still kills', () => {
    const world = new World(ARENA.room);
    const p = createActor('hero', 0, 9.2, 1);
    world.addPlayer(p);
    knockOut(world, p);
    expect(p.state).toBe('dead');
  });

  it('when the last standing hero runs out too, nobody is left standing (the room restarts)', () => {
    const { world, p1, p2 } = coop();
    knockOut(world, p1);
    tick(world, 60);
    knockOut(world, p2);
    expect(p2.state).toBe('dead');
    expect(world.activePlayers).toHaveLength(0);
  });

  it('standing in the circle for 5 s revives with 1 life', () => {
    const { world, p1, p2 } = coop(-1, 1);
    knockOut(world, p1);
    tick(world, 60);
    p2.pos = { x: p1.pos.x + 0.4, y: 0, z: p1.pos.z };
    let revived = -1;
    world.events.on('revive', () => (revived = world.time));
    const start = world.time;
    tick(world, 60 * 6);
    expect(revived - start).toBeGreaterThan(TUNING.coop.reviveTime - 1 / 30);
    expect(revived - start).toBeLessThan(TUNING.coop.reviveTime + 1 / 30);
    expect(p1.hp).toBe(TUNING.coop.reviveHp);
    expect(p1.state).toBe('free');
  });

  it('stepping out of the circle drains the bar quickly', () => {
    const { world, p1, p2 } = coop(-1, 1);
    knockOut(world, p1);
    tick(world, 60);
    p2.pos = { x: p1.pos.x + 0.4, y: 0, z: p1.pos.z };
    tick(world, 60 * 3);
    expect(p1.revive!).toBeCloseTo(3 / TUNING.coop.reviveTime, 1);
    p2.pos = { x: p1.pos.x + 2, y: 0, z: p1.pos.z };
    tick(world, 60 * TUNING.coop.reviveDrain);
    expect(p1.revive).toBe(0);
    expect(p1.state).toBe('downed');
  });
});
