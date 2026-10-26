import type { RoomDef } from '../../sim/room';

/** The style-frame room (design/style-frame): used by M0 and the look check. */
export const TEST_ROOM: RoomDef = {
  id: 'test-room',
  halfWidth: 3.6,
  height: 3.8,
  zFront: 8,
  zBack: 10.67,
  doors: [
    { wall: 'left', z0: 8.55, z1: 9.3, height: 1.9, open: true },
    { wall: 'right', z0: 8.7, z1: 9.45, height: 1.9, open: false },
  ],
  props: [{ kind: 'table', x0: 1.25, x1: 2.55, z0: 9.25, z1: 9.95, top: 0.52 }],
  lamps: [{ x: 0.5, z: 9.7, shadeY: 2.45, poolR: 1.35 }],
  vents: [{ x0: -0.5, x1: 0.5, z0: 9.0, z1: 9.6 }],
  boards: [{ x0: -1.7, x1: -0.5, y0: 1.35, y1: 2.15 }],
};
