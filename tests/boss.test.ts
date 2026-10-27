// M8 stage-1 boss (PLAN.md, research/mechanics/boss-halo): entrance, lightning raise, ward, damage.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { project } from '../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { spawnBoss } from '../src/sim/boss';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { World } from '../src/sim/world';

const B = TUNING.boss;

function setup(heroX = 1.5, bossX = -1.5) {
  const world = new World(STAGE1.rooms.arena.room);
  const hero = createActor('hero', heroX, 9.4, -1);
  world.addPlayer(hero);
  const boss = spawnBoss(world, bossX, 9.4, 1);
  return { world, hero, boss };
}

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); }
}
const secs = (s: number) => Math.round(s * TUNING.simHz);

function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

const head = (a: Actor) => project(a.pos.x, a.pos.y + 0.79 * B.scale, a.pos.z);
const chest = (a: Actor) => project(a.pos.x, a.pos.y + 0.4 * B.scale, a.pos.z);

/** Settle him at his hover height. */
function landed(world: World) { tick(world, {}, secs(B.descend) + 2); }

describe('boss entrance', () => {
  it('floats down from above the frame in 0.67 s and settles at his hover height', () => {
    const world = new World(STAGE1.rooms.arena.room);
    world.addPlayer(createActor('hero', 1.5, 9.4, -1));
    const arrive = record(world, 'bossArrive');
    const boss = spawnBoss(world, -1.5, 9.4, 1);
    expect(boss.pos.y).toBeCloseTo(B.startHeight, 5);
    expect(project(boss.pos.x, boss.pos.y, boss.pos.z)[1]).toBeLessThan(0); // above the screen top
    tick(world, {}, secs(B.descend) - 1);
    expect(arrive.map((e) => e.phase)).toEqual(['descend']);
    tick(world, {}, 2);
    expect(arrive.map((e) => e.phase)).toEqual(['descend', 'land']);
    expect(boss.pos.y).toBeCloseTo(B.hover, 1);
    tick(world, {}, 120);
    expect(boss.pos.y).toBeGreaterThan(B.hover - B.hoverBob - 1e-6);
    expect(boss.pos.y).toBeLessThan(B.hover + B.hoverBob + 1e-6);
  });

  it('faces the nearest player and ignores gravity', () => {
    const { world, boss } = setup(-3, 0);
    landed(world);
    expect(boss.facing).toBe(-1);
    expect(boss.pos.y).toBeGreaterThan(0.05);
  });
});

describe('lightning raise', () => {
  it('telegraphs with his hand, then a bolt raises an intact corpse; at most 2 zombies at a time', () => {
    const { world, hero, boss } = setup(3.2, -2);
    world.spawnCorpses(4);
    const casts = record(world, 'bossCast'), bolts = record(world, 'lightning'), rises = record(world, 'zombieRise');
    landed(world);
    // raises only in this test
    boss.boss!.strikeIn = boss.boss!.dashIn = Infinity;
    tick(world, {}, secs(B.firstRaise) + 1);
    expect(casts).toHaveLength(1);
    expect(bolts).toHaveLength(0); // still the telegraph
    tick(world, {}, secs(B.castTime));
    expect(bolts).toHaveLength(1);
    expect(rises.filter((e) => e.phase === 'start').map((e) => e.actorId)).toEqual([bolts[0].targetId]);
    expect(bolts[0].targetId).toBe(casts[0].targetId);
    // keep the hero alive and the zombies standing: count raises over a long time
    for (let i = 0; i < secs(30); i++) { tick(world); hero.hp = hero.maxHp; }
    const zombies = world.actors.filter((a) => a.kind === 'zombie' && alive(a));
    expect(zombies.length).toBe(B.maxZombies);
    expect(bolts.length).toBe(B.maxZombies);
  });

  it("doesn't raise gibbed corpses, and casts nothing with none left", () => {
    const { world, hero } = setup();
    world.spawnCorpses(2);
    for (const a of world.actors) if (a.corpse) a.corpse.gibbed = true;
    const casts = record(world, 'bossCast');
    landed(world);
    tick(world, {}, secs(5));
    expect(casts.filter((c) => c.targetId !== hero.id)).toHaveLength(0);
  });
});

