// M11 acceptance tests (PLAN.md): improbability bodies bounce off walls and the ceiling, and stop
// doing so after the mode ends · the collapse kills everything on the falling side · the mini-boss
// fight can't end in his death (scripted) · pin works only next to a solid prop. Plus a scripted
// bot through stage 3's first half.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { STAGE3, STAGE3_ROOMS } from '../src/data/stages/stage3';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { dropBlock, setImprobable, startCollapse } from '../src/sim/improbability';
import type { RoomDef } from '../src/sim/room';
import { stageRunner } from '../src/sim/stage';
import { World } from '../src/sim/world';

const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) {
    world.command = { ...IDLE_COMMAND, ...cmd };
    world.step();
  }
}

function setup(room: RoomDef = EMPTY) {
  const world = new World(room);
  const hero = createActor('hero', -2.5, 9.2, 1);
  world.addPlayer(hero);
  return { world, hero };
}

describe('improbability mode (world-improbability-mode)', () => {
  /** Knock a grunt at the right wall; how fast is he going away from it after the first wall hit? */
  function bounce(on: boolean) {
    const { world, hero } = setup();
    setImprobable(world, on);
    const g = createActor('grunt', 2.9, 9.2, -1);
    g.hp = 99;
    world.actors.push(g);
    const walls: { wall: string }[] = [];
    world.events.on('wallHit', (e) => { if (e.actorId === g.id) walls.push(e); });
    world.hitActor(hero, g, 'heavy', 1, 0, { ...g.pos });
    const vx0 = g.flight!.vx;
    let after = 0, maxY = 0;
    for (let i = 0; i < 120 && g.flight; i++) {
      tick(world);
      maxY = Math.max(maxY, g.pos.y);
      if (walls.length && !after && g.flight) after = g.flight.vx;
    }
    return { vx0, after, walls, maxY, world };
  }

  it('knockback is ~2.4x and bodies come back off the walls (and the ceiling)', () => {
    const on = bounce(true), off = bounce(false);
    expect(on.vx0 / off.vx0).toBeCloseTo(TUNING.improbability.knockback, 1);
    expect(on.walls.length).toBeGreaterThan(0);
    // most of the speed comes back, the other way
    expect(-on.after / on.vx0).toBeCloseTo(TUNING.improbability.restitution, 1);
  });

  it('a body going up fast bounces off the ceiling', () => {
    const { world, hero } = setup();
    setImprobable(world, true);
    const g = createActor('grunt', 0, 9.2, -1);
    g.hp = 99;
    world.actors.push(g);
    const hits: string[] = [];
    world.events.on('wallHit', (e) => { if (e.actorId === g.id) hits.push(e.wall); });
    world.events.on('ceilingStick', () => hits.push('stuck'));
    world.hitActor(hero, g, 'uppercut', 1, 0, { ...g.pos });
    g.flight!.vy = 14;
    tick(world, {}, 60);
    expect(hits.some((h) => h === 'back' || h === 'stuck')).toBe(true);
    expect(g.pos.y).toBeLessThan(world.room.height);
  });

  it('after the mode ends, bodies stop dead on the walls again', () => {
    const off = bounce(false);
    expect(off.walls.length).toBeGreaterThan(0);
    expect(Math.abs(off.after / off.vx0)).toBeLessThanOrEqual(0.21);
  });
});

describe('the arena collapse (world-arena-collapse)', () => {
  it('after ~1 s of crack, everything on the falling side goes; the other side stays', () => {
    const { world, hero } = setup();
    hero.pos.x = 2;
    const left = [-3, -2, -0.5].map((x) => { const g = createActor('grunt', x, 9.2, 1); world.actors.push(g); return g; });
    const right = createActor('grunt', 1, 9.2, -1);
    world.actors.push(right);
    const corpse = createActor('grunt', -1.5, 9.8, 1, { dead: true });
    world.actors.push(corpse);
    world.spawnItem('pistol', 'grunt', { x: -2.2, y: 0, z: 8.8 }, { x: 0, y: 0, z: 0 }, 0);
    startCollapse(world, -1, 0);
    tick(world, {}, Math.round(TUNING.collapse.crack * 60) - 3);
    expect(left.every(alive)).toBe(true);
    tick(world, {}, Math.round((TUNING.collapse.fallTime + 0.2) * 60) + 6);
    for (const g of left) expect(world.actors.includes(g)).toBe(false);
    expect(world.actors.includes(corpse)).toBe(false);
    expect(world.items.length).toBe(0);
    expect(alive(right)).toBe(true);
    expect(alive(hero)).toBe(true);
    // and you can't walk off the edge
    tick(world, { moveX: -1 }, 120);
    expect(hero.pos.x).toBeGreaterThan(0);
  });
});

