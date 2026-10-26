// Co-op revive (decided with the user): a subtle circle on the floor around a downed hero and a
// bar that charges while a teammate stands in it. White, like UI (colour is information:
// red stays for blood and telegraphs).
import { INK } from '../../data/palettes';
import { TUNING } from '../../data/tuning';
import type { Actor } from '../../sim/actor';
import { project, scaleAt } from '../camera';
import type { Ctx } from './draw';

/** The circle on the floor (drawn under the actors). */
export function paintReviveCircle(ctx: Ctx, a: Actor): void {
  const R = TUNING.coop.reviveRadius, charging = (a.revive ?? 0) > 0;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const [x, y] = project(a.pos.x + Math.cos(t) * R, 0, a.pos.z + Math.sin(t) * R);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.fillStyle = `rgba(255,255,255,${charging ? 0.1 : 0.05})`;
  ctx.fill();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `rgba(255,255,255,${charging ? 0.6 : 0.35})`;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** The revive bar above the body (drawn over the actors). */
export function paintReviveBar(ctx: Ctx, a: Actor): void {
  const s = scaleAt(a.pos.z), [x, y] = project(a.pos.x, 0.75, a.pos.z);
  const w = 0.6 * s, h = Math.max(6, 0.045 * s), u = Math.min(1, a.revive ?? 0);
  ctx.fillStyle = 'rgba(20,20,22,0.55)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - w / 2, y - h / 2, w * u, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}