describe('ward and damage', () => {
  it('comes up when a gun faces him, blocks head shots from the front for ~1 s, then a window', () => {
    const { world, hero, boss } = setup();
    hero.hands[0] = newHand('pistol', 99, 0);
    const wards = record(world, 'ward'), blocked = record(world, 'wardHit'), hits = record(world, 'hit');
    landed(world);
    // the ward only in this test: no lightning, dash or phase 2 to keep him busy
    boss.boss!.strikeIn = boss.boss!.dashIn = boss.boss!.raiseIn = Infinity;
    boss.boss!.stage = 2;
    expect(wards.map((w) => w.up)).toEqual([true]);
    tick(world, { press: [true, false], aim: head(boss) });
    expect(blocked).toHaveLength(1);
    expect(hits).toHaveLength(0);
    expect(boss.hp).toBe(B.hp);
    tick(world, {}, secs(B.wardUp));
    expect(wards.map((w) => w.up)).toEqual([true, false]);
    // (the blocked shot just queued a strike: tested on its own below)
    expect(boss.boss!.strikeIn).toBeCloseTo(B.strike.afterWard, 1);
    boss.boss!.strikeIn = Infinity;
    // the window: a head shot lands
    tick(world, { press: [true, false], aim: head(boss) });
    expect(boss.hp).toBe(B.hp - 1);
    // and after the window it comes up again
    tick(world, {}, secs(B.wardWindow) + 1);
    expect(wards.map((w) => w.up)).toEqual([true, false, true]);
  });

  it('only head shots hurt him; body shots and punches just flash him', () => {
    const { world, hero, boss } = setup();
    landed(world);
    // no gun yet: no ward
    hero.pos.x = boss.pos.x + 0.5;
    tick(world, { attack: 'heavy', face: -1 }, 1);
    tick(world, {}, 30);
    expect(boss.hp).toBe(B.hp);
    hero.pos.x = 1.5;
    boss.boss!.window = 99; // keep the ward down for this test
    boss.boss!.stage = 2; // and no phase 2 transition (its own test below)
    hero.hands[0] = newHand('pistol', 99, 0);
    tick(world, { press: [true, false], aim: chest(boss) });
    tick(world, {}, 20);
    expect(boss.hp).toBe(B.hp);
    for (let k = 0; k < B.hp; k++) { tick(world, { press: [true, false], aim: head(boss) }); tick(world, {}, 20); }
    expect(alive(boss)).toBe(false);
    expect(boss.corpse?.raisable).toBe(false);
    expect(world.kills).toBe(1);
  });

  it('shots from behind pass the ward', () => {
    // the hero in front draws the ward; player 2 shoots from behind (farther away, so he keeps facing the hero)
    const { world, hero, boss } = setup(0, -1.5);
    const partner = createActor('hero', -3.4, 9.4, 1);
    world.addPlayer(partner);
    partner.hands[0] = newHand('pistol', 99, 0);
    hero.hands[0] = newHand('pistol', 99, 0);
    landed(world);
    expect(boss.facing).toBe(1);
    expect(boss.boss!.ward).toBeGreaterThan(0);
    world.commands[1] = { ...IDLE_COMMAND, press: [true, false], aim: head(boss) };
    tick(world);
    expect(boss.hp).toBe(B.hp - 1);
  });

  it("can't be grabbed", () => {
    const { world, hero, boss } = setup();
    landed(world);
    hero.pos.x = boss.pos.x + 0.4;
    tick(world, { grab: true, face: -1 });
    tick(world, {}, 10);
    expect(hero.holding).toBeUndefined();
    expect(boss.grabbedBy).toBeUndefined();
  });
});

/** Only the move under test: the others wait forever. */
function only(boss: Actor, move: 'strike' | 'dash' | 'raise') {
  const s = boss.boss!;
  s.stage = 2; // no sweep / cannon either
  s.strikeIn = move === 'strike' ? 0 : Infinity;
  s.dashIn = move === 'dash' ? 0 : Infinity;
  s.raiseIn = move === 'raise' ? 0 : Infinity;
}

