import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { CAMERA, project, SCREEN_H, scaleAt, unprojectFloor } from '../src/render/camera';

// Acceptance values from design/art-direction.md (measured from the episodes).
describe('camera projection', () => {
  it('character is 0.247 of screen height at the front edge', () => {
    expect(scaleAt(TEST_ROOM.zFront) / SCREEN_H).toBeCloseTo(0.247, 3);
  });

  it('character is 0.185 of screen height at the back wall (depth scale 0.75)', () => {
    expect(scaleAt(TEST_ROOM.zBack) / SCREEN_H).toBeCloseTo(0.185, 3);
    expect(scaleAt(TEST_ROOM.zBack) / scaleAt(TEST_ROOM.zFront)).toBeCloseTo(0.75, 2);
  });

  it('horizon at 53% of screen height and eye 1.79 H above the floor', () => {
    expect(CAMERA.horizonY / SCREEN_H).toBeCloseTo(0.53, 2);
    expect(project(0, CAMERA.eyeHeight, 9)[1]).toBeCloseTo(CAMERA.horizonY, 6);
  });

  it('front edge of the floor sits near the bottom of the screen', () => {
    const [, y] = project(0, 0, TEST_ROOM.zFront);
    expect(y).toBeGreaterThan(1040);
    expect(y).toBeLessThan(SCREEN_H);
  });

  it('unprojectFloor inverts project on the floor plane', () => {
    const [sx, sy] = project(1.3, 0, 9.4);
    const p = unprojectFloor(sx, sy)!;
    expect(p.x).toBeCloseTo(1.3, 6);
    expect(p.z).toBeCloseTo(9.4, 6);
    expect(unprojectFloor(500, CAMERA.horizonY - 10)).toBeUndefined();
  });
});
