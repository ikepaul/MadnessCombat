// Aim rig (PLAN.md M5, design/art-direction.md "Animation"): the gun hand sits on a circle
// around the shoulder, pointing at the aim point (reach 0.36 H pistols, 0.3 H long guns).
// Shared by the painter and the sim's hitscan, so the tracer leaves the drawn muzzle.
// Local space: +x toward the facing side, -y up, origin between the feet; screen = project().
import type { WeaponDef } from '../data/weapons';
import type { ScreenPoint } from '../render/camera';

/** Shoulders of the front (hand 0) and back (hand 1) hand. */
export const SHOULDERS: [ScreenPoint, ScreenPoint] = [[0.03, -0.5], [-0.05, -0.52]];

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
export function aimRig(foot: ScreenPoint, s: number, facing: 1 | -1, hand: 0 | 1, target: ScreenPoint, w: WeaponDef, kick = 0): Rig {
  const [sx, sy] = SHOULDERS[hand];
  const lx = ((target[0] - foot[0]) / s) * facing, ly = (target[1] - foot[1]) / s;
  const angle = Math.atan2(ly - sy, hand === 0 ? Math.max(0.05, lx - sx) : lx - sx);
  const flip = Math.cos(angle) < 0;
  const c = Math.cos(angle), n = Math.sin(angle), r = w.reach - kick;
  const hx = sx + c * r, hy = sy + n * r;
  const toScreen = (px: number, py: number): ScreenPoint => {
    const qy = flip ? -py : py;
    const x = hx + px * c - qy * n, y = hy + px * n + qy * c;
    return [foot[0] + x * s * facing, foot[1] + y * s];
  };
  return { angle, hand: [hx, hy], flip, muzzle: toScreen(w.muzzle[0], w.muzzle[1]), eject: toScreen(w.eject[0], w.eject[1]) };
}
