// Every gameplay constant, each citing its source note in research/mechanics/ (measured) or
// marked "invented". Distances in H, times in seconds.

export const TUNING = {
  /** Fixed simulation rate. */
  simHz: 60,
  /** Key poses sit on a 30 fps grid: the episodes animate on every frame at 30 fps (research/README.md). */
  animKeyHz: 30,

  move: {
    /** move-walk: calm walk 0.8 H/s, measured ep1 f494-f518. */
    walkSpeed: 0.8,
    /** move-walk: purposeful/combat walk 1.3 H/s, measured ep1 f554-f584. */
    combatWalkSpeed: 1.3,
    /** invented: depth moves look slower in the show's perspective. */
    depthFactor: 0.6,
    /** Actor footprint radius for prop/wall collision. invented */
    radius: 0.15,
    /** Stride length per full walk cycle (two steps); drives the walk animation. invented */
    strideLength: 0.6,
    /** Aim must cross this far past the body (px) to flip facing. invented */
    facingDeadzonePx: 12,
  },

  jump: {
    /** move-jump: airtime 0.63 s, measured ep1 f2386-f2405. */
    airtime: 0.63,
    /** move-jump: apex 1.1-1.2 H (feet), measured ep1 f2390-f2398. */
    apex: 1.15,
    /** move-jump: keep takeoff momentum; small air steer. invented (<= 30%) */
    airSteer: 0.3,
    /** design/art-direction.md: 2-frame (30 fps) landing squash. */
    landSquash: 2 / 30,
  },

  prone: {
    /** move-prone-dodge: stand -> prone <= 0.15 s, measured ep1 f2425-f2430. */
    downTime: 0.15,
    /** move-prone-dodge: prone -> standing ~0.4 s, measured ep1 f2440-f2455. */
    upTime: 0.4,
    /** move-prone-dodge: hurtbox shrinks to 0.3 H. invented from the measured silhouette */
    height: 0.3,
    /** move-prone-dodge: forward dive ~1 H when moving, measured ep1 f2460. */
    diveDistance: 1.0,
  },

  /** Debug cannon for the dodge labs (boss-halo cannon). */
  cannon: {
    /** move-jump: ball ~26 H/s, measured ep1 f2396-f2398. */
    ballSpeed: 26,
    /** move-prone-dodge: re-fire every ~1.3 s, measured ep1. */
    interval: 1.3,
    /** PLAN.md M1: chest height. */
    height: 0.6,
    radius: 0.12,
  },
} as const;

/** Derived jump physics: apex h and airtime T give v0 = 4h/T and g = 8h/T^2. */
export const JUMP_V0 = (4 * TUNING.jump.apex) / TUNING.jump.airtime;
export const GRAVITY = (8 * TUNING.jump.apex) / TUNING.jump.airtime ** 2;
