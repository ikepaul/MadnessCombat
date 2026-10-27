// M8 stage 1 script (PLAN.md): the intro beat, and the stage running headless to its end card
// with a scripted bot (sequencer + waves don't deadlock).
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { BOSS_BEAT, GRENADE_BEAT, INTRO, stage1 } from '../src/data/stages/stage1Script';
import { isBoss } from '../src/sim/boss';
import { GRENADE } from '../src/data/melee';
import { project } from '../src/render/camera';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { World } from '../src/sim/world';

function setup() {
  const world = new World(STAGE1.rooms.arena.room);
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  world.seq.run(stage1);
  return { world, hero };
}

const npc = (world: World, v: Actor['variant']) => world.actors.find((a) => a.variant === v)!;

/** Walk up to `t` on its depth and jab it whenever in reach: real inputs, like a player. */
function brawl(hero: Actor, t: Actor, tick: number): PlayerCommand {
  const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z, face = (dx >= 0 ? 1 : -1) as 1 | -1;
  const inReach = Math.abs(dx) <= TUNING.melee.range - 0.1 && Math.abs(dz) <= TUNING.melee.depthBand * 0.5;
  if (inReach) return { ...IDLE_COMMAND, face, attack: hero.state === 'free' && tick % 6 === 0 ? 'light' : null };
  const d = Math.hypot(dx, dz);
  return { ...IDLE_COMMAND, face, moveX: dx / d, moveZ: dz / d };
}

describe('stage 1 intro', () => {
  it('places the boombox NPC with his boombox and the dancer, and holds the hero during the title card', () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox'), dancer = npc(world, 'dancer');
    expect(bb.carry).toBe('boombox');
    expect(bb.ai).toBeUndefined();
    expect(dancer.ai).toBeUndefined();
    expect(hero.pos.x).toBeCloseTo(INTRO.hero.x, 5);
    world.command = { ...IDLE_COMMAND, moveX: 1 };
    for (let i = 0; i < 60; i++) world.step();
    expect(hero.pos.x).toBeCloseTo(INTRO.hero.x, 5); // the title card is up
  });

  it('walking up to the music gets you punched flat; you get up and take him out; the boombox drops', () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox');
    let knocked = false, hpAfterPunch = -1;
    for (let i = 0; i < 60 * 20 && alive(bb); i++) {
      world.command = brawl(hero, bb, i);
      world.step();
      hero.hp = Math.max(hero.hp, 1); // the bot never dies here; we look at the punch, not the bot's skill
      if (!knocked && hero.state === 'knockback') { knocked = true; hpAfterPunch = hero.hp; }
    }
    expect(knocked).toBe(true);
    expect(hpAfterPunch).toBe(hero.maxHp - 1);
    expect(alive(bb)).toBe(false);
    expect(world.kills).toBe(1);
    for (let i = 0; i < 60; i++) world.step();
    expect(bb.carry).toBeUndefined();
    const box = world.items.find((it) => it.kind === 'boombox');
    expect(box?.state).toBe('floor');
  });

  it("the boombox can't be picked up into a hand", () => {
    const { world, hero } = setup();
    world.step();
    const bb = npc(world, 'boombox');
    world.hitActor(hero, bb, 'wall', 1, 0, bb.pos);
    for (let i = 0; i < 90; i++) world.step();
    const box = world.items.find((it) => it.kind === 'boombox')!;
    hero.pos = { ...hero.pos, x: box.pos.x, z: box.pos.z };
    world.command = { ...IDLE_COMMAND, pickup: true };
    world.step();
    expect(hero.hands[0]).toBeNull();
    expect(world.items.includes(box)).toBe(true);
  });
});

/** Intact grunt corpses (what the boss could raise). */
const intact = (world: World) => world.actors.filter((a) => a.kind === 'grunt' && !a.variant && a.state === 'dead' && !a.corpse?.gibbed);

/**
 * Beat 3 with real inputs: walk to the dropped grenade and pick it up (E), walk within lobbing
 * range of the corpses' middle, hold G to cook for 0.4 s and let go with the cursor on that spot.
 */
