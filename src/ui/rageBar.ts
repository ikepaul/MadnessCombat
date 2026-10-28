// M19 rage bar (design/rage.md 1.3): one per player, right of the life heads. Ink outline, white
// fill in 10% chunks, a rising +N on each gain, the last 2 kill types as pictograms (a repeat
// shakes and greys its icon: that's how the variety rule teaches itself), and at full a pulse, the
// red eye-slit icon (the one red exception) and the key. Phaser Graphics in the UI scene.
import Phaser from 'phaser';
import { INK } from '../data/palettes';
import { SETTINGS } from '../settings';
import type { Actor } from '../sim/actor';
import type { KillType } from '../sim/rage';
import type { World } from '../sim/world';

const INK_HEX = 0x141416, RED = 0xc70f1b, W = 210, H = 16;

interface RowState { flash: number; pops: { text: Phaser.GameObjects.Text; t: number }[]; shake: { type: KillType; t: number } | undefined; newest: number }

export class RageBars {
  private g: Phaser.GameObjects.Graphics;
  private keys: Phaser.GameObjects.Text[] = [];
  private rows = new Map<number, RowState>();
  private time = 0;

  constructor(private scene: Phaser.Scene, world: World) {
    this.g = scene.add.graphics().setDepth(41);
    world.events.on('rageGain', (e) => {
      const row = this.row(e.actorId);
      if (e.repeat) { row.shake = { type: e.type, t: 0.4 }; return; }
      row.newest = 0;
      if (e.amount <= 0) return;
      row.flash = 0.3;
      const text = scene.add.text(0, 0, `+${Math.round(e.amount * 100)}`, { fontFamily: 'Anton', fontSize: '22px', color: '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(42);
      row.pops.push({ text, t: 0 });
    });
  }

  private row(id: number): RowState {
    let r = this.rows.get(id);
    if (!r) this.rows.set(id, (r = { flash: 0, pops: [], shake: undefined, newest: 1 }));
    return r;
  }

  /** Start of the frame: clear (UIScene calls draw() for each player row after). */
  begin(dt: number): void {
    this.time += dt;
    this.g.clear();
    this.keys.forEach((k) => k.setVisible(false));
  }

  draw(index: number, p: Actor, x: number, y: number, dt: number): void {
    const g = this.g, m = p.rage, value = m?.value ?? 0, row = this.row(p.id);
    row.flash = Math.max(0, row.flash - dt);
    row.newest = Math.min(1, row.newest + dt / 0.27);
    const full = value >= 1;
    // the bar: ink outline, dark inside, white fill in 10% chunks
    g.fillStyle(INK_HEX, 1).fillRoundedRect(x - 3, y - H / 2 - 3, W + 6, H + 6, 5);
    g.fillStyle(0x2a2b30, 1).fillRect(x, y - H / 2, W, H);
    const pulse = full ? 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2.2) : 0;
    const fill = full ? Phaser.Display.Color.GetColor(242 + 13 * pulse, 242 + 13 * pulse, 243 + 12 * pulse) : row.flash > 0 ? 0xffffff : 0xf2f2f3;
    g.fillStyle(fill, 1).fillRect(x, y - H / 2, W * value, H);
    if (full) { g.lineStyle(3, 0xffffff, 0.3 + 0.4 * pulse).strokeRoundedRect(x - 6, y - H / 2 - 6, W + 12, H + 12, 7); }
    g.lineStyle(2, INK_HEX, 1);
    for (let k = 1; k < 10; k++) g.lineBetween(x + (W * k) / 10, y - H / 2, x + (W * k) / 10, y + H / 2);
    // full: the eye slit (red) and the key under it
    let ex = x + W + 22;
    if (full) {
      g.fillStyle(INK_HEX, 1).fillEllipse(ex, y, 30, 34);
      g.fillStyle(0xe9e9eb, 1).fillEllipse(ex, y, 24, 28);
      g.lineStyle(4, RED, 1).lineBetween(ex - 2, y - 2, ex + 9, y - 2);
      const key = (this.keys[index] ??= this.scene.add.text(0, 0, '', { fontFamily: 'Inter', fontSize: '14px', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(42));
      key.setText(SETTINGS.keys.rage).setPosition(ex, y + 18).setVisible(true);
      ex += 30;
    }
    // the variety strip: the last 2 kill types, newest on the right; a repeat shakes and greys
    (m?.recent ?? []).forEach((type, i, all) => {
      const newest = i === all.length - 1;
      const shake = row.shake?.type === type ? Math.sin(row.shake.t * 90) * 4 * (row.shake.t / 0.4) : 0;
      const grey = row.shake?.type === type && row.shake.t > 0;
      const pop = newest ? 1 + 0.3 * (1 - row.newest) : 1;
      killIcon(g, type, ex + 12 + i * 32 + shake, y, 12 * pop, grey ? 0x6b6c71 : 0xf2f2f3);
    });
    if (row.shake) { row.shake.t -= dt; if (row.shake.t <= 0) row.shake = undefined; }
    // rising gain numbers from the fill's edge
    for (const pp of row.pops) {
      pp.t += dt;
      pp.text.setPosition(x + W * value, y - 12 - 20 * Math.min(1, pp.t / 0.5)).setAlpha(Math.max(0, 1 - pp.t / 0.6));
    }
    row.pops = row.pops.filter((pp) => (pp.t < 0.6 ? true : (pp.text.destroy(), false)));
  }
}

/** Our own pictogram for a kill type, white on an ink outline, size `r` (half-width, px). */
export function killIcon(g: Phaser.GameObjects.Graphics, type: KillType, x: number, y: number, r: number, color: number): void {
  const fill = () => g.fillStyle(color, 1), line = (w = 3) => g.lineStyle(w, color, 1);
  g.fillStyle(INK_HEX, 1).fillCircle(x, y, r + 4);
  switch (type) {
    case 'fists': fill(); g.fillRoundedRect(x - r * 0.6, y - r * 0.5, r * 1.2, r, 4); g.fillCircle(x - r * 0.6, y - r * 0.1, r * 0.3); break;
    case 'stomp': fill(); g.fillEllipse(x, y - r * 0.15, r * 1.4, r * 0.6); line(); g.lineBetween(x - r, y + r * 0.5, x + r, y + r * 0.5); break;
    case 'kick': fill(); g.fillEllipse(x + r * 0.2, y, r * 1.2, r * 0.55); line(2); g.lineBetween(x - r, y - r * 0.4, x - r * 0.4, y - r * 0.4); g.lineBetween(x - r, y + r * 0.4, x - r * 0.4, y + r * 0.4); break;
    case 'air': fill(); g.fillCircle(x + r * 0.35, y - r * 0.45, r * 0.32); g.fillRoundedRect(x - r * 0.5, y - r * 0.2, r * 0.8, r * 0.45, 3); line(2); g.beginPath(); g.arc(x, y + r * 0.2, r * 0.9, Math.PI * 0.95, Math.PI * 1.6); g.strokePath(); break;
    case 'toss': fill(); g.fillCircle(x - r * 0.5, y, r * 0.3); g.fillRect(x - r * 0.2, y - r * 0.2, r * 0.7, r * 0.4); line(2); g.beginPath(); g.arc(x, y + r * 0.1, r * 0.85, Math.PI * 1.15, Math.PI * 1.85); g.strokePath(); break;
    case 'blade': fill(); g.fillTriangle(x - r * 0.9, y + r * 0.1, x + r, y - r * 0.15, x + r, y + r * 0.2); g.fillRect(x - r * 0.9, y - r * 0.05, r * 0.5, r * 0.3); break;
    case 'blunt': line(r * 0.45); g.lineBetween(x - r * 0.8, y + r * 0.6, x + r * 0.7, y - r * 0.6); break;
    case 'thrown': fill(); g.fillTriangle(x - r * 0.3, y + r * 0.05, x + r, y - r * 0.12, x + r, y + r * 0.18); line(2); g.lineBetween(x - r, y - r * 0.3, x - r * 0.5, y - r * 0.3); g.lineBetween(x - r, y + r * 0.3, x - r * 0.5, y + r * 0.3); break;
    case 'gun': fill(); g.fillRect(x - r * 0.8, y - r * 0.35, r * 1.6, r * 0.4); g.fillRect(x - r * 0.75, y, r * 0.45, r * 0.7); break;
    case 'boom': fill(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.fillTriangle(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a + 0.4) * r * 0.45, y + Math.sin(a + 0.4) * r * 0.45); } break;
    case 'env': fill(); g.fillRect(x - r * 0.2, y - r, r * 0.9, r * 2); line(2); g.lineBetween(x - r * 0.2, y - r * 0.2, x - r * 0.9, y + r * 0.1); break;
    case 'stealth': line(3); g.beginPath(); g.arc(x, y - r * 0.2, r * 0.7, Math.PI * 0.15, Math.PI * 0.85); g.strokePath(); break;
    case 'style': fill(); g.fillTriangle(x, y - r, x - r * 0.25, y, x + r * 0.25, y); g.fillTriangle(x, y + r, x - r * 0.25, y, x + r * 0.25, y); g.fillTriangle(x - r, y, x, y - r * 0.25, x, y + r * 0.25); g.fillTriangle(x + r, y, x, y - r * 0.25, x, y + r * 0.25); break;
    case 'team': fill(); g.fillCircle(x - r * 0.42, y, r * 0.48); g.fillCircle(x + r * 0.42, y, r * 0.48); break;
  }
}
