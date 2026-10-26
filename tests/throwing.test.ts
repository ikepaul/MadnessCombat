// M6 acceptance tests (PLAN.md): knife speed / stick / retrieve, grenade fuse, radius and gib
// flags, a picked-up grenade keeps its fuse, catch window, steal, shield from the front only,
// the street sign hitting two in one swing, pinning; plus disarms and melee swings.
import { describe, expect, it } from 'vitest';
import { GRENADE, MELEE, THROWN } from '../src/data/melee';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { liveGrenade } from '../src/labs/throwLabs';
import { project, scaleAt } from '../src/render/camera';
import { type Actor, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { heldWeaponSegment, tossHeld } from '../src/sim/melee';
import { castRay } from '../src/sim/hitscan';
import { aimRig } from '../src/anim/aim';
import { WEAPONS } from '../src/data/weapons';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';

const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
const Z = 9.2;
const FRAME = 1 / 30;

function setup(room: RoomDef = EMPTY, x = -1.5): { world: World; hero: Actor } {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}

function grunt(world: World, x: number, z = Z, held: Actor['hands'][0] = null): Actor {
  const g = createActor('grunt', x, z, -1);
  g.hands[0] = held;
  world.actors.push(g);
  return g;
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

const chest = (a: Actor) => project(a.pos.x, a.pos.y + 0.45, a.pos.z);
const ticksFor = (world: World, s: number) => Math.round(s / world.dt);

describe('knives (throw-knives)', () => {
  it('a knife out of stab reach is thrown at 13 H/s, kills, sticks in the body and is pulled out in 0.5 s', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('knife'), null];
    const g = grunt(world, 1.5);
    tick(world, { attack: 'light', aim: chest(g) });
    tick(world, {}, ticksFor(world, THROWN.windup));
    const knife = world.items.find((i) => i.kind === 'knife')!;
    expect(knife).toBeDefined();
    expect(Math.hypot(knife.vel.x, knife.vel.y)).toBeCloseTo(THROWN.knifeSpeed, 0);
    expect(hero.hands[0]).toBeNull();
    tick(world, {}, 30);
    expect(g.state).toBe('dead');
    expect(knife.state).toBe('stuck');
    expect(knife.stuckTo).toBe(g.id);
    // walk up to the body (no pull while moving), stop on it: 0.5 s pull, then it's back in the hand
    const pulls = record(world, 'pull');
    while (hero.pos.x < g.pos.x - 0.4) tick(world, { moveX: 1 });
    expect(pulls).toHaveLength(0);
    tick(world, {});
    expect(hero.attack?.kind).toBe('pull');
    tick(world, {}, ticksFor(world, THROWN.pull) - 2);
    expect(hero.hands[0]).toBeNull();
    tick(world, {}, 2);
    expect(hero.hands[0]?.item).toBe('knife');
    expect(pulls.map((p) => p.phase)).toEqual(['start', 'end']);
  });

  it('stabs (no throw) when a grunt is within 0.6 H', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('knife'), null];
    const g = grunt(world, hero.pos.x + 0.5);
    tick(world, { attack: 'light', aim: chest(g) });
    expect(hero.attack?.kind).toBe('swing');
    tick(world, {}, 12);
    expect(g.state).toBe('dead');
    expect(hero.hands[0]?.item).toBe('knife');
  });

  it('a missed knife sticks in the wall', () => {
    const { world, hero } = setup(EMPTY, 2.6);
    hero.hands = [newHand('knife'), null];
    tick(world, { attack: 'light', aim: project(5, 0.6, Z) });
    tick(world, {}, 30);
    const knife = world.items.find((i) => i.kind === 'knife')!;
    expect(knife.state).toBe('stuck');
    expect(knife.stuckTo).toBeUndefined();
    expect(knife.pos.x).toBeCloseTo(EMPTY.halfWidth, 5);
  });
});

