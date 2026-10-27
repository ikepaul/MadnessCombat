// M19 rage meter and solo rage fatalities (design/rage.md).
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { project } from '../src/render/camera';
import { type Actor, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { addKill, killType } from '../src/sim/rage';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';

export const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
const Z = 9.2;

function setup(x = -1): { world: World; hero: Actor } {
  const world = new World(EMPTY);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) {
    world.command = { ...IDLE_COMMAND, ...cmd };
    world.step();
  }
}

function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

export function grunt(world: World, x: number, z = Z): Actor {
  const g = createActor('grunt', x, z, -1);
  g.ai = { cooldown: 0, ring: 2, waitZ: z, driftT: 99, ready: 0 } as never;
  world.actors.push(g);
  return g;
}

describe('M19 kill types', () => {
  it('maps every rule', () => {
    expect(killType('light')).toBe('fists');
    expect(killType('heavy', { via: 'kick' })).toBe('kick');
    expect(killType('sweep')).toBe('kick');
    expect(killType('finisher')).toBe('stomp');
    expect(killType('body')).toBe('toss');
    expect(killType('wall')).toBe('toss');
    expect(killType('slash')).toBe('blade');
    expect(killType('stab')).toBe('blade');
    expect(killType('smash')).toBe('blunt');
    expect(killType('knife')).toBe('thrown');
    expect(killType('gun')).toBe('thrown');
    expect(killType('bullet')).toBe('gun');
    expect(killType('blast')).toBe('boom');
    expect(killType('takedown')).toBe('stealth');
    expect(killType('pin')).toBe('env');
    expect(killType('bullet', { juggled: true })).toBe('air');
    expect(killType('bullet', { via: 'style' })).toBe('style');
    expect(killType('bullet', { team: true, via: 'style' })).toBe('team');
  });

  it('a punch kill is fists, a shot kill gun', () => {
    const { world, hero } = setup(-0.45);
    const g = grunt(world, 0);
    g.hp = 1;
    const kills = record(world, 'kill');
    tick(world, { attack: 'light', face: 1 });
    tick(world, {}, 12);
    expect(kills[0].type).toBe('fists');
    hero.hands[0] = newHand('pistol');
    const g2 = grunt(world, 1.5);
    tick(world, { press: [true, false], aim: project(g2.pos.x, 0.79, Z) });
    expect(kills[1].type).toBe('gun');
  });
});

describe('M19 rage gain', () => {
  const values = (types: Parameters<typeof addKill>[2][]) => {
    const { world, hero } = setup();
    return types.map((t) => { const v = hero.rage?.value ?? 0; addKill(world, hero, t); return +((hero.rage!.value - v).toFixed(3)); });
  };

  it('gun, gun: only the first counts (the user\'s example)', () => {
    expect(values(['gun', 'gun'])).toEqual([0.1, 0]);
  });

  it('gun, fists, gun: the third is in the last 2', () => {
    expect(values(['gun', 'fists', 'gun'])).toEqual([0.1, 0.15, 0]);
  });

  it('a varied streak grows to 25%; a repeat resets it', () => {
    expect(values(['gun', 'fists', 'thrown', 'gun', 'stomp', 'stomp', 'blade'])).toEqual([0.1, 0.15, 0.2, 0.25, 0.25, 0, 0.05]); // the last one hits the cap (0.95 + 0.1)
  });

  it('style and team kills give +5%; capped at 1 with rageReady once', () => {
    expect(values(['style', 'team'])).toEqual([0.15, 0.2]);
    const { world, hero } = setup();
    const ready = record(world, 'rageReady');
    for (const t of ['gun', 'fists', 'thrown', 'stomp', 'blade', 'kick', 'boom', 'toss'] as const) addKill(world, hero, t);
    expect(hero.rage!.value).toBe(1);
    expect(ready).toHaveLength(1);
  });

  it('kills by enemies give nothing; a grenade killing three gives the type + 2 x multi', () => {
    const { world, hero } = setup(-3);
    const a = grunt(world, 0.5), b = grunt(world, 0.8), c = grunt(world, 1.1);
    world.hitActor(a, b, 'heavy', 1, 0, b.pos);
    b.hp = 0;
    world.hitActor(a, b, 'light', 1, 0, b.pos);
    expect(hero.rage?.value ?? 0).toBe(0);
    for (const o of [a, c]) world.hitActor(hero, o, 'blast', 1, 0, o.pos);
    expect(hero.rage!.value).toBeCloseTo(0.13, 5);
  });
});
