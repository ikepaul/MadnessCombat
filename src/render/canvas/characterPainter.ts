// Character drawing, ported from design/style-frame. Local space: 1 unit = 1 H, origin between
// the feet, +x = facing direction, -y = up. Measured proportions (design/art-direction.md):
// head 0.45 x 0.40 H, body 0.30 -> 0.40 H wide, hands 0.12 H, feet 0.19 x 0.05 H.
// Parts are placed by the pose skeleton (src/anim), the whole body by the root transform.
import { aimRig, type Rig } from '../../anim/aim';
import { buildSkeleton } from '../../anim/layers';
import { flatness, ROOT_PIVOT, type Root, type Skeleton } from '../../anim/skeleton';
import { FEEL } from '../../data/feel';
import { BLOOD, BLOOD_DARK, INK, type Palette, ZOMBIE, ZOMBIE_HI } from '../../data/palettes';
import { isWeapon, WEAPONS, type WeaponDef } from '../../data/weapons';
import type { Actor, ActorKind, HeldItem, NpcVariant } from '../../sim/actor';
import { NPC_SUIT, paintBoombox, paintNpcBody, paintNpcHead } from './npcPainter';
import { isStage2Cast, paintStage2Body, paintStage2Head, STAGE2_SUIT } from './stage2CastPainter';
import { project, type ScreenPoint, scaleAt } from '../camera';
import { burst, type Ctx } from './draw';
import { paintGrenade, paintGun, paintMelee } from './weaponPainter';
import { isMelee } from '../../data/melee';

/** Where a long gun's support hand grips the barrel (hand space). */
const FOREGRIP: [number, number] = [0.25, 0.02];

/** Where to draw: the actor's floor point projected, or an explicit screen placement (sheets). */
export interface Placement { x: number; y: number; scale: number }

export interface PaintOptions {
  /** Blood on this stage (wounds, neck stump). Off for stage 1. */
  blood: boolean;
  placement?: Placement;
  /** Impact/hurt flashes (the effect-intensity setting can turn them off). */
  flashes?: boolean;
  /** Draw this skeleton instead of the animated one (pose editor). */
  skeleton?: Skeleton;
}

interface Colors { suit: string; suitShade: string; skin: string; skinHi: string; hand: string; shoe: string }

export function actorColors(kind: ActorKind, pal: Palette, variant?: Actor['variant'], green = 1): Colors {
  const hero = kind === 'hero', zombie = kind === 'zombie';
  // a rising zombie turns green over its first second (enemy-zombie)
  const z = (c: string, zc: string) => (zombie ? (green >= 1 ? zc : mix(c, zc, green)) : c);
  // style frame M7 sheet: the bodyguard's suit sits between a grunt's and the hero's
  const guard = variant === 'bodyguard';
  // M8 NPCs: white tee (boombox NPC), dark tracksuit (dancer)
  const npc = isNpc(variant) ? NPC_SUIT[variant] : isStage2Cast(variant) ? STAGE2_SUIT[variant] : undefined;
  return {
    suit: hero ? pal.hero : guard ? BODYGUARD_SUIT : npc ? npc[0] : pal.suit,
    suitShade: hero ? pal.heroShade : guard ? BODYGUARD_SHADE : npc ? npc[1] : pal.suitShade,
    skin: z(pal.skin, ZOMBIE),
    skinHi: z(pal.skinHi, ZOMBIE_HI),
    hand: z(pal.hand, ZOMBIE),
    shoe: pal.shoe,
  };
}

const BODYGUARD_SUIT = '#5c5e66', BODYGUARD_SHADE = '#4a4c53';

const isNpc = (v: Actor['variant']): v is NpcVariant => v === 'boombox' || v === 'dancer';

/** Linear mix of two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const ch = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** Canvas transform for a root (same maths as rootToWorld in src/anim/skeleton.ts). */
export function applyRoot(ctx: Ctx, root: Root): void {
  ctx.scale(root.sx, root.sy);
  ctx.translate(root.tx, root.ty);
  ctx.translate(ROOT_PIVOT[0], ROOT_PIVOT[1]);
  ctx.rotate(root.r);
  ctx.translate(-ROOT_PIVOT[0], -ROOT_PIVOT[1]);
}