describe('grenades (throw-grenade)', () => {
  it('fuse 1.1 s from the pin, however long it was cooked', () => {
    for (const cook of [0.1, 0.6]) {
      const { world, hero } = setup();
      hero.grenades = 1;
      const pins = record(world, 'grenadePin'), booms = record(world, 'explosion');
      let t = 0;
      const n = ticksFor(world, cook);
      for (let i = 0; i < n; i++) { tick(world, { grenade: true, aim: project(1.5, 0, Z) }); t++; }
      expect(pins).toHaveLength(1);
      while (booms.length === 0 && t < 300) { tick(world, { aim: project(1.5, 0, Z) }); t++; }
      expect(Math.abs(t * world.dt - GRENADE.fuse)).toBeLessThanOrEqual(FRAME);
      expect(hero.grenades).toBe(0);
    }
  });

  it('lands near the floor point under the cursor', () => {
    const { world, hero } = setup();
    hero.grenades = 1;
    tick(world, { grenade: true }, 3);
    tick(world, { aim: project(1.0, 0, 9.6) });
    tick(world, {}, ticksFor(world, GRENADE.lobWindup) + 2);
    const g = world.items.find((i) => i.kind === 'grenade')!;
    let landed = false;
    for (let i = 0; i < 60 && !landed; i++) { tick(world); landed = g.pos.y <= 0.001; }
    expect(Math.abs(g.pos.x - 1.0)).toBeLessThan(0.35);
    expect(Math.abs(g.pos.z - 9.6)).toBeLessThan(0.15);
  });

  it('blast radius 2 H kills inside and spares outside; corpses close by are gibbed, farther ones thrown', () => {
    const { world, hero } = setup(EMPTY, -3);
    const inside = grunt(world, 1.9), outside = grunt(world, 2.35);
    const near = createActor('grunt', 0.4, Z, 1, { dead: true });
    const far = createActor('grunt', -1.6, Z, 1, { dead: true });
    world.actors.push(near, far);
    liveGrenade(world, 0, Z, 0.05);
    tick(world, {}, 6);
    expect(inside.state).toBe('dead');
    expect(outside.state).toBe('free');
    expect(near.corpse?.gibbed).toBe(true);
    expect(near.corpse?.raisable).toBe(false);
    expect(far.corpse?.gibbed).toBe(false);
    expect(far.corpse?.raisable).toBe(true);
    expect(far.flight?.vy).toBeGreaterThan(0);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('a picked-up live grenade keeps its fuse and can be thrown back', () => {
    const { world, hero } = setup();
    const g = liveGrenade(world, hero.pos.x + 0.3, Z, 1.0);
    const booms = record(world, 'explosion');
    tick(world, { grab: true });
    expect(hero.holding).toEqual({ kind: 'item', id: g.id });
    tick(world, {}, ticksFor(world, 0.4));
    expect(g.fuse!).toBeCloseTo(0.6, 1);
    tick(world, { grab: true, aim: project(2.5, 0, Z) });
    let t = ticksFor(world, 0.4) + 1;
    while (booms.length === 0 && t < 200) { tick(world); t++; }
    expect(Math.abs(t * world.dt - 1.0)).toBeLessThanOrEqual(FRAME * 2);
    expect(booms[0].x).toBeGreaterThan(hero.pos.x + 1.5);
  });

  it('cooking past the fuse blows up in your hand', () => {
    const { world, hero } = setup();
    hero.grenades = 1;
    const booms = record(world, 'explosion');
    tick(world, { grenade: true }, ticksFor(world, GRENADE.fuse) + 2);
    expect(booms).toHaveLength(1);
    expect(Math.abs(booms[0].x - hero.pos.x)).toBeLessThan(0.6);
    expect(hero.hp).toBe(hero.maxHp - 1);
  });
});

describe('catching (throw-catch-return)', () => {
  /** Ticks until a knife thrown by a grunt at x=2 reaches the hero at x=-1 (no catch). */
  function throwAtHero(pressF?: number): { world: World; hero: Actor; hitAt: number; caught: boolean } {
    const { world, hero } = setup(EMPTY, -1);
    const g = grunt(world, 2, Z, newHand('knife'));
    tossHeld(world, g, 0, chest(hero));
    const hits = record(world, 'hit'), catches = record(world, 'catch');
    let t = 0;
    while (hits.length === 0 && catches.length === 0 && t < 120) {
      tick(world, { grab: pressF !== undefined && t === pressF });
      t++;
    }
    return { world, hero, hitAt: t, caught: catches.length > 0 };
  }

  it('F with an empty hand within 0.15 s before it arrives catches it; earlier does not', () => {
    const base = throwAtHero();
    expect(base.caught).toBe(false);
    const inWindow = throwAtHero(base.hitAt - 1 - ticksFor(base.world, 0.1));
    expect(inWindow.caught).toBe(true);
    expect(inWindow.hero.hands[0]?.item).toBe('knife');
    expect(inWindow.hero.hp).toBe(inWindow.hero.maxHp);
    const tooEarly = throwAtHero(base.hitAt - 1 - ticksFor(base.world, 0.3));
    expect(tooEarly.caught).toBe(false);
    expect(tooEarly.hero.hp).toBe(tooEarly.hero.maxHp - 1);
  });
});

describe('disarming (combat-disarm)', () => {
  it('F on an armed grunt steals the weapon in 0.4 s', () => {
    const { world, hero } = setup();
    const g = grunt(world, hero.pos.x + 0.45, Z, newHand('pistol', 5, 1));
    const ev = record(world, 'disarm');
    tick(world, { grab: true });
    expect(hero.attack?.kind).toBe('steal');
    tick(world, {}, ticksFor(world, 0.4));
    expect(hero.hands[0]?.item).toBe('pistol');
    expect(hero.hands[0]?.ammo).toBe(5);
    expect(g.hands[0]).toBeNull();
    expect(g.state).toBe('stun');
    expect(ev[0].how).toBe('steal');
  });

  it('a sweep always knocks the weapon away', () => {
    const { world, hero } = setup();
    const g = grunt(world, hero.pos.x + 0.6, Z, newHand('baton'));
    tick(world, { moveX: 1, dive: true });
    tick(world, {}, 30);
    expect(g.hands[0]).toBeNull();
    expect(world.items.some((i) => i.kind === 'baton')).toBe(true);
  });

  it('a ray that crosses the weapon before the body hits the weapon, not the body', () => {
    const { world, hero } = setup();
    const g = grunt(world, 1.5, Z, newHand('rifle'));
    tick(world); // the grunt raises the rifle (aims straight ahead)
    const seg = heldWeaponSegment(g)!;
    const mid: [number, number] = [(seg.p0[0] + seg.p1[0]) / 2, (seg.p0[1] + seg.p1[1]) / 2];
    const from: [number, number] = [mid[0] - 500, mid[1]];
    expect(castRay(world, from, [1, 0], Z, (o) => o === hero).disarm).toBe(g);
    // a ray over the weapon hits the head instead
    const head = project(g.pos.x, 0.79, Z);
    expect(castRay(world, [head[0] - 500, head[1]], [1, 0], Z, (o) => o === hero).hit?.part).toBe('head');
  });

  it('a pistol shot along that line shoots the rifle out of the hand (the grunt lives)', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('pistol'), null];
    const g = grunt(world, 1.5, Z, newHand('rifle'));
    tick(world);
    const seg = heldWeaponSegment(g)!;
    const mid: [number, number] = [(seg.p0[0] + seg.p1[0]) / 2, (seg.p0[1] + seg.p1[1]) / 2];
    // the bullet leaves the muzzle parallel to the barrel: find the cursor that puts it through `mid`
    let aim: [number, number] = [...mid];
    for (let k = 0; k < 8; k++) {
      const rig = aimRig(project(hero.pos.x, hero.pos.y, Z), scaleAt(Z), 1, 0, aim, WEAPONS.pistol, 0);
      const t = (mid[0] - rig.muzzle[0]) / Math.cos(rig.angle);
      aim = [aim[0], aim[1] + (mid[1] - (rig.muzzle[1] + Math.sin(rig.angle) * t))];
    }
    const ev = record(world, 'disarm');
    tick(world, { aim, press: [true, false], attack: 'light' });
    expect(ev.map((e) => e.how)).toContain('shot');
    expect(g.hands[0]).toBeNull();
    expect(g.state).not.toBe('dead');
    expect(world.items.some((i) => i.kind === 'rifle')).toBe(true);
  });
});

