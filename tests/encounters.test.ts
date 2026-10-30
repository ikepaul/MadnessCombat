// M14b slice C (encounters & pacing): one regression test per item (design/audit/enc.md,
// stb.md STB-14, cmb.md CMB-07). The teaching map (ENC-13 / ENC-20) is tests/teaching.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { GRENADE_BEAT, grenadeBeat, stage1From } from '../src/data/stages/stage1Script';
import { STAGE2 } from '../src/data/stages/stage2';
import { bossInterruption } from '../src/data/stages/stage2Script';
import { STAGE3 } from '../src/data/stages/stage3';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { gruntBrain, newAiState } from '../src/sim/ai';
import { isBoss, spawnBoss } from '../src/sim/boss';
import { placeCannon } from '../src/sim/cannon';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { openExit, stageRunner, stuckHint } from '../src/sim/stage';
import { World } from '../src/sim/world';

const ARENA = STAGE1.rooms.arena.room;
const E = TUNING.enc as unknown as Record<string, unknown> & { stomp: Record<string, unknown>; gunTelegraph: Record<string, number> };
const AIT = TUNING.ai as unknown as Record<string, unknown>;
const saved: [Record<string, unknown>, string, unknown][] = [];
/** Set a tuning number for one test (restored afterwards). */
function set(o: Record<string, unknown>, k: string, v: unknown): void { saved.push([o, k, o[k]]); o[k] = v; }
afterEach(() => { for (const [o, k, v] of saved.reverse()) o[k] = v; saved.length = 0; });

function record<K extends keyof GameEvents>(world: World, type: K): (GameEvents[K] & { t: number })[] {
  const out: (GameEvents[K] & { t: number })[] = [];
  world.events.on(type, (e) => out.push({ ...e, t: world.time }));
  return out;
}
const step = (w: World, cmd: Partial<PlayerCommand> = {}, n = 1) => { for (let i = 0; i < n; i++) { w.command = { ...IDLE_COMMAND, ...cmd }; w.step(); } };

function heroIn(room = ARENA, x = 0, z = 9.2): { world: World; hero: Actor } {
  const world = new World(room);
  const hero = createActor('hero', x, z, 1);
  world.addPlayer(hero);
  return { world, hero };
}
function grunt(world: World, kind: 'grunt' | 'zombie', x: number, z: number, held: Parameters<typeof newHand>[0] | null = null): Actor {
  const g = createActor(kind, x, z, x > 0 ? -1 : 1);
  g.ai = newAiState(world);
  g.brain = gruntBrain(world);
  if (held) g.hands[0] = newHand(held);
  world.actors.push(g);
  return g;
}

describe('ENC-09 zombie token cap', () => {
  it('eight zombies on one hero: at most TUNING.enc.zombieMaxAttackers hold a token', () => {
    const { world, hero } = heroIn();
    for (let i = 0; i < 8; i++) grunt(world, 'zombie', (i % 2 ? 1 : -1) * (1 + i * 0.25), 8.6 + (i % 4) * 0.4);
    let most = 0;
    for (let i = 0; i < 60 * 10; i++) {
      step(world);
      hero.hp = hero.maxHp;
      most = Math.max(most, [...world.tokens].filter((id) => world.actorById(id)?.kind === 'zombie').length);
    }
    expect(most).toBe(TUNING.enc.zombieMaxAttackers);
  });

  it('a charging squad of 5 queues for tokens; with 3 left it charges uncapped', () => {
    const { world, hero } = heroIn();
    const squad = [0, 1, 2, 3, 4].map((i) => grunt(world, 'grunt', 1.6 + i * 0.3, 8.6 + i * 0.4));
    for (const g of squad) g.ai!.charge = true;
    let most = 0;
    for (let i = 0; i < 60 * 4; i++) { step(world); hero.hp = hero.maxHp; most = Math.max(most, world.tokens.size); }
    expect(most).toBeLessThanOrEqual(TUNING.ai.maxAttackers);
    for (const g of [squad[3], squad[4]]) world.hitActor(undefined, g, 'blast', 1, 0, g.pos);
    for (let i = 0; i < 60 * 2; i++) { step(world); hero.hp = hero.maxHp; most = Math.max(most, world.tokens.size); }
    expect(most).toBe(3);
  });
});