export function paintCharacter(ctx: Ctx, a: Actor, pal: Palette, time: number, opts: PaintOptions): void {
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
  const col = actorColors(a.kind, pal, a.variant, pose.green ?? 1);
  const layered = buildSkeleton(a, time);
  const sk = opts.skeleton ?? layered.skeleton;
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
  if (opts.flashes !== false && (pose.impact > 0 || pose.hurt > 0)) ctx.filter = `brightness(${FEEL.impactFrame.brightness}) contrast(${FEEL.impactFrame.contrast})`; // impact frame
  ctx.translate(fx, fy);
  ctx.scale(s, s);
  ctx.scale(a.facing, 1);
  applyRoot(ctx, root);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // aim rig (PLAN.md M5): gun hands sit on a circle around the shoulder, toward the aim point
  // (standing only; the sim uses the same rig for the hitscan, so the shots leave these muzzles)
  const gunF = gunDef(pose.held), gunB = gunDef(pose.heldB);
  const target: ScreenPoint | undefined = pose.aim ?? (pose.aimAt ? project(pose.aimAt.x, pose.aimAt.y, pose.aimAt.z) : undefined);
  const canAim = !opts.skeleton && !pose.dead && flat < 0.5 && target !== undefined;
  const rigF = canAim && gunF ? aimRig([fx, fy], s, a.facing, 0, target!, gunF, pose.kick?.[0]) : undefined;
  const rigB = canAim && gunB ? aimRig([fx, fy], s, a.facing, 1, pose.aimB ?? target!, gunB, pose.kick?.[1]) : undefined;
  const aim = rigF?.angle ?? rigB?.angle;
  // a long gun held alone takes both hands: the back hand grips the barrel
  const support = rigF && gunF && !gunF.oneHanded && !pose.heldB;

  // back hand (behind the body unless it swings out in front, as in a cross punch), feet
  const backInFront = sk.handB[0] > 0.2;
  if (rigB && gunB) gunInHand(ctx, rigB, gunB, col.hand, true);
  // a guard smoking with a gun in his front hand holds the cigarette in the back one
  else if (smoking(a) && (rigF || pose.held)) cigarette(ctx, sk.handB, time);
  else if (!backInFront && !support) {
    // a melee weapon in the back hand (the second knife), held like the front one
    if (pose.heldB && isMelee(pose.heldB)) {
      ctx.save();
      ctx.translate(sk.handB[0] + sk.item[0], sk.handB[1] + sk.item[1]);
      ctx.rotate(sk.item[2]);
      ctx.filter = 'brightness(0.85)';
      paintMelee(ctx, pose.heldB);
      ctx.filter = 'none';
      ctx.restore();
    }
    hand(ctx, sk.handB, col.hand);
  }
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
  if (a.variant === 'bodyguard') {
    // style frame M7 sheet: white shirt V and a thin dark tie
    ctx.beginPath(); ctx.moveTo(0.0, -0.575); ctx.lineTo(0.13, -0.575); ctx.lineTo(0.07, -0.43); ctx.closePath();
    ctx.fillStyle = '#ececee'; ctx.fill(); ctx.lineWidth = 0.008; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.055, -0.565); ctx.lineTo(0.085, -0.565); ctx.lineTo(0.075, -0.45); ctx.lineTo(0.065, -0.45); ctx.closePath();
    ctx.fillStyle = '#2a2b2f'; ctx.fill();
  }
  if (isNpc(a.variant)) paintNpcBody(ctx, a.variant, bodyPath);
  else if (isStage2Cast(a.variant)) paintStage2Body(ctx, a.variant, bodyPath);
  if (a.playerIndex === 1) {
    // co-op player 2 (style-frame sheet): a light strap across the body, shoulder to hip
    ctx.save(); bodyPath(ctx); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-0.2, -0.5); ctx.lineTo(-0.12, -0.56); ctx.lineTo(0.22, -0.16); ctx.lineTo(0.22, -0.06); ctx.closePath();
    ctx.fillStyle = '#d9d9dc'; ctx.fill(); ctx.lineWidth = 0.008; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
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
    if (a.variant === 'leader' || a.variant === 'bodyguard' || a.variant === 'welder') paintHeadGear(ctx, a.variant);
    // M10: knocked silly or out cold: stars round the head
    if (pose.dazed) dazedStars(ctx, time);
    else if (isNpc(a.variant)) paintNpcHead(ctx, a.variant);
    else if (isStage2Cast(a.variant)) paintStage2Head(ctx, a.variant);
    if (opts.blood) for (const [wx, wy] of pose.wounds) if (wy <= -0.6) burst(ctx, wx - 0.01, wy + 0.79, 0.035, BLOOD, 7);
    // enemy-behaviours: the last one left sweats
    if (pose.sweat && !pose.dead) sweat(ctx, time);
    ctx.restore();
  }

  if (backInFront && !rigB && !support) hand(ctx, sk.handB, col.hand);

  // front hand + held item
  if (rigF && gunF) {
    gunInHand(ctx, rigF, gunF, col.hand, false);
    if (support) {
      const c = Math.cos(rigF.angle), n = Math.sin(rigF.angle);
      hand(ctx, [rigF.hand[0] + FOREGRIP[0] * c - FOREGRIP[1] * n, rigF.hand[1] + FOREGRIP[0] * n + FOREGRIP[1] * c, rigF.angle], col.hand);
    }
  } else {
    if (pose.grenade && !pose.held) {
      // a cooked grenade in the front hand
      ctx.save();
      ctx.translate(sk.handF[0] + 0.02, sk.handF[1] - 0.05);
      paintGrenade(ctx, true, Math.floor(time * 8) % 2 === 0);
      ctx.restore();
    }
    // an unaware guard smoking (melee-stealth-kill): the cigarette, brighter on a drag
    if (smoking(a)) cigarette(ctx, sk.handF, time);
    if (pose.welding) weldingTorch(ctx, sk.handF, time);
    // carried by the handle, hanging below the hand
    if (a.carry === 'boombox' && !pose.dead) paintBoombox(ctx, sk.handF[0], sk.handF[1] - 0.01, time);
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
  // PLAN.md M7: the enemy aim telegraph, a dashed red line from the muzzle to the aim point
  if (pose.telegraph !== undefined && rigF && target && !pose.dead) telegraphLine(ctx, rigF.muzzle, target, pose.telegraph, s, time);
}

