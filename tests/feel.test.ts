// M4 acceptance tests (PLAN.md): a kill emits hit-stop 3 / shake 6 / chromatic; hit-stop never
// exceeds 6 frames per second; the mixer's voice limits (20 casings -> 6 voices); music layer
// changes land on bar boundaries. Plus the kill-cam triggers and the synthesized sounds.
import { describe, expect, it } from 'vitest';
import { SOUNDS } from '../src/data/audio';
import { FEEL } from '../src/data/feel';
import { STAGE1 } from '../src/data/stages/stage1';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { BarScheduler, LayerSwitcher } from '../src/audio/scheduler';
import { type Recipe, render } from '../src/audio/synth';
import { VoicePool } from '../src/audio/voices';
import { FeelDirector, type FeelSink } from '../src/feel/feel';
import { createActor } from '../src/sim/actor';
import { WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

const FRAME = 1 / 30;

class Recorder implements FeelSink {
  constructor(private now: () => number = () => 0) {}
  stops: number[] = [];
  /** [time granted, seconds] */
  granted: [number, number][] = [];
  shakes: number[] = [];
  chroma: [number, number][] = [];
  killCams = 0;
  hitStop(s: number) { this.stops.push(s); this.granted.push([this.now(), s]); }
  shake(px: number) { this.shakes.push(px); }
  chromatic(px: number, frames: number) { this.chroma.push([px, frames]); }
  killCam() { this.killCams++; }
}

function setup() {
  const world = new World(TEST_ROOM);
  const hero = createActor('hero', 0, 9.2, 1);
  world.actors.push(hero);
  world.player = hero;
  let t = 0;
  const sink = new Recorder(() => t);
  const feel = new FeelDirector(world, sink, () => t);
  return { world, hero, sink, feel, advance: (s: number) => (t += s) };
}

const grunt = (world: World, x = 1) => {
  const g = createActor('grunt', x, 9.2, -1);
  world.actors.push(g);
  return g;
};

describe('feel layer (design/art-direction.md effects table)', () => {
  it('a kill emits hit-stop 2 frames (decided), shake 6 px and a chromatic split', () => {
    const { world, hero, sink } = setup();
    const g = grunt(world);
    g.hp = 1;
    world.hitActor(hero, g, 'light', 1, 0, g.pos);
    expect(sink.stops).toEqual([2 * FRAME]);
    expect(sink.shakes).toContain(6);
    expect(sink.chroma).toEqual([[FEEL.chromatic.kill.px, FEEL.chromatic.kill.frames]]);
    expect(FEEL.chromatic.kill.px).toBeGreaterThanOrEqual(4);
    expect(FEEL.chromatic.kill.px).toBeLessThanOrEqual(8);
  });

  it('punches freeze 1 frame, light or heavy', () => {
    const { world, hero, sink } = setup();
    const g = grunt(world);
    g.hp = 99;
    world.hitActor(hero, g, 'light', 1, 0, g.pos);
    world.hitActor(hero, g, 'heavy', 1, 0, g.pos);
    expect(sink.stops).toEqual([FRAME, FRAME]);
  });

  it('hit-stop never exceeds 6 frames per second (synthetic auto-fire burst)', () => {
    const { feel, sink, advance } = setup();
    // 10 shots per second for 3 s, each asking for the auto-fire maximum
    for (let i = 0; i < 30; i++) {
      feel.stop(FEEL.hitStop.autoFireMax);
      advance(0.1);
    }
    // sliding 1 s windows over the granted stops
    expect(sink.granted.length).toBeGreaterThan(0);
    for (let w = 0; w < 3; w += 0.05) {
      const inWindow = sink.granted.filter(([t]) => t >= w && t < w + 1).reduce((n, [, s]) => n + s, 0);
      expect(inWindow).toBeLessThanOrEqual(6 * FRAME + 1e-9);
    }
  });

  it('a burst of kills stays inside the hit-stop budget', () => {
    const { world, hero, sink } = setup();
    for (let i = 0; i < 5; i++) {
      const g = grunt(world, i);
      g.hp = 1;
      world.hitActor(hero, g, 'light', 1, 0, g.pos);
    }
    expect(sink.stops.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(6 * FRAME + 1e-9);
  });

  it('kill cam: 3 kills within 1 s', () => {
    const { world, hero, sink, advance } = setup();
    for (let i = 0; i < 3; i++) {
      const g = grunt(world, i);
      g.hp = 1;
      world.hitActor(hero, g, 'light', 1, 0, g.pos);
      advance(0.3);
    }
    expect(sink.killCams).toBe(1);
  });

  it('kill cam: the last kill of a wave', () => {
    const { world, hero, sink } = setup();
    world.setRoom(STAGE1.rooms.arena.room);
    world.director = new WaveDirector({
      spawns: [{ id: 'L', kind: 'edge', side: -1, z: 9.2 }],
      waves: [{ id: 'A', threshold: 0, maxAlive: 9, entries: [[0, 'L', 'grunt', null]] }],
    });
    for (let i = 0; i < 5; i++) world.step();
    const g = world.actors.find((a) => a.ai)!;
    world.hitActor(hero, g, 'wall', 1, 0, g.pos);
    expect(sink.killCams).toBe(1);
  });

  it('two kills a second apart do not trigger the kill cam', () => {
    const { world, hero, sink, advance } = setup();
    for (let i = 0; i < 2; i++) {
      const g = grunt(world, i);
      g.hp = 1;
      world.hitActor(hero, g, 'light', 1, 0, g.pos);
      advance(1.1);
    }
    expect(sink.killCams).toBe(0);
  });
});

describe('audio (design/audio-direction.md technical spec)', () => {
  it('voice limits: a burst of 20 casings plays at most 6 at once, oldest stolen', () => {
    const pool = new VoicePool(() => 0.5);
    const c = SOUNDS.casing;
    const steals: number[] = [];
    for (let i = 0; i < 20; i++) {
      const v = pool.start('casing', c.variants, c.limit, i * 0.01, 1);
      if (v.steal !== undefined) steals.push(v.steal);
    }
    expect(c.limit).toBe(6);
    expect(pool.count('casing', 0.2)).toBe(6);
    expect(steals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('footsteps are limited to 3 voices and variants never repeat back to back', () => {
    const pool = new VoicePool();
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const v = pool.start('stepDirt', SOUNDS.stepDirt.variants, SOUNDS.stepDirt.limit, i * 0.01, 0.5);
      expect(v.variant).not.toBe(last);
      last = v.variant;
    }
    expect(pool.count('stepDirt', 2)).toBe(3);
  });

  it('every placeholder recipe renders a non-silent, finite sound within full scale', () => {
    const recipes = new Set(Object.values(SOUNDS).map((s) => s.recipe as Recipe));
    for (const r of recipes) {
      const d = render(r, 48000, 1);
      let peak = 0, finite = true;
      for (const s of d) {
        finite &&= Number.isFinite(s);
        peak = Math.max(peak, Math.abs(s));
      }
      expect(finite, r).toBe(true);
      expect(peak, r).toBeGreaterThan(0.05);
      expect(peak, r).toBeLessThanOrEqual(1);
    }
  });
});

describe('music scheduler (bar boundaries)', () => {
  it('layer changes land on the next bar line', () => {
    const bars = new BarScheduler(120, 4, 10); // 2 s bars from t = 10
    expect(bars.nextBoundary(10)).toBe(10);
    expect(bars.nextBoundary(10.7)).toBe(12);
    expect(bars.nextBoundary(12)).toBe(12);
    const sw = new LayerSwitcher(bars);
    sw.request(2, 10.7);
    expect(sw.update(11.9)).toBeUndefined();
    expect(sw.current).toBe(0);
    expect(sw.update(12)).toEqual({ level: 2, at: 12 });
    expect(sw.current).toBe(2);
  });

  it('only the latest request before the bar line lands', () => {
    const sw = new LayerSwitcher(new BarScheduler(145, 4, 0));
    sw.request(1, 0.1);
    sw.request(3, 0.5);
    const bar = (60 / 145) * 4;
    expect(sw.update(bar)).toEqual({ level: 3, at: bar });
  });
});

describe('M14b VIS-01: the kill cam restores each voice to its own rate', () => {
  /** A fake AudioParam timeline: setValueAtTime events, cancelScheduledValues drops those at or after t. */
  class Param {
    events: [number, number][] = [];
    constructor(public initial: number) {}
    setValueAtTime(v: number, t: number) { this.events.push([t, v]); this.events.sort((a, b) => a[0] - b[0]); return this as unknown as AudioParam; }
    cancelScheduledValues(t: number) { this.events = this.events.filter(([at]) => at < t); return this as unknown as AudioParam; }
    at(t: number) { let v = this.initial; for (const [at, x] of this.events) if (at <= t) v = x; return v; }
  }

  it('two kill cams 0.3 s apart: the loop is back at its base rate 0.7 s after the second', async () => {
    const { scheduleKillCamRate } = await import('../src/audio/mixer');
    const p = new Param(0.98);
    scheduleKillCamRate(p, 0.98, 0, 0.6, 0.6);
    expect(p.at(0.2)).toBeCloseTo(0.588);
    scheduleKillCamRate(p, 0.98, 0.3, 0.9, 0.6);
    expect(p.at(0.5)).toBeCloseTo(0.588);
    expect(p.at(1.0)).toBeCloseTo(0.98);
    expect(p.at(3)).toBeCloseTo(0.98);
  });
});
