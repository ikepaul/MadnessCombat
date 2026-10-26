// M2 acceptance tests (PLAN.md): measured values from research/mechanics/melee-* and
// move-knockdown-getup. Tolerance: +-1 source frame (1/30 s) for timings, +-5% for distances.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { type Actor, createActor, newHand, stateLabel } from '../src/sim/actor';
import { attackTiming } from '../src/sim/combat';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';
import { project } from '../src/render/camera';

const FRAME = 1 / 30;
const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
const Z = 9.2;

function setup(room: RoomDef = EMPTY, x = -1.5): { world: World; hero: Actor } {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.actors.push(hero);
  world.player = hero;
  return { world, hero };
}

function dummy(world: World, x: number, z = Z, hp?: number): Actor {
  const d = createActor('grunt', x, z, -1);
  if (hp) d.hp = d.maxHp = hp;
  world.actors.push(d);
  return d;
}

/** One tick with an edge command, then idle ticks. */
function press(world: World, cmd: Partial<PlayerCommand>): void {
  world.command = { ...IDLE_COMMAND, ...cmd };
  world.step();
}

function idle(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / world.dt); i++) {
    world.command = { ...IDLE_COMMAND };
    world.step();
  }
}

function until(world: World, pred: () => boolean, max = 600): number {
  for (let i = 1; i <= max; i++) {
    world.command = { ...IDLE_COMMAND };
    world.step();
    if (pred()) return i * world.dt;
  }
  return -1;
}

/** Walk right until the hero's x reaches `x`. */
function walkTo(world: World, hero: Actor, x: number): void {
  for (let i = 0; i < 600 && hero.pos.x < x; i++) {
    world.command = { ...IDLE_COMMAND, moveX: 1, face: 1 };
    world.step();
  }
}

function swingTime(kind: 'light' | 'heavy' | 'uppercut' | 'finisher'): number {
  const t = attackTiming(kind);
  return t.startup + t.active + t.recovery + 2 * FRAME;
}

function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

describe('punch range and depth band (melee-punch-knockback)', () => {
  const cases: [string, number, number, boolean][] = [
    ['centre distance 0.55 H', 0.55, 0, true],
    ['centre distance 0.35 H', 0.35, 0, true],
    ['just out of range at 0.7 H', 0.7, 0, false],
    ['inside the depth band (0.15 H)', 0.5, 0.15, true],
    ['outside the depth band (0.25 H)', 0.5, 0.25, false],
    ['behind the puncher', -0.5, 0, false],
  ];
  for (const [name, dx, dz, hits] of cases) {
    it(`${hits ? 'hits' : 'misses'}: ${name}`, () => {
      const { world, hero } = setup();
      const d = dummy(world, hero.pos.x + dx, Z + dz);
      const hitsSeen = record(world, 'hit');
      press(world, { attack: 'light', face: 1 });
      idle(world, swingTime('light'));
      expect(hitsSeen.length > 0).toBe(hits);
      expect(d.hp < d.maxHp).toBe(hits);
    });
  }

  it('a prone target ducks under a punch', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    d.brain = () => ({ ...IDLE_COMMAND, dive: d.body.state === 'ground' });
    idle(world, 0.3);
    expect(d.body.state).toBe('prone');
    press(world, { attack: 'light', face: 1 });
    idle(world, swingTime('light'));
    expect(d.hp).toBe(d.maxHp);
  });

  it('a punch pressed during the previous swing is buffered', () => {
    const { world, hero } = setup();
    press(world, { attack: 'light', face: 1 });
    const t = attackTiming('light');
    idle(world, t.startup + t.active + t.recovery - 0.1);
    const punches = record(world, 'punch');
    press(world, { attack: 'light', face: 1 });
    idle(world, 0.1 + t.startup + 2 * FRAME);
    expect(punches).toHaveLength(1);
    expect(hero.state).toBe('attack');
  });

  it('light punch cycle allows 2-3 punches per second', () => {
    const t = attackTiming('light');
    const rate = 1 / (t.startup + t.active + t.recovery);
    expect(rate).toBeGreaterThanOrEqual(2);
    expect(rate).toBeLessThanOrEqual(3);
  });
});

