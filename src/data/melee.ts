// Melee weapons, throwables and grenades (PLAN.md M6, research/mechanics/melee-weapons,
// melee-environment-weapon, throw-knives, throw-grenade). Measured values cite their note; the
// rest is marked invented. Geometry (length, tip) is shared by the painter and the sim.

export type MeleeId = 'knife' | 'baton' | 'sword' | 'scimitar' | 'axe' | 'bat' | 'pipe' | 'sign';

export interface MeleeDef {
  id: MeleeId;
  name: string;
  /** Centre-to-centre reach of a swing (H). melee-weapons: 0.6-1.0 H; the street sign 1.5 H. */
  reach: number;
  /** Swing timing (s), on the 30 fps key grid. */
  startup: number;
  active: number;
  recovery: number;
  /** Damage of a swing: grunts have 4 hp, so 4 = one-hit kill (melee-weapons: "one hit usually kills"). */
  damage: number;
  /** Blades cut (slash, can take the head); blunt weapons smash. */
  edge: 'blade' | 'blunt';
  /** Hits everything in the arc, not just the nearest (long weapons). */
  multiHit: boolean;
  /** Held in both hands (the other hand must be empty). */
  twoHanded: boolean;
  /** Thrown blades stick in bodies and walls (knife, axe: melee-weapons "can lodge"). */
  sticks: boolean;
  /** Drawn length (H), grip at the origin, blade/head along +x. */
  length: number;
  /** Depth band of a swing (long weapons sweep wider). */
  depthBand: number;
}

const F = 1 / 30;

export const MELEE: Record<MeleeId, MeleeDef> = {
  // throw-knives: stab at <= 0.6 H; one-hit kill. Timing = the light jab (invented split)
  knife: { id: 'knife', name: 'Knife', reach: 0.6, startup: 3 * F, active: 3 * F, recovery: 5 * F, damage: 4, edge: 'blade', multiHit: false, twoHanded: false, sticks: true, length: 0.22, depthBand: 0.2 },
  // melee-weapons: baton = fast short melee (invented timing)
  baton: { id: 'baton', name: 'Baton', reach: 0.7, startup: 4 * F, active: 3 * F, recovery: 6 * F, damage: 4, edge: 'blunt', multiHit: false, twoHanded: false, sticks: false, length: 0.42, depthBand: 0.2 },
  sword: { id: 'sword', name: 'Sword', reach: 0.95, startup: 5 * F, active: 3 * F, recovery: 7 * F, damage: 4, edge: 'blade', multiHit: false, twoHanded: false, sticks: false, length: 0.62, depthBand: 0.22 },
  scimitar: { id: 'scimitar', name: 'Scimitar', reach: 0.9, startup: 5 * F, active: 3 * F, recovery: 7 * F, damage: 4, edge: 'blade', multiHit: false, twoHanded: false, sticks: false, length: 0.58, depthBand: 0.22 },
  // melee-weapons: axe = slow heavy, throwable, lodges
  axe: { id: 'axe', name: 'Axe', reach: 0.85, startup: 7 * F, active: 3 * F, recovery: 9 * F, damage: 4, edge: 'blade', multiHit: false, twoHanded: false, sticks: true, length: 0.55, depthBand: 0.22 },
  bat: { id: 'bat', name: 'Bat', reach: 0.9, startup: 6 * F, active: 3 * F, recovery: 8 * F, damage: 4, edge: 'blunt', multiHit: false, twoHanded: false, sticks: false, length: 0.6, depthBand: 0.22 },
  pipe: { id: 'pipe', name: 'Pipe', reach: 0.85, startup: 6 * F, active: 3 * F, recovery: 8 * F, damage: 4, edge: 'blunt', multiHit: false, twoHanded: false, sticks: false, length: 0.58, depthBand: 0.22 },
  // melee-environment-weapon: reach 1.5-1.6 H (ep3 f3330-f3410), multi-hit sweep, ~0.5 s swing (invented split)
  sign: { id: 'sign', name: 'Street sign', reach: 1.55, startup: 7 * F, active: 4 * F, recovery: 6 * F, damage: 4, edge: 'blunt', multiHit: true, twoHanded: true, sticks: false, length: 1.5, depthBand: 0.3 },
};

