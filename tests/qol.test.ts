// M17 quality-of-life pass (design/qol-pass.md): auto pickup into the empty hand, one pickup plan
// for the sim and the prompt, smart swap and hold E + click, catching.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { THROWN } from '../src/data/melee';
import { WEAPONS } from '../src/data/weapons';
import { project } from '../src/render/camera';
import { type Actor, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { pickupPlan } from '../src/sim/guns';
import type { ItemKind } from '../src/sim/items';
import { disarm, tossHeld } from '../src/sim/melee';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';

const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
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

function floor(world: World, kind: ItemKind, x: number, ammo?: number, spare?: number) {
  const it = world.spawnItem(kind, 'grunt', { x, y: 0, z: Z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  if (ammo !== undefined) it.ammo = ammo;
  if (spare !== undefined) it.spare = spare;
  return it;
}

function grunt(world: World, x: number, held?: ReturnType<typeof newHand>): Actor {
  const g = createActor('grunt', x, Z, -1);
  g.ai = { cooldown: 0, ring: 2, waitZ: Z, driftT: 99, ready: 0 } as never;
  if (held) g.hands[0] = held;
  world.actors.push(g);
  return g;
}

describe('M17 auto pickup into the empty hand', () => {
  it('walking over a loaded SMG with a pistol in hand fills the other hand', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol');
    floor(world, 'smg', -0.6);
    tick(world, { moveX: 1 }, 30);
    expect(hero.hands.map((h) => h?.item)).toEqual(['pistol', 'smg']);
  });

  it('an empty gun is not taken with one hand full, nor with both empty; E still takes it', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol');
    floor(world, 'smg', -0.6, 0, 0);
    tick(world, { moveX: 1 }, 12);
    expect(hero.hands[1]).toBeNull();
    const b = setup();
    floor(b.world, 'pistol', -0.6, 0, 0);
    tick(b.world, { moveX: 1 }, 12);
    expect(b.hero.hands[0]).toBeNull();
    tick(b.world, { pickup: true });
    expect(b.hero.hands[0]?.item).toBe('pistol');
  });

  it('a melee weapon is not walked into the second hand', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol');
    floor(world, 'bat', -0.6);
    tick(world, { moveX: 1 }, 30);
    expect(hero.hands[1]).toBeNull();
  });

  it('your own thrown gun is not picked up again within 1 s', () => {
    const { world, hero } = setup();
    tick(world, {}, 60);
    const gun = floor(world, 'pistol', hero.pos.x + 0.1, 5, 0);
    gun.ownedBy = hero.id;
    gun.ownedAt = world.time - 0.5;
    tick(world);
    expect(hero.hands[0]).toBeNull();
    gun.ownedAt = world.time - 1.1;
    tick(world);
    expect(hero.hands[0]?.item).toBe('pistol');
  });
});

describe('M17 one pickup plan', () => {
  it('a free hand takes; both full swaps the empty gun first, else the emptier one', () => {
    const { world, hero } = setup();
    floor(world, 'rifle', hero.pos.x + 0.2);
    hero.hands = [newHand('pistol'), null];
    expect(pickupPlan(world, hero)).toMatchObject({ verb: 'take', hand: 1 });
    hero.hands = [newHand('pistol'), newHand('smg', 0, 0)];
    expect(pickupPlan(world, hero)).toMatchObject({ verb: 'swap', hand: 1 });
    hero.hands = [newHand('pistol', 2, 0), newHand('smg')];
    expect(pickupPlan(world, hero)).toMatchObject({ verb: 'swap', hand: 0 });
  });

  it('the sign takes both hands; a stuck knife is a pull; a grenade goes in the pocket', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('pistol'), newHand('smg')];
    const sign = floor(world, 'sign', hero.pos.x + 0.2);
    expect(pickupPlan(world, hero)).toMatchObject({ verb: 'swap', hand: 'both' });
    world.items = world.items.filter((i) => i !== sign);
    floor(world, 'grenade', hero.pos.x + 0.2);
    hero.hands = [null, null];
    expect(pickupPlan(world, hero)?.verb).toBe('pocket');
  });
});

