// Every "feel" number from design/art-direction.md (effects table). Frames are 30 fps frames
// (the episodes' rate); values not in the table are marked invented.
import { applyOverrides } from '../dev/overrides';

const F = 1 / 30;

export const FEEL = {
  post: {
    grainAlpha: 0.06, // film grain overlay, ~7% in the style frame
    // radial gradient centred at 52% height: clear inside 0.35 SH, 42% black at 1.05 SH
    vignetteInner: 0.35,
    vignetteOuter: 1.05,
    vignetteStrength: 0.42,
  },
  /**
   * Hit-stop lengths in seconds. Decided with the user 2026-10-26 (replaces the art
   * direction's 3 frames): kills 2 frames, every punch or other hit 1 frame.
   */
  hitStop: {
    kill: 2 * F,
    heavy: 1 * F,
    light: 1 * F,
    bossPhaseKill: 5 * F,
    /** Automatic weapons: at most 1 frame per hit. */
    autoFireMax: 1 * F,
    /** Never more than 6 frames of hit-stop per second. */
    maxPerSecond: 6 * F,
  },
  /** Screen shake in px at 1080p, decaying over 0.15-0.4 s. */
  shake: {
    pistol: 2,
    smg: 1,
    shotgun: 6,
    explosion: 14,
    bossSlam: 10,
    kill: 6,
    /** invented */
    heavyHit: 4,
    /** invented */
    lightHit: 1.5,
    /** invented: a body slammed into a wall */
    wall: 5,
    /** M8, invented: a lightning bolt cracking across the room (under the explosion's 14) */
    lightning: 7,
    /** invented: the player getting hit */
    hurt: 5,
    decayMin: 0.15,
    decayMax: 0.4,
  },
  /** Chromatic split: kills / explosions / boss hits, 4-8 px for 2-3 frames. Not on every hit. */
  chromatic: {
    kill: { px: 6, frames: 2 },
    killCam: { px: 8, frames: 3 },
  },
  /**
   * Kill cam: time x0.3 for 0.6 s + red tint (5-15%) + chromatic on the first frame + audio
   * slowdown. Triggers: the last kill of a wave, 3+ kills within 1 s, boss phase end.
   */
  killCam: { timeScale: 0.3, duration: 0.6, tint: 0.1, comboKills: 3, comboWindow: 1.0, /** revamp C1, invented */ zoom: 0.06 },
  /**
   * M19 rage fatalities (design/rage.md 2.5): time runs at `runScale` through the move, `releaseScale`
   * for `releaseSlow` s after the release, then eases back; per-strike hit-stop and shakes. invented
   */
  rage: { runScale: 0.6, releaseScale: 0.3, releaseSlow: 0.45, strikeStop: 2 / 30, strikeShake: 5, releaseShake: 14, letterbox: 0.07, dim: 0.45 },
  /** Impact frame: the hit character drawn bright for the hit-stop. */
  impactFrame: { brightness: 1.8, contrast: 1.2 },
  /** Kill counter pop: 1.3 -> 1.0 over 8 frames; green for zombie kills. */
  counterPop: { scale: 1.3, frames: 8 },
} as const;

/** Effect intensity setting (art direction: off / reduced / full), applied to shake, flashes, chromatic. */
export type EffectIntensity = 'off' | 'reduced' | 'full';

export const INTENSITY_SCALE: Record<EffectIntensity, number> = { off: 0, reduced: 0.5, full: 1 };

// dev: the F6 tuning panel's saved numbers (src/dev/overrides.ts)
applyOverrides('FEEL', FEEL);
