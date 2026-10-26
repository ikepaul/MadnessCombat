// The one world -> screen mapping. Values measured from the episodes (design/art-direction.md):
// horizon at 53% of screen height, eye 1.79 H above the floor, focal length 2136 px at 1080p,
// walkable floor from z = 8 H (character = 0.247 screen height) to the back wall at z = 10.67 H
// (0.185 screen height). No Phaser imports: the sim uses this for screen-space hit tests.

export const SCREEN_W = 1920;
export const SCREEN_H = 1080;

export const CAMERA = {
  focal: 2136,
  centerX: SCREEN_W / 2,
  horizonY: 572, // 0.53 * 1080
  eyeHeight: 1.79,
} as const;

export type ScreenPoint = [number, number];

/** World (x, y, z) in H units -> screen pixels. z is the distance from the camera. */
export function project(x: number, y: number, z: number): ScreenPoint {
  return [CAMERA.centerX + (CAMERA.focal * x) / z, CAMERA.horizonY + (CAMERA.focal * (CAMERA.eyeHeight - y)) / z];
}

/** Pixels per H at depth z. */
export function scaleAt(z: number): number {
  return CAMERA.focal / z;
}

/** Screen point -> point on the floor plane (y = 0). Undefined above the horizon. */
export function unprojectFloor(sx: number, sy: number): { x: number; z: number } | undefined {
  const dy = sy - CAMERA.horizonY;
  if (dy <= 0) return undefined;
  const z = (CAMERA.focal * CAMERA.eyeHeight) / dy;
  return { x: ((sx - CAMERA.centerX) * z) / CAMERA.focal, z };
}
