// M14b slice B (controls & combat): one regression test per audit item (design/audit/cmb.md,
// design/audit/enc.md ENC-03). Each `Test:` line of the finding is checked here.
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { project } from '../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { mercyWindow } from '../src/sim/combat';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { RoomDef } from '../src/sim/room';
import { clearInputBuffer } from '../src/sim/stage';
import { spawnEnemy } from '../src/sim/waves';
import { World } from '../src/sim/world';

const Z = 9.2;
const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
type Cmd = Partial<PlayerCommand>;

function setup(x = 0, room: RoomDef = EMPTY) {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}
function dummy(world: World, x: number, o: { hp?: number; variant?: Actor['variant'] } = {}): Actor {
  const g = createActor('grunt', x, Z, -1);
  g.variant = o.variant;
  if (o.hp !== undefined) g.hp = g.maxHp = o.hp;
  world.actors.push(g);
  return g;
}
const step = (world: World, cmd: Cmd = {}, n = 1) => { for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); } };
const ahead = (h: Actor, dx = 1, y = 0.7) => project(h.pos.x + dx, y, h.pos.z);
const chestOf = (a: Actor) => project(a.pos.x, a.pos.y + 0.45, a.pos.z);
const count = (world: World, type: string, actorId?: number) => {
  const n = { v: 0 };
  world.events.onAny((t, p) => { if (t === type && (actorId === undefined || (p as { actorId?: number }).actorId === actorId)) n.v++; });
  return n;
};
/** Knock `g` down with a heavy and wait until he lies still (or gets up). */
function floor(world: World, hero: Actor, g: Actor, until: Actor['state'] = 'down') {
  world.hitActor(hero, g, 'heavy', 1, 0, { x: g.pos.x, y: 0.8, z: Z });
  for (let i = 0; i < 120 && g.state !== until; i++) step(world);
  g.pos.x = hero.pos.x + 0.45;
}

const T = TUNING as unknown as { health: { mercy: number }; hit: { chainStun: number[]; toughShrug: number }; input: { buffer: number } };
const saved = { mercy: T.health.mercy, chainStun: [...T.hit.chainStun], shrug: T.hit.toughShrug, buffer: T.input.buffer };
afterEach(() => {
  T.health.mercy = saved.mercy; T.hit.chainStun = [...saved.chainStun]; T.hit.toughShrug = saved.shrug; T.input.buffer = saved.buffer;
});

describe('ENC-03 mercy window (+ CMB-15 / VIS-19 absorbed response)', () => {
  /** An SMG burst: a bullet every 0.1 s for 0.35 s (TUNING.ai.ranged.burst), hero at full health. */
  function burst(difficulty: World['difficulty'] = 'pro') {
    const { world, hero } = setup();
    world.difficulty = difficulty;
    const g = dummy(world, -3);
    const absorbed = count(world, 'hitAbsorbed', hero.id);
    for (let t = 0; t < 60; t++) {
      if (t % 6 === 0 && t <= 21) world.hitBullet(g, hero, 2, 'body', 1, false, { x: hero.pos.x, y: 0.4, z: Z });
      step(world);
    }
    return { lost: TUNING.health.hero - hero.hp, absorbed: absorbed.v };
  }

  it('one SMG burst takes one life on Pro, the rest is absorbed', () => {
    const r = burst();
    expect(r.lost).toBe(1);
    expect(r.absorbed).toBe(3);
  });

  it('scales with difficulty: Noob 0.5 s, Pro 0.3 s, Notch 0.15 s', () => {
    const w = new World(EMPTY);
    const at = (d: World['difficulty']) => { w.difficulty = d; return mercyWindow(w); };
    expect(at('noob')).toBeCloseTo(0.5);
    expect(at('pro')).toBeCloseTo(0.3);
    expect(at('notch')).toBeCloseTo(0.15);
    expect(at('hacker')).toBeGreaterThan(0.15);
    expect(at('hacker')).toBeLessThan(0.3);
    expect(burst('notch').lost).toBe(2);
  });

  it('A/B: mercy 0 restores one burst = every life', () => {
    T.health.mercy = 0;
    expect(burst().lost).toBe(3);
  });

  it('scripted lethal hits go through (the last stand, the boss cameo)', () => {
    const { world, hero } = setup();
    const g = dummy(world, -3);
    world.hitBullet(g, hero, 2, 'body', 1, false, { x: 0, y: 0.4, z: Z });
    step(world, {}, 3);
    world.lastStand = { t: 0 } as unknown as World['lastStand'];
    world.hitBullet(g, hero, 2, 'body', 1, false, { x: 0, y: 0.4, z: Z });
    expect(hero.hp).toBe(TUNING.health.hero - 2);
  });

  it('enemies have no mercy window; get-up i-frames and shield hits emit hitAbsorbed', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol', 99);
    const g = dummy(world, 2, { hp: 50 });
    world.hitBullet(hero, g, 1, 'body', 1, false, { x: 2, y: 0.4, z: Z });
    world.hitBullet(hero, g, 1, 'body', 1, false, { x: 2, y: 0.4, z: Z });
    expect(g.hp).toBe(48);
    floor(world, hero, g, 'getUp');
    const reasons: string[] = [];
    world.events.on('hitAbsorbed', (e) => reasons.push(e.reason));
    world.hitBullet(hero, g, 1, 'body', 1, false, { x: g.pos.x, y: 0.4, z: Z });
    expect(reasons).toEqual(['getUp']);
    // a body held up as a shield
    const s = setup();
    const shield = dummy(s.world, 0.5);
    step(s.world, { grab: true, aim: ahead(s.hero) });
    step(s.world, {}, 3);
    expect(shield.grabbedBy).toBe(s.hero.id);
    const why: string[] = [];
    s.world.events.on('hitAbsorbed', (e) => why.push(e.reason));
    s.world.hitBullet(dummy(s.world, 3), shield, 2, 'body', -1, false, { x: shield.pos.x, y: 0.4, z: Z });
    expect(why).toEqual(['shield']);
  });
});