describe('ENC-17 scripted hits', () => {
  it('the corridor cameo fling knocks the hero across the room but costs no life', () => {
    const { world, hero } = heroIn(STAGE2.rooms.corridor.room, -2.5, 9.0);
    const hp0 = hero.hp;
    const hits = record(world, 'hit');
    world.seq.run(bossInterruption);
    for (let i = 0; i < 60 * 4; i++) step(world);
    expect(hits.some((h) => h.actorId === hero.id && h.kind === 'fling')).toBe(true);
    expect(hero.hp).toBe(hp0);
  });

  it('A/B: scriptedHitsHurt = true gives back the old life lost', () => {
    set(E, 'scriptedHitsHurt', true);
    const { world, hero } = heroIn(STAGE2.rooms.corridor.room, -2.5, 9.0);
    world.seq.run(bossInterruption);
    for (let i = 0; i < 60 * 4; i++) step(world);
    expect(hero.hp).toBe(hero.maxHp - 1);
  });
});

describe('ENC-12 heavy wind-up', () => {
  it('every grunt heavy is drawn (pose.telegraph) for >= 0.3 s before it is thrown', () => {
    set(AIT, 'heavyChance', 1);
    const { world, hero } = heroIn();
    const g = grunt(world, 'grunt', 1.0, 9.2);
    let tellSince = -1;
    const tells: number[] = [];
    world.events.on('punch', (e) => { if (e.actorId === g.id && e.kind === 'heavy') tells.push(tellSince < 0 ? 0 : world.time - tellSince); });
    for (let i = 0; i < 60 * 10; i++) {
      step(world);
      hero.hp = hero.maxHp;
      if (hero.state !== 'free') { hero.state = 'free'; hero.pose.root = { r: 0, tx: 0, ty: 0, sx: 1, sy: 1 }; hero.flight = undefined; hero.pos = { x: 0, y: 0, z: 9.2 }; }
      if (g.pose.telegraph !== undefined) { if (tellSince < 0) tellSince = world.time; } else if (g.state !== 'attack') tellSince = -1;
    }
    expect(tells.length).toBeGreaterThan(2);
    // the drawn tell plus the punch's own startup
    for (const t of tells) expect(t).toBeGreaterThanOrEqual(0.3 - 1e-6);
  });
});

