// Debug cannon and its balls (own design: squat barrel on a two-leg stand). The stage-1 boss
// cannon in M8 gets a proper design pass.
import { INK } from '../../data/palettes';
import { TUNING } from '../../data/tuning';
import type { Ball, Cannon } from '../../sim/cannon';
import { project, scaleAt } from '../camera';
import type { Ctx } from './draw';

export function paintCannon(ctx: Ctx, c: Cannon): void {
  const [x, y] = project(c.x, 0, c.z), s = scaleAt(c.z);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, 0.5 * s, 0.07 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();
  ctx.translate(x, y);
  ctx.scale(s * c.facing, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.beginPath(); ctx.moveTo(-0.25, 0); ctx.lineTo(0, -0.42); ctx.lineTo(0.2, 0); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-0.35, -0.72, 0.8, 0.3, 0.12);
  ctx.fillStyle = '#3a3b40'; ctx.fill();
  ctx.lineWidth = 0.018; ctx.stroke();
  ctx.fillStyle = '#5d5e63'; ctx.fillRect(-0.28, -0.69, 0.66, 0.05);
  ctx.beginPath(); ctx.ellipse(0.45, -0.57, 0.04, 0.13, 0, 0, Math.PI * 2); ctx.fillStyle = '#141416'; ctx.fill();
  ctx.beginPath(); ctx.arc(-0.03, -0.42, 0.06, 0, Math.PI * 2); ctx.fillStyle = '#4a4b50'; ctx.fill(); ctx.stroke();
  ctx.restore();
}

export function paintBall(ctx: Ctx, b: Ball): void {
  const r = TUNING.cannon.radius;
  const [x, y] = project(b.x, b.y, b.z), s = scaleAt(b.z);
  const [, sy] = project(b.x, 0, b.z);
  ctx.beginPath(); ctx.ellipse(x, sy, r * s, 0.03 * s, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
  // short speed streak behind the ball
  ctx.strokeStyle = 'rgba(20,20,22,0.25)';
  ctx.lineWidth = r * s * 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sign(b.vx) * 0.5 * s, y); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * s, 0, Math.PI * 2);
  ctx.fillStyle = '#18181a'; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * s * 0.35, y - r * s * 0.35, r * s * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
}
