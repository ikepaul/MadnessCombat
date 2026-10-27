// Idle animations (playtest 2026-10-27): fidgets for unaware guards and for the hero after he has
// stood still a while, and two guards chatting. Procedural, on top of the sampled clip, and
// chosen from the time and the actor's id only, so host and co-op guest draw the same thing
// without sending anything. Smoking is a keyframed clip ('smoke', M7); a smoker only fidgets
// with his body and head.
import type { Actor } from '../sim/actor';
import type { Skeleton } from './skeleton';

export type Fidget = 'wrist' | 'stretch' | 'scratch' | 'look' | 'shift' | 'shoulders';

/** A fidget starts every `every` s (when the dice say so) and lasts `length` s. invented */
export const IDLE = {
  every: 6.5,
  length: 2.6,
  /** Share of slots that play a fidget. invented */
  chance: 0.75,
  /** The hero starts fidgeting after standing still this long (s). invented */
  heroStill: 3.5,
  /** One chat turn (s): the speaker gestures, the other nods. invented */
  chatTurn: 2.8,
};

const GUARD: Fidget[] = ['wrist', 'stretch', 'scratch', 'look', 'shift'];
const SMOKER: Fidget[] = ['look', 'shift'];
const HERO: Fidget[] = ['shoulders', 'look', 'shift', 'stretch', 'wrist', 'scratch'];
/** Fidgets that move a hand: not while that hand holds something. */
const HANDS: Partial<Record<Fidget, 'F' | 'B' | 'both'>> = { wrist: 'F', stretch: 'both', scratch: 'B', shoulders: 'both' };

/** A small deterministic hash in [0, 1). */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Ease in over the first quarter, hold, ease out over the last quarter. */
function envelope(u: number): number {
  const ss = (t: number) => t * t * (3 - 2 * t);
  return ss(Math.min(1, u / 0.25)) * ss(Math.min(1, (1 - u) / 0.25));
}

/** The fidget playing at `time` (with its 0..1 progress), if any. */
export function fidgetAt(id: number, time: number, pool: readonly Fidget[]): { kind: Fidget; u: number } | undefined {
  const t = time + id * 2.3;
  const slot = Math.floor(t / IDLE.every);
  const local = t - slot * IDLE.every;
  if (local > IDLE.length || hash(slot, id) > IDLE.chance) return undefined;
  return { kind: pool[Math.floor(hash(id, slot) * pool.length)], u: local / IDLE.length };
}

// the hero's stillness, tracked where the skeleton is built (host and guest alike)
const still = new Map<number, { x: number; z: number; since: number }>();

function stillFor(a: Actor, time: number): number {
  const s = still.get(a.id);
  if (!s || Math.abs(s.x - a.pos.x) > 0.01 || Math.abs(s.z - a.pos.z) > 0.01 || time < s.since) {
    still.set(a.id, { x: a.pos.x, z: a.pos.z, since: time });
    return 0;
  }
  return time - s.since;
}

/** Which idle layer applies to `a` now. */
function idleOf(a: Actor, time: number): { pool: readonly Fidget[] } | { chat: true } | undefined {
  const p = a.pose;
  if (p.dead || a.state !== 'free' || p.walkPhase !== undefined || p.dancing || a.body.state !== 'ground') return undefined;
  if (a.kind === 'hero') {
    // the hero: only after standing still (an aimed gun keeps him busy too)
    if (stillFor(a, time) < IDLE.heroStill || p.cast || p.welding || p.handsUp) return undefined;
    return { pool: HERO };
  }
  if (a.kind !== 'grunt' || a.ai?.aware !== false) return undefined;
  if (a.ai.idle === 'chat') return { chat: true };
  if (a.ai.idle === 'smoke') return { pool: SMOKER };
  if (a.ai.idle === 'patrol') return undefined;
  return { pool: GUARD };
}

