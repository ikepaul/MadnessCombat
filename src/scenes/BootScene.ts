import Phaser from 'phaser';
import type { PaletteId } from '../data/palettes';
import '../labs/meleeLabs';
import '../labs/movementLabs';
import '../labs/toolLabs';
import { getLab } from '../labs/registry';

/** Waits for the bundled fonts, then routes by URL: `?lab` (index), `?lab=<slug>`, or the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    Promise.all([document.fonts.load('64px Anton'), document.fonts.load('20px Inter')]).finally(() => {
      const params = new URLSearchParams(window.location.search);
      const palette = (params.get('palette') ?? undefined) as PaletteId | undefined;
      const lab = params.get('lab');
      if (params.has('lab') && !lab) this.scene.start('lab-index');
      else if (lab && getLab(lab)?.scene) this.scene.start(getLab(lab)!.scene!);
      else this.scene.start('game', { lab: params.get('lab') ?? undefined, palette });
    });
  }
}