export const MELEE_IDS = Object.keys(MELEE) as MeleeId[];

export function isMelee(id: string): id is MeleeId {
  return id in MELEE;
}

/** Throwing (throw-knives, melee-weapons). */
export const THROWN = {
  /** throw-knives: wind-up 0.1-0.15 s (ep3 f746-f749). */
  windup: 4 * F,
  recovery: 6 * F,
  /** throw-knives: knife speed 12-15 H/s, measured ep3 f749-f753. */
  knifeSpeed: 13,
  /** Other thrown melee weapons fly a bit slower. invented */
  speed: 11,
  /** throw-knives: "slight drop": this share of gravity. invented */
  gravityShare: 0.15,
  /** Flight before the item falls normally. invented */
  maxFlight: 1.2,
  /** throw-knives: pull a knife out of a corpse or a wall ~0.5 s, ep3 f840-f950. */
  pull: 0.5,
  /** Reach for pulling a stuck blade / the planted sign (E). invented */
  pullRange: 0.6,
  /** throw-catch-return: F with an empty hand within this long before a thrown object arrives. invented */
  catchWindow: 0.15,
  /** F also snatches any weapon flying within this reach of the hands, your own included. invented */
  catchReach: 0.5,
  /** Your own throw can't be caught back for this long after it leaves the hand. invented */
  ownCatchDelay: 0.25,
} as const;

/** throw-grenade, throw-grenade-return. */
export const GRENADE = {
  /**
   * Seconds from the pin. research/mechanics/throw-grenade measured ~1.1 s; raised (playtest
   * 2026-10-27) so cooking has room and an enemy grenade lands with ~1.5 s left to throw it
   * back (enemies cook 0.35 s, the lob flies ~0.7 s). invented
   */
  fuse: 2.5,
  /** throw-grenade: blast radius ~2 H, ep1 f1392-f1404. */
  radius: 2.0,
  /** Corpses this close to the blast are gibbed (can't be raised). invented */
  gibRadius: 1.2,
  /** throw-grenade: bodies thrown ~1.5 H up, ep1 f1392-f1404. */
  launchHeight: 1.5,
  /** Outward drift of thrown bodies. invented */
  launchDistance: 1.4,
  /** throw-grenade: max lob distance ~4 H (the show only lobs ~1.4 H). invented */
  maxRange: 4,
  /** The hero throws farther, about the width of a room (playtest 2026-10-27). invented */
  playerRange: 7,
  /** Airtime of a lob: base + per H of distance. invented */
  lobTime: 0.4,
  lobTimePerH: 0.08,
  /** throw-grenade: pin pull -> release ~0.35 s, ep1 f1360-f1370 (the lob clip). */
  lobWindup: 3 * F,
  lobRecovery: 6 * F,
  /** Live grenade on the floor: pick-up reach with F. invented */
  pickRange: 0.6,
} as const;

/** combat-disarm, combat-human-shield. */
export const DISARM = {
  /** combat-disarm: grab on an armed enemy = steal, 0.4 s. invented */
  steal: 0.4,
  /** The robbed enemy reels this long. invented */
  stealStun: 0.5,
  /** combat-disarm: punches knock the weapon away 30% of the time (kicks/sweeps always). invented */
  punchChance: 0.3,
  /** Hit radius of a held weapon for "shot out of the hand" (H). invented: small, needs precision */
  weaponRadius: 0.045,
} as const;

export const SHIELD = {
  /** combat-human-shield: a body absorbs ~30 hits before it falls apart. invented */
  hits: 30,
} as const;
