// Every gameplay constant, each citing its source note in research/mechanics/ (measured) or
// marked "invented". Distances in H, times in seconds.

export const TUNING = {
  /** Fixed simulation rate. */
  simHz: 60,
  /** Key poses sit on a 30 fps grid: the episodes animate on every frame at 30 fps (research/README.md). */
  animKeyHz: 30,

  move: {
    /**
     * Calm walk. move-walk measured 0.8 H/s (ep1 f494-f518); raised for a smoother feel,
     * decided with the user 2026-10-26. invented
     */
    walkSpeed: 1.1,
    /** Combat walk. move-walk measured 1.3 H/s (ep1 f554-f584); raised like the calm walk. invented */
    combatWalkSpeed: 1.8,
    /** You can keep walking while punching or throwing, at this share of the walk speed. invented */
    attackMoveFactor: 0.7,
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
  /** M7 stealth (melee-stealth-kill, move-drop-from-above). */
  stealth: {
    /** melee-stealth-kill: knife takedown ~0.6 s from contact (ep3 f620-f640). */
    knife: 0.6,
    /** melee-stealth-kill: wire 3 s on screen, shortened to 1.5 s (decided in the note). */
    wire: 1.5,
    /** Takedown reach behind an unaware enemy (centre to centre, H) and depth band. invented */
    reach: 0.7,
    depthBand: 0.25,
    /** move-drop-from-above: landing this close to an unaware enemy goes straight into the kill. invented */
    dropReach: 0.7,
    /** Sight: a player in front within this distance (x) and depth is noticed after `notice` s. invented */
    sight: 5,
    sightDepth: 1.5,
    notice: 0.3,
    /** A loud death alerts unaware enemies within this distance (H); seeing one alerts others within it. invented */
    hearDeath: 3.5,
    /** Patrols walk at this command share and wait at each end. invented */
    patrolSpeed: 0.35,
    patrolWait: 1.2,
  },
  health: {
    /** decided with the user (2026-10-26): 4 light or 2 heavy hits (light 1, heavy 2). */
    grunt: 4,
    /** decided: 3 lives; every hit the player takes costs exactly 1, whatever hit him. */
    hero: 3,
    /** Lab dummies that survive long enough to show stun -> knockdown -> finisher. invented */
    tough: 6,
    /** decided with the user: every kill the player makes heals this much (up to max). */
    healPerKill: 1,
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
    /** Damage follows the button: LMB finisher 1, RMB finisher 2. */
    finisher: { startup: 6 / 30, active: 3 / 30, recovery: 8 / 30, height: 0.15, damage: 1, heavyDamage: 2, reach: 0.5, radius: 0.18 },
    /** A punch pressed during a swing is buffered this long (s). invented */
    buffer: 0.2,
    /** Aim this steeply above horizontal (radians) to turn a heavy punch into an uppercut. invented */
    uppercutAimAngle: Math.PI / 4,
  },

  /**
   * Combos (decided with the user 2026-10-26; the design is invented): consecutive hits on
   * one target within `window` s chain. 3rd+ hit of a chain: +bonus. A heavy straight after
   * a light (quick cross): +bonus. Light-heavy kills a grunt in 2 hits, light x3 in 3.
   */
  combo: {
    /** Longer than the light punch cycle (0.4 s) plus the stun, so a stun-lock keeps the chain. invented */
    window: 0.8,
    bonus: 1,
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
    carrySpeed: 0.6, // combat-human-shield: you move at 0.6x while holding a body (invented, PLAN.md M6)
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

  /** Unarmed grunt AI (enemy-grunt-unarmed). */
  ai: {
    /** enemy-grunt-unarmed: at most 2-3 attacking at once (attack tokens). invented within the plan's range */
    maxAttackers: 2,
    /** enemy-grunt-unarmed: attack every 0.6-1.0 s. invented */
    attackInterval: [0.8, 1.3] as const,
    /** Share of grunt punches that are heavy (knockdown). invented */
    heavyChance: 0.2,
    /** Where a token holder stands to punch (centre distance, inside the 0.6 H range). invented */
    punchDistance: 0.45,
    /** Grunts without a token wait on a ring 1.5-2.5 H from the player (PLAN.md M3). */
    waitRing: [1.5, 2.5] as const,
    /** Grunts walk at this share of the walk speed (the hero was sped up, grunts less so). invented */
    speed: 0.8,
    /** A freed attack token (holder knocked down or killed) is handed out again after this. invented */
    tokenCooldown: 1.0,
    /** No two grunt swings at the same player closer than this (keeps a crowd fair). invented */
    swingGap: 0.45,
    /** Time a grunt stands in punch range before its first swing (a beat to strike first). invented */
    windUp: 0.5,
    /** Armed grunts stand this far inside their weapon's reach. invented */
    weaponMargin: 0.15,
    /** enemy-behaviours: knife grunts throw at range, between these distances (H). invented (> 2 H in the note) */
    knifeThrowRange: [1.8, 4.5] as const,
    /** Seconds between a knife grunt's throw attempts, and the chance per attempt. invented */
    knifeThrowEvery: 2.5,
    knifeThrowChance: 0.5,
    /** enemy-behaviours: an unarmed grunt walks over to a floor weapon within this distance (H). */
    scavenge: 2,
    /** ...but not one lying within this distance of a player. invented */
    scavengeClear: 1.5,
    /** combat-cover: share of gun grunts that kick a table over for cover. invented (the note's one in four) */
    flipChance: 0.25,
    /** PLAN.md M7: one enemy grenade per encounter (wave); chance per aim opportunity to lob it instead. invented */
    grenadeChance: 0.2,
    /** Grenades are lobbed at players 2.5-4 H away with no other grunt within this of the player. invented */
    grenadeRange: [2.5, 4] as const,
    grenadeClear: 2.2,
    /** Cook before the lob (s). invented */
    grenadeCook: 0.35,
    /** M7 ranged grunts (enemy-grunt-armed). */
    ranged: {
      /** Keep this far from the player in x (H): pistols/rifles, and shotguns (close range). invented within the note's 3-5 H */
      keep: [3, 5] as const,
      keepShotgun: [1.4, 2.4] as const,
      /** Aim telegraph: gun raised + red line this long before the shot. enemy-grunt-armed: ~0.4 s (invented) */
      telegraph: 0.4,
      /** Seconds between shots (or bursts). PLAN.md M7: 0.6-1.2 s (invented) */
      interval: [0.6, 1.2] as const,
      /** Aim error at the target (H, +-): roughly half the shots land. invented */
      aimError: 0.3,
      /** Automatic guns fire a burst this long. invented */
      burst: 0.35,
      /** At most this many grunts aim at one player at once. invented */
      maxAimers: 2,
      /** First shot after walking in waits at least this long. invented */
      settle: 0.8,
      /** Cover: a table within this x distance of the firing spot is used (combat-cover). invented */
      coverRange: 2.5,
      /** enemy-behaviours: with an ally in the line of fire, a grunt holds fire and sidesteps this often (the rest = friendly fire). invented */
      holdFire: 0.75,
    },
  },

  /** enemy-spawning: wave scripts. */
  waves: {
    /** enemy-spawning: doors open ~0.3 s before an enemy steps through. */
    doorOpen: 0.3,
    /** Door stays open after the enemy is through, then closes over doorOpen. invented */
    doorHold: 1.0,
    /** Off-screen distance past the side bounds where edge entries start. invented */
    edgeOffset: 1.6,
  },

  /** Co-op (decided with the user 2026-10-26): 2 players on the same Wi-Fi, revive by standing in the circle. */
  coop: {
    /** Standing inside the circle charges the revive bar over 5 s (decided). */
    reviveTime: 5,
    /** Outside the circle a full bar drains in this many seconds ("goes down quickly"). invented */
    reviveDrain: 1.0,
    /** Revive circle radius on the floor, around the downed body's middle. invented */
    reviveRadius: 0.75,
    /** Lives after a revive. invented */
    reviveHp: 1,
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