describe('M17 smart swap and hold E + click', () => {
  it('tap E swaps the smart pick on release', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('pistol'), newHand('smg', 0, 0)];
    floor(world, 'rifle', hero.pos.x + 0.2);
    tick(world, { pickup: true, useHeld: true });
    expect(hero.hands[1]?.item).toBe('smg');
    tick(world, { useHeld: false });
    expect(hero.hands.map((h) => h?.item)).toEqual(['pistol', 'rifle']);
  });

  it('hold E + RMB swaps hand 1 and fires nothing; the click does not punch either', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('pistol'), newHand('pistol', 3, 0)];
    floor(world, 'smg', hero.pos.x + 0.2);
    const shots = record(world, 'shot');
    tick(world, { pickup: true, useHeld: true });
    tick(world, { useHeld: true }, 5);
    // the smart pick would be hand 1 (3 rounds); choose hand 0 with LMB
    tick(world, { useHeld: true, press: [true, false], attack: 'light' });
    expect(hero.hands.map((h) => h?.item)).toEqual(['smg', 'pistol']);
    expect(shots).toHaveLength(0);
    tick(world, { useHeld: false });
    expect(hero.hands.map((h) => h?.item)).toEqual(['smg', 'pistol']);
  });
});

describe('M17 catching', () => {
  it('the F window is 0.25 s', () => {
    expect(THROWN.catchWindow).toBe(0.25);
  });

  it('a weapon popped out of a grunt drops into a free hand without F', () => {
    const { world, hero } = setup(-0.45);
    const g = grunt(world, 0.05, newHand('bat'));
    hero.hands[0] = newHand('pistol');
    disarm(world, hero, g, 'knock', 1);
    const catches = record(world, 'catch');
    tick(world, {}, 60);
    expect(catches).toHaveLength(1);
    expect(hero.hands[1]?.item).toBe('bat');
  });

  it('an enemy knife still needs F', () => {
    const { world, hero } = setup(-1);
    const g = grunt(world, 2, newHand('knife'));
    tossHeld(world, g, 0, project(hero.pos.x, 0.4, Z));
    const hits = record(world, 'hit');
    tick(world, {}, 40);
    expect(hits.some((e) => e.actorId === hero.id)).toBe(true);
    expect(hero.hands[0]).toBeNull();
  });

  it('your own loaded gun coming back off the wall is caught without F; an empty one is not', () => {
    for (const ammo of [4, 0]) {
      const { world, hero } = setup(2.6);
      hero.hands = [newHand('pistol', ammo, 0), null];
      tick(world, { throwGun: true, aim: project(5, 0.6, Z) });
      tick(world, {}, 90);
      expect(hero.hands[0]?.item ?? null).toBe(ammo > 0 ? 'pistol' : null);
    }
  });
});

describe('M17 depth help for hero melee', () => {
  it('a grunt 0.45 H deeper and in reach is hit by a light punch (the snap)', () => {
    const { world, hero } = setup(0);
    const g = grunt(world, 0.45);
    g.pos.z = Z + 0.45;
    const hits = record(world, 'hit');
    tick(world, { attack: 'light', aim: project(g.pos.x, 0.79, g.pos.z) });
    tick(world, {}, 12);
    expect(hits.some((e) => e.actorId === g.id)).toBe(true);
    expect(Math.abs(hero.pos.z - Z)).toBeLessThanOrEqual(0.3 + 1e-6);
  });

  it('a grunt 0.6 H deeper is not snapped to', () => {
    const { world, hero } = setup(0);
    const g = grunt(world, 0.45);
    g.pos.z = Z + 0.6;
    const hits = record(world, 'hit');
    tick(world, { attack: 'light' });
    tick(world, {}, 12);
    expect(hits.some((e) => e.actorId === g.id)).toBe(false);
    expect(hero.pos.z).toBeCloseTo(Z, 5);
  });

  it('the hero band is 0.3 H, enemies keep 0.2 H', () => {
    const { world, hero } = setup(0);
    const g = grunt(world, 0.45);
    g.pos.z = Z + 0.25;
    g.facing = -1;
    // a grunt's punch at a hero 0.25 H away in depth misses
    world.scripted.set(g.id, { ...IDLE_COMMAND, attack: 'light', face: -1 });
    world.step();
    world.scripted.delete(g.id);
    tick(world, {}, 12);
    expect(hero.hp).toBe(hero.maxHp);
  });
});

