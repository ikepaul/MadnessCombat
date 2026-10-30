import Phaser from 'phaser';
import type { PaletteId } from '../data/palettes';
import { getLab } from '../labs/registry';
import type { StageRoomId } from '../data/stages/stage1';

/** Waits for the bundled fonts, then routes by URL: `?lab` (index), `?lab=<slug>`, or the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    // UXS-21: the labs (and the pose editor) load only behind ?lab, from their own chunk
    const labs = params.has('lab')
      ? import('./labScenes').then(({ LabIndexScene, PoseEditorScene }) => {
        if (!this.scene.get('lab-index')) this.scene.add('lab-index', LabIndexScene, false);
        if (!this.scene.get('pose-editor')) this.scene.add('pose-editor', PoseEditorScene, false);
      })
      : Promise.resolve();
    Promise.all([document.fonts.load('64px Anton'), document.fonts.load('20px Inter'), labs]).finally(() => {
      const palette = (params.get('palette') ?? undefined) as PaletteId | undefined;
      const lab = params.get('lab');
      if (params.has('lab') && !lab) this.scene.start('lab-index');
      else if (lab && getLab(lab)?.scene) this.scene.start(getLab(lab)!.scene!);
      else if (lab) this.scene.start('game', { lab, palette });
      else if (params.get('coop') === 'bot') {
        // M18 dev route: player 2 is the partner bot (src/dev/partnerBot.ts), on this laptop
        this.scene.start('game', {
          stage: params.get('stage') === '3' ? 3 : params.get('stage') === '2' ? 2 : 1,
          room: (params.get('room') ?? undefined) as StageRoomId,
          wave: params.get('wave') ?? undefined,
          beat: params.get('beat') ?? undefined,
          palette,
          bot: true,
        });
      }
      else if (params.get('coop') === 'host' || params.get('coop') === 'join') {
        // co-op (PLAN.md M4b): /?coop=host on one laptop, /?coop=join on the other
        this.scene.start('coop-lobby', {
          role: params.get('coop') === 'host' ? 'host' : 'guest',
          stage: params.get('stage') === '3' ? 3 : params.get('stage') === '2' ? 2 : 1,
          room: (params.get('room') ?? undefined) as StageRoomId,
          wave: params.get('wave') ?? undefined,
          palette,
        });
      }
      else if (params.get('room') === 'test') this.scene.start('game', { testRoom: true, palette });
      // M13: no route given: the title screen (the stage routes stay for playtesting)
      else if (!params.has('stage') && !params.has('beat') && !params.has('wave') && !params.has('room')) this.scene.start('title');
      else {
        // the stage route is the default: /?stage=1&room=arena runs the whole stage, &wave=A starts at wave A;
        // /?stage=2 runs stage 2 room by room (&room=office starts in that room, M9)
        this.scene.start('game', {
          stage: params.get('stage') === '3' ? 3 : params.get('stage') === '2' ? 2 : 1,
          room: (params.get('room') ?? undefined) as StageRoomId,
          wave: params.get('wave') ?? undefined,
          beat: params.get('beat') ?? undefined,
          palette,
        });
      }
    });
  }
}
