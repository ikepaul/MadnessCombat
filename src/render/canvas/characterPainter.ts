// Character drawing, ported from design/style-frame. Local space: 1 unit = 1 H, origin between
// the feet, +x = facing direction, -y = up. Measured proportions (design/art-direction.md):
// head 0.45 x 0.40 H, body 0.30 -> 0.40 H wide, hands 0.12 H, feet 0.19 x 0.05 H.
// Parts are placed by the pose skeleton (src/anim), the whole body by the root transform.
import { buildSkeleton } from '../../anim/layers';
import { flatness, ROOT_PIVOT, type Root, type Skeleton } from '../../anim/skeleton';
import { BLOOD, BLOOD_DARK, FLASH_GLOW, INK, type Palette, ZOMBIE, ZOMBIE_HI } from '../../data/palettes';
import type { Actor, ActorKind, HeldItem } from '../../sim/actor';
import { project, type ScreenPoint, scaleAt } from '../camera';
import { burst, type Ctx } from './draw';

const SHOULDER: [number, number] = [0.03, -0.5];

export interface PaintedCharacter {
  /** Screen position of the gun muzzle, if a gun is aimed. */
  muzzle?: ScreenPoint;
  /** Screen position of the ejection port. */
  eject?: ScreenPoint;
}

/** Where to draw: the actor's floor point projected, or an explicit screen placement (sheets). */
export interface Placement { x: number; y: number; scale: number }

export interface PaintOptions {
  /** Blood on this stage (wounds, neck stump). Off for stage 1. */
  blood: boolean;
  placement?: Placement;
  /** Draw this skeleton instead of the animated one (pose editor). */
  skeleton?: Skeleton;
}

interface Colors { suit: string; suitShade: string; skin: string; skinHi: string; hand: string; shoe: string }

export function actorColors(kind: ActorKind, pal: Palette): Colors {
  const hero = kind === 'hero', zombie = kind === 'zombie';
  return {
    suit: hero ? pal.hero : pal.suit,
    suitShade: hero ? pal.heroShade : pal.suitShade,
    skin: zombie ? ZOMBIE : pal.skin,
    skinHi: zombie ? ZOMBIE_HI : pal.skinHi,
    hand: zombie ? ZOMBIE : pal.hand,
    shoe: pal.shoe,
  };
}

/** Canvas transform for a root (same maths as rootToWorld in src/anim/skeleton.ts). */
export function applyRoot(ctx: Ctx, root: Root): void {
  ctx.scale(root.sx, root.sy);
  ctx.translate(root.tx, root.ty);
  ctx.translate(ROOT_PIVOT[0], ROOT_PIVOT[1]);
  ctx.rotate(root.r);
  ctx.translate(-ROOT_PIVOT[0], -ROOT_PIVOT[1]);
}

