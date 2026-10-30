// M14b slice D (design/audit/vis.md VIS-06, VIS-07, VIS-15): what the painter draws for an actor,
// smoothed over the sim's one-tick snaps. Render only: the sim's root, position and facing stay
// exactly as they are (hurtboxes, hitscan and throws read those); this keeps its own memo per
// actor and never writes to the actor.
//
// - VIS-06: a root that snaps (the corpse slumping against a wall, a tumbling body touching down)
//   is blended from where it was drawn, shortest angle, over FEEL.pose.slumpBlend (a clip change)
//   or FEEL.pose.snapEase (a snap inside one clip).
// - VIS-07: a body that jumps into or out of a grab (or swaps sides in the holder's hands) is
//   drawn from where it was, the offset easing out over FEEL.pose.grabEase.
// - VIS-15: a facing flip narrows the body through FEEL.pose.turnTime (never thinner than
//   FEEL.pose.turnMin of its width), the head turning first.
import { FEEL } from '../data/feel';
import type { Actor } from '../sim/actor';
import type { Root } from './skeleton';

export interface Drawn {
  root: Root;
  /** Horizontal scale in place of `facing`: ±1, narrower mid-turn (VIS-15). */
  sx: number;
  /** The head's facing (turns first). */
  headFacing: 1 | -1;
  /** World offset (H) added to the actor position (VIS-07). */
  off: [number, number, number];
  /** VIS-16: the walk cycle the layers draw, its weight easing in and out over FEEL.pose.walkBlend. */
  walk: { phase: number; weight: number };
}

interface Memo {
  t: number;
  /** The sim's values at the last sample. */
  root: Root; facing: 1 | -1; pos: [number, number, number]; state: string; clip: string; phase?: string;
  /** How far the sim root moved on the last sample (snap detection). */
  lastJump: number;
  /** What was drawn at the last sample. */
  drawn: Drawn;
  blend?: { from: Root; at: number; dur: number };
  turn?: { from: 1 | -1; at: number };
  shift?: { off: [number, number, number]; at: number; dur: number };
  /** The last walk phase while stepping and the swing's weight. */
  walkPhase: number; walkW: number;
}

const memos = new WeakMap<Actor, Memo>();

/** A root that moves more than this in one tick (rad, or H of translation) has snapped. VIS audit pop detector. */
const SNAP_RAD = 0.5;
const SNAP_H = 0.1;

const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const copyRoot = (r: Root): Root => ({ r: r.r, tx: r.tx, ty: r.ty, sx: r.sx, sy: r.sy });
const ease = (k: number) => k * k * (3 - 2 * k);

function rootJump(a: Root, b: Root): number {
  return Math.max(Math.abs(wrap(a.r - b.r)) / SNAP_RAD, Math.hypot(a.tx - b.tx, a.ty - b.ty) / SNAP_H, Math.abs(a.sy - b.sy) / SNAP_H);
}

function lerpRoot(a: Root, b: Root, k: number): Root {
  return { r: b.r - wrap(b.r - a.r) * (1 - k), tx: a.tx + (b.tx - a.tx) * k, ty: a.ty + (b.ty - a.ty) * k, sx: a.sx + (b.sx - a.sx) * k, sy: a.sy + (b.sy - a.sy) * k };
}

function raw(a: Actor): Drawn {
  return { root: a.pose.root, sx: a.facing, headFacing: a.facing, off: [0, 0, 0], walk: { phase: a.pose.walkPhase ?? 0, weight: a.pose.walkPhase === undefined ? 0 : 1 } };
}

/** Forget an actor's memo (tests; a lab resetting an actor in place). */
export function resetDrawn(a: Actor): void { memos.delete(a); }

/**
 * The drawn root, horizontal scale and offset of `a` at world time `time`. Sampled once per
 * world time (several frames of one tick draw the same thing); a time going backwards, a long gap
 * or `time` 0 (baking) start over from the sim's values.
 */