/** Add the idle layer to `s` (actor-local, -y up, +x toward the facing side). */
export function applyIdle(a: Actor, s: Skeleton, time: number): void {
  const idle = idleOf(a, time);
  if (!idle) return;
  const freeF = !a.pose.held && !a.hands[0], freeB = !a.hands[1] && !a.holding;
  if ('chat' in idle) { chat(a, s, time, freeF); return; }
  const f = fidgetAt(a.id, time, idle.pool);
  if (!f) return;
  const need = HANDS[f.kind];
  if ((need === 'F' && !freeF) || (need === 'B' && !freeB) || (need === 'both' && (!freeF || !freeB))) return;
  const e = envelope(f.u);
  const to = (part: [number, number, number], x: number, y: number, k = e) => { part[0] += (x - part[0]) * k; part[1] += (y - part[1]) * k; };
  switch (f.kind) {
    case 'wrist': // a look at the watch
      to(s.handF, 0.13, -0.5);
      s.handF[2] += -0.6 * e;
      s.head[2] += 0.2 * e;
      s.head[0] += 0.015 * e;
      break;
    case 'stretch': // arms up, leaning back, then a little twist
      to(s.handF, 0.1, -1.04);
      to(s.handB, -0.1, -1.02);
      s.body[2] -= 0.07 * e;
      s.head[2] -= 0.18 * e;
      s.head[0] -= 0.03 * e;
      break;
    case 'scratch': { // the back hand scratches the back of the head
      const rub = Math.sin(time * 22) * 0.012 * e;
      to(s.handB, -0.14, -0.86);
      s.handB[1] += rub;
      s.head[2] += 0.1 * e;
      break;
    }
    case 'look': // glances back over the shoulder, then up
      s.head[2] += (Math.sin(f.u * Math.PI * 2) * 0.22 - 0.08) * e;
      s.head[0] -= Math.max(0, Math.sin(f.u * Math.PI * 2)) * 0.025 * e;
      break;
    case 'shift': { // weight onto the back foot and back
      const w = Math.sin(f.u * Math.PI) * e;
      s.body[0] -= 0.035 * w;
      s.head[0] -= 0.045 * w;
      s.handF[0] -= 0.03 * w;
      s.handB[0] -= 0.03 * w;
      s.footF[1] -= 0.015 * w;
      s.body[2] -= 0.04 * w;
      break;
    }
    case 'shoulders': { // two shoulder rolls and a neck crack
      const r = Math.max(0, Math.sin(f.u * Math.PI * 4)) * e;
      s.handF[1] -= 0.06 * r;
      s.handB[1] -= 0.06 * r;
      s.handF[0] -= 0.02 * r;
      s.handB[0] -= 0.02 * r;
      s.head[2] += Math.sin(f.u * Math.PI * 2) * 0.16 * e;
      break;
    }
  }
}

/** Two guards talking: turns alternate by id, the speaker gestures, the listener nods. */
function chat(a: Actor, s: Skeleton, time: number, freeF: boolean): void {
  const turn = Math.floor(time / IDLE.chatTurn);
  const u = (time / IDLE.chatTurn) % 1;
  const e = envelope(u);
  if ((turn + a.id) % 2 === 0) {
    // talking: the head bobs with the words, the free hand makes the point
    s.head[2] += Math.sin(time * 7.5) * 0.05 * e;
    s.head[1] -= Math.max(0, Math.sin(time * 9)) * 0.01 * e;
    if (freeF) {
      s.handF[0] += (0.27 - s.handF[0]) * e;
      s.handF[1] += (-0.5 + Math.sin(time * 6) * 0.05 - s.handF[1]) * e;
      s.handF[2] -= 0.4 * e;
    } else s.handB[1] -= Math.max(0, Math.sin(time * 5)) * 0.05 * e;
  } else {
    // listening: slow nods, weight on one leg
    s.head[2] += Math.max(0, Math.sin(time * 4.2)) * 0.12 * e;
    s.body[0] -= 0.02 * e;
    s.head[0] -= 0.025 * e;
  }
}
