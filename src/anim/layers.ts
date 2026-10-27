// Procedural layers on top of the keyframed clip (design/art-direction.md, "Animation"):
// walk cycle, idle breathing, airborne tuck, hit lean and stun wobble. Aim and recoil act on
// the front hand and live in the painter, since they need the screen projection.
import type { Actor } from '../sim/actor';
import { blendIn, sampleClip } from './clips';
import { applyIdle } from './idles';
import { cloneSkeleton, lerpSkeleton, type Skeleton } from './skeleton';

/** Revamp A2 overlap: the head trails the body by 2 frames, the free back hand by 1. invented */
const HEAD_LAG = 2 / 30;
const HAND_LAG = 1 / 30;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * The clip as drawn (revamp A1/A2): overshooting easings, the head and back hand trailing a
 * frame or two, and a crossfade out of the previous clip so switches never pop.
 */
function drawnClip(a: Actor): Skeleton {
  const p = a.pose;
  // a copy: single-key samples are the pose cache's own objects
  const sk = cloneSkeleton(sampleClip(p.clip, p.clipT, true));
  if (!p.dead && p.clipT > 0) {
    sk.head = sampleClip(p.clip, Math.max(0, p.clipT - HEAD_LAG), true).head;
    if (!p.heldB) sk.handB = sampleClip(p.clip, Math.max(0, p.clipT - HAND_LAG), true).handB;
  }
  const blend = blendIn(p.clip);
  if (p.prevClip === undefined || p.clipT >= blend) return sk;
  return lerpSkeleton(sampleClip(p.prevClip, p.prevT ?? 0, true), sk, smooth(p.clipT / blend));
}

/**
 * Revamp A6: a hit snaps in over 3 ticks, then rings out (damped) over REACT_LIFE. Head hits
 * throw the head back, body hits fold the body, hits from behind pitch it forward.
 */
function applyReaction(a: Actor, s: Skeleton): void {
  const r = a.pose.react;
  if (!r || a.pose.dead) return;
  const t = r.age;
  const k = (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 7) * Math.cos((t - 0.05) * 13)) * (0.75 + r.v * 0.5);
  const side = r.v < 0.5 ? 1 : -1;
  if (r.part === 'head') {
    s.head[0] -= 0.05 * k; s.head[1] += 0.01 * k; s.head[2] -= 0.45 * k;
    s.body[2] -= 0.08 * k;
    s.handB[0] -= 0.04 * k; s.handB[1] -= 0.06 * k * side;
  } else if (r.part === 'body') {
    s.body[2] += 0.16 * k;
    s.head[0] += 0.05 * k; s.head[1] += 0.05 * k; s.head[2] += 0.2 * k;
    s.handF[0] -= 0.07 * k; s.handF[1] += 0.08 * k;
    s.handB[0] += 0.05 * k; s.handB[1] += 0.06 * k;
  } else {
    s.body[2] += 0.22 * k;
    s.head[0] += 0.07 * k; s.head[2] += 0.3 * k;
    s.handF[1] -= 0.08 * k; s.handB[0] -= 0.08 * k; s.handB[1] -= 0.1 * k;
  }
}

/**
 * Revamp A7: the way down. `drop` buckles at the knees and the head lolls, `crumple` clutches
 * the wound, `fling` throws the arms and legs out while it spins.
 */
function applyDeath(a: Actor, s: Skeleton): void {
  const d = a.pose.death, c = a.corpse;
  if (!d || !c || c.phase !== 'tumble') return;
  const e = smooth(clamp01(c.t / 0.15));
  if (d === 'drop') {
    s.body[1] += 0.1 * e;
    s.head[1] += 0.12 * e; s.head[2] += 0.4 * e;
    s.handF[1] += 0.18 * e; s.handB[1] += 0.18 * e;
    s.footF[0] += 0.05 * e; s.footB[0] -= 0.04 * e;
  } else if (d === 'crumple') {
    s.handF = [s.handF[0] + (0.1 - s.handF[0]) * e, s.handF[1] + (-0.42 - s.handF[1]) * e, s.handF[2]];
    s.handB = [s.handB[0] + (0.03 - s.handB[0]) * e, s.handB[1] + (-0.5 - s.handB[1]) * e, s.handB[2]];
    s.head[0] += 0.05 * e; s.head[2] += 0.35 * e;
  } else {
    s.handF[0] += 0.12 * e; s.handF[1] -= 0.25 * e;
    s.handB[0] -= 0.14 * e; s.handB[1] -= 0.3 * e;
    s.footF[0] += 0.1 * e; s.footB[0] -= 0.1 * e;
  }
}

/** Idle breathing/hand bob rates: the style frame used 0.12 rad per 30 fps frame. */
export const BREATH_RATE = 0.12 * 30;
/** Dancer loop rate (rad/s): the style frame's 0.26 per 30 fps frame. invented */
const DANCE_RATE = 0.26 * 30;

