// M14b slice D (look & sound) regression tests: one per item of design/audit/vis.md / uxs.md
// that can be tested headless. The pose pops are also measured by the audit probe
// (AUDIT=1 npx vitest run tests/audit/vis/popDetector.test.ts), which now samples the drawn pose.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cues from '../assets/music/cues.json';
import { drawnPose } from '../src/anim/drawn';
import { buildSkeleton } from '../src/anim/layers';
import { rootToWorld, STANDING, lyingAt } from '../src/anim/skeleton';
import { hookWorldAudio } from '../src/audio/hooks';
import type { AudioEngine } from '../src/audio/mixer';
import { clearMusicCache, MusicSystem } from '../src/audio/music';
import { FEEL } from '../src/data/feel';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { TUNING } from '../src/data/tuning';
import { FeelDirector, type FeelSink } from '../src/feel/feel';
import { actorDrawZ } from '../src/render/drawOrder';
import { Vfx } from '../src/render/vfx';
import { type Actor, createActor } from '../src/sim/actor';
import { World } from '../src/sim/world';

const TICK = 1 / 60;

// ---------------------------------------------------------------- music (VIS-02/UXS-02, VIS-03, UXS-21, UXS-24)

interface FakeSource { started?: number; stopped: boolean }
function fakeEngine() {
  const sources: FakeSource[] = [];
  const gains: { value: number; ramps: [number, number][] }[] = [];
  let decodes = 0;
  const ctx = {
    currentTime: 0,
    decodeAudioData: async () => { decodes++; return { duration: 272 } as unknown as AudioBuffer; },
    createBufferSource: () => {
      const s: FakeSource = { stopped: false };
      sources.push(s);
      return { buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect() {}, disconnect() {}, start(t: number) { s.started = t; }, stop() { s.stopped = true; } };
    },
    createGain: () => {
      const g = { value: 0, ramps: [] as [number, number][] };
      gains.push(g);
      return {
        gain: { get value() { return g.value; }, set value(v: number) { g.value = v; }, setValueAtTime(v: number) { g.value = v; }, linearRampToValueAtTime(v: number, t: number) { g.ramps.push([v, t]); }, cancelScheduledValues() {} },
        connect() {}, disconnect() {},
      };
    },
  };
  const engine = { ctx, get now() { return ctx.currentTime; }, play: () => 1, stop() {}, musicGain() {} } as unknown as AudioEngine;
  return { engine, ctx, sources, gains, decodes: () => decodes };
}
const live = (s: FakeSource[]) => s.filter((x) => x.started !== undefined && !x.stopped).length;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('music (M14b VIS-02 / UXS-02 / VIS-03)', () => {
  beforeEach(() => { clearMusicCache(); vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })); });
  afterEach(() => vi.unstubAllGlobals());

  it('ten room changes on the same track: one decode, one live source, never restarted', async () => {
    const f = fakeEngine(), m = new MusicSystem(f.engine);
    const rooms = ['s2-wall', 's2-corner', 's2-roof-a', 's2-roof-b', 's2-office', 's2-corridor', 's2-elevator', 's2-swords', 's2-lobby', 's2-crates'];
    await m.setRoom(rooms[0]);
    const start = f.sources[0].started;
    for (const r of rooms.slice(1)) { f.ctx.currentTime += 5; await m.setRoom(r); }
    // a death restarts the room: the scene calls setRoom again
    await m.setRoom('s2-crates');
    expect(f.decodes()).toBe(1);
    expect(f.sources.length).toBe(1);
    expect(live(f.sources)).toBe(1);
    expect(f.sources[0].started).toBe(start);
  });

  it('a track change stops the old sources and reuses the decoded buffer', async () => {
    const f = fakeEngine(), m = new MusicSystem(f.engine);
    await m.setRoom('s2-wall');
    await m.setCue(null); // the script's silence
    expect(live(f.sources)).toBe(0);
    await m.setRoom('s2-corner'); // the next room starts it again, from the cache
    await settle();
    expect(f.decodes()).toBe(1);
    expect(live(f.sources)).toBe(1);
  });

  it('a one-stem track plays at full whatever the enemy count', async () => {
    const f = fakeEngine(), m = new MusicSystem(f.engine);
    await m.setRoom('s2-wall');
    const g = f.gains[0];
    expect(g.ramps.at(-1)?.[0]).toBe(1);
    for (let i = 0; i < 20; i++) { f.ctx.currentTime += 1; m.setIntensity(0); }
    expect(g.ramps.every(([v]) => v === 1)).toBe(true);
  });

  it('the stem ships as OGG under a neutral name; the tab shows the game title', () => {
    const tracks = cues.tracks as Record<string, { stems: string[] }>;
    const show = /madness/i;
    const delivered = readdirSync('assets/music');
    for (const [id, t] of Object.entries(tracks)) {
      expect(id, id).not.toMatch(show);
      for (const s of t.stems) if (delivered.includes(s)) expect(s, id).not.toMatch(show);
    }
    expect(tracks['combat-v1'].stems).toEqual(['combat_v1.ogg']);
    for (const file of delivered) expect(statSync(`assets/music/${file}`).size, file).toBeLessThan(10e6);
    const title = /GAME_TITLE = '([^']+)'/.exec(readFileSync('src/scenes/TitleScene.ts', 'utf8'))![1];
    expect(readFileSync('index.html', 'utf8')).toContain(`<title>${title}</title>`);
  });
});

