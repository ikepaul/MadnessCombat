// VIS audit probe (design/audit/vis.md): pose pop detector. A scripted session (the hero walks,
// stops, turns, punches, jumps, dives, crawls, gets up, grabs and throws, shoots, reloads, swings
// a blade; grunts take every kind of hit, die, get knocked down and get up) is sampled every tick
// through the painter's own `buildSkeleton` + the root transform. A part that moves more than
// POP_H in one tick while its neighbouring ticks move under a third of that is a pop; the same
// for the root rotation (POP_RAD). Facing flips are listed apart (the mirror is instant by design).
// Run: AUDIT=1 npx vitest run tests/audit/vis/popDetector.test.ts
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../../../src/data/rooms/testRoom';
import { buildSkeleton } from '../../../src/anim/layers';
import { PART_NAMES, rootToWorld } from '../../../src/anim/skeleton';
import { type Actor, createActor, newHand } from '../../../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import type { HitKind } from '../../../src/sim/events';
import { project } from '../../../src/render/camera';
import { World } from '../../../src/sim/world';

const POP_H = 0.1; // H per tick (6 H/s), a part teleporting
const POP_RAD = 0.5; // rad per tick
const PARTS = PART_NAMES.filter((p) => p !== 'item');

interface Sample { tick: number; label: string; facing: number; pts: Record<string, [number, number]>; r: number }

function sample(world: World, a: Actor): Sample {
  const { skeleton } = buildSkeleton(a, world.time);
  const pts: Record<string, [number, number]> = {};
  for (const p of PARTS) {
    const [dx, dy] = rootToWorld(a.pose.root, a.facing, skeleton[p][0], skeleton[p][1]);
    pts[p] = [a.pos.x + dx, a.pos.y + dy];
  }
  return { tick: world.tick, label: `${a.state}/${a.pose.clip}${a.corpse ? '/' + a.corpse.phase : ''}`, facing: a.facing, pts, r: a.pose.root.r };
}

/** The scripted session: [from second, command or action]. */
type Step = [number, (w: World, hero: Actor, g: Actor[]) => Partial<PlayerCommand> | void];
const ONCE = new Set<number>();

function session(): { world: World; hero: Actor; steps: Step[]; grunts: Actor[] } {
  const world = new World(TEST_ROOM);
  const hero = createActor('hero', -2, 9.2, 1);
  world.addPlayer(hero);
  hero.invulnerable = true;
  const grunts = [createActor('grunt', 1.5, 9.2, -1), createActor('grunt', 2.5, 9.6, -1), createActor('grunt', -3, 9.0, 1), createActor('grunt', 3, 8.8, -1)];
  world.actors.push(...grunts);
  const hit = (kind: HitKind, i: number, part: 'head' | 'body' = 'body') => (w: World, h: Actor, g: Actor[]) => { w.hitActor(h, g[i], kind, -1, 0, { x: g[i].pos.x, y: 0.6, z: g[i].pos.z }, part); };
  const steps: Step[] = [
    [0, () => ({ moveX: 1 })], // walk
    [1.0, () => ({})], // stop
    [1.3, () => ({ face: -1 })], // turn
    [1.6, () => ({ moveX: -1, face: -1 })],
    [2.0, () => ({ face: -1 })],
    [2.3, () => ({ face: 1 })],
    [2.5, () => ({ face: 1, attack: 'light' })],
    [3.0, () => ({ face: 1, attack: 'heavy' })],
    [3.7, () => ({ face: 1, attack: 'uppercut' })],
    [4.5, () => ({ face: 1, jump: true })],
    [5.6, () => ({ face: 1, dive: true })],
    [6.4, () => ({ face: 1, moveX: 1 })], // crawl
    [7.0, () => ({ face: 1, dive: true })], // get up
    [7.8, (_w, h) => { h.pos.x = 1.0; h.pos.z = 9.2; return { face: 1 }; }],
    [8.0, () => ({ face: 1, grab: true })],
    [8.8, () => ({ face: -1, grab: true })], // throw
    [9.8, (_w, h) => { h.hands[0] = newHand('pistol'); return { face: 1 }; }],
    [10.0, (_w, h) => ({ face: 1, aim: project(h.pos.x + 3, 0.8, h.pos.z), press: [true, false] })],
    [10.3, (_w, h) => ({ face: 1, aim: project(h.pos.x + 3, 0.8, h.pos.z), reload: true })],
    [11.8, (_w, h) => ({ face: -1, aim: project(h.pos.x - 3, 0.8, h.pos.z) })], // turn while aiming
    [12.2, (_w, h) => ({ face: -1, aim: project(h.pos.x - 3, 0.8, h.pos.z), throwGun: true })],
    [13.0, (_w, h) => { h.hands[0] = newHand('knife'); return { face: 1 }; }],
    [13.2, () => ({ face: 1, attack: 'light' })], // knife swing/stab
    [14.0, (_w, h) => { h.hands[0] = newHand('sword'); return { face: 1 }; }],
    [14.2, () => ({ face: 1, attack: 'light' })],
    [14.8, (_w, h) => { h.hands[0] = newHand('sign'); return { face: 1 }; }],
    [14.9, () => ({ face: 1, attack: 'light' })],
    // grunts: every kind of hit reaction, deaths and a knockdown + get up
    [15.0, hit('light', 1)], [15.6, hit('light', 1, 'head')], [16.2, hit('heavy', 1)],
    [17.5, hit('uppercut', 3)], [19.5, hit('bullet', 2)], [20.0, hit('bullet', 2, 'head')],
    [21.0, hit('sweep', 1)], [24.5, hit('slash', 3)], [25.0, hit('heavy', 1)], [25.5, hit('heavy', 1)],
    [27.0, () => ({})],
  ];
  return { world, hero, steps, grunts };
}