describe('lightning strike', () => {
  it('lands where you stood: knockdown, one life, and the gun flies out of your hand', () => {
    const { world, hero, boss } = setup(2, -2);
    landed(world);
    boss.boss!.window = 99; // no ward in the way
    hero.hands[0] = newHand('smg');
    only(boss, 'strike');
    const bolts = record(world, 'lightning');
    tick(world, {}, secs(B.castTime) + 2);
    expect(bolts).toHaveLength(1);
    expect(bolts[0].targetId).toBe(hero.id);
    expect(hero.state).toBe('knockback');
    expect(hero.hp).toBe(hero.maxHp - 1);
    expect(hero.hands[0]).toBeNull();
    expect(world.items.some((it) => it.kind === 'smg')).toBe(true);
  });

  it('moving away during the telegraph dodges it', () => {
    const { world, hero, boss } = setup(2, -2);
    landed(world);
    only(boss, 'strike');
    tick(world, {}, 1);
    const bolts = record(world, 'lightning');
    tick(world, { moveX: 1 }, secs(B.castTime) + 2);
    expect(bolts).toHaveLength(1);
    expect(bolts[0].targetId).toBe(0);
    expect(hero.hp).toBe(hero.maxHp);
    expect(hero.state).toBe('free');
  });

  it('a burst his ward blocked is answered with lightning right after it drops', () => {
    const { world, hero, boss } = setup(2.5, -2);
    hero.hands[0] = newHand('pistol', 99, 0);
    landed(world);
    boss.boss!.strikeIn = boss.boss!.dashIn = boss.boss!.raiseIn = Infinity;
    tick(world, { press: [true, false], aim: head(boss) });
    const casts = record(world, 'bossCast');
    tick(world, {}, secs(B.wardUp + B.strike.afterWard) + 2);
    expect(casts.map((c) => c.targetId)).toEqual([hero.id]);
  });
});

describe('hover dash, grab and body slams', () => {
  it('dashes ~2 H in 0.27 s after a wind-up and grabs you', () => {
    const { world, hero, boss } = setup(0.5, -1.8);
    landed(world);
    only(boss, 'dash');
    const x0 = boss.pos.x, dash = record(world, 'bossDash');
    tick(world, {}, 1);
    expect(dash.map((d) => d.phase)).toEqual(['windup']);
    tick(world, {}, secs(B.dash.windup) + 1);
    expect(dash.map((d) => d.phase)).toEqual(['windup', 'go']);
    tick(world, {}, secs(B.dash.time) + 1);
    expect(boss.pos.x - x0).toBeCloseTo(hero.pos.x - B.dash.stopShort - x0, 1);
    expect(boss.pos.x - x0).toBeGreaterThan(1.8);
    expect(hero.state).toBe('grabbed');
    expect(hero.grabbedBy).toBe(boss.id);
  });

  it('6 slams one every 0.58 s, then the throw: a hard knockdown and one life', () => {
    const { world, hero, boss } = setup(0.5, -1.8);
    landed(world);
    only(boss, 'dash');
    const slams: number[] = [];
    world.events.on('bossSlam', () => slams.push(world.time));
    tick(world, {}, secs(B.dash.windup + B.dash.time) + 2);
    expect(hero.state).toBe('grabbed');
    const x0 = hero.pos.x;
    tick(world, {}, secs(B.slam.lift + B.slam.count * B.slam.every) + 2);
    expect(slams).toHaveLength(B.slam.count);
    for (let i = 1; i < slams.length; i++) expect(slams[i] - slams[i - 1]).toBeCloseTo(B.slam.every, 1);
    expect(hero.hp).toBe(hero.maxHp - 1);
    expect(hero.grabbedBy).toBeUndefined();
    expect(hero.state).toBe('knockback');
    tick(world, {}, 60);
    expect(Math.abs(hero.pos.x - x0)).toBeGreaterThan(2);
  });

  it('mashing cuts the slams short', () => {
    const { world, boss } = setup(0.5, -1.8);
    landed(world);
    only(boss, 'dash');
    const slams = record(world, 'bossSlam');
    tick(world, {}, secs(B.dash.windup + B.dash.time) + 2);
    for (let i = 0; i < secs(B.slam.lift + B.slam.count * B.slam.every); i++) tick(world, { attack: i % 2 ? 'light' : null, jump: i % 2 === 0 });
    expect(slams).toHaveLength(B.slam.minSlams);
  });

  it('a head shot from a teammate makes him drop you; nobody else can hit you while held', () => {
    // the hero is the nearer one (he dashes at him); player 2 stands behind the boss
    const { world, hero, boss } = setup(1.0, -1.0);
    const partner = createActor('hero', -3.4, 9.4, 1);
    world.addPlayer(partner);
    partner.hands[0] = newHand('pistol', 99, 0);
    landed(world);
    only(boss, 'dash');
    boss.boss!.window = 99;
    tick(world, {}, secs(B.dash.windup + B.dash.time) + 2);
    expect(hero.state).toBe('grabbed');
    const g = createActor('grunt', hero.pos.x, hero.pos.z, 1);
    world.actors.push(g);
    world.hitActor(g, hero, 'heavy', 1, 0, hero.pos);
    expect(hero.hp).toBe(hero.maxHp);
    expect(alive(hero)).toBe(true);
    world.commands[1] = { ...IDLE_COMMAND, press: [true, false], aim: head(boss) };
    tick(world);
    expect(boss.hp).toBe(B.hp - 1);
    expect(hero.grabbedBy).toBeUndefined();
    expect(hero.state).toBe('knockback');
    expect(hero.hp).toBe(hero.maxHp);
  });
});

