// Character drawing, ported from design/style-frame. Local space: 1 unit = 1 H, origin between
// the feet, +x = facing direction, -y = up. Measured proportions (design/art-direction.md):
// head 0.45 x 0.40 H, body 0.30 -> 0.40 H wide, hands 0.12 H, feet 0.19 x 0.05 H.
import { BLOOD, FLASH_GLOW, INK, type Palette, ZOMBIE, ZOMBIE_HI } from '../../data/palettes';
import type { Actor, HeldItem } from '../../sim/actor';
import { project, type ScreenPoint, scaleAt } from '../camera';
import { burst, type Ctx } from './draw';

/** Idle breathing/hand bob rates: the style frame used 0.12 rad per 30 fps frame. */
const BREATH_RATE = 0.12 * 30;
const SHOULDER: [number, number] = [0.03, -0.5];

export interface PaintedCharacter {
  /** Screen position of the gun muzzle, if a gun is aimed. */
  muzzle?: ScreenPoint;
  /** Screen position of the ejection port. */
  eject?: ScreenPoint;
}

/** Where to draw: the actor's floor point projected, or an explicit screen placement (sheets). */
export interface Placement { x: number; y: number; scale: number }

export function paintCharacter(ctx: Ctx, a: Actor, pal: Palette, time: number, placement?: Placement): PaintedCharacter {
  const { pose } = a;
  let fx: number, fy: number, s: number;
  if (placement) ({ x: fx, y: fy, scale: s } = placement);
  else {
    [fx, fy] = project(a.pos.x, a.pos.y, a.pos.z);
    s = scaleAt(a.pos.z);
  }
  const hero = a.kind === 'hero', zombie = a.kind === 'zombie';
  const suit = hero ? pal.hero : pal.suit;
  const suitShade = hero ? pal.heroShade : pal.suitShade;
  const skin = zombie ? ZOMBIE : pal.skin;
  const skinHi = zombie ? ZOMBIE_HI : pal.skinHi;
  const handCol = zombie ? ZOMBIE : pal.hand;

  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(s, s);
  // contact shadow
  ctx.beginPath();
  ctx.ellipse(pose.lying ? 0.2 * a.facing : 0, 0, pose.lying ? 0.62 : 0.3, 0.06, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fill();
  ctx.scale(a.facing, 1);
  if (pose.lying) {
    ctx.scale(1, 0.92);
    ctx.translate(0, -0.2);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const stepping = pose.walkPhase !== undefined;
  const ph = pose.walkPhase ?? 0;
  const breath = time * BREATH_RATE;
  const bob = stepping ? Math.abs(Math.sin(ph)) * 0.014 : Math.sin(breath) * 0.004;
  const liftFront = stepping ? Math.max(0, Math.sin(ph)) * 0.035 : 0;
  const liftBack = stepping ? Math.max(0, -Math.sin(ph)) * 0.035 : 0;
  const swing = stepping ? Math.sin(ph) * 0.07 : 0;

  // aim angle from the shoulder toward the target, in local units
  let aim: number | undefined;
  if (pose.aimAt && !pose.lying) {
    const [tx, ty] = project(pose.aimAt.x, pose.aimAt.y, pose.aimAt.z);
    const lx = ((tx - fx) / s) * a.facing, ly = (ty - fy) / s;
    aim = Math.atan2(ly - (SHOULDER[1] - bob), lx - SHOULDER[0]);
  }

  // back hand (behind the body), feet
  hand(ctx, -0.17 - swing * 0.6, -0.3 - bob + (stepping ? Math.cos(ph) * 0.02 : Math.sin(breath + 1) * 0.008), handCol);
  foot(ctx, -0.06 - swing, liftBack, pal.shoe);
  foot(ctx, 0.08 + swing, liftFront, pal.shoe);

  ctx.save();
  ctx.translate(0, -bob);
  ctx.rotate(pose.lean);
  // body + shade band on the back side
  bodyPath(ctx); ctx.fillStyle = suit; ctx.fill();
  ctx.save(); bodyPath(ctx); ctx.clip(); ctx.fillStyle = suitShade; ctx.fillRect(-0.25, -0.7, 0.13, 0.7); ctx.restore();
  bodyPath(ctx); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
  if (hero) {
    // light collar triangle tells the hero apart
    ctx.beginPath(); ctx.moveTo(0.02, -0.565); ctx.lineTo(0.11, -0.565); ctx.lineTo(0.06, -0.47); ctx.closePath();
    ctx.fillStyle = '#d9d9dc'; ctx.fill(); ctx.lineWidth = 0.008; ctx.stroke();
  }
  paintHead(ctx, skin, skinHi, aim, pose.dead);
  for (const [wx, wy] of pose.wounds) burst(ctx, wx, wy, 0.035, BLOOD, 7);
  ctx.restore();

  // front hand + held item
  const out: PaintedCharacter = {};
  if (aim !== undefined && pose.held === 'pistol') {
    const reach = 0.36;
    const hx = SHOULDER[0] + Math.cos(aim) * reach, hy = SHOULDER[1] - bob + Math.sin(aim) * reach;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(aim);
    const g = paintHeld(ctx, 'pistol');
    const m = ctx.getTransform();
    if (g.muzzle) {
      const p = m.transformPoint(new DOMPoint(g.muzzle[0], g.muzzle[1]));
      out.muzzle = [p.x, p.y];
      if (pose.flash) muzzleFlash(ctx, g.muzzle);
    }
    if (g.eject) {
      const p = m.transformPoint(new DOMPoint(g.eject[0], g.eject[1]));
      out.eject = [p.x, p.y];
    }
    hand(ctx, 0, 0, handCol);
    ctx.restore();
  } else if (pose.held === 'baton') {
    const hx = 0.2, hy = -0.38 - bob;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-1.2 + Math.sin(breath * 1.6) * 0.1); paintHeld(ctx, 'baton'); ctx.restore();
    hand(ctx, hx, hy, handCol);
  } else if (!pose.lying) {
    hand(ctx, 0.19 + swing * 0.6, -0.32 - bob + Math.sin(breath) * 0.008, handCol);
  } else {
    hand(ctx, 0.05, 0.2, handCol); // lying: front hand flopped on the floor side
  }
  ctx.restore();
  return out;
}

function paintHead(ctx: Ctx, skin: string, skinHi: string, aim: number | undefined, dead: boolean): void {
  ctx.save();
  // tilt toward the aim, at most 0.25 rad
  ctx.translate(0.01, -0.79);
  ctx.rotate(aim !== undefined ? Math.max(-0.25, Math.min(0.25, aim * 0.18)) : 0);
  ctx.translate(-0.01, 0.79);
  ctx.beginPath(); ctx.ellipse(0.01, -0.79, 0.2, 0.225, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin; ctx.fill();
  // soft form shading: darker on the back side, lighter toward the face
  const g = ctx.createLinearGradient(-0.19, 0, 0.21, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.17)');
  g.addColorStop(0.3, 'rgba(0,0,0,0.07)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0.2)');
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.085, -0.915, 0.055, 0.03, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = skinHi; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.ellipse(0.01, -0.79, 0.2, 0.225, 0, 0, Math.PI * 2);
  ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
  paintFace(ctx, dead);
  ctx.restore();
}

/** Face A, "slit" (decided): one dash toward the facing side. Dead: two small x's. Never a cross. */
function paintFace(ctx: Ctx, dead: boolean): void {
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  if (dead) {
    ctx.lineWidth = 0.014;
    for (const cx of [0.06, 0.13]) {
      ctx.beginPath();
      ctx.moveTo(cx - 0.02, -0.85); ctx.lineTo(cx + 0.02, -0.81);
      ctx.moveTo(cx + 0.02, -0.85); ctx.lineTo(cx - 0.02, -0.81);
      ctx.stroke();
    }
    return;
  }
  ctx.lineWidth = 0.02;
  ctx.beginPath(); ctx.moveTo(0.035, -0.83); ctx.lineTo(0.16, -0.83); ctx.stroke();
}

/** Mitten: palm + thumb nub as one silhouette, no inner lines (lines inside read as faces). */
function hand(ctx: Ctx, x: number, y: number, color: string, r = 0.06): void {
  const shapes = () => {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.88, 0, 0, Math.PI * 2);
    ctx.moveTo(x + r * 0.95, y - r * 0.55);
    ctx.ellipse(x + r * 0.62, y - r * 0.55, r * 0.36, r * 0.3, -0.5, 0, Math.PI * 2);
  };
  shapes(); ctx.lineWidth = 0.024; ctx.strokeStyle = INK; ctx.stroke();
  shapes(); ctx.fillStyle = color; ctx.fill();
}

function foot(ctx: Ctx, x: number, lift: number, color: string): void {
  ctx.beginPath();
  ctx.ellipse(x, -0.03 - lift, 0.095, 0.035, 0, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
}

function bodyPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.58);
  ctx.quadraticCurveTo(-0.205, -0.32, -0.2, -0.085);
  ctx.quadraticCurveTo(-0.2, -0.045, -0.16, -0.045);
  ctx.lineTo(0.16, -0.045);
  ctx.quadraticCurveTo(0.2, -0.045, 0.2, -0.085);
  ctx.quadraticCurveTo(0.205, -0.32, 0.15, -0.58);
  ctx.closePath();
}

