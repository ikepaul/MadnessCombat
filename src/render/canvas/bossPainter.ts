// The stage-1 boss, ported from the style frame's "Stage 1 cast" (design/art-direction.md, signed
// off 2026-10-27): a hovering necromancer, flared collar, long coat with a torn hem, no feet, cyan
// lightning glow in his eye slit, coat seam and hands. The ward is a screen-facing diamond.
// Local space as for characters: 1 unit = 1 H, origin between the feet, +x = facing, -y = up.
import { FEEL } from '../../data/feel';
import { INK } from '../../data/palettes';
import { TUNING } from '../../data/tuning';
import type { Actor } from '../../sim/actor';
import { project, scaleAt } from '../camera';
import { applyRoot } from './characterPainter';
import type { Ctx } from './draw';

export const BOLT = '#eafcff';
/** Lightning glow colour without alpha: `${BOLT_GLOW}${a})`. */
export const BOLT_GLOW = 'rgba(110,215,255,';
const BOSS = { coat: '#2c2c32', coatShade: '#1d1d22', collar: '#3c3c44', skin: '#c6c6cb', glove: '#3c3c44' };

function glow(ctx: Ctx, x: number, y: number, r: number, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `${BOLT_GLOW}${a.toFixed(3)})`); g.addColorStop(1, `${BOLT_GLOW}0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** Jagged path from (x0,y0) to (x1,y1) with `n` segments, offsets up to `amp`. */
export function jag(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, n: number, amp: number, rnd: () => number): void {
  const nx = y0 - y1, ny = x1 - x0, d = Math.hypot(nx, ny) || 1;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const k = i / n, o = (rnd() * 2 - 1) * amp; ctx.lineTo(x0 + (x1 - x0) * k + (nx / d) * o, y0 + (y1 - y0) * k + (ny / d) * o); }
  ctx.lineTo(x1, y1);
}

/** Glow pass + white core for the current path. */
export function boltStroke(ctx: Ctx, w: number, alpha = 1): void {
  ctx.strokeStyle = `${BOLT_GLOW}${(0.35 * alpha).toFixed(3)})`; ctx.lineWidth = w * 3.5; ctx.stroke();
  ctx.globalAlpha = alpha; ctx.strokeStyle = BOLT; ctx.lineWidth = w; ctx.stroke(); ctx.globalAlpha = 1;
}

export function mulberry(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function hand(ctx: Ctx, x: number, y: number, r = 0.068): void {
  const shapes = () => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.88, 0, 0, Math.PI * 2); ctx.moveTo(x + r * 0.95, y - r * 0.55); ctx.ellipse(x + r * 0.62, y - r * 0.55, r * 0.36, r * 0.3, -0.5, 0, Math.PI * 2); };
  shapes(); ctx.lineWidth = 0.024; ctx.strokeStyle = INK; ctx.stroke();
  shapes(); ctx.fillStyle = BOSS.glove; ctx.fill();
}

function coatPath(ctx: Ctx): void {
  ctx.beginPath(); ctx.moveTo(-0.15, -0.6);
  ctx.quadraticCurveTo(-0.22, -0.3, -0.25, 0.02);
  for (const [x, y] of [[-0.18, -0.04], [-0.12, 0.03], [-0.04, -0.03], [0.04, 0.04], [0.11, -0.02], [0.18, 0.03], [0.24, 0]]) ctx.lineTo(x, y);
  ctx.quadraticCurveTo(0.21, -0.3, 0.15, -0.6); ctx.closePath();
}

function poly(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** The ward (local space): a diamond with rings rippling inward, never a cross. */
function ward(ctx: Ctx, strength: number, time: number): void {
  const W = TUNING.boss.ward, cx = W.x, cy = W.y;
  const at = (k: number): [number, number][] => [[cx, cy - W.hh * k], [cx + W.hw * k, cy], [cx, cy + W.hh * k], [cx - W.hw * k, cy]];
  const flick = (0.8 + 0.2 * Math.sin(time * 27)) * strength;
  glow(ctx, cx, cy, W.hh * 1.05, 0.16 * flick);
  poly(ctx, at(1)); ctx.fillStyle = `${BOLT_GLOW}${(0.14 * flick).toFixed(3)})`; ctx.fill();
  for (let i = 0; i < 4; i++) {
    const k = 1 - ((i / 4 + time * 0.36) % 1);
    poly(ctx, at(k)); ctx.strokeStyle = `${BOLT_GLOW}${(0.5 * k * strength).toFixed(3)})`; ctx.lineWidth = 0.01; ctx.stroke();
  }
  poly(ctx, at(1)); ctx.strokeStyle = `${BOLT_GLOW}${(0.35 * strength).toFixed(3)})`; ctx.lineWidth = 0.05; ctx.stroke();
  ctx.globalAlpha = strength; ctx.strokeStyle = BOLT; ctx.lineWidth = 0.014; ctx.stroke(); ctx.globalAlpha = 1;
}

export interface BossPaintOptions { flashes?: boolean; time: number }

export function paintBoss(ctx: Ctx, a: Actor, o: BossPaintOptions): void {
  const { pose } = a, t = o.time;
  const [fx, fy] = project(a.pos.x, a.pos.y, a.pos.z), s = scaleAt(a.pos.z);
  const [, gy] = project(a.pos.x, 0, a.pos.z);
  const dead = pose.dead, cast = pose.cast ?? 0, wardK = pose.ward ?? 0, grip = dead ? 0 : pose.grip ?? 0;
  /** Hands go from the sides to over his head while he holds someone up (body slams). */
  const up = (x0: number, y0: number, x1: number, y1: number): [number, number] => [x0 + (x1 - x0) * grip, y0 + (y1 - y0) * grip];
  const lit = dead ? 0 : 1;

  // floor shadow: smaller and lighter the higher he floats (the descent's telegraph)
  const air = Math.max(0, a.pos.y);
  const shrink = 1 - Math.min(0.75, air * 0.18);
  ctx.beginPath(); ctx.ellipse(fx, gy, (dead ? 0.6 : 0.32) * shrink * s, 0.05 * shrink * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${(0.24 * (1 - Math.min(0.6, air * 0.12))).toFixed(3)})`; ctx.fill();

  ctx.save();
  if (o.flashes !== false && pose.impact > 0) ctx.filter = `brightness(${FEEL.impactFrame.brightness}) contrast(${FEEL.impactFrame.contrast})`;
  ctx.translate(fx, fy); ctx.scale(s, s); ctx.scale(a.facing, 1);
  applyRoot(ctx, pose.root);
  ctx.rotate(pose.lean);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const sway = Math.sin(t * 2.4 + 1) * 0.012;

  const back = up(-0.21, -0.3 + sway, -0.12, -1.18);
  hand(ctx, back[0], back[1]);
  poly(ctx, [[-0.13, -0.58], [-0.35, -0.97], [-0.17, -1.07], [0, -0.68]]);
  ctx.fillStyle = BOSS.collar; ctx.fill(); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();

  coatPath(ctx); ctx.fillStyle = BOSS.coat; ctx.fill();
  ctx.save(); coatPath(ctx); ctx.clip(); ctx.fillStyle = BOSS.coatShade; ctx.fillRect(-0.3, -0.7, 0.15, 0.8); ctx.restore();
  coatPath(ctx); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
  if (lit) { ctx.beginPath(); ctx.moveTo(0.1, -0.56); ctx.lineTo(0.16, -0.02); boltStroke(ctx, 0.008); }

  // head: bald, pale; eye slit glows (two x's once dead)
  ctx.beginPath(); ctx.ellipse(0.01, -0.8, 0.185, 0.235, 0, 0, Math.PI * 2); ctx.fillStyle = BOSS.skin; ctx.fill();
  const hg = ctx.createLinearGradient(-0.18, 0, 0.2, 0);
  hg.addColorStop(0, 'rgba(0,0,0,0.22)'); hg.addColorStop(0.35, 'rgba(0,0,0,0.08)'); hg.addColorStop(0.6, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = hg; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.08, -0.93, 0.05, 0.028, -0.55, 0, Math.PI * 2); ctx.fillStyle = '#ececef'; ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.ellipse(0.01, -0.8, 0.185, 0.235, 0, 0, Math.PI * 2); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
  if (dead) {
    ctx.lineWidth = 0.014; ctx.strokeStyle = INK;
    for (const cx of [0.06, 0.13]) { ctx.beginPath(); ctx.moveTo(cx - 0.02, -0.86); ctx.lineTo(cx + 0.02, -0.82); ctx.moveTo(cx + 0.02, -0.86); ctx.lineTo(cx - 0.02, -0.82); ctx.stroke(); }
  } else {
    glow(ctx, 0.1, -0.84, 0.13, cast > 0 || wardK > 0 ? 0.6 : 0.35);
    ctx.beginPath(); ctx.moveTo(0.04, -0.84); ctx.lineTo(0.165, -0.84); ctx.strokeStyle = BOLT; ctx.lineWidth = 0.024; ctx.stroke();
  }
  poly(ctx, [[0.13, -0.58], [0.215, -0.67], [0.15, -0.7], [0.05, -0.61]]);
  ctx.fillStyle = BOSS.collar; ctx.fill(); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();

  // front hand: raised with crackling sparks while casting, out toward the ward, or at his side
  if (!dead && cast > 0) {
    const e = Math.min(1, cast * 2.5), hx = 0.21 + (0.15 - 0.21) * e, hy = -0.3 + (-1.2 + 0.3) * e + sway;
    glow(ctx, hx, hy, 0.3 * cast, 0.55 * cast);
    const rnd = mulberry(Math.floor(t * 30));
    for (let i = 0; i < 2 + Math.round(cast * 3); i++) {
      const ang = rnd() * Math.PI * 2, l = 0.08 + rnd() * 0.14 * cast;
      jag(ctx, hx, hy, hx + Math.cos(ang) * l, hy + Math.sin(ang) * l, 4, 0.025, rnd); boltStroke(ctx, 0.009, cast);
    }
    hand(ctx, hx, hy, 0.07);
  } else if (!dead && wardK > 0) {
    hand(ctx, 0.3, -0.6 + sway, 0.07); glow(ctx, 0.3, -0.6 + sway, 0.14, 0.4 * wardK);
    ward(ctx, wardK, t);
  } else if (!dead && (pose.push ?? 0) > 0) {
    // telekinetic sweep: the front hand swings out flat, palm glowing
    const k = pose.push!, e = k * k * (3 - 2 * k), hx = 0.21 + 0.3 * e, hy = -0.3 - 0.32 * e;
    glow(ctx, hx, hy, 0.12 + 0.15 * k, 0.3 + 0.4 * k);
    hand(ctx, hx, hy, 0.07);
  } else if (!dead && pose.sword) {
    // M12 boss-halo clip 7: a long blade, glowing at the edge, held point-forward
    const hx = 0.3, hy = -0.5 - sway;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(0.35);
    ctx.beginPath(); ctx.moveTo(0, -0.025); ctx.lineTo(0.85, -0.008); ctx.lineTo(0.92, 0); ctx.lineTo(0.85, 0.012); ctx.lineTo(0, 0.025); ctx.closePath();
    ctx.fillStyle = '#d9dde2'; ctx.fill(); ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,230,255,0.7)'; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.moveTo(0.05, -0.015); ctx.lineTo(0.84, -0.005); ctx.stroke();
    ctx.fillStyle = '#2c2c32'; ctx.fillRect(-0.03, -0.06, 0.035, 0.12);
    ctx.restore();
    hand(ctx, hx, hy, 0.07);
    glow(ctx, hx, hy, 0.12, 0.35);
  } else {
    const front = up(0.21, -0.3 - sway, 0.22, -1.18);
    hand(ctx, front[0], front[1]);
    if (lit) glow(ctx, front[0], front[1], 0.1 + 0.08 * grip, 0.25 + 0.3 * grip);
  }
  ctx.restore();
}
