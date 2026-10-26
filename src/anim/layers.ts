// Procedural layers on top of the keyframed clip (design/art-direction.md, "Animation"):
// walk cycle, idle breathing, airborne tuck, hit lean and stun wobble. Aim and recoil act on
// the front hand and live in the painter, since they need the screen projection.
import type { Actor } from '../sim/actor';
import { sampleClip } from './clips';
import type { Skeleton } from './skeleton';

/** Idle breathing/hand bob rates: the style frame used 0.12 rad per 30 fps frame. */
export const BREATH_RATE = 0.12 * 30;

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
  s.body[1] -= bob;
  s.head[1] -= bob;
  s.handF[1] -= bob;
  s.handB[1] -= bob;

  // hit lean + stun wobble: body and head rotate about the feet
  let lean = p.lean + tuck * 0.12;
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
