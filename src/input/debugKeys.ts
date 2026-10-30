import type Phaser from 'phaser';

export interface DebugActions {
  toggleOverlay(): void;
  toggleSlowMo(): void;
  togglePause(): void;
  stepFrame(): void;
  setPalette(i: 1 | 2 | 3): void;
  togglePost(): void;
  spawnCorpses(): void;
  dropGuns(): void;
  toggleMute(): void;
  raiseAll(): void;
  /** F6 (dev builds): the tuning panel. */
  toggleTuning?(): void;
}

/** M14b (CMB-02 / UXS-04, decided): the debug keys exist in dev builds, or with `?debug` in the URL. */
export function debugEnabled(dev = import.meta.env.DEV, search = typeof location === 'undefined' ? '' : location.search): boolean {
  return dev || new URLSearchParams(search).has('debug');
}

/**
 * Debug keys (PLAN.md ground rules): F1 overlay, F2 slow-mo 0.25x, F3 pause, F4 or "." step one
 * frame while paused, 1/2/3 stage palettes (and blood: stage 1 has none), P post FX on/off,
 * K drop 20 corpses (corpse-layer stress test), L drop a random gun at each player's feet,
 * Z raise every intact corpse as a zombie (M7). Only with `debug` (dev builds or `?debug`).
 * M (mute, restores your volume) is a player key and always bound; effect intensity lives in
 * Settings only (M14b).
 */
export function bindDebugKeys(scene: Phaser.Scene, debug: boolean, a: DebugActions): void {
  const kb = scene.input.keyboard;
  if (!kb) return;
  kb.on('keydown-M', () => a.toggleMute());
  if (!debug) return;
  kb.addCapture(['F1', 'F2', 'F3', 'F4']);
  kb.on('keydown-F1', () => a.toggleOverlay());
  kb.on('keydown-F2', () => a.toggleSlowMo());
  kb.on('keydown-F3', () => a.togglePause());
  kb.on('keydown-F4', () => a.stepFrame());
  kb.on('keydown-PERIOD', () => a.stepFrame());
  kb.on('keydown-ONE', () => a.setPalette(1));
  kb.on('keydown-TWO', () => a.setPalette(2));
  kb.on('keydown-THREE', () => a.setPalette(3));
  kb.on('keydown-P', () => a.togglePost());
  kb.on('keydown-K', () => a.spawnCorpses());
  kb.on('keydown-L', () => a.dropGuns());
  kb.on('keydown-Z', () => a.raiseAll());
  if (a.toggleTuning) { kb.addCapture('F6'); kb.on('keydown-F6', () => a.toggleTuning!()); }
}