describe('human shield (combat-human-shield)', () => {
  function shieldWorld(gunnerX: number) {
    const { world, hero } = setup(EMPTY, 0);
    const held = grunt(world, 0.45);
    tick(world, { grab: true });
    expect(hero.holding?.id).toBe(held.id);
    const gunner = createActor('grunt', gunnerX, Z, gunnerX > 0 ? -1 : 1, { held: 'pistol' });
    world.actors.push(gunner);
    let n = 0;
    gunner.brain = () => ({ ...IDLE_COMMAND, face: gunnerX > 0 ? -1 : 1, aim: chest(hero), press: [n++ % 12 === 0, false] });
    const shield = record(world, 'shieldHit');
    tick(world, {}, 50);
    return { hero, held, shield };
  }

  it('absorbs fire from the front', () => {
    const { hero, held, shield } = shieldWorld(2.8);
    expect(shield.length).toBeGreaterThan(0);
    expect(hero.hp).toBe(hero.maxHp);
    expect(held.state).toBe('dead');
    expect(hero.holding?.id).toBe(held.id);
  });

  it('does not protect from behind', () => {
    const { hero, shield } = shieldWorld(-2.8);
    expect(shield).toHaveLength(0);
    expect(hero.hp).toBeLessThan(hero.maxHp);
  });

  it('you walk at 0.6x and can fire a one-handed gun in the back hand past it', () => {
    const { world, hero } = setup(EMPTY, 0);
    hero.hands = [null, newHand('pistol')];
    grunt(world, 0.45);
    const target = grunt(world, 2.5);
    tick(world, { grab: true });
    expect(hero.holding).toBeDefined();
    const x0 = hero.pos.x;
    tick(world, { moveX: -1 }, 60);
    expect((x0 - hero.pos.x) / 1).toBeCloseTo(1.8 * 0.6, 1);
    const shots = record(world, 'shot');
    tick(world, { aim: project(target.pos.x, 0.79, Z) });
    tick(world, { aim: project(target.pos.x, 0.79, Z), press: [false, true], attack: 'heavy' });
    expect(shots).toHaveLength(1);
    expect(target.state).toBe('dead');
  });
});