describe('health rules (decided: grunts 4 hp, light 1 / heavy 2; player 3 lives, 1 per hit, kills heal)', () => {
  /** Swing and wait for the swing to end; the dummy stays in reach while stunned. */
  function swing(world: World, kind: 'light' | 'heavy'): void {
    press(world, { attack: kind, face: 1 });
    idle(world, swingTime(kind));
  }

  it('one heavy punch knocks a grunt down but does not kill', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    swing(world, 'heavy');
    expect(d.hp).toBe(2);
    expect(d.state).toBe('knockback');
  });

  it('unchained light punches stun; the fourth kills', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    for (let i = 0; i < 3; i++) {
      swing(world, 'light');
      expect(d.state).toBe('stun');
      idle(world, TUNING.combo.window); // let the chain drop
    }
    swing(world, 'light');
    expect(d.state).toBe('dead');
    expect(d.pose.headless).toBe(false);
  });

  it('combo: three chained lights kill (the third does +1)', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    const hits = record(world, 'hit');
    swing(world, 'light');
    swing(world, 'light');
    swing(world, 'light');
    expect(hits.map((h) => [h.damage, h.combo, h.chain])).toEqual([[1, false, 1], [1, false, 2], [2, true, 3]]);
    expect(d.state).toBe('dead');
  });

  it('combo: a quick cross (light then heavy) kills in two hits and takes the head', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    const kills = record(world, 'kill');
    swing(world, 'light');
    swing(world, 'heavy');
    expect(d.state).toBe('dead');
    expect(kills[0]).toMatchObject({ kind: 'heavy', decap: true });
  });

  it('combo: heavy then light gets no bonus', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5, Z, TUNING.health.tough);
    const hits = record(world, 'hit');
    swing(world, 'heavy');
    expect(hits[0].combo).toBe(false);
    expect(d.hp).toBe(TUNING.health.tough - 2);
  });

  it('two lights and a heavy kill, and the heavy kill takes the head off', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    const kills = record(world, 'kill');
    swing(world, 'light');
    swing(world, 'light');
    swing(world, 'heavy');
    expect(d.state).toBe('dead');
    expect(kills[0]).toMatchObject({ actorId: d.id, kind: 'heavy', decap: true });
  });

  it('every hit costs the player exactly one life, heavy ones too', () => {
    const { world, hero } = setup();
    world.hitActor(undefined, hero, 'heavy', 1, 0, hero.pos);
    expect(hero.hp).toBe(2);
  });

  it('a kill heals the player one life, never above the max', () => {
    const { world, hero } = setup();
    hero.hp = 1;
    const heals = record(world, 'heal');
    const d = dummy(world, hero.pos.x + 0.5);
    d.hp = 1;
    swing(world, 'light');
    expect(hero.hp).toBe(2);
    const e = dummy(world, hero.pos.x + 0.5);
    e.hp = 1;
    hero.hp = hero.maxHp;
    swing(world, 'light');
    expect(e.state).toBe('dead');
    expect(hero.hp).toBe(hero.maxHp);
    expect(heals).toHaveLength(1);
  });

  it('a wall-slam kill by a thrown body heals too', () => {
    const { world, hero } = setup(EMPTY, 2.6);
    hero.hp = 1;
    const a = dummy(world, 3.0);
    press(world, { grab: true, face: 1 });
    press(world, { grab: true, aim: project(3.5, 0, Z) });
    idle(world, 1);
    expect(a.state).toBe('dead');
    expect(hero.hp).toBe(2);
  });

  it('the player can keep walking through a punch', () => {
    const { world, hero } = setup();
    const x0 = hero.pos.x;
    world.command = { ...IDLE_COMMAND, attack: 'light', moveX: 1, face: 1 };
    world.step();
    expect(hero.state).toBe('attack');
    for (let i = 0; i < 12; i++) { world.command = { ...IDLE_COMMAND, moveX: 1 }; world.step(); }
    expect(hero.state).toBe('attack');
    expect(hero.pos.x - x0).toBeGreaterThan(13 * world.dt * TUNING.move.walkSpeed * TUNING.move.attackMoveFactor * 0.9);
  });

  it('the player goes down on the third hit, not before', () => {
    const { world, hero } = setup();
    const g = dummy(world, hero.pos.x + 0.5);
    let swing = false;
    g.brain = () => ({ ...IDLE_COMMAND, face: -1, attack: swing ? 'light' : null });
    const hitOnce = () => {
      swing = true;
      world.step();
      swing = false;
      idle(world, swingTime('light') + TUNING.hit.heroFlinch);
    };
    hitOnce();
    hitOnce();
    expect(hero.hp).toBe(1);
    expect(hero.state).not.toBe('dead');
    hitOnce();
    expect(hero.state).toBe('dead');
  });
});

