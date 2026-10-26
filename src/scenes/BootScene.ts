import Phaser from 'phaser';
import type { PaletteId } from '../data/palettes';

/** Waits for the bundled fonts, then routes by URL: `?lab` (index), `?lab=<slug>`, or the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    Promise.all([document.fonts.load('64px Anton'), document.fonts.load('20px Inter')]).finally(() => {
      const params = new URLSearchParams(window.location.search);
      const palette = (params.get('palette') ?? undefined) as PaletteId | undefined;
      if (params.has('lab') && !params.get('lab')) this.scene.start('lab-index');
      else this.scene.start('game', { lab: params.get('lab') ?? undefined, palette });
    });
  }
}