describe('CMB-07 the stomp', () => {
  const proneVsThree = () => {
    const { world, hero } = heroIn();
    step(world, { dive: true });
    for (let i = 0; i < 40; i++) step(world);
    expect(hero.body.state).toBe('prone');
    for (const [x, z] of [[1.2, 9.2], [-1.2, 9.0], [1.6, 9.5]]) grunt(world, 'grunt', x, z);
    const hits = record(world, 'hit'), stomps = record(world, 'stomp');
    let hit = 0;
    for (let i = 0; i < 60 * 5; i++) {
      step(world);
      if (hero.hp < hero.maxHp) { hit++; hero.hp = hero.maxHp; }
      // back down flat after each knockdown (the test is about lying there)
      if (hero.state === 'free' && hero.body.state === 'ground') { step(world, { dive: true }); }
    }
    return { hit, hits: hits.filter((h) => h.actorId === hero.id), stomps };
  };

  it('prone next to 3 unarmed grunts: stomped within 5 s, each stamp after a >= 0.3 s tell', () => {
    const { hit, stomps } = proneVsThree();
    expect(hit).toBeGreaterThanOrEqual(1);
    const tell = stomps.filter((s) => s.phase === 'tell'), land = stomps.filter((s) => s.phase === 'hit');
    expect(land.length).toBeGreaterThanOrEqual(1);
    for (const l of land) {
      const t = tell.filter((s) => s.actorId === l.actorId && s.t <= l.t).pop()!;
      expect(l.t - t.t).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('A/B: stomp.on = false gives back the old immunity', () => {
    set(E.stomp, 'on', false);
    expect(proneVsThree().hit).toBe(0);
  });
});

describe('ENC-11 boss volley depth', () => {
  it('his volley swings to a hero at the front edge (no safe strip)', () => {
    const { world, hero } = heroIn(ARENA, -2.6, ARENA.zFront + 0.05);
    hero.hp = hero.maxHp = 99;
    const boss = spawnBoss(world, 2.4, 9.6, -1);
    if (!isBoss(boss)) throw new Error('no boss');
    boss.pos.y = 0;
    boss.boss.phase = 'fight';
    boss.boss.stage = 2;
    const c = placeCannon(world, 1.2, 9.6, -1);
    boss.boss.cannon = c;
    boss.boss.act = { kind: 'volley', t: 0, from: { x: boss.pos.x, z: boss.pos.z }, started: false };
    for (let i = 0; i < 30; i++) { step(world); hero.pos.z = ARENA.zFront + 0.05; }
    expect(c.aimZ).toBeCloseTo(ARENA.zFront + 0.05, 2);
  });
});

describe('ENC-18 grenade beat', () => {
  it('times out after 10 s and says its caption again at 5 s', () => {
    const { world } = heroIn();
    const cards = record(world, 'card');
    let done = false;
    world.seq.run(function* g(s) { yield* grenadeBeat(s); done = true; });
    let doneAt = -1;
    for (let i = 0; i < 60 * 15 && doneAt < 0; i++) { step(world); if (done) doneAt = world.time; }
    expect(GRENADE_BEAT.timeout).toBe(10);
    expect(doneAt).toBeCloseTo(GRENADE_BEAT.pause + 10, 1);
    const g = cards.filter((c) => c.text.startsWith('A grenade.'));
    expect(g.length).toBe(2);
    expect(g[1].t - g[0].t).toBeCloseTo(GRENADE_BEAT.recaption, 1);
  });
});

describe('ENC-22 gun telegraph per difficulty', () => {
  const firstShot = (difficulty: World['difficulty']) => {
    const { world, hero } = heroIn(ARENA, -2, 9.2);
    world.difficulty = difficulty;
    hero.hp = hero.maxHp = 99;
    const g = grunt(world, 'grunt', 1.8, 9.2, 'pistol');
    const aims = record(world, 'aimStart'), shots = record(world, 'shot');
    for (let i = 0; i < 60 * 5 && !shots.some((s) => s.actorId === g.id); i++) step(world);
    const s = shots.find((x) => x.actorId === g.id)!;
    return s.t - aims.filter((a) => a.actorId === g.id && a.t <= s.t).pop()!.t;
  };

  it('defaults to 0.4 s on every level, and each level has its own number', () => {
    for (const d of ['noob', 'pro', 'hacker', 'notch'] as const) expect(TUNING.enc.gunTelegraph[d]).toBe(0.4);
    expect(firstShot('pro')).toBeCloseTo(0.4, 1);
    set(E.gunTelegraph, 'noob', 0.6);
    expect(firstShot('noob')).toBeCloseTo(0.6, 1);
  });
});

describe('ENC-21 + STB-14 where to go, stuck hints', () => {
  it('every exit opening sends an exitCue (the arrow) toward its side', () => {
    const world = new World(STAGE3.rooms.vent.room);
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    world.seq.run(stageRunner(STAGE3, 'vent', 'vent'), 'stage');
    step(world, {}, 2);
    const cues = record(world, 'exitCue');
    openExit(world, 'east-door');
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ exit: 'east-door', side: 1, again: false });
  });

  it('stage 3 rooms with a way on have a tracker', () => {
    for (const id of ['outside', 'vent', 'tables', 'street', 'vending', 'console']) expect(STAGE3.rooms[id].tracker, id).toBeDefined();
  });

  it('the intro, left alone: its caption comes back after 20 s with nothing happening', () => {
    const world = new World(ARENA);
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    const cards = record(world, 'card');
    world.seq.run(stage1From('intro'));
    for (let i = 0; i < 60 * 30; i++) step(world);
    const music = cards.filter((c) => c.text.startsWith('Someone is playing music'));
    expect(music.length).toBe(2);
    expect(music[1].t - music[0].t).toBeGreaterThanOrEqual(TUNING.enc.stuckHint);
  });

  it('no stuck hint while an enemy is still in the fight', () => {
    const world = new World(ARENA);
    const hero = createActor('hero', -2, 9.2, 1);
    world.addPlayer(hero);
    const cards = record(world, 'card');
    world.seq.run(stuckHint);
    world.seq.run(function* r(s) { s.run(function* c(q) { yield* q.card('a hint', 2, 'caption'); }); yield () => false; });
    const g = createActor('grunt', 3, 9.2, -1);
    g.ai = newAiState(world);
    g.ai.aware = false;
    world.actors.push(g);
    for (let i = 0; i < 60 * 25; i++) { step(world); hero.hp = hero.maxHp; }
    expect(alive(g)).toBe(true);
    expect(cards.filter((c) => c.text === 'a hint')).toHaveLength(1);
    // the enemy gone: it comes back after 20 s of quiet
    world.hitActor(undefined, g, 'blast', 1, 0, g.pos);
    for (let i = 0; i < 60 * 21; i++) step(world);
    expect(cards.filter((c) => c.text === 'a hint')).toHaveLength(2);
  });
});