function grenadier(world: World, hero: Actor, mem: { cook: number }): PlayerCommand {
  const item = world.items.find((it) => it.kind === 'grenade' && it.state === 'floor' && !it.live);
  if (hero.grenades === 0 && hero.cook === undefined) {
    if (!item) return { ...IDLE_COMMAND };
    const dx = item.pos.x - hero.pos.x, dz = item.pos.z - hero.pos.z, d = Math.hypot(dx, dz);
    return d < 0.25 ? { ...IDLE_COMMAND, pickup: true } : { ...IDLE_COMMAND, moveX: dx / d, moveZ: dz / d };
  }
  // the corpse with the most others within gibbing distance: the heart of a pile
  const bodies = intact(world);
  const crowd = (a: Actor) => bodies.filter((b) => Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) <= GRENADE.gibRadius).length;
  const pile = bodies.reduce((best, a) => (crowd(a) > crowd(best) ? a : best));
  const cx = pile.pos.x, cz = pile.pos.z;
  const aim = project(cx, 0, cz);
  const dx = cx - hero.pos.x, d = Math.abs(dx);
  if (hero.cook === undefined && d > 2.5) return { ...IDLE_COMMAND, moveX: Math.sign(dx), aim };
  mem.cook++;
  return { ...IDLE_COMMAND, aim, grenade: mem.cook < 24 };
}

/**
 * Beat 4 with real inputs: walk over the dropped SMG (empty hands pick it up), then hold fire at
 * the boss's head whenever his ward is down, standing a few H off on his facing side.
 */
function bossShooter(world: World, hero: Actor): PlayerCommand {
  const boss = world.actors.find(isBoss);
  if (!boss) return { ...IDLE_COMMAND };
  if (!hero.hands[0]) {
    const smg = world.items.find((it) => it.kind === 'smg' && it.state === 'floor');
    if (!smg) return { ...IDLE_COMMAND };
    const dx = smg.pos.x - hero.pos.x, dz = smg.pos.z - hero.pos.z, d = Math.hypot(dx, dz);
    return d < 0.2 ? { ...IDLE_COMMAND } : { ...IDLE_COMMAND, moveX: dx / d, moveZ: dz / d };
  }
  const aim = project(boss.pos.x, boss.pos.y + 0.79 * TUNING.boss.scale, boss.pos.z);
  const open = boss.boss.phase === 'fight' && boss.boss.ward <= 0;
  const reload = hero.hands[0].ammo === 0 && hero.hands[0].spare > 0;
  return { ...IDLE_COMMAND, aim, hold: [open, false], press: [open, false], reload };
}

/**
 * The bot for the whole stage so far; `throwGrenade: false` leaves the grenade lying (timeout path).
 * Zombies and grunts on screen go down to the M3 test's "kill all" shortcut.
 */
function playStage(world: World, hero: Actor, throwGrenade: boolean) {
  const bb = npc(world, 'boombox');
  const log = { cleared: [] as number[], waves: [] as string[], music: [] as (string | null)[], explosions: 0, gibs: 0, at: 0, bolts: 0, bossAt: -1 };
  world.events.on('roomCleared', (e) => { log.cleared.push(e.kills); log.at = world.time; });
  world.events.on('waveStart', (e) => log.waves.push(e.wave));
  world.events.on('music', (e) => log.music.push(e.cue));
  world.events.on('explosion', () => log.explosions++);
  world.events.on('gib', () => log.gibs++);
  // raise bolts only (strikes go at heroes)
  world.events.on('zombieRise', (e) => { if (e.phase === 'start') log.bolts++; });
  world.events.on('bossArrive', (e) => { if (e.phase === 'descend') log.bossAt = world.time; });
  const phase2: string[] = [];
  world.events.on('bossSweep', (e) => phase2.push(`sweep:${e.phase}`));
  world.events.on('cannonDrop', (e) => phase2.push(`cannon:${e.phase}`));
  Object.assign(log, { phase2 });
  const mem = { cook: 0 };
  for (let i = 0; i < 60 * 300 && log.cleared.length === 0; i++) {
    // brawl the boombox NPC, "kill all" whoever walks on screen (as in the M3 wave test), the grenade, the boss
    const riotOver = world.director?.state === 'done';
    world.command = alive(bb) ? brawl(hero, bb, i)
      : log.bossAt >= 0 ? bossShooter(world, hero)
        : riotOver && throwGrenade ? grenadier(world, hero, mem) : { ...IDLE_COMMAND };
    world.step();
    hero.hp = hero.maxHp;
    if (!alive(bb)) for (const a of world.actors) if (a.ai && alive(a) && !a.entering) world.hitActor(hero, a, 'wall', 1, 0, a.pos);
  }
  return log;
}

