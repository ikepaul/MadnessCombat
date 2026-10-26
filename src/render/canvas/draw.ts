// Small Canvas 2D helpers shared by the painters (ported from design/style-frame).
import { SCREEN_H, SCREEN_W, type ScreenPoint } from '../camera';

export type Ctx = CanvasRenderingContext2D;

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function poly(ctx: Ctx, pts: ScreenPoint[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function line(ctx: Ctx, a: ScreenPoint, b: ScreenPoint): void {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Fill a polygon region with a gradient (clipped). */
export function shade(ctx: Ctx, pts: ScreenPoint[], fill: CanvasGradient | string): void {
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.restore();
}

/** Star/burst polygon (wounds, impact stars). */
export function burst(ctx: Ctx, x: number, y: number, r: number, color: string, points: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
