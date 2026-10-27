// M9 stage 2 cast (design/art-direction.md, style frame "Stage 2 cast", signed off 2026-10-27, own
// designs): the riot-helmet mini-boss (clown archetype) and the bureaucrat target.
import { BLOOD, INK } from '../../data/palettes';
import type { Ctx } from './draw';

export type Stage2Variant = 'riot' | 'target';

export const isStage2Cast = (v: string | undefined): v is Stage2Variant => v === 'riot' || v === 'target';

/** Suit and shade colours. */
export const STAGE2_SUIT: Record<Stage2Variant, [string, string]> = {
  riot: ['#3f4148', '#30323a'],
  target: ['#7a7c83', '#63656b'],
};

/** Red accent (the only colour besides greys; the riot stripe). */
const RED = BLOOD;

/** Body space, after the suit: the riot vest with pouches and a red band, or the target's shirt and tie. */
export function paintStage2Body(ctx: Ctx, kind: Stage2Variant, bodyPath: (ctx: Ctx) => void): void {
  if (kind === 'riot') {
    ctx.save(); bodyPath(ctx); ctx.clip();
    ctx.fillStyle = '#2b2c31'; ctx.fillRect(-0.21, -0.5, 0.42, 0.3);
    ctx.fillStyle = '#4a4c53';
    for (const px of [-0.02, 0.07, 0.16]) {
      ctx.beginPath(); ctx.roundRect(px - 0.035, -0.36, 0.07, 0.09, 0.012); ctx.fill();
      ctx.lineWidth = 0.007; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.fillStyle = RED; ctx.fillRect(-0.21, -0.5, 0.42, 0.025);
    ctx.restore();
    bodyPath(ctx); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
    return;
  }
  ctx.beginPath(); ctx.moveTo(0.0, -0.575); ctx.lineTo(0.13, -0.575); ctx.lineTo(0.07, -0.43); ctx.closePath();
  ctx.fillStyle = '#f2f2f3'; ctx.fill(); ctx.lineWidth = 0.008; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.05, -0.57); ctx.lineTo(0.09, -0.57); ctx.lineTo(0.085, -0.33); ctx.lineTo(0.07, -0.3); ctx.lineTo(0.055, -0.33); ctx.closePath();
  ctx.fillStyle = '#2a2b2f'; ctx.fill(); ctx.lineWidth = 0.007; ctx.stroke();
}

/** Head space (centre at the origin, face toward +x): the riot helmet and visor, or the glasses and side part. */
export function paintStage2Head(ctx: Ctx, kind: Stage2Variant): void {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'riot') {
    ctx.beginPath(); ctx.ellipse(-0.005, -0.03, 0.225, 0.215, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(0.2, 0.02); ctx.lineTo(-0.215, 0.03); ctx.closePath();
    ctx.fillStyle = '#4a4c53'; ctx.fill(); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.fillStyle = RED; ctx.fillRect(-0.03, -0.26, 0.05, 0.3); ctx.restore();
    ctx.beginPath(); ctx.roundRect(0.0, -0.1, 0.235, 0.17, 0.04); ctx.fillStyle = 'rgba(28,30,36,0.62)'; ctx.fill(); ctx.lineWidth = 0.012; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.moveTo(0.03, -0.075); ctx.lineTo(0.09, -0.075); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.ellipse(-0.01, -0.12, 0.205, 0.12, 0, Math.PI, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#5a5c62'; ctx.fill(); ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = '#1b1c20'; ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.roundRect(0.03, -0.085, 0.075, 0.06, 0.01); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(0.125, -0.085, 0.075, 0.06, 0.01); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.105, -0.06); ctx.lineTo(0.125, -0.06); ctx.moveTo(0.03, -0.065); ctx.lineTo(-0.15, -0.075); ctx.stroke();
  }
  ctx.restore();
}
