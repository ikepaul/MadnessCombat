// M8 wave B (PLAN.md, research/stages.md beat 5): pickups, a grunt manning the boss's cannon.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { GRENADE_BEAT, STAGE1_BEATS, stage1From, WAVE_B, waveB } from '../src/data/stages/stage1Script';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { placeCannon } from '../src/sim/boss';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { spawnEnemy } from '../src/sim/waves';
import { World } from '../src/sim/world';

const secs = (s: number) => Math.round(s * TUNING.simHz);
function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); }
}
function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

/** The arena with the boss's cannon standing at x = -1.5 and a hero to its right. */
function arena(heroX = 2) {
  const world = new World(STAGE1.rooms.arena.room);
  const hero = createActor('hero', heroX, 9.4, -1);
  world.addPlayer(hero);
  const cannon = placeCannon(world, -1.5, 9.6, 1);
  return { world, hero, cannon };
}

function cannoneer(world: World, x: number): Actor {
  return spawnEnemy(world, 'grunt', null, x, 9.6, { role: 'cannon' });
}

describe('a grunt mans the cannon', () => {
  it('walks behind it on the far side from you and fires one ball every 1.3 s at your depth', () => {
    const { world, hero, cannon } = arena();
    const g = cannoneer(world, -3);
    const fires = record(world, 'cannonFire');
    for (let i = 0; i < secs(6) && cannon.byId !== g.id; i++) { tick(world); hero.hp = hero.maxHp; }
    expect(cannon.byId).toBe(g.id);
    expect(Math.abs(g.pos.x - (cannon.x - TUNING.boss.cannon.behind))).toBeLessThan(0.15);
    expect(cannon.facing).toBe(1);
    // keep the hero out of harm (prone) and count the balls
    hero.pos.z = 9.9;
    const t0 = world.time;
    for (let i = 0; i < secs(TUNING.ai.cannonWindup + 3 * TUNING.cannon.interval) + 2; i++) { tick(world); hero.hp = hero.maxHp; }
    expect(fires.length).toBe(4);
    expect(world.time - t0).toBeGreaterThan(TUNING.ai.cannonWindup + 3 * TUNING.cannon.interval - 0.05);
    // the barrel swings to the hero's depth (within its band)
    expect(cannon.aimZ).toBeCloseTo(Math.min(9.9, cannon.z + TUNING.boss.cannon.aimBand), 5);
  });

  it('standing in its lane, a ball knocks you down (one life)', () => {
    const { world, hero, cannon } = arena(2);
    const g = cannoneer(world, -3);
    for (let i = 0; i < secs(6) && cannon.byId !== g.id; i++) tick(world);
    hero.pos.z = cannon.z;
    tick(world, {}, secs(TUNING.ai.cannonWindup) + 20);
    expect(hero.hp).toBe(hero.maxHp - 1);
    expect(['knockback', 'down', 'getUp']).toContain(hero.state);
  });

  it('when you cross to his side he walks round the barrel and turns it', () => {
    const { world, hero, cannon } = arena(2);
    const g = cannoneer(world, -3);
    for (let i = 0; i < secs(6) && cannon.byId !== g.id; i++) tick(world);
    hero.pos.x = -3.2;
    for (let i = 0; i < secs(8) && !(cannon.byId === g.id && cannon.facing === -1); i++) { tick(world); hero.hp = hero.maxHp; }
    expect(cannon.byId).toBe(g.id);
    expect(cannon.facing).toBe(-1);
    expect(Math.abs(g.pos.x - (cannon.x + TUNING.boss.cannon.behind))).toBeLessThan(0.15);
  });

  it('hitting him stops the cannon; killing him leaves it for the next one', () => {
    const { world, hero, cannon } = arena(2.5);
    hero.pos.z = 9.95;
    const g = cannoneer(world, -3);
    for (let i = 0; i < secs(6) && cannon.byId !== g.id; i++) tick(world);
    const fires = record(world, 'cannonFire');
    world.hitActor(hero, g, 'heavy', -1, 0, g.pos);
    world.hitActor(hero, g, 'heavy', -1, 0, g.pos);
    expect(alive(g)).toBe(false);
    tick(world, {}, secs(4));
    expect(fires).toHaveLength(0);
    // a second cannoneer takes it over
    const g2 = cannoneer(world, -3);
    for (let i = 0; i < secs(8) && fires.length === 0; i++) { tick(world); hero.hp = hero.maxHp; }
    expect(cannon.byId).toBe(g2.id);
    expect(fires.length).toBe(1);
  });

  it('without a cannon he just fights like the rest', () => {
    const world = new World(STAGE1.rooms.arena.room);
    const hero = createActor('hero', 0, 9.4, -1);
    world.addPlayer(hero);
    const g = cannoneer(world, -3);
    tick(world, {}, secs(3));
    expect(g.ai?.role).toBeUndefined();
    expect(Math.abs(g.pos.x - hero.pos.x)).toBeLessThan(2.6);
  });
});