/** Held item in hand space (grip at the origin, pointing +x). */
export function paintHeld(ctx: Ctx, item: Exclude<HeldItem, null>): { muzzle?: [number, number]; eject?: [number, number] } {
  ctx.lineWidth = 0.011;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  if (item === 'pistol') {
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.1); ctx.lineTo(0.2, -0.1); ctx.lineTo(0.2, -0.055); ctx.lineTo(0.035, -0.055);
    ctx.lineTo(0.03, 0.045); ctx.lineTo(-0.035, 0.045); ctx.lineTo(-0.05, -0.055); ctx.closePath();
    ctx.fillStyle = '#3b3c41'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6c6d72'; ctx.fillRect(-0.03, -0.094, 0.21, 0.013);
    return { muzzle: [0.2, -0.078], eject: [0.05, -0.1] };
  }
  ctx.beginPath(); ctx.roundRect(-0.02, -0.022, 0.42, 0.044, 0.02);
  ctx.fillStyle = '#2f3034'; ctx.fill(); ctx.stroke();
  return {};
}

/** 1-frame muzzle flash: white star + warm glow (measured 1 frame in ep1). */
function muzzleFlash(ctx: Ctx, at: [number, number]): void {
  const [mx, my] = at;
  const g = ctx.createRadialGradient(mx + 0.05, my, 0, mx + 0.05, my, 0.3);
  g.addColorStop(0, `rgba(${FLASH_GLOW},0.85)`);
  g.addColorStop(1, `rgba(${FLASH_GLOW},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(mx + 0.05, my, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(mx + 0.07, my);
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2, rr = i % 2 ? 0.04 : i % 4 === 0 ? 0.15 : 0.1;
    ctx.lineTo(Math.cos(ang) * rr * (Math.cos(ang) > 0 ? 1.4 : 0.8), Math.sin(ang) * rr);
  }
  ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
}