describe('the mini-boss and the falling tank', () => {
  it('the tank falls after its shadow, crushes what is under it and stays as a solid block', () => {
    const { world } = setup();
    const under = createActor('grunt', -1.5, 9.6, 1);
    world.actors.push(under);
    dropBlock(world, -1.6, 9.6);
    tick(world, {}, Math.round(TUNING.fallingBlock.shadow * 60) - 2);
    expect(alive(under)).toBe(true);
    tick(world, {}, 60);
    expect(alive(under)).toBe(false);
    expect(world.room.props.some((p) => p.kind === 'tank' && p.top >= 1)).toBe(true);
  });

  it('pin works only next to a solid prop: against the tank he goes, out in the open he only flinches', () => {
    for (const [nearTank, pinned] of [[true, true], [false, false]] as const) {
      const { world, hero } = setup();
      world.room.props.push({ kind: 'tank', x0: 1.6, x1: 3.4, z0: 8.8, z1: 9.6, top: 1.25, facing: 1 });
      const mb = createActor('grunt', nearTank ? 1.2 : -0.5, 9.2, -1);
      mb.variant = 'riot';
      mb.protected = true;
      world.actors.push(mb);
      hero.pos.x = mb.pos.x - 0.9;
      hero.hands = [newHand('sign'), null];
      tick(world, { attack: 'heavy', aim: [1500, 600] });
      tick(world, {}, 40);
      expect(mb.state === 'dead', `near the tank: ${nearTank}`).toBe(pinned);
      if (pinned) expect(mb.corpse?.pinned).toBe(true);
    }
  });
});

describe('stage 3, first half', () => {
  it('a scripted bot runs it: outside, vent drop, tables, the camera room (collapse, the jetpack, the shove), the street to the end card', () => {
    const world = new World(STAGE3.rooms.outside.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    STAGE3.loadout(hero);
    hero.invulnerable = true;
    world.seq.run(stageRunner(STAGE3), 'stage');
    const entered: string[] = [], kinds: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    world.events.on('exitTaken', (e) => kinds.push(e.kind));
    let cleared = false, jetpackHits = 0, collapsed = false, improbable = false;
    world.events.on('roomCleared', () => (cleared = true));
    world.events.on('collapse', (e) => { if (e.phase === 'fall') collapsed = true; });
    world.events.on('improbability', (e) => { if (e.on) improbable = true; });
    let mb: Actor | undefined;
    for (let i = 0; i < 60 * 60 * 10 && !cleared; i++) {
      tick(world);
      if (world.transition || hero.traversing || world.inputLocked) continue;
      // stay on the safe side of the crack
      if (world.collapse && hero.pos.x < 1) hero.pos.x = 2;
      for (const a of world.actors) {
        if (!a.ai && a.kind !== 'zombie' && a.variant !== 'riot') continue;
        if (!alive(a) || a.entering) continue;
        if (a.variant === 'riot' && a.hover !== undefined) { world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos }); jetpackHits++; continue; }
        if (a.variant === 'riot' && a.protected) { mb = a; world.hitActor(hero, a, 'pin', 1, 0, { ...a.pos }); continue; }
        world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos });
      }
      for (const it of [...world.items]) if (it.kind === 'grenade' && it.live) world.items.splice(world.items.indexOf(it), 1);
      const x = world.exits.find((e) => e.open && !e.def.warp && e.def.x0 < 50)?.def;
      if (!x || world.exitTaken || i % 15) continue;
      hero.pos.x = Math.max(-world.room.halfWidth + 0.21, Math.min(world.room.halfWidth - 0.21, (x.x0 + x.x1) / 2));
      hero.pos.z = Math.max(x.z0, Math.min(x.z1, 9.0));
      if (x.kind === 'vent') tick(world, { pickup: true });
      else tick(world, { moveX: x.x0 > 0 ? 1 : -1 });
    }
    expect(entered).toEqual([...STAGE3_ROOMS]);
    expect(kinds).toEqual(['vent', 'door', 'door', 'fall', 'edge']);
    expect(improbable).toBe(true);
    expect(collapsed).toBe(true);
    // the jetpack fight: hit plenty, never died (it ends in the shove)
    expect(jetpackHits).toBeGreaterThan(10);
    expect(mb?.kind).toBe('zombie');
    expect(world.physics).toBe('normal');
    expect(cleared).toBe(true);
  });
});
