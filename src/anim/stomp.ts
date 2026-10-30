// M14b (PLAN "Look & sound": the stomp's pose; design/audit/cmb.md CMB-07). Render only: the
// `stomp` event's `tell` draws a wind-up (front knee pulled up high, arms out for balance, the sim's
// lean back on top), `hit` / `miss` a stamp (the front foot driven flat onto the floor ahead, the
// body dipping into it, arms flung down and back) that eases back to the clip. Our own pose, not
// copied from any reference. Off with FEEL.pose.stompPose = 0 (the old: lean only).
import { FEEL } from '../data/feel';
import { TUNING } from '../data/tuning';
import type { Actor } from '../sim/actor';
import type { World } from '../sim/world';
import type { PartXf, Skeleton } from './skeleton';

interface Stomp { phase: 'tell' | 'stamp'; t0: number }
const stomps = new WeakMap<Actor, Stomp>();

/** Listen for the world's stomps (GameScene, once per world). */
export function installStompPose(world: World): void {
  world.events.on('stomp', (e) => {
    const a = world.actorById(e.actorId);
    if (a) stomps.set(a, { phase: e.phase === 'tell' ? 'tell' : 'stamp', t0: world.time });
  });
}

/** The stamp's timing (s): drive down, hold on the floor, ease back to the clip. invented */
export const STAMP = { drive: 0.06, hold: 0.1, back: 0.2 };

// key poses, actor-local H (-y up, +x toward the facing side), against REST
// (the feet draw behind the coat, which reaches ±0.2 H: a raised foot must clear its front edge)
const WIND: Partial<Skeleton> = {
  footF: [0.31, -0.22, -0.55],
  footB: [-0.07, -0.03, 0.05],
  handF: [0.27, -0.44, 0.3],
  handB: [-0.27, -0.42, -0.3],
};
const STAMP_POSE: Partial<Skeleton> = {
  footF: [0.4, -0.03, 0.1],
  footB: [-0.1, -0.03, -0.1],
  handF: [0.1, -0.27, 0.2],
  handB: [-0.28, -0.36, -0.4],
};
const DIP = 0.045;

const ease = (u: number) => u * u * (3 - 2 * u);
const mix = (p: PartXf, q: PartXf, t: number): void => { for (let i = 0; i < 3; i++) p[i] += (q[i] - p[i]) * t; };

/** Bend the clip's skeleton toward the wind-up or the stamp (in place); true if it did. */
export function applyStomp(a: Actor, s: Skeleton, time: number): boolean {
  if (!FEEL.pose.stompPose) return false;
  const st = stomps.get(a);
  if (!st || a.pose.dead || a.state !== 'free') return false;
  const dt = time - st.t0;
  let pose: Partial<Skeleton>, w: number, dip = 0;
  if (st.phase === 'tell') {
    // the sim clears the telegraph when the tell is cut short (hit, the target got up)
    if (a.pose.telegraph === undefined || dt < 0) return false;
    pose = WIND;
    w = ease(Math.min(1, dt / TUNING.enc.stomp.tell));
  } else {
    const { drive, hold, back } = STAMP;
    if (dt < 0 || dt > drive + hold + back) { stomps.delete(a); return false; }
    pose = STAMP_POSE;
    w = dt < drive ? ease(dt / drive) : dt < drive + hold ? 1 : 1 - ease((dt - drive - hold) / back);
    dip = DIP * w;
  }
  for (const k of Object.keys(pose) as (keyof Skeleton)[]) mix(s[k], pose[k]!, w);
  if (dip) for (const k of ['body', 'head', 'handF', 'handB'] as const) s[k][1] += dip;
  return true;
}
