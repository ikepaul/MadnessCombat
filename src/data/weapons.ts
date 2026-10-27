// Guns (PLAN.md M5, research/mechanics/gun-*). Measured values cite their note; the rest is
// marked invented. Geometry (length, muzzle, grip) is shared by the painter and the sim's aim
// rig, so the tracer starts exactly at the drawn muzzle.
import { applyOverrides } from '../dev/overrides';

export type WeaponId = 'pistol' | 'pistolSuppressed' | 'deagle' | 'smg' | 'rifle' | 'mg' | 'shotgun' | 'sawedoff';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Long guns are held with both hands when carried alone. */
  oneHanded: boolean;
  /** Full auto while the button is held; otherwise one shot per press. */
  auto: boolean;
  /** Seconds between shots. */
  interval: number;
  mag: number;
  /** Seconds to reload (pump shotgun: per shell). */
  reload: number;
  pellets: number;
  /** Random spread per ray, degrees (+-). */
  spread: number;
  /** Damage to enemies: grunts (4 hp) die from 1 head or 2 body hits (decided 2026-10-26). */
  damageHead: number;
  damageBody: number;
  /** Hand distance from the shoulder when aiming (design/art-direction.md). */
  reach: number;
  /** Drawn length (H); muzzle point in hand space (grip at the origin, barrel along +x). */
  length: number;
  muzzle: [number, number];
  eject: [number, number];
  /** Walk speed factor while firing (machine gun). */
  firingWalk: number;
  suppressed: boolean;
  /** Screen shake per shot (design/art-direction.md effects table) and hand recoil kick (H). */
  shake: number;
  recoil: number;
}

const PISTOL_GEOM = { reach: 0.36, length: 0.25, muzzle: [0.2, -0.078] as [number, number], eject: [0.05, -0.1] as [number, number] };
const LONG_GEOM = { reach: 0.3, length: 0.55 };

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    // gun-pistol-suppressed: semi, min 0.15 s between shots (invented cap), mag 8 (invented)
    id: 'pistol', name: 'Pistol', oneHanded: true, auto: false, interval: 0.15, mag: 8,
    // gun-reload: pistol reload ~0.6 s, measured ep2 f1649-f1667
    reload: 0.6, pellets: 1, spread: 1, damageHead: 4, damageBody: 2, ...PISTOL_GEOM,
    firingWalk: 1, suppressed: false, shake: 2, recoil: 0.06,
  },
  pistolSuppressed: {
    id: 'pistolSuppressed', name: 'Suppressed pistol', oneHanded: true, auto: false, interval: 0.15, mag: 8, reload: 0.6,
    pellets: 1, spread: 1, damageHead: 4, damageBody: 2, ...PISTOL_GEOM, length: 0.36, muzzle: [0.33, -0.078],
    firingWalk: 1, suppressed: true, shake: 1, recoil: 0.04,
  },
  deagle: {
    // gun-pistol-suppressed: Desert Eagle, slow and powerful, mag 7; one-shots on the body. invented
    id: 'deagle', name: 'Desert Eagle', oneHanded: true, auto: false, interval: 0.35, mag: 7, reload: 0.7,
    pellets: 1, spread: 0.5, damageHead: 4, damageBody: 4, ...PISTOL_GEOM, length: 0.3, muzzle: [0.25, -0.085],
    firingWalk: 1, suppressed: false, shake: 4, recoil: 0.1,
  },
  smg: {
    // gun-hitscan-smg: 0.1 s auto, measured ep1 f1612-f1621; spread +-2 deg and mag 30 invented
    id: 'smg', name: 'SMG', oneHanded: true, auto: true, interval: 0.1, mag: 30, reload: 1.0, pellets: 1, spread: 2,
    damageHead: 4, damageBody: 2, reach: 0.34, length: 0.32, muzzle: [0.28, -0.07], eject: [0.08, -0.1],
    firingWalk: 1, suppressed: false, shake: 1, recoil: 0.03,
  },
  rifle: {
    // gun-auto-rifle: 0.1 s (the SMG's measured rate), 30 rounds, less spread than the SMG (invented)
    id: 'rifle', name: 'Rifle', oneHanded: false, auto: true, interval: 0.1, mag: 30, reload: 1.0, pellets: 1, spread: 1.2,
    damageHead: 4, damageBody: 2, ...LONG_GEOM, muzzle: [0.5, -0.06], eject: [0.12, -0.1],
    firingWalk: 1, suppressed: false, shake: 1.5, recoil: 0.035,
  },
  mg: {
    // gun-auto-rifle: machine gun 0.07 s, 100 rounds, slower walk while firing (invented)
    id: 'mg', name: 'Machine gun', oneHanded: false, auto: true, interval: 0.07, mag: 100, reload: 1.6, pellets: 1, spread: 2.5,
    damageHead: 4, damageBody: 2, ...LONG_GEOM, length: 0.6, muzzle: [0.56, -0.06], eject: [0.14, -0.1],
    firingWalk: 0.5, suppressed: false, shake: 1.5, recoil: 0.04,
  },
  shotgun: {
    // gun-shotgun: 5-6 near-parallel pellet rays +-4 deg, 0.6 s pump, 6 shells (invented)
    id: 'shotgun', name: 'Pump shotgun', oneHanded: false, auto: false, interval: 0.6, mag: 6, reload: 0.4, pellets: 6, spread: 4,
    damageHead: 4, damageBody: 2, ...LONG_GEOM, muzzle: [0.52, -0.06], eject: [0.15, -0.09],
    firingWalk: 1, suppressed: false, shake: 6, recoil: 0.1,
  },
  sawedoff: {
    // gun-shotgun: sawed-off, 2 shots then reload/throw; wider spread (invented)
    id: 'sawedoff', name: 'Sawed-off', oneHanded: true, auto: false, interval: 0.2, mag: 2, reload: 1.0, pellets: 6, spread: 6,
    damageHead: 4, damageBody: 2, reach: 0.34, length: 0.36, muzzle: [0.33, -0.06], eject: [0.08, -0.08],
    firingWalk: 1, suppressed: false, shake: 6, recoil: 0.1,
  },
};

export const GUNS = {
  /** design-decisions: a gun carries its magazine plus at most one spare. */
  maxSpare: 1,
  /** gun-dual-wield: long guns can be dual-wielded, with more spread (x this). invented */
  dualLongSpread: 2.5,
  /** gun-empty-throw: thrown guns fly straight (screen space) at this speed (H/s). invented */
  throwSpeed: 14,
  /**
   * Thrown gun damage: a body hit knocks down (invented). M10b click -> throw -> punch (PLAN.md):
   * a head hit no longer kills, it stuns like a punch and starts a chain (one heavy then kills).
   */
  throwHead: 1,
  throwBody: 1,
  /** gun-pickup-drop: pick-up reach on the floor (E, or automatic with empty hands). invented */
  pickupRange: 0.5,
  /** Non-lethal bullet hits make the target flinch this long. invented */
  flinch: 0.3,
  /** Bullet kills knock the body back this far over this airtime (bodies drop, they don't fly). invented */
  knockback: 0.7,
  knockbackAirtime: 0.25,
  /** Point-blank shotgun: within this distance the knockback is a heavy hit's, and a head hit bursts the head. invented */
  pointBlank: 1.2,
} as const;

/** Every weapon id, for pick-ups and the HUD. */
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function isWeapon(id: string): id is WeaponId {
  return id in WEAPONS;
}

// dev: the F6 tuning panel's saved numbers (src/dev/overrides.ts)
applyOverrides('GUNS', GUNS);
