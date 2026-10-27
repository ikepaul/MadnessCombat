// Loose items on the floor or in flight: dropped weapons and severed heads (own design: the
// head is our character's round top shape, melee-decapitation).
import { BLOOD_DARK, INK, type Palette } from '../../data/palettes';
import { isMelee, MELEE } from '../../data/melee';
import { isWeapon, WEAPONS } from '../../data/weapons';
import type { Item } from '../../sim/items';
import { project, scaleAt } from '../camera';
import { actorColors, paintHead, paintHeld } from './characterPainter';
import { paintBoombox } from './npcPainter';
import { paintGrenade } from './weaponPainter';
import type { Ctx } from './draw';

/** Head radius-ish offset so a resting head sits on the floor. */
const HEAD_REST = 0.2;

export function paintItem(ctx: Ctx, it: Item, pal: Palette, blood: boolean, time = 0): void {
  const s = scaleAt(it.pos.z);
  if (it.state === 'stuck' || it.state === 'planted') { paintFixed(ctx, it, s, blood); return; }
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
  } else if (it.kind === 'boombox') {
    // on its back on the floor, still playing (M8)
    paintBoombox(ctx, 0, -0.26, time);
  } else if (it.kind === 'grenade') {
    // live grenades blink faster as the fuse runs down (telegraph)
    const rate = it.fuse !== undefined && it.fuse < 0.5 ? 16 : 8;
    paintGrenade(ctx, !!it.live, !!it.live && Math.floor(time * rate) % 2 === 0);
  } else {
    // centre the weapon on its floor point
    ctx.translate(isWeapon(it.kind) ? -WEAPONS[it.kind].length / 2 + 0.05 : isMelee(it.kind) ? -MELEE[it.kind].length / 2 + 0.05 : -0.2, 0);
    paintHeld(ctx, it.kind);
  }
  ctx.restore();
}

/** A blade stuck in a body or a wall (tip in, handle out), or the street sign planted upright. */
function paintFixed(ctx: Ctx, it: Item, s: number, blood: boolean): void {
  if (it.kind === 'head' || it.kind === 'grenade' || it.kind === 'boombox') return;
  const [x, y] = project(it.pos.x, it.pos.y, it.pos.z);
  const len = isMelee(it.kind) ? MELEE[it.kind].length : isWeapon(it.kind) ? WEAPONS[it.kind].length : 0.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (it.state === 'planted') {
    // grip end in the ground, plate up
    const [, gy] = project(it.pos.x, 0, it.pos.z);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, gy, 0.1 * s, 0.025 * s, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
    ctx.translate(x, gy);
    ctx.scale(s, s);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(0.1, 0);
    paintHeld(ctx, it.kind);
    ctx.restore();
    return;
  }
  ctx.rotate(it.angle);
  // the tip (or, for the pinning sign, most of its length) is inside what it hit
  ctx.translate(-len * (it.kind === 'sign' ? 0.62 : 0.55), 0);
  paintHeld(ctx, it.kind);
  if (blood && it.stuckTo !== undefined) {
    ctx.beginPath(); ctx.arc(len * 0.55, 0, 0.03, 0, Math.PI * 2);
    ctx.fillStyle = BLOOD_DARK; ctx.fill();
  }
  ctx.restore();
}
