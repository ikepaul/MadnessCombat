// M7 acceptance tests (PLAN.md): an aim telegraph precedes every enemy shot, a friendly-fire
// kill, alert rules (suppressed vs. unsuppressed), takedowns only on unaware targets from
// behind/above, zombie rise time, HP and the raisable rule.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { type Actor, createActor, type HeldItem, newHand } from '../src/sim/actor';
import { gruntBrain, newAiState } from '../src/sim/ai';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import type { RoomDef } from '../src/sim/room';
import { project } from '../src/render/camera';
import { World } from '../src/sim/world';

const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
const Z = 9.2;
const R = TUNING.ai.ranged;

function setup(room: RoomDef = EMPTY, x = -1.5): { world: World; hero: Actor } {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}

function enemy(world: World, x: number, held: HeldItem = null, z = Z): Actor {
  const g = createActor('grunt', x, z, -1);
  if (held) g.hands[0] = newHand(held);
  g.ai = newAiState(world);
  g.brain = gruntBrain(world);
  world.actors.push(g);
  return g;
}

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) {
    world.command = { ...IDLE_COMMAND, ...cmd };
    world.step();
  }
}

function record<K extends keyof GameEvents>(world: World, type: K): (GameEvents[K] & { t: number })[] {
  const out: (GameEvents[K] & { t: number })[] = [];
  world.events.on(type, (e) => out.push({ ...e, t: world.time }));
  return out;
}

describe('armed grunts (enemy-grunt-armed)', () => {
  it('every enemy shot follows an aim telegraph of 0.4 s', () => {
    const { world, hero } = setup(EMPTY, -2);
    hero.hp = 999;
    hero.maxHp = 999;
    const shooters = [enemy(world, 2, 'pistol'), enemy(world, 2.5, 'smg', 9.8), enemy(world, 1.5, 'shotgun', 8.6)];
    const aims = record(world, 'aimStart'), shots = record(world, 'shot');
    tick(world, {}, 60 * 12);
    expect(shots.length).toBeGreaterThan(6);
    for (const s of shots) {
      const aim = aims.filter((a) => a.actorId === s.actorId && a.t <= s.t).at(-1);
      expect(aim, `shot by ${s.actorId} at ${s.t}`).toBeDefined();
      const since = s.t - aim!.t;
      expect(since).toBeGreaterThanOrEqual(R.telegraph - 1e-6);
      expect(since).toBeLessThanOrEqual(R.telegraph + R.burst + 0.05);
    }
    // (one may fall to friendly fire first)
    expect(new Set(shots.map((s) => s.actorId)).size).toBeGreaterThanOrEqual(shooters.length - 1);
  });

  it('enemy bullets hit other enemies in the line of fire (friendly-fire kill)', () => {
    const { world, hero } = setup(EMPTY, -2.5);
    hero.hp = 999;
    const shooter = enemy(world, 2.5, 'pistol');
    const victim = createActor('grunt', 0, Z, -1);
    world.actors.push(victim);
    const kills = record(world, 'kill');
    for (let i = 0; i < 60 * 30 && victim.state !== 'dead'; i++) {
      // the victim stands still in the way, between shooter and hero, whatever depth they move to
      victim.pos.x = 0;
      victim.pos.z = hero.pos.z = shooter.pos.z;
      tick(world);
    }
    expect(victim.state).toBe('dead');
    expect(kills.find((k) => k.actorId === victim.id)?.byId).toBe(shooter.id);
  });

  it('gun grunts keep their distance instead of closing in', () => {
    const { world, hero } = setup(EMPTY, 0);
    hero.hp = 999;
    const g = enemy(world, 1, 'pistol');
    tick(world, {}, 60 * 4);
    expect(Math.abs(g.pos.x - hero.pos.x)).toBeGreaterThan(R.keep[0] - 0.5);
    expect(world.tokens.has(g.id)).toBe(false);
  });

  it('an empty gun with no spare is clicked, then thrown at the player', () => {
    const { world, hero } = setup(EMPTY, -2);
    hero.hp = 999;
    const g = enemy(world, 2, 'pistol');
    g.hands[0]!.ammo = 0;
    g.hands[0]!.spare = 0;
    const clicks = record(world, 'dryFire'), throws = record(world, 'throw');
    tick(world, {}, 60 * 3);
    expect(clicks.some((c) => c.actorId === g.id)).toBe(true);
    expect(throws.some((c) => c.actorId === g.id)).toBe(true);
    expect(g.hands[0]).toBeNull();
  });
});

const S = TUNING.stealth;

function guard(world: World, x: number, facing: 1 | -1, held: HeldItem = null, z = Z): Actor {
  const g = enemy(world, x, held, z);
  g.facing = facing;
  g.ai!.aware = false;
  g.ai!.idle = 'smoke';
  return g;
}

