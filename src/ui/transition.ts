// Revamp F2: the ink wipe between screens (title -> stage -> end card -> title), the same
// diagonal ink sweep as the room transitions (src/render/stageHud.ts), run on real time.
import Phaser from 'phaser';
import { effectLevel } from '../settings';

const INK_HEX = 0x141416;
const W = 1920, H = 1080;
/** The wipe's edge leans this far over the screen height (px). */
const SLANT = 360;
/** Seconds per wipe. invented (the room wipe is 0.35 s) */
const WIPE = 0.35;
/** UXS-17: with effects off / reduced motion the wipe is a plain fade this long (s). invented */
const FADE = 0.2;

/** A stage started from a menu shows its stage card even when it resumes a checkpoint. */
let cardPending = false;

export function requestStageCard(): void {
  cardPending = true;
}

/** Whether the stage card is owed (and clears the request). */
export function takeStageCard(): boolean {
  const c = cardPending;
  cardPending = false;
  return c;
}

/**
 * `out` sweeps ink over the screen from the left, then calls `done`; `in` starts covered and
 * uncovers to the right. The graphics sit above everything in `scene` and remove themselves.
 */
export function inkWipe(scene: Phaser.Scene, kind: 'out' | 'in', done?: () => void): void {
  const g = scene.add.graphics().setDepth(5000).setScrollFactor(0);
  const t0 = performance.now();
  const fade = effectLevel() === 'off';
  const draw = () => {
    const u = Math.min(1, (performance.now() - t0) / 1000 / (fade ? FADE : WIPE));
    if (fade) {
      g.clear();
      g.fillStyle(INK_HEX, kind === 'out' ? u : 1 - u);
      g.fillRect(0, 0, W, H);
      if (u < 1) return;
      scene.events.off('update', draw);
      if (kind === 'in') g.destroy();
      done?.();
      return;
    }
    const e = u * u * (3 - 2 * u);
    const lead = -SLANT + e * (W + SLANT * 2);
    g.clear();
    g.fillStyle(INK_HEX, 1);
    const pts: [number, number][] = kind === 'out'
      ? [[-10, 0], [lead + SLANT, 0], [lead, H], [-10, H]]
      : [[lead + SLANT, 0], [W + 10, 0], [W + 10, H], [lead, H]];
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.closePath();
    g.fillPath();
    if (u < 1) return;
    scene.events.off('update', draw);
    if (kind === 'in') g.destroy();
    done?.();
  };
  draw();
  scene.events.on('update', draw);
  scene.events.once('shutdown', () => scene.events.off('update', draw));
}