describe('melee weapons and the street sign (melee-weapons, melee-environment-weapon)', () => {
  it('a baton swing kills a grunt at 0.7 H in one hit', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('baton'), null];
    const g = grunt(world, hero.pos.x + 0.7);
    tick(world, { attack: 'light' }, 1);
    tick(world, {}, 20);
    expect(g.state).toBe('dead');
  });

  it('the street sign hits two targets in one swing', () => {
    const { world, hero } = setup(EMPTY, -2);
    hero.hands = [newHand('sign'), null];
    const a = grunt(world, -1.2), b = grunt(world, -0.6, Z + 0.1);
    tick(world, { attack: 'light' });
    const t = MELEE.sign;
    tick(world, {}, ticksFor(world, t.startup + t.active) + 1);
    expect(a.state).toBe('dead');
    expect(b.state).toBe('dead');
  });

  it('pulling the planted sign takes 0.5 s and both hands', () => {
    const { world, hero } = setup();
    const it = world.spawnItem('sign', 'grunt', { x: hero.pos.x + 0.3, y: 0, z: Z }, { x: 0, y: 0, z: 0 }, 0);
    it.state = 'planted';
    tick(world, { pickup: true });
    tick(world, {}, ticksFor(world, THROWN.pull) + 1);
    expect(hero.hands[0]?.item).toBe('sign');
    expect(world.items.includes(it)).toBe(false);
  });

  it('a thrust pins a grunt next to the wall: the corpse stays on the wall with the sign in it', () => {
    const { world, hero } = setup(EMPTY, 1.6);
    hero.hands = [newHand('sign'), null];
    const g = grunt(world, EMPTY.halfWidth - 0.35);
    const pins = record(world, 'pin');
    tick(world, { attack: 'heavy' });
    tick(world, {}, 30);
    expect(g.state).toBe('dead');
    expect(g.corpse?.pinned).toBe(true);
    expect(pins).toHaveLength(1);
    expect(g.pos.x).toBeCloseTo(EMPTY.halfWidth - 0.22, 5);
    const sign = world.items.find((i) => i.kind === 'sign')!;
    expect(sign.state).toBe('stuck');
    expect(sign.stuckTo).toBe(g.id);
    expect(hero.hands[0]).toBeNull();
    tick(world, {}, 120);
    expect(g.pos.x).toBeCloseTo(EMPTY.halfWidth - 0.22, 5);
  });

  it('a thrust away from any surface just knocks the target flying', () => {
    const { world, hero } = setup(EMPTY, -2);
    hero.hands = [newHand('sign'), null];
    const g = grunt(world, -0.8);
    tick(world, { attack: 'heavy' });
    tick(world, {}, 30);
    expect(g.state).toBe('dead');
    expect(g.corpse?.pinned).toBeFalsy();
    expect(hero.hands[0]?.item).toBe('sign');
  });

  it('pins against a tall prop too (a pole)', () => {
    const room: RoomDef = { ...EMPTY, props: [{ kind: 'pole', x0: 1.0, x1: 1.14, z0: 9.13, z1: 9.27, top: 3.4, lean: 0 }] };
    const { world, hero } = setup(room, -0.6);
    hero.hands = [newHand('sign'), null];
    const g = grunt(world, 0.7);
    tick(world, { attack: 'heavy' });
    tick(world, {}, 30);
    expect(g.corpse?.pinned).toBe(true);
    expect(g.pos.x).toBeCloseTo(1.0 - 0.22, 5);
  });
});
