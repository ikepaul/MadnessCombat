// M13 game shell: progress (stages unlock as you go, Continue at the room checkpoint), the
// effective effect level (reduced motion), the credits text from assets/CREDITS.md.
import { beforeEach, describe, expect, it } from 'vitest';
import { PROGRESS, resetProgress, saveCheckpoint, stageFinished } from '../src/progress';
import { effectLevel, SETTINGS } from '../src/settings';
import { creditsText } from '../src/ui/credits';

describe('progress (decided: unlock as you go, restart the room)', () => {
  beforeEach(() => resetProgress());

  it('stage 1 is open from the start; finishing a stage opens the next and points Continue at it', () => {
    expect(PROGRESS.unlocked).toBe(1);
    stageFinished(1);
    expect(PROGRESS.unlocked).toBe(2);
    expect(PROGRESS.checkpoint?.stage).toBe(2);
    stageFinished(2);
    expect(PROGRESS.unlocked).toBe(3);
    stageFinished(3);
    expect(PROGRESS.unlocked).toBe(3);
    expect(PROGRESS.checkpoint).toBeUndefined();
  });

  it('entering a room saves it as the checkpoint, loadout and body count included', () => {
    saveCheckpoint({ stage: 2, room: 'office', entry: 'hole', kills: 12, players: [{ hands: [null, null], grenades: 1 }] });
    expect(PROGRESS.checkpoint).toMatchObject({ stage: 2, room: 'office', kills: 12 });
    expect(PROGRESS.unlocked).toBe(2);
  });
});

describe('settings', () => {
  it('reduced motion turns the screen effects off whatever the intensity says', () => {
    SETTINGS.effects = 'full';
    SETTINGS.reducedMotion = true;
    expect(effectLevel()).toBe('off');
    SETTINGS.reducedMotion = false;
    expect(effectLevel()).toBe('full');
  });
});

describe('credits', () => {
  it('lists the required CC-BY credit (the gunshot recordings) without markdown', () => {
    const t = creditsText();
    expect(t).toContain('Gunshot recordings');
    expect(t).toContain('CC BY 3.0');
    expect(t).not.toContain('**');
    expect(t).not.toMatch(/^#/m);
  });
});

describe('dev tuning overrides (M13 playtest pass)', () => {
  it('sets a number deep in a data object, and refuses anything that is not a number', async () => {
    const { setPath } = await import('../src/dev/overrides');
    const root = { move: { hero: { walkSpeed: 1.5 } }, name: 'x' };
    expect(setPath(root, ['move', 'hero', 'walkSpeed'], 1.8)).toBe(true);
    expect(root.move.hero.walkSpeed).toBe(1.8);
    expect(setPath(root, ['name'], 2)).toBe(false);
    expect(setPath(root, ['move', 'nope', 'x'], 2)).toBe(false);
  });

  it('applies nothing without saved overrides (tests, production)', async () => {
    const { applyOverrides } = await import('../src/dev/overrides');
    const root = { a: 1 };
    applyOverrides('X', root);
    expect(root.a).toBe(1);
  });
});
