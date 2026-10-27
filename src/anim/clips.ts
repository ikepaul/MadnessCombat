// Keyframed clips (design/art-direction.md, "Animation"): key poses on the 30 fps grid the
// episodes animate on, tweened with easing. Poses and clips are data (src/data/poses.json),
// authored in the pose editor lab (/?lab=pose-editor).
import poseData from '../data/poses.json';
import { TUNING } from '../data/tuning';
import { cloneSkeleton, lerpSkeleton, PART_NAMES, REST, type PartXf, type Skeleton } from './skeleton';

/**
 * `back` overshoots the key a little and comes back (follow-through on hit poses), `settle`
 * eases in/out with a small overshoot past the target (the return to guard). Both are drawn only:
 * the sim samples them as `out` / `inOut` so hit geometry stays exact (revamp A2).
 */
export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'settle';
/** [frame on the 30 fps grid, pose name, easing into this key] */
export type ClipKey = [number, string, Ease];
export interface ClipDef { loop?: boolean; keys: ClipKey[] }
/** Poses store only the parts that differ from REST. */
export type PoseDef = Partial<Record<(typeof PART_NAMES)[number], PartXf>>;
export interface PoseLibrary { poses: Record<string, PoseDef>; clips: Record<string, ClipDef> }

const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  // easeOutBack, ~12% past the key at its peak. invented
  back: (t) => { const c = 1.9, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
  // smoothstep with a ~5% overshoot near the end. invented
  settle: (t) => { const s = t * t * (3 - 2 * t); return s + Math.sin(Math.PI * t) * Math.sin(Math.PI * t * 0.5) * 0.3 * t; },
};

/** What the sim sees of the drawn-only easings. */
const SIM_EASE: Partial<Record<Ease, Ease>> = { back: 'out', settle: 'inOut' };

/** The live library. The pose editor mutates it in place so every actor picks up edits. */
export const LIBRARY: PoseLibrary = poseData as unknown as PoseLibrary;

const cache = new Map<string, Skeleton>();

/** A named pose as a full skeleton (missing parts come from REST). */
export function poseSkeleton(name: string): Skeleton {
  let s = cache.get(name);
  if (!s) {
    const def = LIBRARY.poses[name] ?? {};
    s = cloneSkeleton(REST);
    for (const k of PART_NAMES) {
      const p = def[k];
      if (p) s[k] = [p[0], p[1], p[2]];
    }
    cache.set(name, s);
  }
  return s;
}

/** Call after editing LIBRARY.poses. */
export function invalidatePoses(): void {
  cache.clear();
}

export function clipDuration(name: string): number {
  const c = LIBRARY.clips[name];
  if (!c || c.keys.length === 0) return 0;
  return c.keys[c.keys.length - 1][0] / TUNING.animKeyHz;
}

/**
 * Sample a clip at `t` seconds. Unknown clips fall back to the idle pose. `drawn` = for the
 * painter (overshooting easings play out); the sim leaves it false.
 */
export function sampleClip(name: string, t: number, drawn = false): Skeleton {
  const clip = LIBRARY.clips[name];
  if (!clip || clip.keys.length === 0) return poseSkeleton('idle');
  const keys = clip.keys;
  const last = keys[keys.length - 1][0];
  let f = t * TUNING.animKeyHz;
  if (clip.loop && last > 0) f %= last;
  if (f <= keys[0][0]) return poseSkeleton(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [f1, pose1, ease] = keys[i];
    if (f <= f1) {
      const [f0, pose0] = keys[i - 1];
      const u = f1 > f0 ? (f - f0) / (f1 - f0) : 1;
      return lerpSkeleton(poseSkeleton(pose0), poseSkeleton(pose1), EASE[drawn ? ease : SIM_EASE[ease] ?? ease](u));
    }
  }
  return poseSkeleton(keys[keys.length - 1][1]);
}

/**
 * Revamp A1: how long the painter crossfades into each clip (s). Hit reactions come in fast,
 * returns to rest slowly; clips not listed use BLEND_DEFAULT. All invented.
 */
const BLEND_IN: Record<string, number> = {
  stun: 0.04, knockback: 0.05, punchLight: 0.04, punchHeavy: 0.05, uppercut: 0.05, stab: 0.04, swing: 0.05,
  idle: 0.12, holdLong: 0.12, carry: 0.1, lying: 0.12, slumped: 0.15, getUp: 0.08,
};
const BLEND_DEFAULT = 0.08;

export function blendIn(clip: string): number {
  return BLEND_IN[clip] ?? BLEND_DEFAULT;
}

/** poses.json text: one line per pose / clip so diffs stay readable. */
export function serializeLibrary(lib: PoseLibrary = LIBRARY): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const poses = Object.entries(lib.poses).map(([name, def]) => {
    const parts = PART_NAMES.filter((k) => def[k]).map((k) => `"${k}": [${def[k]!.map(r).join(', ')}]`);
    return `    "${name}": {${parts.length ? ` ${parts.join(', ')} ` : ''}}`;
  });
  const clips = Object.entries(lib.clips).map(([name, c]) => {
    const keys = c.keys.map(([f, p, e]) => `[${f}, "${p}", "${e}"]`).join(', ');
    return `    "${name}": { ${c.loop ? '"loop": true, ' : ''}"keys": [${keys}] }`;
  });
  return `{\n  "poses": {\n${poses.join(',\n')}\n  },\n  "clips": {\n${clips.join(',\n')}\n  }\n}\n`;
}

/** Store a skeleton as a pose, keeping only the parts that differ from REST. */
export function setPose(name: string, s: Skeleton): void {
  const def: PoseDef = {};
  for (const k of PART_NAMES) {
    const p = s[k], q = REST[k];
    if (Math.abs(p[0] - q[0]) > 1e-4 || Math.abs(p[1] - q[1]) > 1e-4 || Math.abs(p[2] - q[2]) > 1e-4) def[k] = [p[0], p[1], p[2]];
  }
  LIBRARY.poses[name] = def;
  invalidatePoses();
}