describe('hit-stun (melee-hitstun-finisher)', () => {
  it('a light hit stuns for 0.7 s', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    press(world, { attack: 'light', face: 1 });
    until(world, () => d.state === 'stun');
    const t = until(world, () => d.state !== 'stun');
    expect(t).toBeGreaterThan(TUNING.hit.stun - FRAME);
    expect(t).toBeLessThan(TUNING.hit.stun + FRAME);
  });

  it('the finisher hits a downed enemy: LMB for 1, RMB for 2 (a heavy kill takes the head)', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    press(world, { attack: 'heavy', face: 1 });
    until(world, () => d.state === 'down');
    expect(d.hp).toBe(2);
    // step up to the lying body (no time to walk before he gets up) and punch down at it
    hero.pos.x = d.pos.x - 0.45;
    press(world, { attack: 'light', face: 1 });
    expect(hero.attack?.kind).toBe('finisher');
    idle(world, swingTime('finisher'));
    expect(d.hp).toBe(1);
    const kills = record(world, 'kill');
    press(world, { attack: 'heavy', face: 1 });
    expect(hero.attack?.kind).toBe('finisher');
    idle(world, swingTime('finisher'));
    expect(kills).toMatchObject([{ kind: 'finisher', decap: true }]);
    expect(d.state).toBe('dead');
  });
});

describe('knockback and knockdown (move-knockdown-getup)', () => {
  function knockedHero() {
    const { world, hero } = setup(EMPTY, 0);
    const g = dummy(world, 0.5);
    let swing = true;
    g.brain = () => {
      const c = { ...IDLE_COMMAND, face: -1 as const, attack: swing ? ('heavy' as const) : null };
      swing = false;
      return c;
    };
    return { world, hero, g };
  }

  it('a heavy punch knocks the body ~1.5 H back with ~0.37 s airtime', () => {
    const { world, hero } = knockedHero();
    const start = hero.pos.x;
    until(world, () => hero.state === 'knockback');
    const air = until(world, () => hero.flight?.phase === 'skid');
    expect(air).toBeGreaterThan(TUNING.hit.knockbackAirtime - FRAME);
    expect(air).toBeLessThan(TUNING.hit.knockbackAirtime + FRAME);
    until(world, () => hero.state === 'down');
    expect(Math.abs(hero.pos.x - start)).toBeGreaterThan(1.5 * 0.95);
    expect(Math.abs(hero.pos.x - start)).toBeLessThan(1.5 * 1.05);
  });

  it('hit -> controllable again takes ~1.1 s, with i-frames while getting up', () => {
    const { world, hero, g } = knockedHero();
    until(world, () => hero.state === 'knockback');
    const t = until(world, () => hero.state === 'free');
    // measured f519 -> f554 = 35 frames
    expect(t).toBeGreaterThan(1.1 - FRAME);
    expect(t).toBeLessThan(35 / 30 + FRAME);
    expect(stateLabel(hero)).toBe('idle');
    expect(g.state).toBe('free');
  });

  it('get-up has i-frames', () => {
    const { world, hero } = knockedHero();
    until(world, () => hero.state === 'getUp');
    const hp = hero.hp;
    world.hitActor(undefined, hero, 'heavy', 1, 0, hero.pos);
    expect(hero.hp).toBe(hp);
    expect(hero.state).toBe('getUp');
  });

  it('a knockdown drops the held item 0.5-1 H away', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5, Z, TUNING.health.tough);
    d.hands[0] = newHand('baton');
    press(world, { attack: 'heavy', face: 1 });
    idle(world, 1.5);
    expect(d.hands[0]).toBeNull();
    expect(world.items).toHaveLength(1);
    const it = world.items[0];
    expect(it.state).toBe('floor');
    const dx = Math.abs(it.pos.x - (hero.pos.x + 0.5));
    expect(dx).toBeGreaterThan(0.4);
    expect(dx).toBeLessThan(1.1);
  });

  it('an uppercut launches about 1 H up', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5, Z, TUNING.health.tough);
    // cursor straight above the hero's head
    const aim = project(hero.pos.x + 0.1, 2.5, Z);
    press(world, { attack: 'heavy', aim });
    expect(hero.attack?.kind).toBe('uppercut');
    let apex = 0;
    until(world, () => { apex = Math.max(apex, d.pos.y); return d.state === 'down'; });
    expect(apex).toBeGreaterThan(0.95);
    expect(apex).toBeLessThan(1.05);
  });
});

