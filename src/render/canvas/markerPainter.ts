// M17 grenade landing marker (design/qol-pass.md 7): while a hero cooks, winds up a lob or holds a
// live grenade, a ring on the floor where it'll land, the blast radius, and the fuse sweeping down.
// Ink and white only (design/art-direction.md).
import { GRENADE } from '../../data/melee';
import { INK } from '../../data/palettes';
import { project } from '../camera';
import type { Ctx } from './draw';

/** A circle on the floor plane through the camera (exact, not an ellipse guess). */
function floorCircle(ctx: Ctx, x: number, z: number, r: number, n = 32): void {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const [sx, sy] = project(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
}

/** `fuse` = seconds left, `time` = world time (blink). */
export function paintGrenadeMarker(ctx: Ctx, x: number, z: number, fuse: number, time: number): void {
  ctx.save();
  // the blast radius, faint
  floorCircle(ctx, x, z, GRENADE.radius, 48);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // the target ring: ink with a white inner stroke
  floorCircle(ctx, x, z, 0.25);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#f2f2f3';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // the fuse: a white arc that sweeps down, blinking in the last 0.5 s
  const left = Math.max(0, Math.min(1, fuse / GRENADE.fuse));
  const blink = fuse < 0.5 && Math.floor(time * 6) % 2 === 1;
  if (left > 0 && !blink) {
    ctx.beginPath();
    const n = Math.max(2, Math.round(32 * left));
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / 32) * Math.PI * 2;
      const [sx, sy] = project(x + Math.cos(a) * 0.36, 0, z + Math.sin(a) * 0.36);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
}
