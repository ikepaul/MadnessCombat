// M8 stage 1 NPCs (design/art-direction.md, style frame "Stage 1 cast", own designs): the boombox
// NPC (white tee, headphones, carries the boombox) and the dancer NPC (tracksuit stripe, beanie).
import { INK } from '../../data/palettes';
import type { NpcVariant } from '../../sim/actor';
import type { Ctx } from './draw';

/** Suit and shade colours per NPC. */
export const NPC_SUIT: Record<NpcVariant, [string, string]> = {
  boombox: ['#e3e3e5', '#bfc0c4'],
  dancer: ['#4a4b51', '#3a3b40'],
};

/** Body space (inside the body transform, after the suit): the dancer's light side stripe. */
export function paintNpcBody(ctx: Ctx, kind: NpcVariant, bodyPath: (ctx: Ctx) => void): void {
  if (kind !== 'dancer') return;
  ctx.save(); bodyPath(ctx); ctx.clip(); ctx.fillStyle = '#dcdcdf'; ctx.fillRect(-0.005, -0.62, 0.035, 0.62); ctx.restore();
  bodyPath(ctx); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
}

/** Head space (head centre at the origin, face toward +x): headphones or the beanie. */
export function paintNpcHead(ctx: Ctx, kind: NpcVariant): void {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'boombox') {
    ctx.strokeStyle = '#2a2b2f'; ctx.lineWidth = 0.026;
    ctx.beginPath(); ctx.moveTo(-0.025, -0.03); ctx.quadraticCurveTo(-0.06, -0.16, -0.035, -0.245); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.025, 0, 0.055, 0.072, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a2b2f'; ctx.fill();
    ctx.lineWidth = 0.01; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.02, 0, 0.025, 0.035, 0, 0, Math.PI * 2); ctx.fillStyle = '#6b6d73'; ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(0, -0.1, 0.212, 0.165, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = '#cfd0d3'; ctx.fill(); ctx.lineWidth = 0.014; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-0.215, -0.135, 0.43, 0.06, 0.02); ctx.fillStyle = '#b6b7bb'; ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.006; ctx.strokeStyle = 'rgba(20,20,22,0.35)';
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 0.055, -0.13); ctx.lineTo(k * 0.055, -0.08); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(-0.03, -0.275, 0.045, 0, Math.PI * 2); ctx.fillStyle = '#f0f0f2'; ctx.fill();
    ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();
}

/** Beat pulse 0..1 for the boombox speakers (≈ 125 BPM until the user's track sets the tempo). invented */
export const beat = (time: number) => Math.pow(Math.max(0, Math.sin(time * Math.PI * 125 / 60)), 4);

/** The boombox, (x, y) = top of the handle, in H. Speakers pump and the LED blinks on the beat. */
export function paintBoombox(ctx: Ctx, x: number, y: number, time: number): void {
  const pulse = beat(time);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineWidth = 0.016; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.roundRect(x - 0.1, y, 0.2, 0.07, 0.025); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(x - 0.19, y + 0.045, 0.38, 0.19, 0.03); ctx.fillStyle = '#3a3b40'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 0.17, y + 0.06, 0.34, 0.02);
  for (const sx of [-0.105, 0.105]) {
    const r = 0.056 * (1 + pulse * 0.12);
    ctx.beginPath(); ctx.arc(x + sx, y + 0.145, r, 0, Math.PI * 2); ctx.fillStyle = '#606167'; ctx.fill(); ctx.lineWidth = 0.01; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + sx, y + 0.145, r * 0.36, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  }
  ctx.fillStyle = '#c9cacd'; ctx.fillRect(x - 0.025, y + 0.1, 0.05, 0.035); ctx.lineWidth = 0.006; ctx.strokeRect(x - 0.025, y + 0.1, 0.05, 0.035);
  ctx.beginPath(); ctx.arc(x, y + 0.19, 0.009, 0, Math.PI * 2); ctx.fillStyle = pulse > 0.2 ? '#ff3a44' : '#7a1a20'; ctx.fill();
  if (pulse > 0.25) {
    ctx.strokeStyle = `rgba(20,20,22,${pulse * 0.6})`; ctx.lineWidth = 0.01;
    for (const a0 of [-0.45, Math.PI - 0.45]) for (const k of [0.25, 0.3]) { ctx.beginPath(); ctx.arc(x, y + 0.145, k, a0, a0 + 0.9); ctx.stroke(); }
  }
  ctx.restore();
}
