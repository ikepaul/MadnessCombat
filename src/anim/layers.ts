// Procedural layers on top of the keyframed clip (design/art-direction.md, "Animation"):
// walk cycle, idle breathing, airborne tuck, hit lean and stun wobble. Aim and recoil act on
// the front hand and live in the painter, since they need the screen projection.
import type { Actor } from '../sim/actor';
import { sampleClip } from './clips';
import { applyIdle } from './idles';
import type { Skeleton } from './skeleton';

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
  const sk = sampleClip(p.clip, p.clipT);
  const s = {} as Skeleton;
  for (const k in sk) s[k as keyof Skeleton] = [...sk[k as keyof Skeleton]] as Skeleton[keyof Skeleton];

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
