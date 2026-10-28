// M9 HUD pieces for room-graph stages: the ink wipe between rooms (decided 2026-10-27: a quick
// diagonal wipe in the ink colour, ~0.35 s each way) and the tracker (world-objective-radar: rings,
// a crosshair and a red blip toward the target; centred = he's right below). Phaser Graphics in the
// UI scene, so the wipe covers the HUD too and the post FX never touch them.
import Phaser from 'phaser';
import { TUNING } from '../data/tuning';
import type { World } from '../sim/world';

const INK_HEX = 0x141416;
const W = 1920, H = 1080;
/** The wipe's edge leans this far over the screen height (px). */
const SLANT = 360;

export class StageHud {
  private wipe: Phaser.GameObjects.Graphics;
  private radar: Phaser.GameObjects.Graphics;
  private stand: Phaser.GameObjects.Graphics;
  /** Spawn variety: a red chevron at the screen side someone is about to come in from (behind you). */
  private flankG: Phaser.GameObjects.Graphics;
  private flank?: { side: -1 | 1; t0: number };
  /** Wipe: phase and the world time it started. */
  private phase?: { kind: 'out' | 'in'; t0: number };

  constructor(scene: Phaser.Scene, private world: World) {
    this.radar = scene.add.graphics().setDepth(60);
    this.wipe = scene.add.graphics().setDepth(95);
    this.stand = scene.add.graphics().setDepth(80);
    this.flankG = scene.add.graphics().setDepth(61);
    world.events.on('flank', (e) => (this.flank = { side: e.side, t0: world.time }));
    world.events.on('roomTransition', (e) => (this.phase = { kind: e.phase, t0: world.time }));
    // a new room is there: if the wipe is still covering the screen, uncover it (co-op guests can
    // miss the 'in' event; never leave the screen black)
    world.events.on('roomChanged', () => { if (this.phase?.kind === 'out') this.phase = { kind: 'in', t0: world.time }; });
  }

  update(): void {
    this.drawWipe();
    this.drawRadar();
    this.drawLastStand();
    this.drawFlank();
  }

  /** Two blinking chevrons pointing out of the screen edge, ~1 s (invented). */
  private drawFlank(): void {
    const g = this.flankG;
    g.clear();
    const f = this.flank;
    if (!f) return;
    const u = (this.world.time - f.t0) / 1.0;
    if (u >= 1) { this.flank = undefined; return; }
    const alpha = (1 - u) * (0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * 4)));
    const s = f.side, cy = H * 0.5;
    g.fillStyle(0xd62620, alpha);
    g.lineStyle(5, INK_HEX, alpha);
    for (const k of [0, 1]) {
      const tip = s < 0 ? 28 + k * 46 : W - 28 - k * 46;
      const back = tip - s * 34;
      g.beginPath();
      g.moveTo(tip, cy);
      g.lineTo(back, cy - 44);
      g.lineTo(back + s * 14, cy);
      g.lineTo(back, cy + 44);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  /** M12 world-last-stand: red bars close in, the colour drains, a pulse with the heartbeat. */
  private drawLastStand(): void {
    const g = this.stand;
    g.clear();
    const ls = this.world.lastStand;
    if (!ls) return;
    const u = Math.min(1, ls.t / 0.4), beat = Math.pow(Math.max(0, Math.sin(ls.t * Math.PI * 2 * 1.3)), 8);
    g.fillStyle(0x6e5a5a, 0.35 * u);
    g.fillRect(0, 0, W, H);
    const bar = 90 * u + 10 * beat;
    g.fillStyle(0x8a0a12, 0.92);
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);
  }

  private drawWipe(): void {
    const g = this.wipe;
    g.clear();
    const ph = this.phase;
    if (!ph) return;
    const u = Math.min(1, (this.world.time - ph.t0) / TUNING.stage.wipe);
    // eased; `out` sweeps the ink in from the left, `in` carries on and uncovers to the right
    const e = u * u * (3 - 2 * u);
    const span = W + SLANT * 2;
    const lead = -SLANT + e * span;
    g.fillStyle(INK_HEX, 1);
    const quad = (pts: [number, number][]) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.closePath();
      g.fillPath();
    };
    if (ph.kind === 'out') quad([[-10, 0], [lead + SLANT, 0], [lead, H], [-10, H]]);
    else quad([[lead + SLANT, 0], [W + 10, 0], [W + 10, H], [lead, H]]);
    if (ph.kind === 'in' && u >= 1) this.phase = undefined;
  }

  private drawRadar(): void {
    const g = this.radar;
    g.clear();
    const tr = this.world.tracker;
    if (!tr) return;
    const [bx, by] = typeof tr === 'function' ? tr(this.world) : tr;
    const cx = W - 120, cy = 120, R = 78, t = this.world.time;
    // the device: a dark disc, two rings, a crosshair, a slow sweep
    g.fillStyle(0x10141a, 0.82); g.fillCircle(cx, cy, R + 12);
    g.lineStyle(4, INK_HEX, 1); g.strokeCircle(cx, cy, R + 12);
    g.lineStyle(2, 0x9fb3c8, 0.45); g.strokeCircle(cx, cy, R); g.strokeCircle(cx, cy, R * 0.5);
    g.lineBetween(cx - R, cy, cx + R, cy); g.lineBetween(cx, cy - R, cx, cy + R);
    const a = (t * 2.2) % (Math.PI * 2);
    g.lineStyle(3, 0x9fb3c8, 0.6); g.lineBetween(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    // the blip: red, pulsing; it sits on the rim when the target is far
    const d = Math.min(1, Math.hypot(bx, by)), ang = Math.atan2(by, bx);
    const px = cx + Math.cos(ang) * d * R, py = cy + Math.sin(ang) * d * R;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 5));
    g.fillStyle(0xd62620, 0.35 * pulse); g.fillCircle(px, py, 14);
    g.fillStyle(0xff3a30, pulse); g.fillCircle(px, py, 7);
  }
}
