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

  /** Hit points. research/design-decisions.md: grunts die from 1 good hit, the player survives ~3. */
  health: {
    /** decided: dies from 1 heavy or 2 light hits (invented split, PLAN.md M2). */
    grunt: 2,
    /** decided: the player survives about 3 hits. */
    hero: 3,
    /** Lab dummies that survive long enough to show stun -> knockdown -> finisher. invented */
    tough: 4,
  },

  /** Unarmed attacks. Frame counts are on the 30 fps key grid (the clips in poses.json match). */
  melee: {
    /** melee-punch-knockback: punch range 0.5-0.6 H, fists touching faces, ep1 f520. Max centre distance. */
    range: 0.6,
    /** melee-punch-knockback: depth band +-0.2 H. invented */
    depthBand: 0.2,
    /** Fist hit circle; the hand is 0.12 H (design/art-direction.md). */
    fistRadius: 0.06,
    /**
     * Light jab. melee-punch-knockback: 2-3 punches/s, ep1 f770-f870 -> 0.4 s cycle; the
     * startup/active/recovery split is invented. Aimed at the face.
     */
    light: { startup: 4 / 30, active: 3 / 30, recovery: 5 / 30, height: 0.79, damage: 1 },
    /** Heavy cross: slower, knocks down. invented split */
    heavy: { startup: 6 / 30, active: 3 / 30, recovery: 8 / 30, height: 0.79, damage: 2 },
    /** Uppercut: heavy with the cursor aimed steeply up. Hits the chest. invented trigger */
    uppercut: { startup: 6 / 30, active: 3 / 30, recovery: 9 / 30, height: 0.6, damage: 2 },
    /** Downward hit on a downed body (melee-hitstun-finisher). Fist low and further out. invented */
    finisher: { startup: 6 / 30, active: 3 / 30, recovery: 8 / 30, height: 0.15, damage: 2, reach: 0.5, radius: 0.18 },
    /** A punch pressed during a swing is buffered this long (s). invented */
    buffer: 0.2,
    /** Aim this steeply above horizontal (radians) to turn a heavy punch into an uppercut. invented */
    uppercutAimAngle: Math.PI / 4,
  },

  /** Hit reactions. */
  hit: {
    /** melee-hitstun-finisher: face-punch stun ~0.7 s, ep1 f1120-f1140. */
    stun: 0.7,
    /** The player only flinches from a light hit (move-knockdown-getup proposal). invented */
    heroFlinch: 0.25,
    /** move-knockdown-getup: knockback ~1.5 H, ep1 f519-f536 (air + skid). */
    knockbackDistance: 1.5,
    /** move-knockdown-getup: airborne ~0.35-0.4 s (11 f), ep1 f519-f530. */
    knockbackAirtime: 11 / 30,
    /** move-knockdown-getup: the body skids f530-f536 before lying still. */
    skid: 6 / 30,
    /** move-knockdown-getup: lying still ~0.2 s, ep1 f536-f542. */
    lie: 0.2,
    /** Knocked-down enemies stay down longer so the finisher has a window (melee-hitstun-finisher). invented */
    enemyLie: 0.8,
    /** move-knockdown-getup: get up ~0.4 s (12 f), ep1 f542-f554. I-frames during it are invented. */
    getUp: 0.4,
    /** melee-punch-knockback: uppercut launch ~1 H up, ep2 f3310. */
    uppercutHeight: 1.0,
    /** Uppercut drift back while airborne. invented */
    uppercutDrift: 0.5,
    /** Impact frame (bright flash) on the hit character: 2 frames. invented until M4 hit-stop */
    impact: 2 / 30,
    /** Player hurt flash. invented */
    hurtFlash: 0.2,
    /** move-knockdown-getup: a knockdown drops the weapon ~0.5-1 H away, ep1 f1739. */
    dropDistance: [0.5, 1.0] as const,
  },

  /** melee-low-sweep: dive into an adjacent enemy. */
  sweep: {
    /** Contact reach from the diver (dive covers 1 H in 0.3 s, contact ~0.2 s in, ep1 f590-f596). invented */
    reach: 0.45,
    /** melee-low-sweep: victim flies ~1 H, ep1 f596-f614. */
    distance: 1.0,
    /** invented: low, short flight */
    airtime: 0.25,
    damage: 1,
  },

  /** melee-grab-throw. */
  grab: {
    /** "contact range": same reach as a punch. invented */
    range: 0.6,
    /** Walk speed while carrying a body. invented */
    carrySpeed: 0.7,
    /** Throw: wind-up to release, then recovery (matches the "throw" clip). invented */
    windup: 5 / 30,
    recovery: 7 / 30,
    /** melee-grab-throw: thrown "hard, at head height", 1.5 H up to the room width. invented speed */
    speed: 8,
    releaseHeight: 0.5,
    vy: 2.5,
    /** Spin of a thrown body (rad/s). invented */
    spin: 11,
    /** A thrown body hitting a wall at least this fast kills (melee-grab-throw). invented */
    wallKillSpeed: 4,
    /** Thrown-body vs actor overlap. invented */
    hitRadius: 0.35,
    damage: 1,
    /** Thrown heads only stagger (melee-decapitation: "light knockback, no kill"). */
    headStun: 0.35,
  },

  /** world-persistence-decals: corpses settle, then freeze into the corpse layer. */
  corpse: {
    /** Settled -> frozen (lets the blood pool finish growing first). invented */
    freezeDelay: 1.5,
    /** melee-decapitation: the headless body stands a moment before it drops. invented */
    headlessStand: 0.3,
    /** Bodies that end within this distance of a wall slump against it. invented */
    slumpDistance: 0.35,
  },

  /** Soft push-apart between standing actors. invented */
  separation: { distance: 0.32, rate: 8 },

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