describe('CMB-06 stun shrinks within a chain', () => {
  it('jab stuns go 0.7 -> 0.45 -> 0.25 s', () => {
    const { world, hero } = setup();
    const g = dummy(world, 0.5, { hp: 40 });
    T.hit.toughShrug = 0;
    const stuns: number[] = [];
    for (let i = 0; i < 3; i++) { world.hitActor(hero, g, 'light', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); stuns.push(g.stunFor); step(world, {}, 24); }
    expect(stuns.map((s) => Math.round(s * 100) / 100)).toEqual([0.7, 0.45, 0.25]);
  });

  it('a riot under 0.4 s jabs swings back within 2 s (the 4th jab is shrugged off)', () => {
    const run = () => {
      const { world, hero } = setup();
      const g = spawnEnemy(world, 'grunt', null, 0.5, Z, { variant: 'riot' });
      g.entering = undefined;
      g.hp = g.maxHp = 40;
      let back = -1, blocks = 0;
      world.events.on('hit', (e) => { if (e.actorId === hero.id && back < 0) back = world.time; });
      world.events.on('block', (e) => { if (e.actorId === g.id) blocks++; });
      for (let t = 0; t < 60 * 4; t++) { step(world, { attack: t % 24 === 0 ? 'light' : null, aim: project(g.pos.x, 0.7, g.pos.z), moveX: Math.abs(g.pos.x - hero.pos.x) > 0.5 ? 1 : 0 }); hero.hp = 3; hero.mercyAt = undefined; }
      return { back, blocks };
    };
    const now = run();
    expect(now.blocks).toBeGreaterThan(0);
    expect(now.back).toBeGreaterThan(0);
    expect(now.back).toBeLessThanOrEqual(2);
    // A/B: the old numbers lock him for good
    T.hit.chainStun = [0.7, 0.7, 0.7]; T.hit.toughShrug = 0;
    expect(run().back).toBe(-1);
  });
});