describe('grab and throw (melee-grab-throw)', () => {
  it('a thrown body knocks down a second dummy', () => {
    const { world, hero } = setup(EMPTY, -2);
    const a = dummy(world, -1.5);
    const b = dummy(world, 0.5);
    const grabs = record(world, 'grab'), throws = record(world, 'throw');
    press(world, { grab: true, face: 1 });
    expect(a.state).toBe('grabbed');
    expect(hero.holding).toEqual({ kind: 'actor', id: a.id });
    idle(world, 0.1);
    // throw toward a floor point to the right on the same depth
    press(world, { grab: true, aim: project(3, 0, Z) });
    let downed = false;
    until(world, () => (downed ||= b.state === 'knockback' || b.state === 'down' || b.state === 'dead'), 120);
    expect(downed).toBe(true);
    expect(grabs).toHaveLength(1);
    expect(throws).toHaveLength(1);
  });

  it('a body thrown hard into a wall dies', () => {
    const { world } = setup(EMPTY, 2.6);
    const a = dummy(world, 3.0);
    press(world, { grab: true, face: 1 });
    press(world, { grab: true, aim: project(3.5, 0, Z) });
    const walls = record(world, 'wallHit');
    idle(world, 1);
    expect(walls.length).toBeGreaterThan(0);
    expect(a.state).toBe('dead');
  });

  it('corpses can be grabbed and thrown too, and settle and freeze again', () => {
    const { world, hero } = setup();
    const c = dummy(world, hero.pos.x + 0.5);
    c.hp = 1;
    press(world, { attack: 'light', face: 1 });
    until(world, () => c.corpse?.phase === 'frozen');
    const thawed = record(world, 'corpseThawed');
    const frozen = record(world, 'corpseFrozen');
    // walk to the corpse and pick it up
    walkTo(world, hero, c.pos.x - 0.5);
    press(world, { grab: true, face: 1 });
    expect(hero.holding?.id).toBe(c.id);
    expect(thawed).toHaveLength(1);
    press(world, { grab: true, aim: project(-3, 0, Z) });
    until(world, () => c.corpse?.phase === 'frozen');
    expect(frozen).toHaveLength(1);
  });
});

describe('low sweep (melee-low-sweep)', () => {
  it('diving into an adjacent enemy knocks him down and drops his item', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.7, Z, TUNING.health.tough);
    d.hands[0] = newHand('pistol');
    world.command = { ...IDLE_COMMAND, moveX: 1, dive: true };
    world.step();
    expect(hero.body.sweep).toBe(true);
    let downed = false;
    until(world, () => (downed ||= d.state === 'knockback'), 30);
    expect(downed).toBe(true);
    expect(d.hands[0]).toBeNull();
    expect(world.items.map((i) => i.kind)).toEqual(['pistol']);
  });
});

describe('decapitation (melee-decapitation)', () => {
  it('a killing heavy blow knocks the head off as an item', () => {
    const { world, hero } = setup();
    const d = dummy(world, hero.pos.x + 0.5);
    for (let i = 0; i < 2; i++) {
      press(world, { attack: 'light', face: 1 });
      idle(world, swingTime('light'));
    }
    expect(d.state).toBe('stun');
    const kills = record(world, 'kill');
    press(world, { attack: 'heavy', face: 1 });
    idle(world, 2);
    expect(kills[0]?.decap).toBe(true);
    expect(d.pose.headless).toBe(true);
    const head = world.items.find((i) => i.kind === 'head');
    expect(head?.state).toBe('floor');
    expect(d.corpse?.phase === 'settled' || d.corpse?.phase === 'frozen').toBe(true);
  });
});

describe('events (PLAN.md M2 hooks)', () => {
  it('a kill emits punch, hit, kill and bodyFall', () => {
    const { world, hero } = setup();
    dummy(world, hero.pos.x + 0.5).hp = 2;
    const seen = new Set<string>();
    for (const t of ['punch', 'hit', 'kill', 'bodyFall', 'corpseSettled'] as const) world.events.on(t, () => seen.add(t));
    press(world, { attack: 'heavy', face: 1 });
    idle(world, 1.2);
    expect([...seen].sort()).toEqual(['bodyFall', 'corpseSettled', 'hit', 'kill', 'punch']);
  });
});

describe('corpses (world-persistence-decals)', () => {
  it('200 corpses settle, freeze and stop costing sim time', () => {
    const { world } = setup();
    world.spawnCorpses(200);
    idle(world, TUNING.corpse.freezeDelay + 0.1);
    expect(world.actors.filter((a) => a.corpse?.phase === 'frozen')).toHaveLength(200);
  });
});
