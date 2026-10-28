// UXS audit probes (opt-in: AUDIT=1 npx vitest run tests/audit/uxs). They print numbers and
// record current behaviour; they're evidence for design/audit/uxs.md, not acceptance tests.
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A Map-backed localStorage, so src/settings.ts and src/progress.ts load from what we put in. */
function memStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

async function loadWith(init: Record<string, string>) {
  vi.resetModules();
  const store = memStorage(init);
  vi.stubGlobal('localStorage', store);
  const settings = await import('../../../src/settings');
  const progress = await import('../../../src/progress');
  return { store, settings, progress };
}

afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!process.env.AUDIT)('UXS saves: corrupt and old localStorage', () => {
  it('unparseable JSON falls back to defaults (good)', async () => {
    const { settings, progress } = await loadWith({ 'madness-like.settings': '{oops', 'madness-like.progress': 'not json' });
    expect(settings.SETTINGS.master).toBe(0.8);
    expect(progress.PROGRESS.unlocked).toBe(1);
  });

  it('wrong-typed values pass through unvalidated (UXS-12)', async () => {
    const { settings, progress } = await loadWith({
      'madness-like.settings': JSON.stringify({ master: 'loud', music: null, effects: 'banana', reducedMotion: 'yes', blood: 1, friendlyFire: 'x', keys: { jump: 'NOPE', oldAction: 'Q' } }),
      'madness-like.progress': JSON.stringify({ unlocked: '9', checkpoint: { stage: 7, room: 42 } }),
    });
    const s = settings.SETTINGS as unknown as Record<string, unknown>;
    console.log('[UXS-12] settings after corrupt load', JSON.stringify({ master: s.master, music: s.music, effects: s.effects, level: settings.effectLevel(), reducedMotion: s.reducedMotion, keys: settings.SETTINGS.keys }));
    console.log('[UXS-12] progress after corrupt load', JSON.stringify(progress.PROGRESS));
    // what the game then computes from them
    const { INTENSITY_SCALE } = await import('../../../src/data/feel');
    console.log('[UXS-12] INTENSITY_SCALE[effectLevel()] =', INTENSITY_SCALE[settings.effectLevel()], '(shake multiplier)');
    expect(s.master).toBe('loud'); // documents the gap
    expect(settings.SETTINGS.effects).toBe('banana'); // effectLevel() is 'off' only because reducedMotion 'yes' is truthy
  });
});

describe.skipIf(!process.env.AUDIT)('UXS saves: replaying an earlier stage', () => {
  it('finishing a replayed stage 1 moves Continue back from stage 3 to stage 2 (UXS-03)', async () => {
    const { progress } = await loadWith({});
    progress.stageFinished(1);
    progress.stageFinished(2);
    progress.saveCheckpoint({ stage: 3, room: 'desert', entry: 'west', kills: 140, players: [{ hands: [null, null], grenades: 0 }] });
    const before = structuredClone(progress.PROGRESS.checkpoint);
    progress.stageFinished(1); // Stage select -> stage 1 -> end card
    console.log('[UXS-03] checkpoint before replaying stage 1:', JSON.stringify(before), '\n          after:', JSON.stringify(progress.PROGRESS.checkpoint));
    expect(progress.PROGRESS.checkpoint?.stage).toBe(2);
  });

  it('just entering a room of a replayed stage 2 overwrites a stage 3 checkpoint', async () => {
    const { progress } = await loadWith({});
    progress.saveCheckpoint({ stage: 3, room: 'desert', entry: 'west', kills: 140, players: [] });
    progress.saveCheckpoint({ stage: 2, room: 'wall', entry: 'street', kills: 0, players: [] });
    expect(progress.PROGRESS.checkpoint?.stage).toBe(2);
  });

  it('"Reset progress" wipes everything in one press (UXS-04): one call, no confirm', async () => {
    const { progress, store } = await loadWith({ 'madness-like.progress': JSON.stringify({ unlocked: 3, checkpoint: { stage: 3, room: 'desert', entry: 'west', kills: 140, players: [] } }) });
    progress.resetProgress();
    console.log('[UXS-04] stored progress after one Reset press:', store.getItem('madness-like.progress'));
    expect(progress.PROGRESS.unlocked).toBe(1);
  });
});
