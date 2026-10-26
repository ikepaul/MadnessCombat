import Phaser from 'phaser';

export interface DebugActions {
  toggleOverlay(): void;
  toggleSlowMo(): void;
  togglePause(): void;
  stepFrame(): void;
  setPalette(i: 1 | 2 | 3): void;
  togglePost(): void;
  spawnCorpses(): void;
  dropGuns(): void;
  cycleEffects(): void;
  toggleMute(): void;
  raiseAll(): void;
}

/**
 * Debug keys (PLAN.md ground rules): F1 overlay, F2 slow-mo 0.25x, F3 pause, F4 or "." step one
 * frame while paused, 1/2/3 stage palettes (and blood: stage 1 has none), P post FX on/off,
 * K drop 20 corpses (corpse-layer stress test), L drop a random gun at each player's feet, V effect intensity (full/reduced/off), M mute,
 * Z raise every intact corpse as a zombie (M7).
 */
export function bindDebugKeys(scene: Phaser.Scene, a: DebugActions): void {
  const kb = scene.input.keyboard;
  if (!kb) return;
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
  kb.on('keydown-V', () => a.cycleEffects());
  kb.on('keydown-M', () => a.toggleMute());
  kb.on('keydown-Z', () => a.raiseAll());
}