describe('wave B (stage script)', () => {
  it('has 9 grunts, the first one for the cannon, coming from the cannon side first', () => {
    const w = waveB(-1).waves[0];
    expect(w.entries).toHaveLength(9);
    expect(w.entries[0][4]?.role).toBe('cannon');
    expect(w.entries[0][1].startsWith('L')).toBe(true);
    expect(waveB(1).waves[0].entries[0][1].startsWith('R')).toBe(true);
  });

  it('drops a sawed-off at the start, two knives after 2 kills, two pistols after 4', () => {
    const world = new World(STAGE1.rooms.arena.room);
    const hero = createActor('hero', 0, 9.4, 1);
    world.addPlayer(hero);
    world.seq.run(stage1From('waveB'));
    const drops: string[] = [];
    world.events.on('itemDrop', (e) => { const it = world.items.find((i) => i.id === e.itemId); if (it && Math.abs(e.y - GRENADE_BEAT.dropHeight) < 1e-6) drops.push(it.kind); });
    let killsAtWave = -1;
    world.events.on('waveStart', () => (killsAtWave = world.kills));
    for (let i = 0; i < secs(120) && drops.length < 5; i++) {
      tick(world);
      hero.hp = hero.maxHp;
      // one kill at a time, letting each drop land before the next
      if (killsAtWave >= 0 && i % 90 === 0) {
        const g = world.actors.find((a) => a.ai && alive(a) && !a.entering);
        if (g) world.hitActor(hero, g, 'wall', 1, 0, g.pos);
      }
    }
    expect(drops).toEqual(WAVE_B.drops.flatMap((d) => d.items));
  });

  it('every ?beat= route starts the stage there and runs to the end card', () => {
    for (const beat of STAGE1_BEATS) {
      const world = new World(STAGE1.rooms.arena.room);
      const hero = createActor('hero', 0, 9.4, 1);
      world.addPlayer(hero);
      world.seq.run(stage1From(beat));
      let cleared = false;
      world.events.on('roomCleared', () => (cleared = true));
      let boss: Actor | undefined;
      for (let i = 0; i < secs(400) && !cleared; i++) {
        tick(world);
        hero.hp = hero.maxHp;
        // the shortcuts: NPCs and enemies on screen go down; the boss takes head shots when he can be hurt
        for (const a of world.actors) {
          if (!alive(a) || a.entering || a.variant === 'dancer') continue;
          if (a.ai || a.variant === 'boombox') world.hitActor(hero, a, 'wall', 1, 0, a.pos);
          if (a.kind === 'boss' && a.boss?.phase === 'fight' && i % 30 === 0) { boss = a; world.hitActor(hero, a, 'bullet', 1, 0, a.pos, 'head'); }
        }
      }
      expect(cleared, beat).toBe(true);
      if (beat === 'waveB') expect(boss).toBeUndefined();
    }
  });
});
