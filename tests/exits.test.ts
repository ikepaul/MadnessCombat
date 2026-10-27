// Playtest 2026-10-27: vent exits read as what they are (crawl into a wall vent, leap up into a
// ceiling one) and the HUD knows when E would take an exit.
import { describe, expect, it } from 'vitest';
import { STAGE2 } from '../src/data/stages/stage2';
import { STAGE3 } from '../src/data/stages/stage3';
import { createActor } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import { outOfSight, partnerAhead, type StageDef, stageRunner, usableExitAt, waitingInExit } from '../src/sim/stage';
import { World } from '../src/sim/world';

function at(def: StageDef, room: string, entry: string, x: number, z: number) {
  const world = new World(def.rooms[room].room);
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  world.seq.run(stageRunner(def, room, entry), 'stage');
  for (let i = 0; i < 3; i++) world.step();
  for (const a of world.actors) if (a !== hero) a.invulnerable = true;
  hero.invulnerable = true;
  hero.pos.x = x;
  hero.pos.z = z;
  world.step();
  return { world, hero };
}

function pressE(world: World, hero: ReturnType<typeof createActor>) {
  for (let i = 0; i < 30 && !hero.traversing; i++) {
    world.command = { ...IDLE_COMMAND, pickup: i % 2 === 0 };
    world.step();
  }
  return hero.traversing?.kind;
}

describe('vent exits', () => {
  it('stage 3 outside: the wall vent shows the prompt and is crawled into', () => {
    const { world, hero } = at(STAGE3, 'outside', 'west', 2.7, 10.1);
    expect(usableExitAt(world, hero)?.id).toBe('vent');
    expect(pressE(world, hero)).toBe('crawlIn');
  });

  it('stage 2 crates: the ceiling vent is a leap up', () => {
    const { world, hero } = at(STAGE2, 'crates', 'lift', -2.3, 9.0);
    expect(usableExitAt(world, hero)?.id).toBe('vent');
    expect(pressE(world, hero)).toBe('leap');
  });

  it('no prompt away from an exit', () => {
    const { world, hero } = at(STAGE3, 'outside', 'west', -1.0, 9.0);
    expect(usableExitAt(world, hero)).toBeUndefined();
  });
});

// Playtest 2026-10-27: in co-op nobody is dragged out of the room by his partner.
function coopAt(def: StageDef, room: string, entry: string) {
  const world = new World(def.rooms[room].room);
  const p1 = createActor('hero', 0, 9.2, 1), p2 = createActor('hero', 0, 9.2, 1);
  world.addPlayer(p1);
  world.addPlayer(p2);
  world.seq.run(stageRunner(def, room, entry), 'stage');
  for (let i = 0; i < 3; i++) world.step();
  for (const a of world.actors) a.invulnerable = true;
  return { world, p1, p2 };
}

function put(a: ReturnType<typeof createActor>, x: number, z: number) {
  a.pos.x = x;
  a.pos.z = z;
}

/** One tick; `e` = which players press E this tick. */
function tick2(world: World, e: [boolean, boolean] = [false, false]) {
  world.commands = [{ ...IDLE_COMMAND, pickup: e[0] }, { ...IDLE_COMMAND, pickup: e[1] }];
  world.step();
}

