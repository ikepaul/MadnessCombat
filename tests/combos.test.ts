// M10b acceptance (PLAN.md): juggle (max 3 jabs), wall bounce (not outdoors), pop & catch (either
// player), thrown empty gun + one heavy kills, the head punt floors the next grunt, the backward
// shot only fires at an enemy in contact behind.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { project } from '../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { disarm } from '../src/sim/melee';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';

const Z = 9.2;
const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
function setup(room: RoomDef = EMPTY, x = 0) {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}
function grunt(world: World, x: number, z = Z): Actor {
  const g = createActor('grunt', x, z, -1);
  world.actors.push(g);
  return g;
}
const at = (a: Actor) => ({ x: a.pos.x, y: a.pos.y + 0.6, z: a.pos.z });
const tick = (world: World, cmd: Partial<PlayerCommand> = {}, n = 1) => { for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); } };
const airborne = (a: Actor) => !!a.flight?.juggle && a.flight.phase === 'air';

/** Stun with a light, then uppercut: the launcher. */
function launch(world: World, hero: Actor, g: Actor) {
  world.hitActor(hero, g, 'light', 1, 0, at(g));
  world.hitActor(hero, g, 'uppercut', 1, 0, at(g));
}

describe('launcher -> juggle', () => {
  it('an uppercut on a stunned grunt launches him alive; jabs keep him up, at most 3', () => {
    const { world, hero } = setup();
    const g = grunt(world, 0.5);
    launch(world, hero, g);
    expect(alive(g)).toBe(true);
    expect(airborne(g)).toBe(true);
    const hp = g.hp;
    let t = 0;
    for (let jab = 0; jab < 5; jab++) {
      const before = g.flight!.airtime;
      tick(world, {}, 6);
      t += 6;
      world.hitActor(hero, g, 'light', 1, 0, at(g));
      expect(g.hp).toBe(hp); // jabs don't hurt
      if (jab < TUNING.juggle.maxJabs) expect(g.flight!.airtime).toBeGreaterThan(before);
      else expect(g.flight!.juggle!.jabs).toBe(TUNING.juggle.maxJabs);
    }
    void t;
  });

  it('a heavy that does not kill spikes him into the floor and he bounces once', () => {
    const { world, hero } = setup();
    const g = grunt(world, 0.5);
    g.hp = g.maxHp = 20;
    launch(world, hero, g);
    tick(world, {}, 8);
    const phases: string[] = [];
    world.events.on('juggle', (e) => phases.push(e.phase));
    world.hitActor(hero, g, 'heavy', 1, 0, at(g));
    for (let i = 0; i < 90 && g.flight; i++) tick(world);
    expect(phases).toEqual(['spike', 'bounce']);
    expect(alive(g)).toBe(true);
  });

  it('F grabs a juggled grunt out of the air; zombies are not launched', () => {
    const { world, hero } = setup();
    const g = grunt(world, 0.6);
    launch(world, hero, g);
    tick(world, {}, 4);
    tick(world, { grab: true });
    expect(hero.holding).toEqual({ kind: 'actor', id: g.id });
    const b = setup();
    const z = createActor('zombie', 0.5, Z, -1);
    b.world.actors.push(z);
    b.world.hitActor(b.hero, z, 'light', 1, 0, at(z));
    b.world.hitActor(b.hero, z, 'uppercut', 1, 0, at(z));
    expect(z.flight?.juggle).toBeUndefined();
  });
});

describe('head punt', () => {
  it('a heavy kill on a juggled grunt sends the head into the next grunt and knocks him down', () => {
    const { world, hero } = setup(EMPTY, -1);
    const g = grunt(world, -0.5);
    const next = grunt(world, 0.9);
    next.facing = -1;
    launch(world, hero, g);
    tick(world, {}, 6);
    const fat: string[] = [];
    world.events.on('fatality', (e) => fat.push(e.kind));
    world.hitActor(hero, g, 'heavy', 1, 0, at(g));
    expect(g.state).toBe('dead');
    expect(g.pose.headless).toBe(true);
    expect(fat).toEqual(['punt']);
    let floored = false;
    for (let i = 0; i < 60 && !floored; i++) { tick(world); floored = next.state === 'knockback' || next.state === 'down' || !alive(next); }
    expect(floored).toBe(true);
  });
});

