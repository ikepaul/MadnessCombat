// M18 co-op moves (design/coop-moves.md): every move's tests, two heroes driven by commands.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { project } from '../src/render/camera';
import { type Actor, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';
import { newBotState, partnerCommand } from '../src/dev/partnerBot';

export const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
const Z = 9.2;

function coop(x1 = -1, x2 = 1, room: RoomDef = EMPTY): { world: World; p1: Actor; p2: Actor } {
  const world = new World(room);
  const p1 = createActor('hero', x1, Z, 1);
  const p2 = createActor('hero', x2, Z, -1);
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

function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

function grunt(world: World, x: number, z = Z): Actor {
  const g = createActor('grunt', x, z, -1);
  g.ai = { cooldown: 0, ring: 2, waitZ: z, driftT: 99, ready: 0 } as never;
  world.actors.push(g);
  return g;
}

export const head = (a: Actor) => project(a.pos.x, a.pos.y + 0.79, a.pos.z);

describe('M18 partner bot', () => {
  it('fights and kills a grunt next to it', () => {
    const { world, p2 } = coop(-2.5, 0);
    const g = grunt(world, 0.5);
    const st = newBotState();
    for (let i = 0; i < 600 && g.state !== 'dead'; i++) {
      world.commands = [{ ...IDLE_COMMAND }, partnerCommand(world, p2, st)];
      world.step();
    }
    expect(g.state).toBe('dead');
  });
});

describe('M18 shared chains', () => {
  it("P1's light and P2's heavy within 0.8 s chain: the quick cross kills a 4 hp grunt", () => {
    const { world, p1, p2 } = coop(-0.45, 0.45);
    p2.facing = -1;
    const g = grunt(world, 0);
    const kills = record(world, 'kill');
    tick(world, 1, { attack: 'light', face: 1 });
    tick(world, 14);
    expect(g.hp).toBe(3);
    tick(world, 1, {}, { attack: 'heavy', face: -1 });
    tick(world, 16);
    expect(g.state).toBe('dead');
    expect(kills[0].team).toBe(true);
    expect(p1).toBeDefined();
  });
});

describe('M18 double-team', () => {
  it("both players' blows within 0.25 s kill at once; 0.4 s apart they don't", () => {
    for (const gap of [0.1, 0.4]) {
      const { world, p1 } = coop(-0.45, 0.45);
      const g = grunt(world, 0);
      g.chain = undefined;
      const fat = record(world, 'fatality');
      p1.hands[0] = newHand('pistol');
      // P1 shoots him in the body (2), P2 jabs him (1) `gap` later; chain bonuses aside he'd survive
      tick(world, 1, { press: [true, false], aim: project(0, 0.4, Z) });
      tick(world, Math.round(gap * 60) - 1);
      g.chain = undefined;
      tick(world, 1, {}, { attack: 'light', face: -1 });
      tick(world, 10);
      expect(g.state === 'dead').toBe(gap < 0.25);
      expect(fat.some((f) => f.kind === 'double')).toBe(gap < 0.25);
    }
  });
});

describe('M18 weapon pass', () => {
  it('Q with the cursor on the partner lobs the pistol into their free hand, ammo kept, past an enemy', () => {
    const { world, p1, p2 } = coop(-2, 1);
    p1.hands[0] = newHand('pistol', 5, 0);
    const g = grunt(world, -0.5);
    const hits = record(world, 'hit');
    tick(world, 1, { throwGun: true, aim: project(p2.pos.x, 0.5, Z) });
    expect(p1.hands[0]).toBeNull();
    tick(world, 60);
    expect(p2.hands[0]).toMatchObject({ item: 'pistol', ammo: 5 });
    expect(hits.some((e) => e.actorId === g.id)).toBe(false);
  });

  it('a partner with both hands full gets it at their feet', () => {
    const { world, p1, p2 } = coop(-2, 1);
    p1.hands[0] = newHand('knife');
    p2.hands = [newHand('pistol'), newHand('pistol')];
    tick(world, 1, { throwGun: true, aim: project(p2.pos.x, 0.5, Z) });
    tick(world, 90);
    const k = world.items.find((i) => i.kind === 'knife')!;
    expect(k.state).toBe('floor');
    expect(Math.abs(k.pos.x - p2.pos.x)).toBeLessThan(1);
  });
});