describe('CMB-08 generic edge buffer', () => {
  /** A press of `second` at `off` ticks before the hero is ready again after `first`. */
  function pressBefore(first: (t: number, h: Actor) => Cmd, second: Cmd, off: number, prep?: (w: World, h: Actor) => void) {
    const run = (extraAt: number) => {
      const { world, hero } = setup();
      prep?.(world, hero);
      const ev = { jump: count(world, 'jump', hero.id), dive: count(world, 'dive', hero.id), punch: count(world, 'punch', hero.id) };
      let ready = -1;
      for (let t = 0; t < 90; t++) {
        let c = first(t, hero);
        if (t === extraAt) c = { ...c, ...second };
        step(world, c);
        if (ready < 0 && t > 0 && hero.state === 'free' && hero.body.state === 'ground' && !hero.attack && !hero.holding) ready = t;
      }
      return { ready, jumps: ev.jump.v, dives: ev.dive.v, punches: ev.punch.v };
    };
    const base = run(-1);
    return { base, with: run(base.ready - off) };
  }

  it('jump and dive pressed 6 ticks before a jab ends come out', () => {
    const jab = (t: number, h: Actor): Cmd => ({ attack: t === 0 ? 'light' : null, aim: ahead(h) });
    const j = pressBefore(jab, { jump: true }, 6);
    expect(j.with.jumps).toBe(j.base.jumps + 1);
    const d = pressBefore(jab, { dive: true, moveX: 1 }, 6);
    expect(d.with.dives).toBe(d.base.dives + 1);
  });

  it('a punch pressed during the hero flinch or the prone get-up comes out', () => {
    const flinch = (w: World, h: Actor) => { w.hitActor(dummy(w, 2, { hp: 99 }), h, 'light', -1, 0, { x: h.pos.x, y: 0.8, z: Z }); };
    const f = pressBefore(() => ({}), { attack: 'light', aim: [0, 0] }, 6, flinch);
    expect(f.with.punches).toBe(f.base.punches + 1);
    const up = (t: number): Cmd => ({ dive: t === 0 || t === 12 });
    const u = pressBefore(up, { attack: 'light' }, 6);
    expect(u.with.punches).toBe(u.base.punches + 1);
    // ...and after a body throw
    const thr = (t: number, h: Actor): Cmd => ({ grab: t === 0 || t === 12, aim: ahead(h) });
    const b = pressBefore(thr, { attack: 'light', aim: [0, 0] }, 6, (w) => { dummy(w, 0.5, { hp: 99 }); });
    expect(b.with.punches).toBe(b.base.punches + 1);
  });

  it('a knife swing queues the next one; A/B buffer 0 drops it', () => {
    const run = () => {
      const { world, hero } = setup();
      hero.hands[1] = newHand('knife');
      dummy(world, 0.5, { hp: 99 });
      const swings = count(world, 'punch', hero.id);
      // the stab takes 11 frames (22 ticks): the second click 6 ticks before it ends
      for (let t = 0; t < 60; t++) step(world, { attack: t === 0 || t === 16 ? 'heavy' : null, press: [false, t === 0 || t === 16], aim: ahead(hero) });
      return swings.v;
    };
    expect(run()).toBe(2);
    T.input.buffer = 0;
    expect(run()).toBe(1);
  });

  it('is cleared on room entry / pause close', () => {
    const { world, hero } = setup();
    world.hitActor(dummy(world, 2, { hp: 99 }), hero, 'light', -1, 0, { x: 0, y: 0.8, z: Z });
    step(world, { jump: true });
    expect(hero.inbuf?.jump).toBeDefined();
    clearInputBuffer(hero);
    expect(hero.inbuf).toBeUndefined();
  });
});

describe('CMB-09 jump buffer and coyote time', () => {
  it('a jump pressed 6 ticks before landing jumps on landing', () => {
    const { world, hero } = setup();
    const jumps = count(world, 'jump', hero.id);
    step(world, { jump: true });
    let land = -1;
    for (let t = 0; t < 60 && land < 0; t++) { step(world); if (hero.body.state === 'ground') land = t; }
    const { world: w2, hero: h2 } = setup();
    const j2 = count(w2, 'jump', h2.id);
    step(w2, { jump: true });
    for (let t = 0; t < 60; t++) step(w2, { jump: t === land - 6 });
    expect(jumps.v).toBe(1);
    expect(j2.v).toBe(2);
  });

  it('a jump 4 ticks after walking off a prop still jumps', () => {
    const room: RoomDef = { ...EMPTY, props: [{ kind: 'table', x0: 0, x1: 1.2, z0: 9.0, z1: 9.6, top: 0.5 }] };
    const { world, hero } = setup(1.0, room);
    hero.pos.y = 0.5;
    const jumps = count(world, 'jump', hero.id);
    let off = -1;
    for (let t = 0; t < 60; t++) {
      step(world, { moveX: 1, jump: off >= 0 && t === off + 4 });
      if (off < 0 && hero.body.state === 'air') off = t;
    }
    expect(off).toBeGreaterThan(0);
    expect(jumps.v).toBe(1);
  });
});

describe('CMB-16 first different press wins inside a move', () => {
  it('L, uppercut and a jab inside the jab: the uppercut comes next and launches', () => {
    const { world, hero } = setup();
    const g = dummy(world, 0.5, { hp: 99 });
    const kinds: string[] = [];
    world.events.on('punch', (e) => e.actorId === hero.id && kinds.push(e.kind));
    for (let t = 0; t < 40; t++) {
      const c: Cmd = { aim: ahead(hero) };
      if (t === 0) c.attack = 'light';
      if (t === 15) { c.attack = 'heavy'; c.aim = ahead(hero, 0.3, 2.5); }
      if (t === 21) c.attack = 'light';
      step(world, c);
    }
    expect(kinds.slice(0, 2)).toEqual(['light', 'uppercut']);
    expect(g.flight?.juggle).toBeDefined();
  });
});

