import Phaser from 'phaser';
import type { PaletteId } from '../data/palettes';
import '../labs/aiLabs';
import '../labs/gunLabs';
import '../labs/meleeLabs';
import '../labs/movementLabs';
import '../labs/toolLabs';
import { getLab } from '../labs/registry';
import type { StageRoomId } from '../data/stages/stage1';

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
      else if (lab) this.scene.start('game', { lab, palette });
      else if (params.get('coop') === 'host' || params.get('coop') === 'join') {
        // co-op (PLAN.md M4b): /?coop=host on one laptop, /?coop=join on the other
        this.scene.start('coop-lobby', {
          role: params.get('coop') === 'host' ? 'host' : 'guest',
          stage: 1,
          room: (params.get('room') ?? 'arena') as StageRoomId,
          wave: params.get('wave') ?? undefined,
          palette,
        });
      }
      else if (params.get('room') === 'test') this.scene.start('game', { testRoom: true, palette });
      else {
        // the stage route is the default: /?stage=1&room=arena runs the whole stage, &wave=A starts at wave A
        this.scene.start('game', {
          stage: 1,
          room: (params.get('room') ?? 'arena') as StageRoomId,
          wave: params.get('wave') ?? undefined,
          beat: params.get('beat') ?? undefined,
          palette,
        });
      }
    });
  }
}