export function paintCharacter(ctx: Ctx, a: Actor, pal: Palette, time: number, opts: PaintOptions): PaintedCharacter {
  const { pose } = a;
  const { placement } = opts;
  let fx: number, fy: number, s: number, shadowY: number;
  if (placement) {
    ({ x: fx, y: fy, scale: s } = placement);
    shadowY = fy;
  } else {
    [fx, fy] = project(a.pos.x, a.pos.y, a.pos.z);
    shadowY = project(a.pos.x, pose.groundY, a.pos.z)[1];
    s = scaleAt(a.pos.z);
  }
  const col = actorColors(a.kind, pal);
  const layered = buildSkeleton(a, time);
  const sk = opts.skeleton ?? layered.skeleton;
  const bob = opts.skeleton ? 0 : layered.bob;
  const root = pose.root;
  const flat = flatness(root);

  // contact shadow stays on the surface below and shrinks with height; lying bodies cast a long one
  const air = Math.max(0, fy === shadowY ? 0 : (shadowY - fy) / s);
  const shrink = 1 - Math.min(0.5, air * 0.4);
  // under the body's middle (the root pivot), so lying and prone shadows cover the whole body
  const mid = root.tx * root.sx * a.facing;
  ctx.beginPath();
  ctx.ellipse(fx + mid * s, shadowY, (0.3 + 0.32 * flat) * shrink * s, 0.06 * shrink * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.2 * (1 - Math.min(0.6, air * 0.5))})`;
  ctx.fill();

  ctx.save();
  if (pose.impact > 0 || pose.hurt > 0) ctx.filter = 'brightness(1.8) contrast(1.2)'; // impact frame
  ctx.translate(fx, fy);
  ctx.scale(s, s);
  ctx.scale(a.facing, 1);
  applyRoot(ctx, root);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // aim angle from the shoulder toward the target, in local units (standing only)
  let aim: number | undefined;
  if (pose.aimAt && flat < 0.5) {
    const [tx, ty] = project(pose.aimAt.x, pose.aimAt.y, pose.aimAt.z);
    const lx = ((tx - fx) / s) * a.facing, ly = (ty - fy) / s;
    aim = Math.atan2(ly - (SHOULDER[1] - bob), lx - SHOULDER[0]);
  }

  // back hand (behind the body unless it swings out in front, as in a cross punch), feet
  const backInFront = sk.handB[0] > 0.2;
  if (!backInFront) hand(ctx, sk.handB, col.hand);
  foot(ctx, sk.footB, col.shoe);
  foot(ctx, sk.footF, col.shoe);

  // body + shade band on the back side
  ctx.save();
  ctx.translate(sk.body[0], sk.body[1]);
  ctx.rotate(sk.body[2]);
  bodyPath(ctx); ctx.fillStyle = col.suit; ctx.fill();
  ctx.save(); bodyPath(ctx); ctx.clip(); ctx.fillStyle = col.suitShade; ctx.fillRect(-0.25, -0.7, 0.13, 0.7); ctx.restore();
  bodyPath(ctx); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
  if (a.kind === 'hero') {
    // light collar triangle tells the hero apart
    ctx.beginPath(); ctx.moveTo(0.02, -0.565); ctx.lineTo(0.11, -0.565); ctx.lineTo(0.06, -0.47); ctx.closePath();
    ctx.fillStyle = '#d9d9dc'; ctx.fill(); ctx.lineWidth = 0.008; ctx.stroke();
  }
  if (pose.headless) neckStump(ctx, opts.blood);
  if (opts.blood) for (const [wx, wy] of pose.wounds) if (wy > -0.6) burst(ctx, wx, wy, 0.035, BLOOD, 7);
  ctx.restore();

  if (!pose.headless) {
    ctx.save();
    ctx.translate(sk.head[0], sk.head[1]);
    // tilt toward the aim, at most 0.25 rad
    ctx.rotate(sk.head[2] + (aim !== undefined ? Math.max(-0.25, Math.min(0.25, aim * 0.18)) : 0));
    paintHead(ctx, col.skin, col.skinHi, pose.dead);
    if (opts.blood) for (const [wx, wy] of pose.wounds) if (wy <= -0.6) burst(ctx, wx - 0.01, wy + 0.79, 0.035, BLOOD, 7);
    ctx.restore();
  }

  if (backInFront) hand(ctx, sk.handB, col.hand);

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
    hand(ctx, [0, 0, 0], col.hand);
    ctx.restore();
  } else {
    if (pose.held) {
      ctx.save();
      ctx.translate(sk.handF[0] + sk.item[0], sk.handF[1] + sk.item[1]);
      ctx.rotate(sk.item[2] + (pose.held === 'baton' && !pose.dead ? Math.sin(time * 5.8) * 0.1 : 0));
      paintHeld(ctx, pose.held);
      ctx.restore();
    }
    hand(ctx, sk.handF, col.hand);
  }
  ctx.restore();
  return out;
}

/** Head at the origin of its own transform. */
export function paintHead(ctx: Ctx, skin: string, skinHi: string, dead: boolean): void {
  ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.225, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin; ctx.fill();
  // soft form shading: darker on the back side, lighter toward the face
  const g = ctx.createLinearGradient(-0.2, 0, 0.2, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.17)');
  g.addColorStop(0.3, 'rgba(0,0,0,0.07)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0.2)');
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.075, -0.125, 0.055, 0.03, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = skinHi; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.225, 0, 0, Math.PI * 2);
  ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
  paintFace(ctx, dead);
}

/** Face A, "slit" (decided): one dash toward the facing side. Dead: two small x's. Never a cross. */
function paintFace(ctx: Ctx, dead: boolean): void {
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  if (dead) {
    ctx.lineWidth = 0.014;
    for (const cx of [0.05, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(cx - 0.02, -0.06); ctx.lineTo(cx + 0.02, -0.02);
      ctx.moveTo(cx + 0.02, -0.06); ctx.lineTo(cx - 0.02, -0.02);
      ctx.stroke();
    }
    return;
  }
  ctx.lineWidth = 0.02;
  ctx.beginPath(); ctx.moveTo(0.025, -0.04); ctx.lineTo(0.15, -0.04); ctx.stroke();
}

/** Flat top of the body where the head was (melee-decapitation). */
function neckStump(ctx: Ctx, blood: boolean): void {
  ctx.beginPath(); ctx.ellipse(0, -0.575, 0.15, 0.035, 0, 0, Math.PI * 2);
  ctx.fillStyle = blood ? BLOOD_DARK : '#5d5e63'; ctx.fill();
  ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
}

/** Mitten: palm + thumb nub as one silhouette, no inner lines (lines inside read as faces). */
function hand(ctx: Ctx, xf: readonly [number, number, number], color: string, r = 0.06): void {
  ctx.save();
  ctx.translate(xf[0], xf[1]);
  ctx.rotate(xf[2]);
  const shapes = () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.88, 0, 0, Math.PI * 2);
    ctx.moveTo(r * 0.95, -r * 0.55);
    ctx.ellipse(r * 0.62, -r * 0.55, r * 0.36, r * 0.3, -0.5, 0, Math.PI * 2);
  };
  shapes(); ctx.lineWidth = 0.024; ctx.strokeStyle = INK; ctx.stroke();
  shapes(); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

function foot(ctx: Ctx, xf: readonly [number, number, number], color: string): void {
  ctx.beginPath();
  ctx.ellipse(xf[0], xf[1], 0.095, 0.035, xf[2], 0, Math.PI * 2);
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
