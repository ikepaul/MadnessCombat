import Phaser from 'phaser';
import { INK } from '../data/palettes';
import { beginRun, LAST_STAGE, PROGRESS } from '../progress';
import { Menu, type MenuItem } from '../ui/menu';
import { controlsItems, settingsItems } from '../ui/settingsMenu';
import { creditsText } from '../ui/credits';
import { inkWipe, requestStageCard } from '../ui/transition';

/** Working title (our own; the show's name stays out of the game). One place to change it. */
export const GAME_TITLE = 'BODY COUNT';

/** Our own stage names for the cards. */
export const STAGE_NAMES: Record<number, string> = { 1: 'THE ARENA', 2: 'THE BUILDING', 3: 'THE RETURN' };

export interface TitleData { view?: 'main' | 'stages' | 'coop' | 'settings' | 'controls' | 'credits' }

/**
 * Title screen (PLAN.md M13): Continue (the last room checkpoint), New game, Stage select (unlocked
 * as you go), Co-op, Settings (volumes, effects, reduced motion, blood, key bindings), Credits.
 * Our own title card: ink black, a red slash, Anton type.
 */
export class TitleScene extends Phaser.Scene {
  private menu?: Menu;
  private layer: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('title');
  }

  create(data: TitleData): void {
    this.cameras.main.setBackgroundColor('#141416');
    const g = this.add.graphics();
    // the red slash and a grey floor band (our title card)
    g.fillStyle(0x8a0a12, 1);
    g.beginPath(); g.moveTo(0, 410); g.lineTo(1920, 330); g.lineTo(1920, 362); g.lineTo(0, 452); g.closePath(); g.fillPath();
    g.fillStyle(0x2a2b30, 1);
    g.fillRect(0, 880, 1920, 200);
    this.add.text(110, 150, GAME_TITLE, { fontFamily: 'Anton', fontSize: '150px', color: '#f2f2f3', stroke: INK, strokeThickness: 12 });
    this.add.text(116, 330, 'three stages, keyboard and mouse', { fontFamily: 'Inter', fontSize: '26px', color: '#9a9ba0' });
    this.show(data.view ?? 'main');
    // revamp F2: the title comes in from under the ink
    inkWipe(this, 'in');
    // the menu's key handlers live on the scene's keyboard: drop them when the scene stops
    this.events.once('shutdown', () => this.clear());
  }

  private clear(): void {
    this.menu?.destroy();
    this.menu = undefined;
    for (const o of this.layer) o.destroy();
    this.layer = [];
  }

  private heading(text: string): void {
    this.layer.push(this.add.text(1000, 430, text, { fontFamily: 'Anton', fontSize: '56px', color: '#f2f2f3' }));
  }

  private show(view: NonNullable<TitleData['view']>): void {
    this.clear();
    const at = (items: MenuItem[], back?: () => void, size = 44, gap = 64, y = 530) => (this.menu = new Menu(this, items, 1060, y, back, size, gap));
    if (view === 'main') {
      const cp = PROGRESS.checkpoint;
      const canContinue = !!cp && (cp.stage > 1 || !!cp.room);
      at([
        { label: () => (cp ? `Continue · stage ${cp.stage}` : 'Continue'), disabled: !canContinue, action: () => this.play(cp!.stage, true) },
        { label: 'New game', action: () => this.play(1, false) },
        { label: 'Stage select', action: () => this.show('stages') },
        // UXS-06 (decided): co-op needs the dev server's relay, so production builds hide it until there's a server
        ...(import.meta.env.DEV ? [
          { label: 'Co-op (host)', action: () => this.show('coop') },
          { label: 'Co-op (join)', action: () => this.scene.start('coop-lobby', { role: 'guest', stage: 1 }) },
        ] : []),
        { label: 'Settings', action: () => this.show('settings') },
        { label: 'Credits', action: () => this.show('credits') },
      ]);
    } else if (view === 'stages') {
      this.heading('STAGE SELECT');
      const rows: MenuItem[] = [];
      for (let n = 1; n <= LAST_STAGE; n++) {
        const open = n <= PROGRESS.unlocked;
        rows.push({ label: open ? `Stage ${n} · ${STAGE_NAMES[n]}` : `Stage ${n} · locked`, disabled: !open, action: () => this.play(n, false) });
      }
      rows.push({ label: 'Back', action: () => this.show('main') });
      at(rows, () => this.show('main'));
    } else if (view === 'coop') {
      // hosting: pick where the two of you start (playtest: hosting always began at stage 1)
      this.heading('CO-OP · HOST');
      const cp = PROGRESS.checkpoint;
      const rows: MenuItem[] = [];
      if (cp && (cp.stage > 1 || cp.room)) rows.push({ label: `Continue · stage ${cp.stage}`, action: () => this.host(cp.stage, true) });
      for (let n = 1; n <= LAST_STAGE; n++) {
        const open = n <= PROGRESS.unlocked;
        rows.push({ label: open ? `Stage ${n} · ${STAGE_NAMES[n]}` : `Stage ${n} · locked`, disabled: !open, action: () => this.host(n, false) });
      }
      rows.push({ label: 'Back', action: () => this.show('main') });
      at(rows, () => this.show('main'));
    } else if (view === 'settings') {
      this.heading('SETTINGS');
      at(settingsItems(() => this.show('controls'), () => this.show('main')), () => this.show('main'), 34, 44); // UXS-11: the last row stays on screen
    } else if (view === 'controls') {
      this.heading('CONTROLS');
      const items = controlsItems(this, (on) => { if (this.menu) this.menu.hold = on; }, () => this.show('settings'));
      // UXS-11: the help line sits under the heading and the rows end above the bottom edge (no overlap at 1280x720)
      at(items, () => this.show('settings'), 26, 28, 592);
      this.layer.push(this.add.text(1000, 498, 'Mouse: aim, LMB / RMB use the front / back hand.\nEnter on a row, then press the new key.', { fontFamily: 'Inter', fontSize: '26px', color: '#9a9ba0' }));
    } else {
      this.heading('CREDITS');
      this.layer.push(this.add.text(1000, 520, creditsText(), { fontFamily: 'Inter', fontSize: '26px', color: '#d9d9dc', wordWrap: { width: 860 }, lineSpacing: 6 }));
      // just the text and a way back (Esc, Enter or a click)
      const backText = this.add.text(1000, 990, 'Back (Esc)', { fontFamily: 'Anton', fontSize: '36px', color: '#c70f1b' }).setInteractive({ useHandCursor: true });
      this.layer.push(backText);
      let gone = false;
      const back = () => { if (gone) return; gone = true; this.input.keyboard!.off('keydown-ESC', back); this.input.keyboard!.off('keydown-ENTER', back); this.show('main'); };
      backText.on('pointerdown', back);
      this.input.keyboard!.on('keydown-ESC', back);
      this.input.keyboard!.on('keydown-ENTER', back);
    }
  }

  /** Host co-op on this stage (`resume` = from the saved room checkpoint); the lobby waits for player 2. */
  private host(stage: number, resume: boolean): void {
    beginRun(resume);
    this.scene.start('coop-lobby', { role: 'host', stage, resume });
  }

  /** Start a stage: `resume` = from the saved room checkpoint (else from its start). */
  private play(stage: number, resume: boolean): void {
    // revamp F2: ink over the title, then the stage (with its card, even when resuming a checkpoint)
    this.menu?.destroy();
    this.menu = undefined;
    beginRun(resume);
    requestStageCard();
    inkWipe(this, 'out', () => this.scene.start('game', { stage, resume }));
  }
}
