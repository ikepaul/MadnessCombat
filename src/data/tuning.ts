// Every gameplay constant, each citing its source note in research/mechanics/ (measured) or
// marked "invented". Distances in H, times in seconds.
import { applyOverrides } from '../dev/overrides';

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
    /**
     * The hero's own speeds (playtest 2026-10-27, "snappy"): ~35% over the shared walk speeds,
     * which enemies keep (their AI speeds are shares of those). invented
     */
    hero: { walkSpeed: 1.5, combatWalkSpeed: 2.4 },
  },

  jump: {
    /** move-jump: airtime 0.63 s, measured ep1 f2386-f2405. */
    airtime: 0.63,
    /** move-jump: apex 1.1-1.2 H (feet), measured ep1 f2390-f2398. */
    apex: 1.15,
    /** move-jump: keep takeoff momentum; small air steer. invented (<= 30%) */
    airSteer: 0.3,
    /**
     * The hero in the air (playtest 2026-10-27): full steering. Velocity eases toward the input at
     * `airAccel` (1/s) up to `airSpeed` x the ground speed, and the takeoff carries that boost too
     * (a little more jump distance). invented
     */
    hero: { airAccel: 14, airSpeed: 1.15 },
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
    /** The hero gets up quicker than the measured 0.4 s (playtest 2026-10-27, "snappy"). invented */
    heroUpTime: 0.28,
    /** Crawling on the belly (playtest 2026-10-27), and dragging yourself while downed in co-op (H/s). invented */
    crawlSpeed: 0.55,
    downedCrawlSpeed: 0.3,
  },

  /** Hit points. research/design-decisions.md: grunts die from 1 good hit, the player survives ~3. */
  /** M12 world-arena-lock (src/sim/arena.ts). */
  arenaLock: {
    /** Shadow before each wall comes down (s): the note's ~0.5 s. */
    shadow: 0.55,
    height: 7,
    fallSpeed: 18,
    /** Standing this close to a wall's line when it lands = crushed (H). invented */
    crushBand: 0.45,
    /** Between one wall landing and the next one's shadow (s). invented */
    gap: 0.7,
  },
  /** M12 world-last-stand. */
  lastStand: {
    /** Aim and fire for ~5 s (decided: playable last stand). */
    seconds: 5,
    /** The boss and the target each go down to this many hits here. invented */
    bossHits: 2,
  },
  /** M12 boss-halo clips 6-7: the sword dive and the teleport. invented */
  duel: {
    /** Rising with the sword before the dive (the telegraph), the dive itself, the pause after (s). */
    windup: 0.6,
    dive: 0.32,
    recover: 1.1,
    /** Bullet hits that make him teleport away. */
    hitsToTeleport: 3,
    /** boss-clown clip 4: the zombie mini-boss with the sign takes 10% damage until it's out of his hands. */
    signArmour: 0.1,
  },
  /** M11 world-improbability-mode (src/sim/improbability.ts). */
  improbability: {
    /** Knockback x2.3-2.5: a punch sends a body ~9 H/s vs ~4 normally (ep3 f2385-f2404). */
    knockback: 2.4,
    /** Wall and ceiling bounce (normal mode: 0.2, the body all but stops). PLAN.md M11 */
    restitution: 0.8,
    /** A body hitting the ceiling at least this fast sticks there this often (ep3: one does). invented */
    stickSpeed: 5,
    stickChance: 0.1,
    /** Enemies flying in out of control (H/s). invented */
    flyInSpeed: 8,
    flyInLift: 4,
  },
  /** M11 enemy-sun-brute, our vending machine: ~6 melee hits (invented), big slow knockdown punches. */
  brute: { hp: 6, reach: 1.0, speed: 0.55 },
  /** M11 world-arena-collapse. */
  collapse: {
    /** The crack telegraph before the floor goes (s). PLAN.md M11 ~1 s */
    crack: 1.0,
    /** Falling into the void: acceleration (H/s^2) and how long until it's gone (s). invented */
    fallSpeed: 14,
    fallTime: 1.0,
  },
  /** M11 world-falling-hazard: the tank. */
  fallingBlock: {
    /** Shadow before it drops (s): the note's 0.5-1.0 s. */
    shadow: 0.9,
    height: 7,
    fallSpeed: 16,
    /** Footprint half-sizes and height of the landed tank (H): tall enough to pin against. own design */
    halfX: 1.1,
    halfZ: 0.42,
    top: 1.25,
  },
  /** M10 world-elevator-fight (src/sim/elevator.ts). Timings invented unless noted. */
  elevator: {
    /** Shaft scroll while the cab climbs (H/s), and the fall. */
    speed: 1.6,
    fallSpeed: 14,
    fallAccel: 20,
    /** The fall lasts this long before the crash (s). */
    fallTime: 1.3,
    /** enemy-welder: the cut takes ~2.7 s (ep2 f4410-f4490). */
    cut: 2.7,
    /** Hits the cables take before they part. */
    cableHits: 3,
    /** Pulling up through the hatch (H/s); E works this far round the hole (H). */
    climbSpeed: 2.2,
    hatchSlack: 0.3,
  },
  /** M10 world-interrogate-knockout. invented */
  interrogate: {
    /** A hold-up: the last enemy is unarmed and a player with a gun stands this close, facing him. */
    holdUpRange: 2.4,
    /** E this close to a surrendered enemy starts the interrogation. */
    talkRange: 1.1,
    /** Each speech bubble shows this long (s). */
    bubble: 1.3,
    /** Dazed: a non-lethal knockdown with stars (s). */
    dazed: 5,
  },
  /** M9 stages as room graphs (src/sim/stage.ts). */
  stage: {
    /** Ink wipe: covers the screen in this long, uncovers in the same (decided 2026-10-27: ~0.35 s). */
    wipe: 0.35,
    /** Walking out / starting the climb before the wipe starts (s). invented */
    traverse: 0.45,
    /**
     * Co-op exits (playtest 2026-10-27): at a ceiling vent the boost works this far from the
     * braced partner (H); he is pulled up this long after the boost (s); a player gone ahead into
     * a wall vent is out of sight after this long (s). invented
     */
    boostReach: 1.1,
    pullDelay: 0.7,
    crawlHide: 0.45,
    /** move-climb-vault: ladder ~1.1 H/s (ep2 f990-f1040); the vault over the parapet ~1 s (f1090-f1130). */
    climbSpeed: 1.1,
    vaultTime: 0.9,
    vaultDistance: 1.0,
    vaultHeight: 0.6,
    /** Dropping in through a vent or a breach starts this high (H). invented */
    dropHeight: 2.6,
    /** world-breach: enemies in a room entered from above are caught off guard this long (s). invented */
    surprise: 1.0,
    /** move-fall-transition: falling in from the sky starts this high (H, above the frame); a shove over the edge (H/s). invented */
    skyHeight: 5,
    shoveSpeed: 5,
  },
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
    sight: 4,
    sightDepth: 1.5,
    notice: 0.3,
    /** A loud death alerts unaware enemies within this distance (H); seeing one alerts others within it. invented */
    hearDeath: 3.5,
    /** Patrols walk at this command share and wait at each end. invented */
    patrolSpeed: 0.35,
    patrolWait: 1.2,
  },
  /** M7 zombies (enemy-zombie). */
  zombie: {
    /** M14: an armed zombie (ep4's raised agent with a rifle) aims this long before it fires (s). invented */
    gunTelegraph: 0.6,
    /** enemy-zombie: bolt -> standing ~1.0 s (ep1 f1485-f1520). */
    rise: 1.0,
    /** enemy-zombie: walk 0.7-0.9 H/s (ep1 f1525-f1555), as a share of the calm walk (zombies never combat-walk). */
    speed: 0.8 / 1.1,
    /** enemy-zombie: ~3 bullet hits; a melee weapon takes 2 (the note's 1-3 axe hits). invented split */
    hp: 3,
    weaponHit: 1.5,
    /** Headless, it takes one more hit (enemy-zombie, invented). */
    headlessHp: 0.5,
    /** Light hits only make it twitch (no stun lock). invented */
    flinch: 0.12,
    /** A melee weapon within this distance is taken up on rising. invented */
    weaponReach: 0.6,
  },
  /** M8 stage-1 boss, the hovering necromancer (boss-halo, design/art-direction.md). */
  boss: {
    /** Drawn and hit 1.1 H tall (style frame "Stage 1 cast"). own design */
    scale: 1.1,
    /** boss-halo: floats down from above the frame, ep1 f1420-f1440 (0.67 s). Starts above the screen top. */
    descend: 0.67,
    startHeight: 4.8,
    /** M9 cameo: rises back out of the frame at this speed (H/s). invented */
    leaveSpeed: 6,
    /** M9 boss-halo clip 5: the fling covers ~3.6 H in ~0.33 s (ep2): 3.0 in the air + the skid. Wind-up and mass raise (s). */
    fling: { distance: 3.0, airtime: 0.33, windup: 0.35 },
    /** `club` = the stage 4 club's whole-room raise (ep4 2:34, wiki 19 zombies). */
    massRaise: { max: 8, cast: 0.6, club: 19 },
    /** Hover height under his feet and its bob (H, s). style frame, invented */
    hover: 0.14,
    hoverBob: 0.03,
    hoverRate: 2.4,
    /** Raise telegraph: the hand goes up with a crackle this long before the bolt (s). invented within ep1 f1450-f1480 */
    castTime: 0.8,
    /** boss-halo: the bolt shows 2 frames (30 fps). */
    boltTime: 2 / 30,
    /** Stage 1 raises 1-2 zombies (ep1: two in all). At most this many alive at once. */
    maxZombies: 2,
    /** First raise after landing, then one every... (s). invented */
    firstRaise: 1.0,
    raiseEvery: 6,
    /** Raise targets within this distance of him (H). invented: the whole arena */
    raiseRange: 8,
    /** boss-halo: the shield stays up ~1 s (ep1 f1659-f1699), then a window before it can rise again (s). window invented */
    wardUp: 1.0,
    wardWindow: 1.5,
    /** Fade of the ward drawing in / out (s). invented */
    wardFade: 0.12,
    /** It comes up when someone with a gun is on its side within this distance (H). invented */
    wardThreat: 7,
    /** Ward diamond, boss-local (H, before scale): centre and half sizes (style frame). */
    ward: { x: 0.54, y: -0.62, hw: 0.25, hh: 0.68 },
    /** Head hits (any bullet or thrown gun to the head while the ward is down) to kill him. invented */
    hp: 3,
    /**
     * Lightning strike (boss-halo clip 2, ep1 f1729-f1739: knockdown + the gun flies off). Same hand-up
     * telegraph as the raise; the bolt lands where the target stood when he raised his hand, so
     * moving dodges it. Timings invented; ep1 strikes right after his shield drops.
     */
    strike: { first: 3, every: 5, afterWard: 0.4, range: 8, radius: 0.55, depthBand: 0.35 },
    /**
     * Hover dash -> grab (boss-halo clip 3): ~2-2.5 H in 0.27 s (ep1 f1929-f1939). Wind-up, stopping
     * short, grab reach and cooldowns invented.
     */
    dash: { range: 2.6, depthBand: 1.0, first: 2, windup: 0.25, time: 0.27, stopShort: 0.45, reach: 0.65, grabBand: 0.35, coolHit: 6, coolMiss: 3, recover: 0.6 },
    /**
     * Body slams (ep1 f1949-f2099): 5-6 slams, one per 0.5-0.67 s, alternating sides, then a throw
     * onto the pile (f2109-f2139). Mashing (any button) takes a slam off per `mashPer` presses down
     * to `minSlams`. The whole grab costs the hero one life, on the throw. invented
     */
    slam: { count: 6, every: 0.58, lift: 0.4, mashPer: 3, minSlams: 2, throwBoost: 2, recover: 0.8 },
    /**
     * Phase 2 (research/stages.md beat 4): starts at his first head wound, or after `after` s of
     * fighting. He sweeps the corpses off the screen (ep1 f2229-f2259; boss-halo: the push covers
     * ~3.6 H in ~0.33 s), then summons the cannon. Wind-up and hop invented.
     */
    sweep: { after: 30, windup: 0.5, speed: 11, hop: 1.2 },
    /**
     * The summoned cannon (ep1 f2279-f2399, world-falling-hazard): its shadow first (0.5-1.0 s), then
     * it drops onto its stand beside him and crushes whatever is under it. He hovers behind it and
     * fires ~4 balls one per 1.3 s (TUNING.cannon), the barrel swinging to the target's depth within
     * `aimBand`. Then a new volley every `every` s. Placement, fall speed, aim swing invented.
     */
    cannon: { offset: 1.0, shadow: 0.8, dropHeight: 6, fallSpeed: 14, crushRadius: 0.6, crushBand: 0.4, shots: 4, firstShot: 0.6, every: 9, behind: 0.75, aimBand: 0.8, landShake: 12 },
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
    /** M17 (design/qol-pass.md): the hero's melee depth band is wider than the enemies' 0.2 H. invented */
    hero: { depthBand: 0.3 },
  },

  /** M17 quality-of-life pass (design/qol-pass.md). All invented. */
  qol: {
    /** Your own thrown gun isn't auto-picked up again for this long (s). */
    ownThrowIgnore: 1.0,
    /** Smart swap: a one-handed melee weapon scores this (an empty gun 0, a full gun with a spare 1). */
    meleeSwapScore: 0.6,
    /** E held this long (s) with both hands full shows the hand chooser. */
    holdShow: 0.18,
    /** Depth snap: targets within this depth (H) and this far past the reach (H) are snapped to, at this speed (H/s), at most this far (H) per attack. */
    snapBand: 0.5,
    snapAhead: 0.3,
    snapSpeed: 3.0,
    snapMax: 0.3,
    /** ...and only until he's this close in depth (H). */
    snapNear: 0.1,
    /** No muzzle-to-cursor correction when the cursor is closer to the muzzle than this (H, screen-scaled). */
    aimMinDist: 0.3,
    /** Throws find depth: an enemy within this of the cursor (H at his depth) and this depth (H) is the target. */
    throwMagnet: 0.35,
    throwDepth: 1.2,
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

  /**
   * M10b combos & fatalities (design/combos-and-fatalities.md, PLAN.md M10b). All invented unless
   * a reference frame is named.
   */
  juggle: {
    /** The launcher: an uppercut on a stunned grunt deals this (not the usual 2+1), so he goes up alive. */
    launchDamage: 1,
    /** Each light jab on a launched grunt keeps him up this much longer (s), at most `maxJabs` times; jabs deal no damage. */
    jabAir: 0.15,
    maxJabs: 3,
    /** Punches reach a juggled grunt this far from the fist (H) and up to this height (feet, H). */
    reachX: 0.5,
    reachUp: 1.6,
    /** A punch that launches or jabs a juggled grunt ends this soon after it connects (s), so the next one fits. */
    cancel: 0.08,
    /** Share of the uppercut's forward drift a launched (juggled) grunt keeps. */
    drift: 0.3,
    /** A heavy that doesn't kill spikes him into the floor at this speed (H/s); he bounces up this fast (H/s). */
    spikeSpeed: 7,
    spikeBounce: 1.6,
    /** Wall bounce (ep3 f2350-f2510): sub-lethal slams at this speed or more (H/s) come back this elastic, and pop up this fast. */
    bounceMinSpeed: 1.2,
    wallBounce: 0.55,
    bounceUp: 2.6,
    /** Pop & catch (ep2 f3060-f3140): a knocked-away weapon goes up about this high (H). */
    popHeight: 1.0,
    /** ...and it's yours for this long (s): enemies don't scavenge it meanwhile (they never catch). */
    popReserve: 3.0,
    /** Head punt (ep1 f1929): the head leaves along the hit at this speed (H/s). */
    puntSpeed: 6,
    /** Over-the-shoulder (ep3 f6660-f6710): an enemy within this distance behind you (H) can be shot without turning. */
    backReach: 0.6,
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

  /**
   * Flying kick (playtest 2026-10-27): dive in mid-air. A lunge along the facing, the foot out;
   * the first enemy it meets takes a heavy blow (knockdown) and the kicker bounces off. invented
   */
  flyKick: {
    /** Forward speed of the lunge (H/s) and the most it may still rise (H/s). */
    speed: 4.2,
    maxRise: 0.6,
    /** The foot: ahead of the body and up from the feet (H), contact radius. */
    reach: 0.42,
    height: 0.38,
    radius: 0.24,
    /** Bounce off whoever was kicked (H/s back, H/s up). */
    bounceBack: 1.2,
    bounceUp: 2.2,
    /** How far the body leans back for the kick (rad). */
    lean: 0.35,
  },

  /** melee-grab-throw. */
  grab: {
    /** "contact range": same reach as a punch. invented */
    range: 0.6,
    /**
     * Grab assist (playtest 2026-10-27, "less precise"): F takes the nearest target within this
     * radius (H, either side) and this depth (H): living enemies first, then bodies, then heads.
     * A grab pressed during a move is kept this long (s) and fires when the move ends. invented
     */
    assistRadius: 1.1,
    assistDepth: 0.45,
    buffer: 0.25,
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
    /** M8 wave B: a grunt taking over the cannon fires his first ball this long after he's in place (s). invented */
    cannonWindup: 0.8,
    /** combat-cover: share of gun grunts that kick a table over for cover. invented (the note's one in four) */
    flipChance: 0.25,
    /** PLAN.md M7: one enemy grenade per encounter (wave); chance per aim opportunity to lob it instead. invented */
    grenadeChance: 0.2,
    /** Grenades are lobbed at players 2.5-4 H away with no other grunt within this of the player. invented */
    grenadeRange: [2.5, 4] as const,
    grenadeClear: 2.2,
    /** Cook before the lob (s). invented */
    grenadeCook: 0.35,
    /** enemy-squad-leader: the squad waits within this of its leader (half-width), fights anyone within `squadEngage`. invented */
    squadSpread: 1,
    squadEngage: 1.4,
    /** enemy-elite-bodyguard: distance from the VIP (each guard on one side). invented */
    guardGap: 0.8,
    /** enemy-elite-bodyguard: hits to kill (invented; a head shot always kills). */
    bodyguardHits: 2,
    /** M9 boss-clown: the riot-helmet mini-boss takes 2 rifle head shots or 4 to the body. invented */
    riotHp: 8,
    /**
     * M14 enemy-agent: survives at least two head wounds (ep4 1:15-1:16), so 12 hp = 3 head shots;
     * fights hand to hand inside `closeRange` (H), the heavy pistol beyond; blunt weapons hit him
     * twice as hard (the episode's baton kill). All invented.
     */
    agent: { hp: 12, closeRange: 3, bluntScale: 2 },
    /**
     * M14 world-crowd-dancefloor: a crowd's grunts without an attack token wait closer in than the
     * usual ring and shove (no damage) when right next to the player. All invented.
     */
    crowd: { ring: 0.8, shoveRange: 0.75, shove: 0.3, shoveEvery: [1.2, 2.2] as const },
    /** M7 ranged grunts (enemy-grunt-armed). */
    ranged: {
      /** Keep this far from the player in x (H): pistols/rifles, and shotguns (close range). invented within the note's 3-5 H */
      keep: [3, 5] as const,
      keepShotgun: [1.4, 2.4] as const,
      /** M9 boss-clown: the riot-helmet mini-boss walks right in, firing (ep2 1:51). invented */
      keepRiot: [1.0, 1.8] as const,
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
    /**
     * Spawn variety (playtest 2026-10-27: "they come in one at a time and I spam head shots"):
     * a wave's entries arrive in seeded groups, spread over the room's spawn points, now and then
     * one from behind the player; low alive counts bring the next group sooner. Waves marked
     * `exact` keep their scripted order. Not from the show. All invented.
     */
    variety: {
      /** 1 = groups/spread/flanks; 0 = the old single-file trickle (A/B switch). invented */
      on: 1,
      /** Group size (members), seeded per group; capped by the wave's maxAlive. invented */
      groupMin: 2,
      groupMax: 3,
      /** Seconds between members of one group (seeded each). invented */
      jitterMin: 0.15,
      jitterMax: 0.45,
      /** Seconds between groups, seeded; scaled by the wave's own mean entry delay / 1 s. invented */
      gapMin: 1.2,
      gapMax: 2.6,
      /** Chance a group splits over several spawn points (else all through one, a step apart). invented */
      split: 0.7,
      /** Chance a group sends one member in from the side behind the player (with a cue). invented */
      flank: 0.3,
      /** A flanker arrives at least this long after his cue (door sound / whistle + HUD arrow). invented */
      flankLead: 0.7,
      /** Pressure: with this many or fewer alive, the gap to the next group runs pressureRate x faster. invented */
      pressureAlive: 1,
      pressureRate: 3,
      /** A ready group that doesn't fit under maxAlive waits this long, then sends whoever fits. invented */
      holdMax: 1.2,
      /** No entry this close (H in x, and 1 H in depth) to a player while another point is free. invented */
      safeDist: 1.3,
      /** Group members' first shot / swing waits this much longer per place in the group. invented */
      settleStep: 0.3,
    },
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
    /** M18 co-op moves (design/coop-moves.md). All invented. */
    /** The cursor counts as on your partner within this of his hurtbox (H, at his depth). */
    aimSlack: 0.3,
    /** Hold & hit: the partner's 3rd light hit kills a held grunt; a held grunt hit this often dies on any impact when thrown. */
    held: { killHits: 3, tenderHits: 2 },
    /** Ping-pong: a body flying into a partner within this (H) bounces off him this elastic, at most `maxPings` times; the partner's heavy bats it at `batSpeed` (H/s). */
    pingPong: { reachX: 0.35, band: 0.3, restitution: 0.65, maxPings: 4, batSpeed: 6 },
    /** Wishbone: both grab within `window` (s); brace, pull, recover (s); the halves fly apart at `halfSpeed` (H/s). */
    wishbone: { window: 0.5, brace: 0.2, pull: 0.25, recover: 0.3, halfSpeed: 2.2 },
    /** Weapon pass: speed (H/s), arc apex (H), lead on the partner's motion (share), homing (H/s^2), range (H). */
    pass: { speed: 7, apex: 0.35, lead: 1, homing: 1.0, range: 6 },
    /** Body bat: the batted body leaves at this share of its speed, at least `minSpeed` (H/s); fist slack (H); spin x. */
    bat: { speedScale: 1.5, minSpeed: 8, slack: 0.15, spinScale: 2 },
    /** Double-team: both players hit the same enemy within this (s); tough ones take +toughBonus instead of dying. */
    double: { window: 0.25, toughBonus: 2 },
    /** Hero toss: the lift (s), carry speed share, throw speed (H/s), launch height and vy (H, H/s), share of gravity in flight (flat, at kick height), longest flight (s), landing recovery (s), hit radius (H). */
    toss: { lift: 0.25, carrySpeed: 0.6, speed: 9, launchY: 0.45, vy: 0.6, gravity: 0.25, maxFlight: 0.9, recover: 0.2, hitRadius: 0.4 },
    /** Carry-spin: orbit radius (H), seconds per turn, carrier walk share, max time (s), fire only past this |cos|, the sweep band (H) and arc (rad), sweep and release speeds (H/s). */
    spin: { radius: 0.75, period: 1.2, walk: 0.6, maxTime: 4, fireCos: 0.38, sweepIn: 0.45, sweepOut: 1.1, sweepArc: 0.3, sweepSpeed: 5, release: 9 },
  },

  /**
   * M19 rage meter and rage fatalities (design/rage.md). All invented except `base`, the user's 10%.
   * Gain: a kill whose type isn't one of the last `recent` gives base + streakStep x min(streak, streakMax).
   */
  rage: {
    base: 0.10, streakStep: 0.05, streakMax: 3, recent: 2,
    styleBonus: 0.05, teamBonus: 0.05, multi: 0.03, bossBonus: 0.2,
    /** Victims at most, and the stun the frozen bystanders get when the world resumes (s). */
    cap: 6, aftershock: 0.4,
    /** Victims must be on screen, with this margin (H). */
    screenMargin: 0.3,
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

// dev: the F6 tuning panel's saved numbers (src/dev/overrides.ts), before anything is derived from them
applyOverrides('TUNING', TUNING);

/** Derived jump physics: apex h and airtime T give v0 = 4h/T and g = 8h/T^2. */
export const JUMP_V0 = (4 * TUNING.jump.apex) / TUNING.jump.airtime;
export const GRAVITY = (8 * TUNING.jump.apex) / TUNING.jump.airtime ** 2;
