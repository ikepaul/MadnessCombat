// Loose items on the floor or in flight: dropped weapons and severed heads (own design: the
// head is our character's round top shape, melee-decapitation).
import { BLOOD_DARK, INK, type Palette } from '../../data/palettes';
import type { Item } from '../../sim/items';
import { project, scaleAt } from '../camera';
import { actorColors, paintHead, paintHeld } from './characterPainter';
import type { Ctx } from './draw';

/** Head radius-ish offset so a resting head sits on the floor. */
const HEAD_REST = 0.2;

export function paintItem(ctx: Ctx, it: Item, pal: Palette, blood: boolean): void {
  const s = scaleAt(it.pos.z);
  const [gx, gy] = project(it.pos.x, 0, it.pos.z);
  const lift = it.kind === 'head' ? HEAD_REST : 0.03;
  const [x, y] = project(it.pos.x, it.pos.y + lift, it.pos.z);
  const air = Math.min(1, it.pos.y / 1.5);
  ctx.beginPath();
  ctx.ellipse(gx, gy, (it.kind === 'head' ? 0.18 : 0.15) * s * (1 - air * 0.4), 0.035 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.2 * (1 - air * 0.6)})`;
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(it.angle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (it.kind === 'head') {
    const c = actorColors(it.skin, pal);
    paintHead(ctx, c.skin, c.skinHi, true);
    // cut side under the head
    ctx.beginPath(); ctx.ellipse(0, 0.2, 0.11, 0.03, 0, 0, Math.PI * 2);
    ctx.fillStyle = blood ? BLOOD_DARK : '#5d5e63'; ctx.fill();
    ctx.lineWidth = 0.01; ctx.strokeStyle = INK; ctx.stroke();
  } else {
    ctx.translate(it.kind === 'baton' ? -0.2 : -0.08, 0);
    paintHeld(ctx, it.kind);
  }
  ctx.restore();
}