function run() {
  ONCE.clear();
  const { world, hero, steps, grunts } = session();
  const track = [hero, ...grunts];
  const series = new Map<number, Sample[]>();
  let k = 0;
  for (let i = 0; i < 60 * 30; i++) {
    const t = i / 60;
    while (k + 1 < steps.length && steps[k + 1][0] <= t) k++;
    const fresh = !ONCE.has(k);
    ONCE.add(k);
    // the step runs every tick of its segment; its edges (attack, jump, dive, grab, presses) only on the first
    const out = (fresh ? steps[k][1](world, hero, grunts) : steps[k][1].length === 0 ? steps[k][1](world, hero, grunts) : undefined) ?? {};
    const cmd: Partial<PlayerCommand> = fresh ? out : { moveX: out.moveX ?? 0, moveZ: out.moveZ ?? 0, face: out.face, aim: out.aim };
    world.command = { ...IDLE_COMMAND, ...cmd };
    world.step();
    for (const a of track) {
      if (a.corpse?.phase === 'frozen') continue;
      let s = series.get(a.id);
      if (!s) series.set(a.id, (s = []));
      s.push(sample(world, a));
    }
  }
  const pops: { who: string; tick: number; part: string; d: number; from: string; to: string }[] = [];
  const flips: { who: string; tick: number; d: number; label: string }[] = [];
  for (const [id, s] of series) {
    const who = id === hero.id ? 'hero' : `grunt${grunts.findIndex((g) => g.id === id)}`;
    const delta = (i: number, p: string) => (i <= 0 || i >= s.length ? 0 : Math.hypot(s[i].pts[p][0] - s[i - 1].pts[p][0], s[i].pts[p][1] - s[i - 1].pts[p][1]));
    for (let i = 1; i < s.length; i++) {
      if (s[i].tick !== s[i - 1].tick + 1) continue;
      if (s[i].facing !== s[i - 1].facing) {
        flips.push({ who, tick: s[i].tick, d: +Math.max(...PARTS.map((p) => delta(i, p))).toFixed(3), label: s[i].label });
        continue;
      }
      for (const p of PARTS) {
        const d = delta(i, p), n = Math.max(delta(i - 1, p), delta(i + 1, p));
        if (d > POP_H && n < d / 3) pops.push({ who, tick: s[i].tick, part: p, d: +d.toFixed(3), from: s[i - 1].label, to: s[i].label });
      }
      const wrap = (x: number) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
      const dr = wrap(s[i].r - s[i - 1].r), nr = Math.max(i > 1 ? wrap(s[i - 1].r - s[i - 2].r) : 0, i + 1 < s.length ? wrap(s[i + 1].r - s[i].r) : 0);
      if (dr > POP_RAD && nr < dr / 3) pops.push({ who, tick: s[i].tick, part: 'root.r', d: +dr.toFixed(3), from: s[i - 1].label, to: s[i].label });
    }
  }
  const dbg = (process.env.AUDIT_TICKS ?? "").split(",").filter(Boolean).map(Number);
  const dump: string[] = [];
  for (const [id, s] of series) for (const x of s) if (dbg.some((t) => Math.abs(t - x.tick) <= 2)) dump.push(`id${id} t${x.tick} ${x.label} f${x.facing} r${x.r.toFixed(2)} body ${x.pts.body.map((v) => v.toFixed(2))} head ${x.pts.head.map((v) => v.toFixed(2))}`);
  return { pops, flips, dump };
}

describe.skipIf(!process.env.AUDIT)('VIS pose pop detector', () => {
  it('lists the transitions that snap', () => {
    const { pops, flips, dump } = run();
    if (dump.length) console.log(dump.join('\n'));
    // group by transition
    const groups = new Map<string, { n: number; max: number; parts: Set<string>; ticks: number[] }>();
    for (const p of pops) {
      const key = `${p.from} -> ${p.to}`;
      const g = groups.get(key) ?? { n: 0, max: 0, parts: new Set(), ticks: [] };
      g.n++; g.max = Math.max(g.max, p.d); g.parts.add(p.part); g.ticks.push(p.tick);
      groups.set(key, g);
    }
    const rows = [...groups].sort((a, b) => b[1].max - a[1].max).map(([k, g]) => `${g.max.toFixed(2)} H  x${g.n}  ${k}  [${[...g.parts].join(',')}] ticks ${g.ticks.slice(0, 4).join(',')}`);
    const out = [`pops: ${pops.length} in ${groups.size} transitions`, ...rows, `facing flips: ${flips.length}, max part jump ${Math.max(0, ...flips.map((f) => f.d)).toFixed(2)} H`, ...flips.slice(0, 8).map((f) => `  ${f.who} t${f.tick} ${f.d} H ${f.label}`)];
    console.log(out.join('\n'));
    if (process.env.AUDIT_OUT) require('node:fs').writeFileSync(process.env.AUDIT_OUT, out.join('\n'));
    expect(pops.length).toBeGreaterThanOrEqual(0);
  });
});