describe('co-op exits', () => {
  it('a walk-in exit waits until both players are in it', () => {
    const { world, p1, p2 } = coopAt(STAGE2, 'wall', 'west');
    const rooms: string[] = [];
    world.events.on('roomEnter', (e) => rooms.push(e.room));
    put(p1, 3.4, 9.0);
    put(p2, -1, 9.0);
    for (let i = 0; i < 20; i++) { put(p1, 3.4, 9.0); tick2(world); }
    expect(world.exitTaken).toBeUndefined();
    expect(waitingInExit(world, p1)).toBe(true);
    put(p2, 3.3, 9.3);
    tick2(world);
    expect(world.exitTaken?.id).toBe('street');
    for (let i = 0; i < 90; i++) tick2(world);
    expect(rooms).toContain('corner');
  });

  it('the ladder: the first one climbs ahead out of the fight, the room is left when the second follows', () => {
    const { world, p1, p2 } = coopAt(STAGE2, 'corner', 'west');
    put(p1, 2.6, 10.1);
    put(p2, -1, 9.2);
    tick2(world, [true, false]);
    expect(p1.parked).toBe('ladder');
    expect(p1.traversing?.kind).toBe('climb');
    expect(world.activePlayers).toEqual([p2]);
    expect(partnerAhead(world, p2)?.id).toBe('ladder');
    for (let i = 0; i < 300; i++) tick2(world);
    expect(world.exitTaken).toBeUndefined();
    expect(outOfSight(world, p1)).toBe(true);
    put(p2, 2.6, 10.1);
    tick2(world, [false, true]);
    expect(world.exitTaken?.id).toBe('ladder');
    for (let i = 0; i < 90; i++) tick2(world);
    expect(world.roomId).toBe('roofA');
    expect(p1.parked).toBeUndefined();
    expect(world.activePlayers.length).toBe(2);
  });

  it('the ceiling vent: one braces, the other is boosted up and pulls him after', () => {
    const { world, p1, p2 } = coopAt(STAGE2, 'crates', 'lift');
    const phases: string[] = [];
    world.events.on('coopExit', (e) => phases.push(e.phase));
    put(p1, -2.3, 9.0);
    put(p2, -3.0, 9.0);
    tick2(world, [true, false]);
    expect(p1.traversing?.kind).toBe('brace');
    expect(usableExitAt(world, p2)?.id).toBe('vent');
    // the braced one holds still under the vent; his partner steps up within reach
    for (let i = 0; i < 20; i++) tick2(world);
    expect(p1.traversing?.kind).toBe('brace');
    put(p2, p1.pos.x - 0.6, p1.pos.z);
    tick2(world, [false, true]);
    expect(p2.traversing?.kind).toBe('leap');
    expect(p1.traversing?.kind).toBe('pulled');
    expect(world.exitTaken?.id).toBe('vent');
    let warped = false;
    world.events.on('warp', () => (warped = true));
    for (let i = 0; i < 90; i++) tick2(world);
    expect(phases).toEqual(['brace', 'boost', 'pull']);
    expect(warped).toBe(true);
    expect(p1.pos.x).toBeGreaterThan(2);
    expect(p2.pos.x).toBeGreaterThan(2);
  });

  it('the ceiling vent: E again stands back up', () => {
    const { world, p1 } = coopAt(STAGE2, 'crates', 'lift');
    put(p1, -2.3, 9.0);
    tick2(world, [true, false]);
    tick2(world);
    tick2(world, [true, false]);
    expect(p1.traversing).toBeUndefined();
  });

  it('the wall vent: crawled into one at a time', () => {
    const { world, p1, p2 } = coopAt(STAGE3, 'outside', 'west');
    put(p1, 2.7, 10.1);
    put(p2, -1, 9.0);
    tick2(world, [true, false]);
    expect(p1.traversing?.kind).toBe('crawlIn');
    for (let i = 0; i < 40; i++) tick2(world);
    expect(outOfSight(world, p1)).toBe(true);
    expect(world.exitTaken).toBeUndefined();
    put(p2, 2.7, 10.1);
    tick2(world, [false, true]);
    expect(world.exitTaken?.id).toBe('vent');
  });

  it('with the partner downed, the one standing leaves alone (and brings him along)', () => {
    const { world, p1, p2 } = coopAt(STAGE2, 'corner', 'west');
    p2.state = 'downed';
    put(p1, 2.6, 10.1);
    tick2(world, [true, false]);
    expect(world.exitTaken?.id).toBe('ladder');
    for (let i = 0; i < 90; i++) tick2(world);
    expect(world.roomId).toBe('roofA');
    expect(p2.state).toBe('free');
  });
});