describe('stage 1 headless', () => {
  it('runs from the intro through wave A, the grenade and the boss to the end card without deadlocking', () => {
    const { world, hero } = setup();
    world.step();
    let intactBefore = -1, intactAfter = -1;
    world.events.on('grenadePin', () => (intactBefore = intact(world).length));
    world.events.on('explosion', () => world.seq.run(function* () { yield 0.2; intactAfter = intact(world).length; }));
    const log = playStage(world, hero, true);
    expect(log.waves).toEqual(['A']);
    expect(log.music).toEqual(['riot', 'boss']);
    expect(log.explosions).toBe(1);
    // the pile went up: fewer bodies left for the boss to raise
    expect(log.gibs).toBeGreaterThan(0);
    expect(intactAfter).toBe(intactBefore - log.gibs);
    // he raised someone, went into phase 2 (sweep, cannon), and went down
    expect(log.bolts).toBeGreaterThan(0);
    expect((log as typeof log & { phase2: string[] }).phase2).toEqual(['sweep:windup', 'sweep:push', 'cannon:shadow', 'cannon:fall', 'cannon:land']);
    const boss = world.actors.find((a) => a.kind === 'boss')!;
    expect(alive(boss)).toBe(false);
    // the boombox NPC + wave A's 18 grunts + the boss + every zombie he raised; the dancer lives
    expect(log.cleared).toEqual([1 + 18 + 1 + log.bolts]);
    expect(alive(npc(world, 'dancer'))).toBe(true);
    // nothing left hanging once the last caption has run out
    for (let i = 0; i < 60 * 6; i++) world.step();
    expect(world.seq.busy).toBe(false);
  });

  it('drops one grenade per hero after the riot, falling in from above', () => {
    const { world, hero } = setup();
    world.step();
    const drops: number[] = [];
    world.events.on('itemDrop', (e) => { if (world.items.find((i) => i.id === e.itemId)?.kind === 'grenade') drops.push(e.y); });
    playStage(world, hero, false);
    expect(drops).toEqual([GRENADE_BEAT.dropHeight]);
  });

  it("moves on after the timeout if nobody throws it, so the stage can't stall", () => {
    const { world, hero } = setup();
    world.step();
    let dropAt = -1;
    world.events.on('itemDrop', (e) => { if (world.items.find((i) => i.id === e.itemId)?.kind === 'grenade') dropAt = world.time; });
    const log = playStage(world, hero, false);
    expect(log.explosions).toBe(0);
    expect(log.bossAt - dropAt).toBeCloseTo(GRENADE_BEAT.timeout, 1);
    expect(log.cleared).toHaveLength(1);
  });

  it('the SMG drops once his first zombie is up', () => {
    const { world, hero } = setup();
    world.step();
    let boltAt = -1, smgAt = -1;
    world.events.on('zombieRise', (e) => { if (boltAt < 0 && e.phase === 'start') boltAt = world.time; });
    world.events.on('itemDrop', (e) => { if (smgAt < 0 && world.items.find((i) => i.id === e.itemId)?.kind === 'smg') smgAt = world.time; });
    playStage(world, hero, true);
    expect(boltAt).toBeGreaterThan(0);
    expect(smgAt - boltAt).toBeCloseTo(BOSS_BEAT.smgAfterBolt, 1);
  });
});
