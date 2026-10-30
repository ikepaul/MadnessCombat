// A small menu in our title-card style (PLAN.md M13): Anton type on dark, the chosen item in the red
// accent with an ink marker. Arrow keys / W-S and Enter, or the mouse; Esc backs out.
import Phaser from 'phaser';

export interface MenuItem {
  label: string | (() => string);
  /** Greyed out and skipped (a locked stage). */
  disabled?: boolean;
  /** Enter / click. */
  action?: () => void;
  /** Left / right on this row (a volume, a toggle). */
  adjust?: (dir: -1 | 1) => void;
  /** The cursor left this row (UXS-09: a confirm row disarms). */
  leave?: () => void;
}

const RED = '#c70f1b', WHITE = '#f2f2f3', GREY = '#5b5c61';

export class Menu {
  private texts: Phaser.GameObjects.Text[] = [];
  private marker: Phaser.GameObjects.Text;
  private index = 0;
  private offs: (() => void)[] = [];
  private held = false;
  /** While true the menu ignores keys (a key rebind is listening); releasing it redraws the rows. */
  get hold(): boolean { return this.held; }
  set hold(on: boolean) { this.held = on; if (!on) this.refresh(); }
  /** An action may replace this menu with another one: nothing runs on it after that. */
  private destroyed = false;

  constructor(scene: Phaser.Scene, private items: MenuItem[], x: number, y: number, private onBack?: () => void, size = 44, gap = 64) {
    items.forEach((it, i) => {
      const t = scene.add.text(x, y + i * gap, '', { fontFamily: 'Anton', fontSize: `${size}px`, color: WHITE }).setOrigin(0, 0.5).setDepth(200);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (!it.disabled) { this.select(i); this.refresh(); } });
      t.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (it.disabled || this.hold || this.destroyed) return;
        this.select(i);
        if (it.adjust) it.adjust(p.x > t.x + t.width * 0.6 ? 1 : -1);
        else it.action?.();
        this.refresh();
      });
      this.texts.push(t);
    });
    this.marker = scene.add.text(x - 44, y, '▶', { fontFamily: 'Inter', fontSize: `${Math.round(size * 0.6)}px`, color: RED }).setOrigin(0, 0.5).setDepth(200);
    while (items[this.index]?.disabled && this.index < items.length - 1) this.index++;
    const kb = scene.input.keyboard!;
    // the key press that opened this menu (from another scene) still reaches it: ignore that frame
    const born = performance.now();
    const on = (ev: string, fn: () => void) => { const h = (e?: KeyboardEvent) => { if (!this.hold && !this.destroyed && !(e && e.timeStamp < born)) fn(); }; kb.on(ev, h); this.offs.push(() => kb.off(ev, h)); };
    on('keydown-UP', () => this.move(-1));
    on('keydown-W', () => this.move(-1));
    on('keydown-DOWN', () => this.move(1));
    on('keydown-S', () => this.move(1));
    on('keydown-LEFT', () => this.adjust(-1));
    on('keydown-A', () => this.adjust(-1));
    on('keydown-RIGHT', () => this.adjust(1));
    on('keydown-D', () => this.adjust(1));
    on('keydown-ENTER', () => { const it = this.items[this.index]; if (it && !it.disabled) { it.action?.(); this.refresh(); } });
    on('keydown-SPACE', () => { const it = this.items[this.index]; if (it && !it.disabled) { it.action?.(); this.refresh(); } });
    on('keydown-ESC', () => this.onBack?.());
    this.refresh();
  }

  /** Move the cursor to row `i`; the row it leaves hears about it. */
  private select(i: number): void {
    if (i !== this.index) this.items[this.index]?.leave?.();
    this.index = i;
  }

  private move(d: number): void {
    const n = this.items.length;
    let i = this.index;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!this.items[i].disabled) break;
    }
    this.select(i);
    this.refresh();
  }

  private adjust(d: -1 | 1): void {
    this.items[this.index]?.adjust?.(d);
    this.refresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    this.texts.forEach((t, i) => {
      const it = this.items[i];
      t.setText(typeof it.label === 'function' ? it.label() : it.label);
      t.setColor(it.disabled ? GREY : i === this.index ? RED : WHITE);
    });
    const cur = this.texts[this.index];
    if (cur) this.marker.setY(cur.y);
  }

  destroy(): void {
    this.destroyed = true;
    for (const off of this.offs) off();
    this.texts.forEach((t) => t.destroy());
    this.marker.destroy();
  }
}