describe('M17 F grabs with any free hand', () => {
  it('a pistol in front moves to the back hand and the grunt is grabbed; RMB fires past him', () => {
    const { world, hero } = setup(0);
    hero.hands = [newHand('pistol'), null];
    const g = grunt(world, 0.45);
    const swaps = record(world, 'handSwap');
    tick(world, { grab: true });
    expect(hero.holding).toEqual({ kind: 'actor', id: g.id });
    expect(hero.hands[0]).toBeNull();
    expect(hero.hands[1]?.item).toBe('pistol');
    expect(swaps).toHaveLength(1);
  });

  it('two guns: F grabs nothing', () => {
    const { world, hero } = setup(0);
    hero.hands = [newHand('pistol'), newHand('pistol')];
    grunt(world, 0.45);
    tick(world, { grab: true });
    expect(hero.holding).toBeUndefined();
  });
});

describe('M17 cover and aim', () => {
  const table = (x0: number, x1: number, top = 0.52) => ({ ...TEST_ROOM, props: [{ kind: 'table' as const, x0, x1, z0: 9.25, z1: 9.95, top }] });

  function shoot(room: RoomDef, hx: number, hz: number, gx: number, gz: number, aimY: number) {
    const world = new World(room);
    const hero = createActor('hero', hx, hz, gx > hx ? 1 : -1);
    world.addPlayer(hero);
    hero.hands[0] = newHand('pistol');
    const g = grunt(world, gx);
    g.pos.z = gz;
    const shots = record(world, 'shot');
    tick(world, { press: [true, false], aim: project(gx, aimY, gz) });
    return { surface: shots[0].rays[0].surface, g };
  }

  it('from behind a table you hit a grunt at your depth across it (it was blocked)', () => {
    expect(shoot(table(-0.5, 0.8), -1.2, 10.3, 2.4, 10.3, 0.4).surface).toBe('flesh');
  });

  it('a grunt in front of your table is hit over it (your own cover)', () => {
    expect(shoot(table(1.25, 2.55), 1.9, 10.3, -2, 8.5, 0.4).surface).toBe('flesh');
  });

  it('a grunt behind a table is covered from the front, his head above it is not', () => {
    expect(shoot(table(1.25, 2.55), -2.5, 8.4, 1.9, 10.2, 0.3).surface).toBe('prop');
    expect(shoot(table(1.25, 2.55), -2.5, 8.4, 1.9, 10.2, 0.84).surface).toBe('flesh');
  });

  it('the bullet goes to the cursor (spread off): within 1 px at three distances and both depths', () => {
    const w = WEAPONS.pistol as { spread: number };
    const spread = w.spread;
    w.spread = 0;
    try {
      for (const [hz, tx] of [[8.3, 1.5], [8.3, -0.5], [10.3, 1.5], [10.3, 3]] as const) {
        const world = new World(EMPTY);
        const hero = createActor('hero', -2.5, hz, 1);
        world.addPlayer(hero);
        hero.hands[0] = newHand('pistol');
        const shots = record(world, 'shot');
        const aim = project(tx, 0.8, 9.2);
        tick(world, { press: [true, false], aim });
        const s = shots[0], dx = Math.cos(s.angle), dy = Math.sin(s.angle);
        const vx = aim[0] - s.muzzle[0], vy = aim[1] - s.muzzle[1];
        expect(Math.abs(vx * dy - vy * dx)).toBeLessThan(1);
      }
    } finally { w.spread = spread; }
  });
});

describe('M17 throws find depth', () => {
  it('a knife thrown at a grunt 0.6 H deeper kills him; without a target it stays on your depth', () => {
    const { world, hero } = setup(-1.5);
    hero.hands[0] = newHand('knife');
    const g = grunt(world, 1);
    g.pos.z = Z + 0.6;
    const it = tossHeld(world, hero, 0, project(g.pos.x, 0.79, g.pos.z))!;
    expect(it.vel.z).toBeGreaterThan(0);
    tick(world, {}, 40);
    expect(g.state).toBe('dead');
    const b = setup(-1.5);
    b.hero.hands[0] = newHand('knife');
    const it2 = tossHeld(b.world, b.hero, 0, project(1, 0.79, Z + 0.6))!;
    expect(it2.vel.z).toBe(0);
  });

  it('an empty gun thrown at the head of a grunt at another depth stuns him', () => {
    const { world, hero } = setup(-1.5);
    hero.hands[0] = newHand('pistol', 0, 0);
    hero.hands[0].clicked = true;
    const g = grunt(world, 0.5);
    g.pos.z = Z - 0.5;
    const hits = record(world, 'hit');
    tick(world, { press: [true, false], aim: project(g.pos.x, 0.79, g.pos.z) });
    tick(world, {}, 30);
    expect(hits.some((e) => e.actorId === g.id && e.kind === 'gun')).toBe(true);
  });
});