describe('CMB-10 a shot pressed late in the cooldown fires when ready', () => {
  it('pistol pressed every 8 ticks fires >= 13 shots in 2 s', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol', 99);
    const shots = count(world, 'shot', hero.id);
    for (let t = 0; t < 120; t++) step(world, { press: [t % 8 === 0, false], aim: ahead(hero, 2) });
    expect(shots.v).toBeGreaterThanOrEqual(13);
  });
});

describe('CMB-11 a dive just before landing dives, not kicks', () => {
  it('dive 3 ticks before landing -> prone after landing, no kick', () => {
    const probe = setup();
    step(probe.world, { jump: true });
    let land = -1;
    for (let t = 0; t < 60 && land < 0; t++) { step(probe.world); if (probe.hero.body.state === 'ground') land = t; }
    const { world, hero } = setup();
    step(world, { jump: true });
    let kicked = false;
    for (let t = 0; t < 40; t++) { step(world, { dive: t === land - 3 }); kicked ||= !!hero.body.kick; }
    expect(kicked).toBe(false);
    expect(['goingProne', 'prone', 'diving']).toContain(hero.body.state);
  });

  it('high in the air it is still the flying kick', () => {
    const { world, hero } = setup();
    step(world, { jump: true });
    let kicked = false;
    for (let t = 0; t < 20; t++) { step(world, { dive: t === 6 }); kicked ||= !!hero.body.kick; }
    expect(kicked).toBe(true);
  });
});

describe('CMB-13 + CMB-14 the weapon finisher', () => {
  it('knife LMB at a downed grunt stabs it (the knife stays in hand); at a rising one it is not thrown', () => {
    for (const st of ['down', 'getUp'] as const) {
      const { world, hero } = setup();
      hero.hands[0] = newHand('knife');
      const g = dummy(world, 0.45, { hp: 50 });
      floor(world, hero, g, st);
      const hp = g.hp;
      for (let t = 0; t < 40; t++) step(world, { attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(hero) });
      expect(hero.hands[0]?.item).toBe('knife');
      if (st === 'down') { expect(g.hp).toBeLessThan(hp); expect(['down', 'knockback', 'getUp']).toContain(g.state); }
    }
  });

  it('a bat swing at a downed agent hits it, planted', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('bat');
    const g = dummy(world, 0.45, { hp: 12, variant: 'agent' });
    floor(world, hero, g);
    const x0 = hero.pos.x;
    for (let t = 0; t < 30; t++) step(world, { attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(hero), moveX: 1 });
    expect(g.hp).toBeLessThan(12);
    expect(hero.pos.x).toBeCloseTo(x0, 1);
  });

  it('an uppercut at a downed body is a heavy finisher', () => {
    const { world, hero } = setup();
    const g = dummy(world, 0.45, { hp: 50 });
    floor(world, hero, g);
    const kinds: string[] = [];
    world.events.on('punch', (e) => e.actorId === hero.id && kinds.push(e.kind));
    const hp = g.hp;
    for (let t = 0; t < 30; t++) step(world, { attack: t === 0 ? 'heavy' : null, aim: ahead(hero, 0.3, 2.5) });
    expect(kinds[0]).toBe('finisher');
    expect(g.hp).toBe(hp - TUNING.melee.finisher.heavyDamage);
  });
});

describe('CMB-04 the shotgun no longer one-shots the agent', () => {
  it('agent at 2 H survives a point-blank-range blast (>= 2 blasts to kill), a grunt still dies to one', () => {
    for (const aimAt of ['chest', 'head'] as const) {
      const { world, hero } = setup(-1);
      hero.hands[0] = newHand('shotgun', 99);
      const g = dummy(world, 1, { hp: TUNING.ai.agent.hp, variant: 'agent' });
      const hits = count(world, 'hit', g.id);
      step(world, { press: [true, false], aim: aimAt === 'chest' ? chestOf(g) : project(g.pos.x, 0.79, Z) });
      expect(hits.v).toBeGreaterThan(0);
      expect(alive(g)).toBe(true);
      expect(g.hp).toBeGreaterThanOrEqual(TUNING.ai.agent.hp - 4);
    }
    const { world, hero } = setup(-1);
    hero.hands[0] = newHand('shotgun', 99);
    const g = dummy(world, 0);
    step(world, { press: [true, false], aim: chestOf(g) });
    expect(alive(g)).toBe(false);
  });
});
