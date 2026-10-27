// M8 sequencer (PLAN.md): coroutine scripts in the sim for intros, cutscenes and set pieces.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import type { Seq } from '../src/sim/sequencer';
import type { RoomScript } from '../src/sim/waves';
import { World } from '../src/sim/world';

const ROOM = STAGE1.rooms.arena.room;

function setup() {
  const world = new World(ROOM);
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  return { world, hero };
}

const run = (world: World, seconds: number) => { for (let i = 0; i < Math.round(seconds * TUNING.simHz); i++) world.step(); };

describe('sequencer', () => {
  it('yields wait in world seconds, then resumes on the right tick', () => {
    const { world } = setup();
    const marks: number[] = [];
    world.seq.run(function* (s: Seq) {
      marks.push(world.tick);
      yield* s.wait(1);
      marks.push(world.tick);
      yield 0.5;
      marks.push(world.tick);
    });
    run(world, 2);
    expect(marks).toEqual([1, 61, 91]);
    expect(world.seq.busy).toBe(false);
  });

  it('runs scripts side by side; until and join wait on conditions', () => {
    const { world } = setup();
    let flag = false;
    const order: string[] = [];
    world.seq.run(function* (s: Seq) {
      const a = s.run(function* () { yield 0.5; order.push('a'); flag = true; });
      const b = s.run(function* (q: Seq) { yield* q.until(() => flag); order.push('b'); });
      yield* s.join(a, b);
      order.push('joined');
      const met = yield* s.until(() => false, 0.25);
      order.push(met ? 'met' : 'timeout');
    });
    run(world, 1.5);
    expect(order).toEqual(['a', 'b', 'joined', 'timeout']);
  });

  it('moveTo walks an NPC to its mark and hands it back', () => {
    const { world } = setup();
    let arrived: boolean | undefined;
    const npc = world.seq.place('grunt', -2, 9.2, 1);
    world.seq.run(function* (s: Seq) { arrived = yield* s.moveTo(npc, 1, 9.8); });
    run(world, 4);
    expect(arrived).toBe(true);
    // arrives within 0.08 H, then coasts to a stop
    expect(Math.hypot(npc.pos.x - 1, npc.pos.z - 9.8)).toBeLessThan(0.1);
    expect(world.scripted.has(npc.id)).toBe(false);
  });

  it('lockInput ignores the player, a script can still walk him, act fires one edge', () => {
    const { world, hero } = setup();
    world.seq.lockInput(true);
    world.command = { ...IDLE_COMMAND, moveX: 1 };
    run(world, 0.5);
    expect(hero.pos.x).toBeCloseTo(0, 5);
    world.command = { ...IDLE_COMMAND };
    let jumps = 0;
    world.events.on('jump', () => jumps++);
    world.seq.run(function* (s: Seq) {
      yield* s.moveTo(hero, -1, 9.2);
      yield* s.act(hero, { jump: true });
      s.lockInput(false);
    });
    run(world, 3);
    expect(Math.abs(hero.pos.x + 1)).toBeLessThan(0.1);
    expect(jumps).toBe(1);
    expect(world.inputLocked).toBe(false);
    // input is back: the held move key walks him again
    world.command = { ...IDLE_COMMAND, moveX: 1 };
    run(world, 0.5);
    expect(hero.pos.x).toBeGreaterThan(-0.9);
  });

  it('cards, music and shakes go out as events; a card waits while it shows', () => {
    const { world } = setup();
    const seen: string[] = [];
    world.events.on('card', (e) => seen.push(`card:${e.style}:${e.text}:${e.seconds}`));
    world.events.on('music', (e) => seen.push(`music:${e.cue}`));
    world.events.on('cameraShake', (e) => seen.push(`shake:${e.px}`));
    let after = -1;
    world.seq.run(function* (s: Seq) {
      s.music('riot');
      yield* s.card('ROUND ONE', 2);
      after = world.time;
      s.cameraShake(10, 0.3);
      yield* s.card('a caption', 1, 'caption');
      s.music(null);
    });
    run(world, 4);
    expect(seen).toEqual(['music:riot', 'card:title:ROUND ONE:2', 'shake:10', 'card:caption:a caption:1', 'music:null']);
    expect(after).toBeCloseTo(2 + 1 / TUNING.simHz, 5);
  });

  it('spawn, giveItem and drop put enemies and items in the room', () => {
    const { world, hero } = setup();
    world.seq.run(function* (s: Seq) {
      s.spawn('grunt', 'pistol', 2, 9.4);
      s.giveItem(hero, 'smg');
      s.giveItem(hero, 'grenade');
      s.drop('grenade', -1, 9.2);
    });
    run(world, 0.1);
    const g = world.actors.find((a) => a.ai);
    expect(g?.hands[0]?.item).toBe('pistol');
    expect(hero.hands[0]?.item).toBe('smg');
    expect(hero.hands[0]?.ammo).toBeGreaterThan(0);
    expect(hero.grenades).toBe(1);
    expect(world.items.some((i) => i.kind === 'grenade' && !i.live)).toBe(true);
  });

  it('waves run inside a script without announcing roomCleared; the script decides the end', () => {
    const { world } = setup();
    const script: RoomScript = {
      spawns: [{ id: 'L', kind: 'edge', side: -1, z: 9.2 }],
      waves: [{ id: 'X', threshold: 0, maxAlive: 9, entries: [[0, 'L', 'grunt', null], [0.2, 'L', 'grunt', null]] }],
    };
    const cleared: number[] = [];
    world.events.on('roomCleared', (e) => cleared.push(e.kills));
    let afterWaves = false;
    world.seq.run(function* (s: Seq) {
      yield* s.waves(script);
      afterWaves = true;
      yield 1;
      s.clear();
    });
    for (let i = 0; i < 60 * 10 && cleared.length === 0; i++) {
      world.step();
      for (const a of world.actors) if (a.ai && alive(a) && !a.entering) world.hitActor(undefined, a, 'wall', 1, 0, a.pos);
      if (!afterWaves) expect(cleared).toEqual([]);
    }
    expect(afterWaves).toBe(true);
    expect(cleared).toEqual([2]);
  });

  it('cancel stops a script and lets go of the actor it was steering', () => {
    const { world } = setup();
    const npc = world.seq.place('grunt', 0, 9.2, 1);
    const t = world.seq.run(function* (s: Seq) { yield* s.moveTo(npc, 3, 9.2); });
    run(world, 0.2);
    expect(world.scripted.has(npc.id)).toBe(true);
    t.cancel();
    expect(world.scripted.has(npc.id)).toBe(false);
    const x = npc.pos.x;
    run(world, 0.5);
    expect(npc.pos.x).toBeCloseTo(x, 1);
  });
});
