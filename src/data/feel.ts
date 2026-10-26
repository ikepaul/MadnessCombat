// Every "feel" number from design/art-direction.md (effects table). Filled in further in M4;
// M0 only needs the post-processing values.

export const FEEL = {
  post: {
    grainAlpha: 0.06, // film grain overlay, ~7% in the style frame
    // radial gradient centred at 52% height: clear inside 0.35 SH, 42% black at 1.05 SH
    vignetteInner: 0.35,
    vignetteOuter: 1.05,
    vignetteStrength: 0.42,
  },
  /** Hit-stop lengths in seconds (3 frames at 30 fps = 0.1 s). Used from M4. */
  hitStop: {
    kill: 0.1,
    bossPhaseKill: 0.167,
    autoFireMax: 0.033,
    maxPerSecond: 0.2,
  },
  killCam: { timeScale: 0.3, duration: 0.6 },
} as const;