describe('alert rules (melee-stealth-kill)', () => {
  it('an unsuppressed shot alerts everyone; a suppressed one alerts nobody', () => {
    for (const [gun, alerted] of [['pistol', true], ['pistolSuppressed', false]] as const) {
      const { world, hero } = setup(EMPTY, -3);
      hero.hands[0] = newHand(gun);
      const a = guard(world, 2, 1), b = guard(world, 3, 1, null, 10);
      tick(world, { press: [true, false], aim: project(-3, 2.5, Z) });
      tick(world, {}, 30);
      expect(a.ai!.aware !== false, gun).toBe(alerted);
      expect(b.ai!.aware !== false, gun).toBe(alerted);
    }
  });

  it('a suppressed headshot kill stays quiet; a loud kill alerts the guards nearby', () => {
    for (const [gun, alerted] of [['pistolSuppressed', false], ['deagle', true]] as const) {
      const { world, hero } = setup(EMPTY, -3);
      hero.hands[0] = newHand(gun);
      const target = guard(world, 0, 1), near = guard(world, 1.5, 1);
      for (let i = 0; i < 30 && target.state !== 'dead'; i++) tick(world, { press: [i % 12 === 0, false], aim: project(0, 0.79, Z) });
      expect(target.state, gun).toBe('dead');
      tick(world, {}, 10);
      expect(near.ai!.aware !== false, gun).toBe(alerted);
    }
  });

  it('a player in front is noticed after 0.3 s; one behind is not', () => {
    const { world } = setup(EMPTY, -1);
    const facing = guard(world, 1, -1), away = guard(world, 1, 1, null, 9.8);
    const alerts = record(world, 'alert');
    tick(world, {}, Math.round(S.notice * 60) + 2);
    expect(facing.ai!.aware).toBe(true);
    expect(alerts[0].t).toBeGreaterThanOrEqual(S.notice - 1e-6);
    // the guard who saw him alerts those near him
    expect(away.ai!.aware).toBe(true);
  });
});

describe('takedowns (melee-stealth-kill, move-drop-from-above)', () => {
  it('E behind an unaware guard: wire 1.5 s with empty hands, silent', () => {
    const { world, hero } = setup(EMPTY, 0);
    const g = guard(world, 0.5, 1), far = guard(world, 2.6, 1);
    const kills = record(world, 'kill');
    tick(world, { pickup: true });
    expect(hero.attack?.kind).toBe('takedown');
    expect(hero.attack?.weapon).toBe('wire');
    tick(world, {}, Math.round(S.wire * 60) - 2);
    expect(g.state).not.toBe('dead');
    tick(world, {}, 3);
    expect(g.state).toBe('dead');
    expect(kills[0]).toMatchObject({ actorId: g.id, kind: 'takedown' });
    tick(world, {}, 20);
    expect(far.ai!.aware).toBe(false);
  });

  it('with a weapon in hand it is the 0.6 s knife', () => {
    const { world, hero } = setup(EMPTY, 0);
    hero.hands[0] = newHand('pistol');
    const g = guard(world, 0.5, 1);
    tick(world, { pickup: true });
    expect(hero.attack?.weapon).toBe('knife');
    tick(world, {}, Math.round(S.knife * 60) + 1);
    expect(g.state).toBe('dead');
  });

  it('no takedown from the front or on an alert enemy', () => {
    const { world, hero } = setup(EMPTY, 0);
    guard(world, 0.5, -1);
    tick(world, { pickup: true });
    expect(hero.attack?.kind).not.toBe('takedown');
    const w2 = setup(EMPTY, 0);
    const g2 = enemy(w2.world, 0.5);
    g2.facing = 1;
    tick(w2.world, { pickup: true });
    expect(w2.hero.attack?.kind).not.toBe('takedown');
  });

  it('landing next to an unaware guard from above goes straight into the kill', () => {
    const { world, hero } = setup(EMPTY, 0);
    // facing away from where the hero drops in (the vent behind him)
    const g = guard(world, 0.4, 1);
    hero.pos.y = 2;
    hero.body.state = 'air';
    hero.body.vel = { x: 0, y: 0, z: 0 };
    const takedowns = record(world, 'takedown');
    for (let i = 0; i < 60 && !takedowns.length; i++) tick(world);
    expect(takedowns[0]).toMatchObject({ targetId: g.id, how: 'knife' });
    tick(world, {}, Math.round(S.knife * 60) + 1);
    expect(g.state).toBe('dead');
  });

  it('a hit on the attacker breaks the takedown and the victim wakes up', () => {
    const { world, hero } = setup(EMPTY, 0);
    const g = guard(world, 0.5, 1);
    tick(world, { pickup: true });
    tick(world, {}, 10);
    world.hitActor(undefined, hero, 'heavy', 1, 0, { ...hero.pos });
    tick(world, {}, 2);
    expect(g.state).not.toBe('dead');
    expect(g.takenBy).toBeUndefined();
    expect(g.ai!.aware).toBe(true);
  });
});

describe('enemy behaviours (enemy-behaviours, combat-cover)', () => {
  it('a gun grunt kicks the table over and it becomes upright cover toward the player', () => {
    const { world, hero } = setup(TEST_ROOM, -1.5);
    hero.pos.z = 8.4;
    hero.hp = 999;
    const g = enemy(world, 1.9, 'pistol', 10.15);
    g.ai!.flipper = true;
    const flips = record(world, 'tableFlip');
    tick(world, {}, 60 * 4);
    expect(flips.length).toBe(1);
    const t = world.room.props[0];
    expect(t.kind === 'table' && t.tip?.t).toBe(1);
    expect(t.z0).toBeCloseTo(9.25 - 0.52, 5);
    expect(t.top).toBeCloseTo(0.7, 5);
    // the stage data itself is untouched
    expect(TEST_ROOM.props[0].z0).toBe(9.25);
  });

  it('an empty-handed grunt picks up a weapon lying within 2 H', () => {
    const { world } = setup(EMPTY, -3);
    const g = enemy(world, 1);
    world.spawnItem('bat', 'grunt', { x: 2.2, y: 0, z: Z }, { x: 0, y: 0, z: 0 }, 0);
    tick(world, {}, 60 * 3);
    expect(g.hands[0]?.item).toBe('bat');
  });

  it('enemies lob at most one grenade per encounter', () => {
    const { world, hero } = setup(EMPTY, -2);
    hero.hp = 999;
    hero.maxHp = 999;
    enemy(world, 1.5, 'pistol');
    enemy(world, 2, 'pistol', 9.9);
    const pins = record(world, 'grenadePin');
    tick(world, {}, 60 * 25);
    expect(pins.length).toBe(1);
  });
});
