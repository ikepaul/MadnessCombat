// M14b slice E (shell & tech): rebinding, the reset confirm, the end card's keys, blur pause, text
// sizes, lazy labs, the TUNED tag. One test per audit id (design/audit/uxs.md, cmb.md CMB-17).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bindKey, DEFAULT_KEYS, fillKeys, SETTINGS } from '../src/settings';
import { confirmItem } from '../src/ui/confirm';
import { END_CARD, EndCardGate } from '../src/ui/endCard';
import { edgeCounts, FOCUS_GUARD, pauseOnBlur } from '../src/ui/focus';
import { tunedTag } from '../src/dev/overrides';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const label = (it: { label: string | (() => string) }) => (typeof it.label === 'function' ? it.label() : it.label);

describe('CMB-17 / UXS-10 rebinding', () => {
  afterEach(() => { SETTINGS.keys = { ...DEFAULT_KEYS }; });

  it('binding a key in use swaps the two actions', () => {
    const r = bindKey('grab', 'SPACE');
    expect(r).toEqual({ ok: true, swapped: 'jump' });
    expect(SETTINGS.keys.grab).toBe('SPACE');
    expect(SETTINGS.keys.jump).toBe('F');
    // no key does two things
    const keys = Object.values(SETTINGS.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses F1-F6, Esc, Enter and M; the debug keys only while they are live', () => {
    for (const k of ['F1', 'F4', 'F6', 'ESC', 'ENTER', 'M']) expect(bindKey('jump', k).ok).toBe(false);
    expect(SETTINGS.keys.jump).toBe('SPACE');
    expect(bindKey('up', 'Z', true).ok).toBe(false);
    // without the debug set (production), Z is free for AZERTY players
    expect(bindKey('up', 'Z', false)).toEqual({ ok: true });
  });

  it('captions follow the new key', () => {
    bindKey('use', 'T');
    expect(fillKeys('Pick it up ({key:use})')).toContain('T');
  });

  it('no hidden second dive key, and the pause menu rebuilds the keys when it closes', () => {
    expect(src('src/input/playerInput.ts')).not.toMatch(/addKey\(K\.C\)/);
    expect(src('src/scenes/GameScene.ts')).toMatch(/pauseClosed\(\): void \{[^}]*boundKeys !== JSON\.stringify\(SETTINGS\.keys\)/);
  });
});

describe('UXS-09 reset progress needs a second press', () => {
  it('one press arms, two reset; leaving the row disarms', () => {
    let resets = 0;
    const it = confirmItem('Reset progress', () => resets++, 'Progress reset');
    it.action!();
    expect(resets).toBe(0);
    expect(label(it)).toContain('press again');
    it.leave!();
    it.action!();
    expect(resets).toBe(0);
    it.action!();
    expect(resets).toBe(1);
    expect(label(it)).toBe('Progress reset');
  });

  it('is not in the pause menu', () => {
    expect(src('src/scenes/UIScene.ts')).toMatch(/settingsItems\([^;]*, true\)/);
  });
});

describe('UXS-13 the end card', () => {
  it('a reload tap after the last kill keeps the card; a held R replays', () => {
    const card = new EndCardGate();
    card.show(1.5); // the card comes up 1.5 s after roomCleared
    expect(card.ready(1.6)).toBe(false);
    card.pressR(1.6); // the reflex reload
    expect(card.replayDue(5)).toBe(false);
    const t = 1.5 + END_CARD.deaf + 0.1;
    card.pressR(t); card.releaseR(); // a tap once it listens: still nothing
    expect(card.replayDue(t + 1)).toBe(false);
    card.pressR(t);
    expect(card.replayDue(t + END_CARD.hold * 0.9)).toBe(false);
    expect(card.fill(t + END_CARD.hold / 2)).toBeCloseTo(0.5);
    expect(card.replayDue(t + END_CARD.hold)).toBe(true);
    expect(card.replayDue(t + END_CARD.hold + 0.1)).toBe(false); // once
  });
});

describe('UXS-15 pause on blur', () => {
  const base = { dev: false, menuOpen: false, cleared: false, dead: false };
  it('single player pauses; not while dead, on the end card, in co-op or in labs', () => {
    expect(pauseOnBlur(base)).toBe(true);
    expect(pauseOnBlur({ ...base, dead: true })).toBe(false);
    expect(pauseOnBlur({ ...base, cleared: true })).toBe(false);
    expect(pauseOnBlur({ ...base, menuOpen: true })).toBe(false);
    expect(pauseOnBlur({ ...base, coop: 'host' })).toBe(false);
    expect(pauseOnBlur({ ...base, dev: true })).toBe(false);
  });

  it('the click that brings focus back does not skip the death wait', () => {
    expect(edgeCounts(0.05)).toBe(false);
    expect(edgeCounts(FOCUS_GUARD + 0.01)).toBe(true);
  });
});

describe('UXS-16 text sizes', () => {
  it('player-facing text is at least 26 px, captions 34 px (debug text exempt)', () => {
    const files = [
      ...readdirSync(join(__dirname, '../src/ui')).map((f) => `src/ui/${f}`),
      ...['TitleScene', 'UIScene', 'CoopLobbyScene', 'GameScene'].map((f) => `src/scenes/${f}.ts`),
    ].filter((f) => f.endsWith('.ts'));
    const small: string[] = [];
    for (const f of files) {
      for (const [i, line] of src(f).split('\n').entries()) {
        if (line.includes('// debug text')) continue;
        for (const m of line.matchAll(/fontSize: '(\d+)px'/g)) if (Number(m[1]) < 26) small.push(`${f}:${i + 1} ${m[1]}px`);
      }
    }
    expect(small).toEqual([]);
    expect(src('src/scenes/UIScene.ts')).toMatch(/fontSize: '34px'[^\n]*wordWrap: \{ width: 1400 \}/);
  });
});

describe('UXS-21 labs are lazy', () => {
  it('nothing in the game bundle imports a lab; BootScene loads them behind ?lab', () => {
    const lazy = new Set(['labScenes.ts', 'LabIndexScene.ts', 'PoseEditorScene.ts']);
    const eager: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(__dirname, '..', dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== 'labs') walk(p); continue; }
        if (!p.endsWith('.ts') || lazy.has(e.name)) continue;
        for (const m of src(p).matchAll(/^import [^;]*'([^']*labs\/(\w+))'/gm)) if (m[2] !== 'registry') eager.push(`${p}: ${m[1]}`);
        if (/^import .*(LabIndexScene|PoseEditorScene)'/m.test(src(p))) eager.push(`${p}: a lab scene`);
      }
    };
    walk('src');
    expect(eager).toEqual([]);
    expect(src('src/scenes/BootScene.ts')).toContain("import('./labScenes')");
    expect(src('vite.config.ts')).toContain('chunkSizeWarningLimit: 1000');
  });
});

describe('UXS-25 the TUNED tag', () => {
  it('counts the active overrides', () => {
    expect(tunedTag({})).toBe('');
    expect(tunedTag({ 'TUNING.move.hero.walkSpeed': 1.6, 'FEEL.shake.hit': 2 })).toBe('TUNED · 2');
  });
});