/** Three little stars circling over the head (head space). */
function dazedStars(ctx: Ctx, time: number): void {
  for (let k = 0; k < 3; k++) {
    const a = time * 4 + (k * Math.PI * 2) / 3, x = Math.cos(a) * 0.2, y = -0.3 + Math.sin(a) * 0.05;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.018 : 0.045, t = (i / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
    ctx.closePath();
    ctx.fillStyle = '#fff3b0'; ctx.fill(); ctx.lineWidth = 0.008; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
}

/** enemy-welder: the torch in the front hand, a white-hot tip and sparks spraying off it (screen-bright). */
function weldingTorch(ctx: Ctx, handF: readonly [number, number, number], time: number): void {
  ctx.save();
  ctx.translate(handF[0], handF[1]);
  ctx.rotate(0.9);
  ctx.fillStyle = '#3a3b40'; ctx.fillRect(0, -0.018, 0.16, 0.036);
  ctx.lineWidth = 0.008; ctx.strokeStyle = INK; ctx.strokeRect(0, -0.018, 0.16, 0.036);
  ctx.translate(0.17, 0);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.16);
  g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(0.3, 'rgba(140,210,255,0.5)'); g.addColorStop(1, 'rgba(140,210,255,0)');
  ctx.fillStyle = g; ctx.fillRect(-0.16, -0.16, 0.32, 0.32);
  // sparks: short bright streaks thrown out and falling
  for (let k = 0; k < 12; k++) {
    const u = (time * 3.1 + k * 0.137) % 1, ang = -1.2 + ((k * 0.61) % 1) * 2.4;
    const r = 0.04 + u * 0.32, x = Math.cos(ang) * r, y = Math.sin(ang) * r + u * u * 0.25;
    ctx.globalAlpha = 1 - u;
    ctx.lineWidth = 0.012; ctx.strokeStyle = u < 0.4 ? '#ffffff' : '#ffc070';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * 0.04, y - Math.sin(ang) * 0.04 - 0.01); ctx.stroke();
  }
  ctx.restore();
}

const smoking = (a: Actor) => a.ai?.aware === false && a.ai.idle === 'smoke' && !a.pose.dead && a.state === 'free';