export interface Layered {
  skeleton: Skeleton;
  /** Body bob, applied to the shoulder for aiming. */
  bob: number;
}

export function buildSkeleton(a: Actor, time: number): Layered {
  const p = a.pose;
  const sk = drawnClip(a);
  const s = {} as Skeleton;
  for (const k in sk) s[k as keyof Skeleton] = [...sk[k as keyof Skeleton]] as Skeleton[keyof Skeleton];
  applyReaction(a, s);
  applyDeath(a, s);
  // M14 melee-blade-deflect: the sword held up and across in front of the body, both hands near the hilt
  if (p.guard && !p.dead) { s.handF = [0.24, -0.52, 0]; s.handB = [0.12, -0.47, 0]; s.item = [s.item[0], s.item[1], -1.9]; }

  // the flying kick (playtest 2026-10-27): front foot thrust out level with the hips, back foot
  // tucked, fists up by the face (the root leans the whole body back)
  if (a.body.kick && !p.dead && a.state === 'free') {
    s.footF = [0.44, -0.12, -0.3];
    s.footB = [-0.02, -0.16, 0.3];
    s.handF = [0.16, -0.62, 0];
    s.handB = [-0.06, -0.58, 0];
  }

  // idles (playtest 2026-10-27): guards' fidgets and chats, the hero's after standing still
  applyIdle(a, s, time);

  const quiet = p.dead || a.state === 'down' || a.state === 'knockback';
  const stepping = p.walkPhase !== undefined;
  const ph = p.walkPhase ?? 0;
  const breath = time * BREATH_RATE + a.id * 1.7;
  const bob = quiet ? 0 : stepping ? Math.abs(Math.sin(ph)) * 0.014 : Math.sin(breath) * 0.004;
  const swing = stepping ? Math.sin(ph) * 0.07 : 0;
  const tuck = p.tuck;

  s.footF[0] += swing;
  s.footB[0] -= swing;
  s.footF[1] -= (stepping ? Math.max(0, Math.sin(ph)) * 0.035 : 0) + tuck * 0.12;
  s.footB[1] -= (stepping ? Math.max(0, -Math.sin(ph)) * 0.035 : 0) + tuck * 0.08;
  // walking while punching: the feet step, the hands stay on the punch
  const handSwing = a.state === 'attack' ? 0 : swing;
  s.handB[0] -= handSwing * 0.6 + tuck * 0.03;
  s.handB[1] += -tuck * 0.12 + (quiet || a.state === 'attack' ? 0 : stepping ? Math.cos(ph) * 0.02 : Math.sin(breath + 1) * 0.008);
  if (!p.held) {
    s.handF[0] += handSwing * 0.6 + tuck * 0.04;
    s.handF[1] += -tuck * 0.14 + (quiet ? 0 : Math.sin(breath) * 0.008);
  }
  // M8 dancer NPC (style frame "Stage 1 cast") and the ending's dance emote: bounce, sway, hands pumping overhead in turn
  const dn = (a.variant === 'dancer' || p.dancing) && a.state === 'free' && !p.dead && !stepping ? time * DANCE_RATE + a.id : undefined;
  let danceBob = 0, danceLean = 0;
  if (dn !== undefined) {
    danceBob = Math.abs(Math.sin(dn)) * 0.035;
    danceLean = Math.sin(dn * 0.5) * 0.12;
    s.footF[1] -= Math.max(0, Math.sin(dn)) * 0.04;
    s.footB[1] -= Math.max(0, -Math.sin(dn)) * 0.04;
    s.handB[0] = -0.2; s.handB[1] = -0.35 - Math.max(0, Math.sin(dn * 0.5)) * 0.38;
    s.handF[0] = 0.22; s.handF[1] = -0.35 - Math.max(0, -Math.sin(dn * 0.5)) * 0.38;
  }
  s.body[1] -= bob + danceBob;
  s.head[1] -= bob + danceBob;
  s.handF[1] -= bob + danceBob;
  s.handB[1] -= bob + danceBob;

  // hit lean + stun wobble: body and head rotate about the feet
  let lean = p.lean + tuck * 0.12 + danceLean;
  if (a.state === 'stun') lean += Math.sin(a.stateT * 18) * 0.05 * Math.max(0, 1 - a.stateT / 0.7);
  if (lean !== 0) {
    const c = Math.cos(lean), sn = Math.sin(lean);
    for (const k of ['head', 'handF', 'handB'] as const) {
      const [x, y] = s[k];
      s[k][0] = x * c - y * sn;
      s[k][1] = x * sn + y * c;
    }
    s.body[2] += lean;
    s.head[2] += lean;
  }
  return { skeleton: s, bob };
}
