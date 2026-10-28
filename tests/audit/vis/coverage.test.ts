// VIS audit probe (design/audit/vis.md): event -> response coverage matrix. Reads the sources: every
// event type in src/sim/events.ts, whether anything emits it, and which subscribers answer it with
// a sound (src/audio/hooks.ts, boombox), a feel response (src/feel/feel.ts), a VFX/decal
// (src/render/vfx.ts, gunFx.ts, decals.ts) or HUD/scene work (UIScene, hud, stageHud, transition,
// GameScene). Prints the matrix and the silent / effect-less rows.
// Run: AUDIT=1 npx vitest run tests/audit/vis/coverage.test.ts
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const GROUPS: Record<string, string[]> = {
  sound: ['src/audio/hooks.ts', 'src/audio/boombox.ts'],
  feel: ['src/feel/feel.ts'],
  vfx: ['src/render/vfx.ts', 'src/render/gunFx.ts', 'src/render/decals.ts'],
  hud: ['src/scenes/UIScene.ts', 'src/ui/hud.ts', 'src/render/stageHud.ts', 'src/ui/transition.ts', 'src/scenes/GameScene.ts'],
};

export function matrix() {
  const ev = read('src/sim/events.ts');
  const body = ev.slice(ev.indexOf('export interface GameEvents'), ev.indexOf('export type HitKind'));
  const names = [...body.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]);
  const emitters = [...walk('src/sim'), ...walk('src/data')].map(read).join('\n');
  const subs = Object.fromEntries(Object.entries(GROUPS).map(([g, files]) => [g, files.map(read).join('\n')]));
  return names.map((n) => {
    const on = (src: string) => new RegExp(`events\\.on\\('${n}'`).test(src);
    const count = (src: string) => (src.match(new RegExp(`events\\.on\\('${n}'`, 'g')) ?? []).length;
    return {
      event: n,
      emitted: new RegExp(`emit\\('${n}'`).test(emitters),
      sound: on(subs.sound), soundHandlers: count(subs.sound), feel: on(subs.feel), vfx: on(subs.vfx), hud: on(subs.hud),
    };
  });
}

describe.skipIf(!process.env.AUDIT)('VIS event coverage matrix', () => {
  it('prints the matrix', () => {
    const m = matrix();
    const mark = (b: boolean) => (b ? 'x' : '.');
    const lines = ['event | emitted | sound | feel | vfx | hud', ...m.map((r) => `${r.event} | ${mark(r.emitted)} | ${r.sound ? 'x' + (r.soundHandlers > 1 ? r.soundHandlers : '') : '.'} | ${mark(r.feel)} | ${mark(r.vfx)} | ${mark(r.hud)}`)];
    const plumbing = new Set(['tick', 'roomChanged', 'corpseFrozen', 'corpseThawed', 'corpseSettled', 'itemDrop', 'roomEnter', 'exitOpen', 'warp', 'doorClose', 'waveStart', 'roomCleared', 'music', 'card']);
    const silent = m.filter((r) => r.emitted && !r.sound && !plumbing.has(r.event)).map((r) => r.event);
    const bare = m.filter((r) => r.emitted && !r.sound && !r.feel && !r.vfx && !r.hud && !plumbing.has(r.event)).map((r) => r.event);
    const dead = m.filter((r) => !r.emitted).map((r) => r.event);
    lines.push(`\nsilent (emitted, no sound): ${silent.join(', ')}`, `no response at all: ${bare.join(', ')}`, `declared, never emitted: ${dead.join(', ')}`);
    console.log(lines.join('\n'));
    if (process.env.AUDIT_OUT) writeFileSync(process.env.AUDIT_OUT, lines.join('\n'));
    expect(m.length).toBeGreaterThan(50);
  });
});