/** Cigarette between the fingers (hand space), ember glowing brighter at the mouth, smoke curling up. */
function cigarette(ctx: Ctx, handF: readonly [number, number, number], time: number): void {
  const drag = handF[1] < -0.62;
  ctx.save();
  ctx.translate(handF[0] + 0.045, handF[1] - 0.03);
  ctx.rotate(-0.35);
  ctx.lineCap = 'butt';
  ctx.lineWidth = 0.022; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.08, 0); ctx.stroke();
  ctx.lineWidth = 0.014; ctx.strokeStyle = '#f4f4f2';
  ctx.beginPath(); ctx.moveTo(0.002, 0); ctx.lineTo(0.074, 0); ctx.stroke();
  const glow = drag ? 1 : 0.55 + 0.15 * Math.sin(time * 9);
  ctx.beginPath(); ctx.arc(0.082, 0, 0.012, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,${Math.round(110 + 60 * glow)},40,1)`; ctx.fill();
  ctx.beginPath(); ctx.arc(0.082, 0, 0.03 + 0.02 * glow, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,140,50,${0.18 * glow})`; ctx.fill();
  // three puffs rising off the tip in turn
  for (let k = 0; k < 3; k++) {
    const u = ((time / 2.4 + k / 3) % 1);
    ctx.beginPath();
    ctx.arc(0.09 + u * 0.06 + Math.sin(u * 6 + k) * 0.02, -u * 0.32, 0.012 + u * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(235,235,238,${0.35 * (1 - u)})`; ctx.fill();
  }
  ctx.restore();
}

/** Sweat drops on the back of the head (head space), sliding down in turn. */
function sweat(ctx: Ctx, time: number): void {
  for (let k = 0; k < 3; k++) {
    const u = (time / 1.1 + k / 3) % 1, x = -0.17 + k * 0.05, y = -0.12 + k * 0.04 + u * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -0.03); ctx.quadraticCurveTo(0.022, 0.005, 0, 0.015); ctx.quadraticCurveTo(-0.022, 0.005, 0, -0.03);
    ctx.globalAlpha = 1 - u * 0.7;
    ctx.fillStyle = '#e9f3fb'; ctx.fill(); ctx.lineWidth = 0.007; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
}

/** The aim telegraph: dashes marching toward the target, solid and bright just before the shot. */
function telegraphLine(ctx: Ctx, from: ScreenPoint, to: ScreenPoint, u: number, s: number, time: number): void {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (len < 1) return;
  const dash = Math.max(6, s * 0.05);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash(u > 0.85 ? [] : [dash, dash * 0.8]);
  ctx.lineDashOffset = -time * dash * 6;
  ctx.lineWidth = Math.max(2, s * (0.01 + 0.008 * u));
  ctx.strokeStyle = `rgba(214,38,32,${0.35 + 0.55 * u})`;
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(to[0], to[1], Math.max(2, s * 0.012) * (1 + u), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(214,38,32,${0.4 + 0.5 * u})`; ctx.fill();
  ctx.restore();
}

/** M7 head gear (style frame sheet, own designs), head space: squad leader shades, bodyguard earpiece. */
export function paintHeadGear(ctx: Ctx, kind: 'leader' | 'bodyguard' | 'welder'): void {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'welder') {
    // style frame M7 sheet: the welder's mask (used in M10's elevator)
    ctx.strokeStyle = '#3a3b40'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(-0.01, -0.12); ctx.lineTo(-0.19, -0.04); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-0.02, -0.175, 0.24, 0.35, 0.06); ctx.fillStyle = '#6b6d73'; ctx.fill(); ctx.lineWidth = 0.016; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(0.05, -0.08, 0.15, 0.065, 0.015); ctx.fillStyle = '#1d2a22'; ctx.fill(); ctx.lineWidth = 0.01; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,255,190,0.45)'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(0.07, -0.068); ctx.lineTo(0.11, -0.068); ctx.stroke();
  } else if (kind === 'leader') {
    ctx.lineWidth = 0.012; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(0.02, -0.05); ctx.lineTo(-0.17, -0.07); ctx.stroke();
    ctx.fillStyle = '#18181b';
    for (const lx of [0.065, 0.152]) { ctx.beginPath(); ctx.ellipse(lx, -0.045, 0.043, 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillRect(0.1, -0.055, 0.016, 0.01);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.008;
    for (const lx of [0.05, 0.137]) { ctx.beginPath(); ctx.moveTo(lx, -0.062); ctx.lineTo(lx + 0.02, -0.062); ctx.stroke(); }
  } else {
    ctx.strokeStyle = '#2a2b2f'; ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.moveTo(-0.06, 0);
    for (let k = 1; k <= 8; k++) ctx.lineTo(-0.06 - 0.05 * (k / 8) + (k % 2 ? 0.012 : -0.012), 0.24 * (k / 8));
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.055, -0.005, 0.02, 0.024, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a2b2f'; ctx.fill();
  }
  ctx.restore();
}

function gunDef(h: HeldItem | undefined): WeaponDef | undefined {
  return h && isWeapon(h) ? WEAPONS[h] : undefined;
}

/** A gun at its rig: the gun, then the mitten over the grip (back-hand guns are a shade darker). */
function gunInHand(ctx: Ctx, rig: Rig, w: WeaponDef, handCol: string, back: boolean): void {
  ctx.save();
  ctx.translate(rig.hand[0], rig.hand[1]);
  ctx.rotate(rig.angle);
  // pointing behind the body: mirror so the grip still hangs under the barrel
  if (rig.flip) ctx.scale(1, -1);
  if (back) ctx.filter = 'brightness(0.85)';
  paintGun(ctx, w.id);
  ctx.filter = 'none';
  hand(ctx, [0, 0, 0], handCol);
  ctx.restore();
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

/** Held item in hand space (grip at the origin, pointing +x): guns and melee weapons. */
export function paintHeld(ctx: Ctx, item: Exclude<HeldItem, null>): void {
  if (isWeapon(item)) { paintGun(ctx, item); return; }
  paintMelee(ctx, item);
}
