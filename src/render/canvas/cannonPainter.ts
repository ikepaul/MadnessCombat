// Cannons and their balls (own design, not the episode's: a squat banded iron barrel on a
// riveted two-leg stand with splayed feet). The boss's cannon falls in from the sky: its shadow
// grows on the floor first (world-falling-hazard), then it drops onto its stand.
import { INK } from '../../data/palettes';
import { TUNING } from '../../data/tuning';
import type { Ball, Cannon } from '../../sim/cannon';
import { project, scaleAt } from '../camera';
import type { Ctx } from './draw';

const IRON = '#36373c', IRON_HI = '#5d5e63', STAND = '#4a4b50';

export function paintCannon(ctx: Ctx, c: Cannon): void {
  const y = c.y ?? 0, s = scaleAt(c.z);
  const [gx, gy] = project(c.x, 0, c.z);
  // the shadow first: small and faint while it's high up, full size as it lands
  const k = 1 - Math.min(1, y / TUNING.boss.cannon.dropHeight);
  ctx.beginPath();
  ctx.ellipse(gx, gy, (0.18 + 0.36 * k) * s, (0.03 + 0.045 * k) * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${(0.1 + 0.15 * k).toFixed(3)})`;
  ctx.fill();
  const [x, py] = project(c.x, y, c.z);
  if (py < -0.8 * s) return; // still above the screen
  ctx.save();
  ctx.translate(x, py);
  ctx.scale(s * c.facing, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  // stand: two splayed legs with feet, a hub on top
  ctx.lineWidth = 0.035;
  ctx.beginPath(); ctx.moveTo(-0.26, -0.01); ctx.lineTo(-0.02, -0.42); ctx.lineTo(0.22, -0.01); ctx.stroke();
  ctx.lineWidth = 0.022; ctx.strokeStyle = STAND;
  ctx.beginPath(); ctx.moveTo(-0.24, -0.02); ctx.lineTo(-0.02, -0.4); ctx.lineTo(0.2, -0.02); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.016;
  for (const fx of [-0.3, 0.18]) { ctx.beginPath(); ctx.roundRect(fx, -0.03, 0.12, 0.03, 0.01); ctx.fillStyle = STAND; ctx.fill(); ctx.stroke(); }
  // barrel: thick at the breech, a muzzle ring, two bands, a touch-hole on top
  ctx.beginPath();
  ctx.moveTo(-0.36, -0.73); ctx.quadraticCurveTo(-0.44, -0.57, -0.36, -0.41);
  ctx.lineTo(0.38, -0.47); ctx.lineTo(0.38, -0.67); ctx.closePath();
  ctx.fillStyle = IRON; ctx.fill(); ctx.lineWidth = 0.018; ctx.stroke();
  ctx.fillStyle = IRON_HI; ctx.beginPath(); ctx.moveTo(-0.33, -0.7); ctx.lineTo(0.36, -0.655); ctx.lineTo(0.36, -0.635); ctx.lineTo(-0.33, -0.665); ctx.closePath(); ctx.fill();
  for (const bx of [-0.18, 0.12]) { ctx.beginPath(); ctx.roundRect(bx, -0.73 + (bx + 0.36) * 0.08, 0.05, 0.3 - (bx + 0.36) * 0.16, 0.01); ctx.fillStyle = '#2a2b2f'; ctx.fill(); ctx.lineWidth = 0.01; ctx.stroke(); }
  ctx.beginPath(); ctx.roundRect(0.36, -0.7, 0.07, 0.26, 0.02); ctx.fillStyle = '#2a2b2f'; ctx.fill(); ctx.lineWidth = 0.014; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.43, -0.57, 0.025, 0.09, 0, 0, Math.PI * 2); ctx.fillStyle = '#141416'; ctx.fill();
  ctx.beginPath(); ctx.arc(-0.27, -0.73, 0.02, 0, Math.PI * 2); ctx.fillStyle = '#141416'; ctx.fill();
  // hub
  ctx.beginPath(); ctx.arc(-0.02, -0.42, 0.06, 0, Math.PI * 2); ctx.fillStyle = STAND; ctx.fill(); ctx.lineWidth = 0.016; ctx.stroke();
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
