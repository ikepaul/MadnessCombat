// Spawn variety (TUNING.waves.variety, playtest 2026-10-27): wave entries arrive in seeded groups
// spread over the room's spawn points, now and then one from behind the player, deterministic
// from the world seed; `on: 0` restores the old single-file trickle. The probe report prints
// before/after numbers: `PROBE=1 npx vitest run tests/spawns.test.ts`.
import { afterEach, describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { waveB } from '../src/data/stages/stage1Script';
import { LOBBY, OFFICE } from '../src/data/stages/stage2';
import { lobbyWaves } from '../src/data/stages/stage2Late';
import { officeWaves } from '../src/data/stages/stage2Script';
import { CONSOLE, STREET } from '../src/data/stages/stage3';
import { consoleWaves } from '../src/data/stages/stage3Late';
import { streetAmbush } from '../src/data/stages/stage3Script';
import { TUNING } from '../src/data/tuning';
import { alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import type { RoomDef } from '../src/sim/room';
import { type RoomScript, WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

// the A/B switch (TUNING is read-only to the type checker; the F6 panel writes it at run time)
const V = TUNING.waves.variety as { on: number };
const ON = V.on;
afterEach(() => { V.on = ON; });

const ROOMS: Record<string, [RoomDef, () => RoomScript]> = {
  'stage1 wave A': [STAGE1.rooms.arena.room, () => STAGE1.rooms.arena.script],
  'stage1 wave B': [STAGE1.rooms.arena.room, () => waveB(1)],
  'stage2 office': [OFFICE, officeWaves],
  'stage2 lobby': [LOBBY, lobbyWaves],
  'stage3 street': [STREET, streetAmbush],
  'stage3 console': [CONSOLE, consoleWaves],
};

/**
 * The head-shot spammer: an invulnerable hero in the middle facing right who drops one enemy that
 * has walked in every `killEvery` seconds. Logs every spawn (time, point) and how many were up.
 */
function probe(name: string, seed = 1, killEvery = 0.6, players = 1) {
  const [room, script] = ROOMS[name];
  const world = new World(room);
  (world as unknown as { seed: number }).seed = seed;
  for (let i = 0; i < players; i++) world.addPlayer(createActor('hero', i * 0.6, (room.zFront + room.zBack) / 2, 1));
  const sc = script();
  world.director = new WaveDirector(sc, 0, true);
  // which of the script's points a spawn came from: same side, nearest depth
  const pointOf = (x: number, z: number) => sc.spawns
    .map((sp) => {
      const d = sp.kind === 'door' ? room.doors[sp.door] : undefined;
      return { id: sp.id, side: sp.kind === 'edge' ? sp.side : d!.wall === 'left' ? -1 : 1, z: sp.kind === 'edge' ? sp.z : (d!.z0 + d!.z1) / 2 };
    })
    .filter((q) => q.side === Math.sign(x))
    .sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0]?.id ?? '?';
  const spawns: { t: number; point: string; x: number; z: number }[] = [];
  let flanks = 0, peak = 0, cleared = false, next = killEvery;
  world.events.on('spawn', (e) => spawns.push({ t: world.time, x: e.x, z: e.z, point: pointOf(e.x, e.z) }));
  world.events.on('flank', () => flanks++);
  world.events.on('roomCleared', () => (cleared = true));
  for (let i = 0; i < 60 * 180 && !cleared; i++) {
    world.commands = world.players.map(() => ({ ...IDLE_COMMAND, face: 1 as const }));
    world.step();
    for (const p of world.players) { p.hp = p.maxHp; p.state = 'free'; }
    const up = world.actors.filter((a) => a.ai && alive(a) && !a.entering);
    peak = Math.max(peak, up.length);
    if (world.time >= next && up.length) {
      world.hitActor(world.players[0], up[0], 'wall', 1, 0, up[0].pos);
      next = world.time + killEvery;
    }
  }
  // a spawn "in a group": another one within 0.6 s of it
  const grouped = spawns.filter((s, i) => spawns.some((o, j) => j !== i && Math.abs(o.t - s.t) < 0.6)).length;
  // ...and from the other side of the room at the same time (a crossfire)
  const crossed = spawns.filter((s, i) => spawns.some((o, j) => j !== i && Math.abs(o.t - s.t) < 0.6 && Math.sign(o.x) !== Math.sign(s.x))).length;
  const sides = new Set(spawns.map((s) => Math.sign(s.x))).size;
  const gaps = spawns.slice(1).map((s, i) => s.t - spawns[i].t);
  return {
    cleared, spawns, flanks, peak, sides,
    points: new Set(spawns.map((s) => s.point)).size,
    groupedPct: Math.round((100 * grouped) / Math.max(1, spawns.length)),
    crossPct: Math.round((100 * crossed) / Math.max(1, spawns.length)),
    maxGap: Math.max(0, ...gaps),
    seconds: Math.round(world.time),
  };
}

describe('spawn variety', () => {
  it('groups arrive together: most spawns come within 0.6 s of another', () => {
    for (const seed of [1, 2, 3]) {
      const r = probe('stage1 wave A', seed);
      expect(r.cleared).toBe(true);
      expect(r.groupedPct).toBeGreaterThanOrEqual(70);
    }
    // the old trickle: replacements come in one at a time
    V.on = 0;
    expect(probe('stage1 wave A', 1).groupedPct).toBeLessThan(50);
  });

  it('several spawn points (and both sides at once) get used in multi-door rooms', () => {
    for (const name of ['stage2 office', 'stage2 lobby', 'stage3 console', 'stage3 street']) {
      const r = probe(name, 2);
      expect(r.cleared, name).toBe(true);
      expect(r.sides, name).toBe(2);
      expect(r.points, name).toBeGreaterThan(1);
      // both doors in the same moment, not just taking turns
      expect(r.crossPct, name).toBeGreaterThan(20);
    }
    expect(probe('stage1 wave A', 2).points).toBe(6);
    // the old office: the doors take turns, one grunt at a time
    V.on = 0;
    expect(probe('stage2 office', 2).crossPct).toBe(0);
  });

  it('never more than maxAlive at once, and nobody spawns on top of a player', () => {
    const world = new World(STAGE1.rooms.arena.room);
    // the hero stands right at the left edge: left entries go elsewhere
    const hero = createActor('hero', -3.2, 9.3, 1);
    world.addPlayer(hero);
    world.director = new WaveDirector(STAGE1.rooms.arena.script);
    let most = 0, close = 0;
    world.events.on('spawn', (e) => { if (Math.abs(e.x - hero.pos.x) < 2 && Math.abs(e.z - hero.pos.z) < 1) close++; });
    for (let i = 0; i < 60 * 30; i++) {
      world.command = { ...IDLE_COMMAND };
      world.step();
      hero.hp = hero.maxHp;
      most = Math.max(most, world.actors.filter((a) => a.ai && alive(a)).length);
    }
    expect(most).toBe(STAGE1.rooms.arena.script.waves[0].maxAlive);
    expect(close).toBe(0);
  });

  it('a flank comes from behind the player, after its cue', () => {
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = new World(STAGE1.rooms.arena.room);
      (world as unknown as { seed: number }).seed = seed;
      const hero = createActor('hero', 0, 9.3, 1);
      world.addPlayer(hero);
      world.director = new WaveDirector(STAGE1.rooms.arena.script);
      const cues: { side: number; t: number }[] = [];
      world.events.on('flank', (e) => cues.push({ side: e.side, t: world.time }));
      for (let i = 0; i < 60 * 40; i++) {
        world.command = { ...IDLE_COMMAND, face: 1 };
        world.step();
        hero.hp = hero.maxHp;
        for (const a of world.actors) if (a.ai && alive(a) && !a.entering) world.hitActor(hero, a, 'wall', 1, 0, a.pos);
      }
      // facing right: behind is the left
      for (const c of cues) expect(c.side).toBe(-1);
      seen += cues.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('entering group members hold their first shot (settle + their place in the group)', () => {
    const world = new World(STAGE1.rooms.arena.room);
    const hero = createActor('hero', 0, 9.3, 1);
    world.addPlayer(hero);
    const guns: RoomScript = { spawns: STAGE1.rooms.arena.script.spawns, waves: [{ id: 'G', threshold: 0, maxAlive: 4, entries: [[0.2, 'L-mid', 'grunt', 'pistol'], [0.2, 'R-mid', 'grunt', 'pistol'], [0.2, 'L-back', 'grunt', 'pistol'], [0.2, 'R-back', 'grunt', 'pistol']] }] };
    world.director = new WaveDirector(guns);
    const firstShot = new Map<number, number>(), inAt = new Map<number, number>();
    world.events.on('shot', (e) => { if (e.actorId !== hero.id && !firstShot.has(e.actorId)) firstShot.set(e.actorId, world.time); });
    for (let i = 0; i < 60 * 8; i++) {
      world.command = { ...IDLE_COMMAND };
      world.step();
      hero.hp = hero.maxHp;
      for (const a of world.actors) if (a.ai && !a.entering && !inAt.has(a.id)) inAt.set(a.id, world.time);
    }
    expect(firstShot.size).toBeGreaterThan(0);
    for (const [id, t] of firstShot) expect(t - inAt.get(id)!).toBeGreaterThanOrEqual(TUNING.ai.ranged.settle + TUNING.ai.ranged.telegraph - 0.05);
    // not all at once
    const times = [...firstShot.values()].sort();
    expect(times[times.length - 1] - times[0]).toBeGreaterThan(0.2);
  });

  it('is deterministic: the same seed gives the same arrivals, another seed others', () => {
    const a = probe('stage1 wave A', 7), b = probe('stage1 wave A', 7), c = probe('stage1 wave A', 8);
    expect(b.spawns).toEqual(a.spawns);
    expect(c.spawns).not.toEqual(a.spawns);
  });

  it('switched off (on: 0) it is the old scripted trickle, seed or not', () => {
    V.on = 0;
    const a = probe('stage1 wave A', 1), b = probe('stage1 wave A', 9);
    expect(b.spawns).toEqual(a.spawns);
    // the script's own order of points
    const order = ['L-mid', 'R-mid', 'R-front', 'L-back', 'L-front', 'R-back'];
    expect(a.spawns.map((s) => s.point)).toEqual(Array.from({ length: 18 }, (_, i) => order[i % 6]));
    expect(a.flanks).toBe(0);
  });

  it('exact waves keep their scripted order with the switch on', () => {
    const exact = STAGE1.rooms.arena.script;
    const script = () => ({ ...exact, waves: exact.waves.map((w) => ({ ...w, exact: true as const })) });
    const run = () => {
      const world = new World(STAGE1.rooms.arena.room);
      world.addPlayer(createActor('hero', 0, 9.3, 1));
      world.director = new WaveDirector(script());
      const out: string[] = [];
      world.events.on('spawn', (e) => out.push(`${e.x < 0 ? 'L' : 'R'}${e.z.toFixed(1)}@${world.tick}`));
      for (let i = 0; i < 60 * 30; i++) {
        world.command = { ...IDLE_COMMAND };
        world.step();
        world.players[0].hp = 99;
        for (const a of world.actors) if (a.ai && alive(a) && !a.entering) world.hitActor(world.players[0], a, 'wall', 1, 0, a.pos);
      }
      return out;
    };
    const on = run();
    V.on = 0;
    expect(run()).toEqual(on);
  });

  it.skipIf(!process.env.PROBE)('report', () => {
    const rows: string[] = [];
    for (const on of [0, 1]) {
      V.on = on;
      for (const name of Object.keys(ROOMS)) {
        for (const seed of [1, 2]) {
          const r = probe(name, seed, 1.0);
          rows.push(`${on ? 'NEW' : 'OLD'} ${name.padEnd(15)} seed ${seed}: spawns ${r.spawns.length}, points ${r.points}, grouped ${r.groupedPct}%, both sides at once ${r.crossPct}%, peak up ${r.peak}, flanks ${r.flanks}, max gap ${r.maxGap.toFixed(1)} s, ${r.seconds} s`);
        }
      }
    }
    console.log(rows.join('\n'));
  });
});
