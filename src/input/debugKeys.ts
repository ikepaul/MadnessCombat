import Phaser from 'phaser';

export interface DebugActions {
  toggleOverlay(): void;
  toggleSlowMo(): void;
  togglePause(): void;
  stepFrame(): void;
  setPalette(i: 1 | 2 | 3): void;
  togglePost(): void;
}

/**
 * Debug keys (PLAN.md ground rules): F1 overlay, F2 slow-mo 0.25x, F3 pause, F4 or "." step one
 * frame while paused, 1/2/3 stage palettes, P post FX on/off.
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
}