// ---------------------------------------------------------------- drawn pose (VIS-06, VIS-07, VIS-15) and walk (VIS-16)

/** Every part's drawn world point for the actor at `time`. */
function drawnPoints(a: Actor, time: number) {
  const d = drawnPose(a, time), { skeleton } = buildSkeleton(a, time, d.walk);
  return Object.fromEntries((['body', 'head', 'handF', 'handB', 'footF', 'footB'] as const).map((p) => {
    const [dx, dy] = rootToWorld(d.root, d.sx as 1 | -1, skeleton[p][0], skeleton[p][1]);
    return [p, [a.pos.x + d.off[0] + dx, a.pos.y + d.off[1] + dy]];
  })) as Record<string, [number, number]>;
}
const maxJump = (a: Record<string, [number, number]>, b: Record<string, [number, number]>) => Math.max(...Object.keys(a).map((k) => Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1])));

describe('drawn pose (render only)', () => {
  it('VIS-06: a corpse slumping against a wall blends from lying to sitting (shortest angle)', () => {
    const g = createActor('grunt', 0, 9.2, 1);
    g.state = 'dead'; g.pose.dead = true; g.pose.clip = 'lying'; g.pose.root = lyingAt(-Math.PI / 2);
    let t = 1;
    for (let i = 0; i < 5; i++) drawnPose(g, (t += TICK));
    g.pose.clip = 'slumped'; g.pose.root = { ...STANDING };
    const rs: number[] = [];
    for (let i = 0; i < 12; i++) rs.push(drawnPose(g, (t += TICK)).root.r);
    expect(rs[0]).toBeLessThan(-1); // still mostly lying on the first tick
    for (let i = 1; i < rs.length; i++) expect(Math.abs(rs[i] - rs[i - 1])).toBeLessThan(0.5);
    expect(rs.at(-1)).toBe(0);
  });

  it('VIS-06: the landing snap inside the tumble eases over 3 ticks', () => {
    const g = createActor('grunt', 0, 9.2, 1);
    g.state = 'dead'; g.pose.dead = true; g.pose.clip = 'lying'; g.pose.root = lyingAt(3.77);
    let t = 1;
    for (let i = 0; i < 4; i++) drawnPose(g, (t += TICK));
    g.pose.root = lyingAt(-Math.PI / 2);
    const r1 = drawnPose(g, (t += TICK)).root.r;
    expect(Math.abs(Math.atan2(Math.sin(r1 - 3.77), Math.cos(r1 - 3.77)))).toBeLessThan(0.5);
    drawnPose(g, (t += TICK));
    expect(drawnPose(g, (t += TICK)).root.r).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('VIS-07: a body jumping out of the hands is drawn from where it was', () => {
    const g = createActor('grunt', 1.0, 9.2, 1);
    g.state = 'grabbed';
    let t = 1;
    for (let i = 0; i < 4; i++) drawnPose(g, (t += TICK));
    const before = drawnPoints(g, t);
    g.state = 'knockback'; g.pos.x = 1.6;
    const after = drawnPoints(g, (t += TICK));
    expect(maxJump(before, after)).toBeLessThan(0.25);
    for (let i = 0; i < 3; i++) drawnPose(g, (t += TICK));
    expect(drawnPose(g, t).off).toEqual([0, 0, 0]);
  });

  it('VIS-15: a turn narrows over 2 frames, head first; no tick moves a part more than 0.2 H', () => {
    const h = createActor('hero', 0, 9.2, 1);
    let t = 1;
    let last = drawnPoints(h, (t += TICK));
    h.facing = -1;
    const first = drawnPose(h, (t += TICK));
    expect(first.headFacing).toBe(-1);
    expect(Math.abs(first.sx)).toBeLessThan(1);
    let jump = maxJump(last, drawnPoints(h, t));
    last = drawnPoints(h, t);
    for (let i = 0; i < 6; i++) { const p = drawnPoints(h, (t += TICK)); jump = Math.max(jump, maxJump(last, p)); last = p; }
    expect(jump).toBeLessThanOrEqual(0.2);
    expect(drawnPose(h, t).sx).toBe(-1);
  });

  it('never writes to the actor (the sim keeps its instant root, position and facing)', () => {
    const g = createActor('grunt', 0, 9.2, 1);
    g.state = 'grabbed';
    let t = 1;
    drawnPose(g, (t += TICK));
    g.facing = -1; g.pos.x = 0.5; g.pose.root = lyingAt(1);
    const snap = JSON.stringify(g);
    for (let i = 0; i < 10; i++) drawnPose(g, (t += TICK));
    expect(JSON.stringify(g)).toBe(snap);
  });

  it('VIS-16: at mid-stance the planted foot moves under 10 % of the body speed (was 27 %+)', () => {
    const h = createActor('hero', 0, 9.2, 1);
    const S = TUNING.move.strideLength, v = 2.4;
    const foot = (x: number) => {
      h.pos.x = x; h.pose.walkPhase = (x / S) * Math.PI * 2;
      const { skeleton } = buildSkeleton(h, 1);
      return x + rootToWorld(h.pose.root, 1, skeleton.footF[0], skeleton.footF[1])[0];
    };
    // the front foot is planted while sin(phase) < 0; mid-stance at 3π/2
    const x0 = (0.75 * S), dx = v * TICK;
    const speed = Math.abs(foot(x0 + dx / 2) - foot(x0 - dx / 2)) / TICK;
    expect(speed / v).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------- draw order (VIS-17)

describe('draw order (VIS-17)', () => {
  it('at equal depth the hero draws after a grunt, but behind an attacking grunt', () => {
    const h = createActor('hero', 0, 9.2, 1), g = createActor('grunt', 0.3, 9.2, -1);
    // the list sorts far -> near: a smaller key draws later (in front)
    expect(actorDrawZ(h)).toBeLessThan(actorDrawZ(g));
    g.state = 'attack';
    expect(actorDrawZ(g)).toBeLessThan(actorDrawZ(h));
  });
});

// ---------------------------------------------------------------- feel (VIS-11, VIS-12, absorbed hits)

class Recorder implements FeelSink {
  stops: number[] = []; shakes: number[] = []; chroma: number[] = [];
  hitStop(s: number) { this.stops.push(s); }
  shake(px: number) { this.shakes.push(px); }
  chromatic(px: number) { this.chroma.push(px); }
  killCam() {}
}
function feelSetup() {
  const world = new World(TEST_ROOM), hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  let t = 0;
  const sink = new Recorder();
  new FeelDirector(world, sink, () => (t += 2)); // fresh budget each call
  return { world, hero, sink };
}
const at = { actorId: 0, x: 0, y: 0, z: 9.2 };

describe('feel (VIS-11 / VIS-12)', () => {
  it('set pieces shake the screen at least 5 px, all under the explosion', () => {
    const cases: [string, unknown][] = [
      ['blockDrop', { phase: 'land', x: 0, y: 0, z: 9 }], ['wallDrop', { side: 'back', phase: 'land' }],
      ['doorSmash', { ...at, door: 0 }], ['propToppled', at], ['vendingSmash', at],
    ];
    for (const [ev, payload] of cases) {
      const { world, sink } = feelSetup();
      world.events.emit(ev as 'propToppled', payload as never);
      expect(Math.max(0, ...sink.shakes), ev).toBeGreaterThanOrEqual(5);
      expect(Math.max(...sink.shakes), ev).toBeLessThan(FEEL.shake.explosion);
    }
    for (const [ev, payload] of [['swordDive', { ...at, phase: 'hit' }], ['stab', { ...at, targetId: 1 }]] as const) {
      const { world, sink } = feelSetup();
      world.events.emit(ev, payload as never);
      expect(sink.stops, ev).toEqual([FEEL.hitStop.setPiece]);
      expect(sink.chroma.length, ev).toBe(1);
    }
  });

  it("a boss's killing blow freezes bossPhaseKill (5 frames)", () => {
    const { world, sink } = feelSetup();
    const b = createActor('grunt', 1, 9.2, -1, {});
    b.variant = 'riot';
    world.actors.push(b);
    world.events.emit('kill', { actorId: b.id, byId: 0, kind: 'heavy', decap: false, ...b.pos });
    expect(sink.stops[0]).toBeCloseTo(5 / 30, 6);
  });

  it('an absorbed hit has no hit-stop and no shake; a shield hit a 1 px shake', () => {
    const { world, sink } = feelSetup();
    world.events.emit('hitAbsorbed', { ...at, reason: 'mercy' });
    expect(sink.stops).toEqual([]);
    expect(sink.shakes).toEqual([]);
    world.events.emit('shieldHit', { ...at, holderId: 1, broke: false });
    expect(sink.shakes).toEqual([FEEL.shake.shield]);
  });
});

// ---------------------------------------------------------------- sounds and VFX (VIS-08, VIS-19, absorbed hits)

function audioSetup() {
  const world = new World(TEST_ROOM), hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  const played: string[] = [];
  const engine = new Proxy({}, { get: (_t, k) => (k === 'play' ? (id: string) => { played.push(id); return 1; } : () => 0) }) as unknown as AudioEngine;
  hookWorldAudio(world, engine);
  return { world, hero, played };
}

describe('sounds (VIS-08 / VIS-19)', () => {
  it('jump, a teammate down and back, an edge spawn, a lost hand, shield hits and absorbed hits all sound', () => {
    const { world, played } = audioSetup();
    const ev = (name: string, payload: object) => { played.length = 0; world.events.emit(name as 'jump', payload as never); return [...played]; };
    expect(ev('jump', at)).toEqual(['cloth', 'whooshLight']);
    expect(ev('playerDown', at)).toContain('downCue');
    expect(ev('revive', at)).toEqual(['heal']);
    expect(ev('spawn', { ...at, x: TEST_ROOM.halfWidth + 0.5 })).toEqual(['stepConcrete', 'stepConcrete']);
    expect(ev('spawn', { ...at, x: 0 })).toEqual([]); // from a door: the door sounds
    expect(ev('dismember', { ...at, hand: 'F', dirX: 1 })).toEqual(['dismember']);
    expect(ev('shieldHit', { ...at, holderId: 1, broke: false })).toEqual(['impact']);
    expect(ev('shieldHit', { ...at, holderId: 1, broke: true })).toEqual(['impact', 'bodyFall']);
    expect(ev('hitAbsorbed', { ...at, reason: 'getUp' })).toEqual(['absorb']);
  });

  it("a held shield's zero-damage hit doesn't also play the 'punching a corpse' thud", () => {
    const { world, hero, played } = audioSetup();
    const g = createActor('grunt', 0.5, 9.2, -1);
    g.grabbedBy = hero.id;
    world.actors.push(g);
    world.events.emit('hit', { ...at, actorId: g.id, attackerId: 0, kind: 'bullet', part: 'body', damage: 0, killed: false, dirX: 0, dirZ: 0, combo: false, chain: 0 });
    expect(played).toEqual([]);
  });

  it('VFX: the absorbed flash follows the actor; a shield break scatters pieces', () => {
    const world = new World(TEST_ROOM), g = createActor('grunt', 0, 9.2, 1);
    world.actors.push(g);
    const vfx = new Vfx(world, () => true) as unknown as { absorbs: unknown[]; chunks: unknown[]; drops: unknown[] };
    world.events.emit('hitAbsorbed', { actorId: g.id, x: 0, y: 0, z: 9.2, reason: 'shield' });
    expect(vfx.absorbs.length).toBe(1);
    world.events.emit('shieldHit', { ...at, holderId: 1, broke: true });
    expect(vfx.chunks.length).toBeGreaterThan(0);
    expect(vfx.drops.length).toBeGreaterThan(0);
  });
});