export function drawnPose(a: Actor, time: number): Drawn {
  const P = FEEL.pose;
  let m = memos.get(a);
  const pos: [number, number, number] = [a.pos.x, a.pos.y, a.pos.z];
  if (!m || time <= 0 || time < m.t || time - m.t > 0.5) {
    const d = raw(a);
    if (time > 0) memos.set(a, { t: time, root: copyRoot(a.pose.root), facing: a.facing, pos, state: a.state, clip: a.pose.clip, phase: a.corpse?.phase, lastJump: 0, drawn: { ...d, root: copyRoot(d.root) }, walkPhase: d.walk.phase, walkW: d.walk.weight });
    return d;
  }
  if (time === m.t) return m.drawn;
  const target = a.pose.root;

  // VIS-15: a facing flip starts a turn (from whatever is drawn now)
  const flipped = a.facing !== m.facing;
  let turns = flipped && P.turnTime > 0;

  // VIS-06: a snap of the root, after a quiet tick, blends from the drawn root
  const jump = rootJump(target, m.root);
  const clipChanged = a.pose.clip !== m.clip || a.corpse?.phase !== m.phase;
  if (jump > 1 && m.lastJump < jump / 3 && a.state !== 'attack') {
    const dur = clipChanged ? P.slumpBlend : P.snapEase;
    if (dur > 0) {
      const from = copyRoot(m.drawn.root);
      // flipping at the same tick: the drawn root mirrored into the new facing carries it (no narrow)
      if (flipped) { from.sx = -from.sx; turns = false; }
      m.blend = { from, at: m.t, dur };
    }
  }
  m.lastJump = jump;
  if (turns) m.turn = { from: m.facing, at: m.t };

  // VIS-07: into / out of a grab (or switching sides in the hands): start from the drawn spot
  const grabbed = a.state === 'grabbed' || m.state === 'grabbed';
  const d = Math.hypot(pos[0] - m.pos[0], pos[1] - m.pos[1], pos[2] - m.pos[2]);
  if (grabbed && d > SNAP_H && P.grabEase > 0) {
    const was = m.drawn.off;
    m.shift = { off: [m.pos[0] + was[0] - pos[0], m.pos[1] + was[1] - pos[1], m.pos[2] + was[2] - pos[2]], at: m.t, dur: P.grabEase };
  }

  // the drawn values now
  let root = target;
  if (m.blend) {
    const k = (time - m.blend.at) / m.blend.dur;
    if (k >= 1 - 1e-6) m.blend = undefined;
    else root = lerpRoot(m.blend.from, target, ease(Math.max(0, k)));
  }
  let sx: number = a.facing, headFacing = a.facing;
  if (m.turn) {
    const k = (time - m.turn.at) / P.turnTime;
    if (k >= 1 - 1e-6) m.turn = undefined;
    else {
      // through the narrow: from the old side to the new, never thinner than turnMin
      const v = m.turn.from * (1 - 2 * k);
      sx = Math.abs(v) < P.turnMin ? (k < 0.5 ? m.turn.from : a.facing) * P.turnMin : v;
      headFacing = a.facing;
    }
  }
  const off: [number, number, number] = [0, 0, 0];
  if (m.shift) {
    const k = (time - m.shift.at) / m.shift.dur;
    if (k >= 1 - 1e-6) m.shift = undefined;
    else for (let i = 0; i < 3; i++) off[i] = m.shift.off[i] * (1 - k);
  }

  // VIS-16: the swing grows in when he starts walking and settles when he stops (no foot snap)
  const stepping = a.pose.walkPhase !== undefined;
  if (stepping) m.walkPhase = a.pose.walkPhase!;
  const rate = P.walkBlend > 0 ? (time - m.t) / P.walkBlend : 1;
  m.walkW = stepping ? Math.min(1, m.walkW + rate) : Math.max(0, m.walkW - rate);
  const walk = { phase: m.walkPhase, weight: m.walkW };

  m.t = time;
  m.root = copyRoot(target);
  m.facing = a.facing;
  m.pos = pos;
  m.state = a.state;
  m.clip = a.pose.clip;
  m.phase = a.corpse?.phase;
  m.drawn = { root: root === target ? copyRoot(target) : root, sx, headFacing, off, walk };
  return m.drawn;
}