describe('phase 2: corpse sweep and cannon', () => {
  const C = B.cannon;
  /** A boss in the fight with nothing on his timers but phase 2. */
  function phase2(heroX = 2.5, bossX = -2) {
    const t = setup(heroX, bossX);
    landed(t.world);
    const s = t.boss.boss!;
    s.strikeIn = s.dashIn = s.raiseIn = Infinity;
    s.window = 99;
    return t;
  }
  /** Wound him once (a head shot from the hero) to open phase 2. */
  function wound(world: World, hero: Actor, boss: Actor) {
    hero.hands[0] = newHand('pistol', 99, 0);
    tick(world, { press: [true, false], aim: head(boss) });
    hero.hands[0] = null;
  }

  it('his first head wound opens phase 2: the sweep sends every intact body off the screen', () => {
    const { world, hero, boss } = phase2();
    world.spawnCorpses(5);
    const gibbed = world.actors.find((a) => a.corpse)!;
    gibbed.corpse!.gibbed = true;
    const sweeps = record(world, 'bossSweep');
    wound(world, hero, boss);
    expect(sweeps.map((e) => e.phase)).toEqual(['windup']);
    tick(world, {}, secs(B.sweep.windup) + 1);
    expect(sweeps.map((e) => e.phase)).toEqual(['windup', 'push']);
    expect(sweeps[1].count).toBe(4);
    tick(world, {}, secs(1));
    const left = world.actors.filter((a) => a.kind === 'grunt' && a.state === 'dead');
    expect(left).toEqual([gibbed]);
  });

  it('without a wound, phase 2 starts after 30 s of fighting', () => {
    const { world } = phase2();
    const sweeps = record(world, 'bossSweep');
    tick(world, {}, secs(B.sweep.after - 1));
    expect(sweeps).toHaveLength(0);
    tick(world, {}, secs(1) + 2);
    expect(sweeps).toHaveLength(1);
  });

  it('the cannon: shadow, drop, it crushes what is under it and stays as solid ground', () => {
    const { world, hero, boss } = phase2();
    const drops = record(world, 'cannonDrop');
    wound(world, hero, boss);
    // a grunt standing where it will land (placed after the shot, so it can't catch the bullet)
    const g = createActor('grunt', boss.pos.x + C.offset, boss.pos.z, -1);
    world.actors.push(g);
    tick(world, {}, secs(B.sweep.windup + 0.4) + 2);
    expect(drops.map((d) => d.phase)).toEqual(['shadow']);
    const cannon = world.cannons[0];
    expect(cannon.live).toBe(true);
    expect(cannon.y).toBeGreaterThan(0);
    tick(world, {}, secs(C.shadow + C.dropHeight / C.fallSpeed) + 2);
    expect(drops.map((d) => d.phase)).toEqual(['shadow', 'fall', 'land']);
    expect(cannon.y).toBe(0);
    expect(g.state).toBe('dead');
    const prop = world.room.props.find((p) => p.kind === 'cannon')!;
    expect(prop).toBeDefined();
    expect(g.pos.x < prop.x0 || g.pos.x > prop.x1).toBe(true);
  });

  /** Wound him and wait until he's behind the landed cannon, about to fire. */
  function toVolley(world: World, hero: Actor, boss: Actor) {
    wound(world, hero, boss);
    tick(world, {}, secs(B.sweep.windup + 0.4 + C.shadow + C.dropHeight / C.fallSpeed) + 4);
    tick(world, {}, secs(0.3) + 1);
    return world.cannons[0];
  }

  it('volleys: he hovers behind it and fires 4 balls 1.3 s apart; standing in the lane gets you knocked down', () => {
    const { world, hero, boss } = phase2(1.8, -2);
    const fires = record(world, 'cannonFire');
    const cannon = toVolley(world, hero, boss);
    expect(boss.pos.x).toBeCloseTo(cannon.x - cannon.facing * C.behind, 1);
    tick(world, {}, secs(C.firstShot) + 10);
    expect(fires).toHaveLength(1);
    expect(hero.hp).toBe(hero.maxHp - 1);
    expect(['knockback', 'down', 'getUp']).toContain(hero.state);
    for (let i = 0; i < secs(4 * TUNING.cannon.interval); i++) { tick(world); hero.hp = hero.maxHp; }
    expect(fires).toHaveLength(C.shots);
    expect(cannon.shots).toBe(0);
  });

  it('going prone lets the whole volley pass over you', () => {
    const { world, hero, boss } = phase2(1.8, -2);
    const fires = record(world, 'cannonFire');
    toVolley(world, hero, boss);
    tick(world, { dive: true });
    tick(world, {}, secs(C.firstShot + C.shots * TUNING.cannon.interval));
    expect(fires).toHaveLength(C.shots);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it("his ward can't come up while he works the cannon, and shots pass over it to his head", () => {
    const { world, hero, boss } = phase2(1.8, -2);
    wound(world, hero, boss);
    tick(world, {}, secs(B.sweep.windup + 0.4 + C.shadow + C.dropHeight / C.fallSpeed + 0.3) + 6);
    boss.boss!.window = 0; // the ward could rise now, but he's busy
    hero.hands[0] = newHand('pistol', 99, 0);
    hero.state = 'free';
    tick(world, {}, 2);
    expect(boss.boss!.ward).toBe(0);
    const hp = boss.hp;
    tick(world, { press: [true, false], aim: head(boss) });
    expect(boss.hp).toBe(hp - 1);
  });

  it('when he dies the cannon stays, silent, as terrain', () => {
    const { world, hero, boss } = phase2(1.8, -2);
    wound(world, hero, boss);
    tick(world, {}, secs(B.sweep.windup + 0.4 + C.shadow + C.dropHeight / C.fallSpeed + 0.3) + 6);
    hero.hands[0] = newHand('pistol', 99, 0);
    while (alive(boss)) { tick(world, { press: [true, false], aim: head(boss) }); tick(world, {}, 12); hero.hp = hero.maxHp; }
    const fires = record(world, 'cannonFire');
    tick(world, {}, secs(5));
    expect(fires).toHaveLength(0);
    expect(world.cannons).toHaveLength(1);
    expect(world.room.props.some((p) => p.kind === 'cannon')).toBe(true);
  });
});

describe('phase 2 always plays', () => {
  it("a burst to the head can't skip it: after the first wound nothing counts until the cannon lands", () => {
    const { world, hero, boss } = setup(2.5, -2);
    landed(world);
    const s = boss.boss!;
    s.strikeIn = s.dashIn = s.raiseIn = Infinity;
    s.window = 99;
    hero.hands[0] = newHand('smg', 99, 0);
    const sweeps = record(world, 'bossSweep');
    // a full-auto burst at his head for a whole second
    for (let i = 0; i < 60; i++) tick(world, { hold: [true, false], press: [i === 0, false], aim: head(boss) });
    expect(boss.hp).toBe(B.hp - 1);
    expect(sweeps[0]?.phase).toBe('windup');
    expect(alive(boss)).toBe(true);
    // once the cannon is down he can be hurt again
    hero.hands[0] = null;
    for (let i = 0; i < secs(5) && !(world.cannons[0]?.y === 0); i++) tick(world);
    tick(world); // he notices it's down on his next step
    expect(world.cannons[0].y).toBe(0);
    expect(boss.boss!.untouchable).toBe(false);
    hero.hands[0] = newHand('pistol', 99, 0);
    hero.hp = hero.maxHp;
    tick(world, {}, 1);
    tick(world, { press: [true, false], aim: head(boss) });
    expect(boss.hp).toBe(B.hp - 2);
  });
});