describe('wall bounce', () => {
  it('a sub-lethal heavy into a wall comes back airborne, juggleable; outdoors it does not', () => {
    const inside = setup(EMPTY, 2.2);
    const g = grunt(inside.world, 3.0);
    g.hp = g.maxHp = 20;
    const bounces: number[] = [];
    inside.world.events.on('wallBounce', (e) => bounces.push(e.speed));
    inside.world.hitActor(inside.hero, g, 'heavy', 1, 0, at(g));
    for (let i = 0; i < 40 && bounces.length === 0; i++) tick(inside.world);
    expect(bounces.length).toBe(1);
    expect(g.flight?.vx ?? 0).toBeLessThan(0); // back toward the hero
    expect(airborne(g)).toBe(true);

    const out = setup({ ...EMPTY, outdoor: true }, 2.2);
    const o = grunt(out.world, 3.0);
    o.hp = o.maxHp = 20;
    let n = 0;
    out.world.events.on('wallBounce', () => n++);
    out.world.hitActor(out.hero, o, 'heavy', 1, 0, at(o));
    tick(out.world, {}, 40);
    expect(n).toBe(0);
  });
});

describe('pop & catch', () => {
  it('a knocked-out weapon goes up, and player 2 can catch it with F', () => {
    const { world, hero } = setup(EMPTY, -1);
    const p2 = createActor('hero', 0.9, Z, -1);
    world.addPlayer(p2);
    const g = grunt(world, 0.4);
    g.hands[0] = newHand('knife');
    disarm(world, hero, g, 'knock', 1);
    const it = world.items.find((i) => i.kind === 'knife')!;
    expect(it.vel.y).toBeGreaterThan(3.5);
    let caught = false;
    for (let i = 0; i < 60 && !caught; i++) {
      world.commands = [{ ...IDLE_COMMAND }, { ...IDLE_COMMAND, grab: i % 4 === 0 }];
      world.step();
      caught = p2.hands.some((h) => h?.item === 'knife');
    }
    expect(caught).toBe(true);
    expect(p2.primedAt).toBeDefined();
  });
});

describe('click -> throw -> punch', () => {
  it('a thrown empty gun to the head stuns, and one heavy then kills', () => {
    const { world, hero } = setup(EMPTY, -1);
    const g = grunt(world, 0.6);
    world.hitActor(hero, g, 'gun', 1, 0, { x: g.pos.x, y: g.pos.y + 0.8, z: Z }, 'head');
    expect(g.state).toBe('stun');
    expect(alive(g)).toBe(true);
    world.hitActor(hero, g, 'heavy', 1, 0, at(g));
    expect(g.state).toBe('dead');
  });
});

describe('over the shoulder', () => {
  function shooter(behindAt: number | undefined) {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol');
    const g = behindAt === undefined ? undefined : grunt(world, behindAt);
    if (g) g.facing = 1;
    const shots: number[] = [];
    world.events.on('shot', (e) => shots.push(e.hand));
    // aim ahead (facing right), RMB
    tick(world, { aim: project(2, 0.6, Z), press: [false, true] });
    return { world, hero, g, shots };
  }

  it('RMB shoots the enemy right behind you, in the head, without turning', () => {
    const { hero, g, shots } = shooter(-0.45);
    expect(shots).toHaveLength(1);
    expect(hero.facing).toBe(1);
    expect(g!.state).toBe('dead');
  });

  it('nobody in contact behind: no backward shot', () => {
    expect(shooter(-1.5).shots).toHaveLength(0);
    expect(shooter(undefined).shots).toHaveLength(0);
  });
});

describe('juggle with real commands (timing)', () => {
  it('stun, launch, three jabs and a heavy all land in one airtime: the head punt', () => {
    const { world } = setup(EMPTY, -0.5);
    const g = grunt(world, 0);
    const aimAt = (y: number) => project(g.pos.x + 0.05, y, Z);
    const press = (attack: 'light' | 'heavy', y: number, wait: number) => {
      world.command = { ...IDLE_COMMAND, attack, aim: aimAt(y) };
      world.step();
      for (let i = 0; i < wait; i++) { world.command = { ...IDLE_COMMAND, aim: aimAt(0.6) }; world.step(); }
    };
    const log: string[] = [];
    world.events.on('juggle', (e) => log.push(e.phase));
    world.events.on('fatality', (e) => log.push(e.kind));
    press('light', 0.6, 24);
    press('heavy', 2.6, 14); // cursor high: the uppercut
    press('light', 1.2, 14);
    press('light', 1.2, 14);
    press('light', 1.2, 14);
    press('heavy', 1.2, 20);
    expect(log).toEqual(['launch', 'jab', 'jab', 'jab', 'punt']);
    expect(g.pose.headless).toBe(true);
  });
});
