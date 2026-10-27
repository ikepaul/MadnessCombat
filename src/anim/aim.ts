// Aim rig (PLAN.md M5, design/art-direction.md "Animation"): the gun hand sits on a circle
// around the shoulder, pointing at the aim point (reach 0.36 H pistols, 0.3 H long guns).
// Shared by the painter and the sim's hitscan, so the tracer leaves the drawn muzzle.
// Local space: +x toward the facing side, -y up, origin between the feet; screen = project().
import { TUNING } from '../data/tuning';
import type { WeaponDef } from '../data/weapons';
import type { ScreenPoint } from '../render/camera';
import { type Root, rootToWorld } from './skeleton';

/** Shoulders of the front (hand 0) and back (hand 1) hand. */
export const SHOULDERS: [ScreenPoint, ScreenPoint] = [[0.03, -0.5], [-0.05, -0.52]];

/** Prone aim range (local angle, negative = up): no aiming behind or into the floor. invented */
export const PRONE_ARC: [number, number] = [-1.1, 0.25];
/** Prone: how far past the lying shoulder the arms reach out (local, H). invented */
export const PRONE_REACH: [number, number] = [0.32, 0.05];

/** A shoulder where the lying pose puts it (local, -y up). */
export function proneShoulder(root: Root, hand: 0 | 1): ScreenPoint {
  const [x, y] = rootToWorld(root, 1, SHOULDERS[hand][0], SHOULDERS[hand][1]);
  // the arms reach out past the head (the head is right where the shoulders turn to)
  return [x + PRONE_REACH[0], -y + PRONE_REACH[1]];
}

export interface Rig {
  /** Aim angle in local space (0 = straight ahead, negative = up, beyond +-pi/2 = behind). */
  angle: number;
  /** Hand (grip) position, local. */
  hand: [number, number];
  /** Pointing behind the body: the gun is mirrored so its grip still hangs down. */
  flip: boolean;
  /** Muzzle and ejection port on screen. */
  muzzle: ScreenPoint;
  eject: ScreenPoint;
}

/**
 * Rig for one hand. `foot` = the actor's projected floor point, `s` = px per H at its depth,
 * `target` = the aim point on screen, `kick` = recoil (H, pulls the hand back along the barrel).
 * The front hand always aims to the facing side (facing follows the cursor); the back hand may
 * aim behind the body (split aim: one gun each way, gun-dual-wield).
 */
export function aimRig(foot: ScreenPoint, s: number, facing: 1 | -1, hand: 0 | 1, target: ScreenPoint, w: WeaponDef, kick = 0, prone?: Root): Rig {
  const [sx, sy] = prone ? proneShoulder(prone, hand) : SHOULDERS[hand];
  const lx = ((target[0] - foot[0]) / s) * facing, ly = (target[1] - foot[1]) / s;
  let angle = Math.atan2(ly - sy, hand === 0 || prone ? Math.max(0.05, lx - sx) : lx - sx);
  // lying on the belly (playtest 2026-10-27): both guns point ahead, from a little down to well up
  const clampProne = (v: number) => (prone ? Math.max(PRONE_ARC[0], Math.min(PRONE_ARC[1], v)) : v);
  angle = clampProne(angle);
  const place = (ang: number) => {
    const flip = Math.cos(ang) < 0;
    const c = Math.cos(ang), n = Math.sin(ang), r = w.reach - kick;
    const hx = sx + c * r, hy = sy + n * r;
    const local = (px: number, py: number): [number, number] => {
      const qy = flip ? -py : py;
      return [hx + px * c - qy * n, hy + px * n + qy * c];
    };
    return { flip, hx, hy, local };
  };
  // M17 (design/qol-pass.md 6): the barrel sits off the shoulder line, so turn the gun until the
  // muzzle points straight at the target (the bullet then lands on the cursor); skipped up close
  for (let k = 0; k < 4; k++) {
    const [mx, my] = place(angle).local(w.muzzle[0], w.muzzle[1]);
    if (Math.hypot(lx - mx, ly - my) < TUNING.qol.aimMinDist) break;
    const want = Math.atan2(ly - my, lx - mx);
    const d = Math.atan2(Math.sin(want - angle), Math.cos(want - angle));
    if (Math.abs(d) > 0.6) break;
    angle = clampProne(angle + d);
  }
  const { flip, hx, hy, local } = place(angle);
  const toScreen = (px: number, py: number): ScreenPoint => {
    const [x, y] = local(px, py);
    return [foot[0] + x * s * facing, foot[1] + y * s];
  };
  return { angle, hand: [hx, hy], flip, muzzle: toScreen(w.muzzle[0], w.muzzle[1]), eject: toScreen(w.eject[0], w.eject[1]) };
}
