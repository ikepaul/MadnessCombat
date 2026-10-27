// Stage 2, first half (PLAN.md M9, research/stages.md Stage 2 rooms 1-6): infiltration to the
// target. Our own layouts: a street under the building's wall, the corner with a ladder, two
// rooftops (a box for cover, the breach tile), the target's office and the corridor. Exits are
// one-way; the corridor's far door leads on to the elevator (M10), which ends the stage for now.
import type { RoomDef } from '../../sim/room';
import type { StageDef } from '../../sim/stage';
import { newHand } from '../../sim/actor';
import { stage2Scripts } from './stage2Script';

const STREET = { halfWidth: 3.5, height: 3.8, zFront: 8, zBack: 10.4, doors: [], lamps: [], vents: [], boards: [] };
const ROOF = { halfWidth: 3.5, height: 3.8, zFront: 8, zBack: 10.5, doors: [], lamps: [], vents: [], boards: [] };

export const WALL: RoomDef = { ...STREET, id: 's2-wall', outdoor: true, scene: 'street', night: true, props: [], manhole: { x: -0.6, z: 8.7 } };
export const CORNER: RoomDef = {
  ...STREET, id: 's2-corner', outdoor: true, scene: 'street', night: true, props: [],
  ladders: [{ x: 2.6, z: 10.38, top: 3.4 }],
};
export const ROOF_A: RoomDef = {
  ...ROOF, id: 's2-roof-a', outdoor: true, scene: 'roof', night: true,
  props: [{ kind: 'crate', x0: 0.55, x1: 1.35, z0: 9.15, z1: 9.75, top: 0.72 }],
};
export const ROOF_B: RoomDef = {
  ...ROOF, id: 's2-roof-b', outdoor: true, scene: 'roof', night: true, props: [],
  breach: { x0: 0.6, x1: 1.5, z0: 9.1, z1: 9.7 },
};
export const OFFICE: RoomDef = {
  id: 's2-office', halfWidth: 3.6, height: 3.8, zFront: 8, zBack: 10.67,
  doors: [
    { wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: false },
    { wall: 'right', z0: 8.7, z1: 9.45, height: 1.9, open: false },
  ],
  props: [{ kind: 'table', x0: -1.9, x1: -0.7, z0: 9.9, z1: 10.4, top: 0.55 }],
  lamps: [{ x: -1.2, z: 9.8, shadeY: 2.45, poolR: 1.2 }],
  vents: [],
  boards: [{ x0: 0.4, x1: 1.8, y0: 1.3, y1: 2.1 }],
  holes: [{ x0: 0.6, x1: 1.5, z0: 9.1, z1: 9.7 }],
};
export const CORRIDOR: RoomDef = {
  id: 's2-corridor', halfWidth: 3.6, height: 3.4, zFront: 8, zBack: 9.9,
  doors: [
    { wall: 'left', z0: 8.4, z1: 9.15, height: 1.9, open: false },
    { wall: 'right', z0: 8.4, z1: 9.15, height: 1.9, open: false },
  ],
  props: [],
  lamps: [{ x: -1.8, z: 9.3, shadeY: 2.3, poolR: 1.0 }, { x: 1.8, z: 9.3, shadeY: 2.3, poolR: 1.0 }],
  vents: [],
  boards: [],
};

/** Off the side of the screen (walk-out exits). */
const EAST = { x0: 3.15, x1: 9, z0: 0, z1: 99 };

/** Tracker (world-objective-radar): the target's office is ahead and below until the breach tile, then he flees west. */
export const STAGE2: StageDef = {
  stage: 2,
  palette: 'cool',
  // research/stages.md: the episode's body count
  targetBodyCount: 86,
  start: { room: 'wall', entry: 'west' },
  loadout(p) {
    // research/stages.md Stage 2: fiber wire (empty hands) + the suppressed pistol
    p.hands = [newHand('pistolSuppressed', undefined, 2), null];
    p.grenades = 0;
  },
  rooms: {
    wall: {
      room: WALL,
      entries: { west: { x: -2.9, z: 9.0, facing: 1, from: 'walk' } },
      exits: [{ id: 'street', kind: 'edge', ...EAST, to: 'corner', entry: 'west' }],
      tracker: [0.85, -0.2],
      script: stage2Scripts.wall,
    },
    corner: {
      room: CORNER,
      entries: { west: { x: -2.9, z: 9.2, facing: 1, from: 'walk' } },
      exits: [{ id: 'ladder', kind: 'ladder', x0: 2.25, x1: 2.95, z0: 9.9, z1: 10.4, to: 'roofA', entry: 'parapet' }],
      tracker: [0.6, -0.75],
      script: stage2Scripts.corner,
    },
    roofA: {
      room: ROOF_A,
      entries: { parapet: { x: -2.4, z: 9.3, facing: 1, from: 'vault' } },
      exits: [{ id: 'roof', kind: 'edge', ...EAST, to: 'roofB', entry: 'west' }],
      tracker: [0.55, -0.35],
      script: stage2Scripts.roofA,
    },
    roofB: {
      room: ROOF_B,
      entries: { west: { x: -2.9, z: 9.3, facing: 1, from: 'walk' } },
      exits: [{ id: 'breach', kind: 'breach', ...ROOF_B.breach!, to: 'office', entry: 'hole' }],
      // the blip closes in on the marked tile: centred = he's right below
      tracker: (w) => {
        const p = w.player, b = ROOF_B.breach!;
        if (!p) return [0, 0];
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        return [Math.max(-1, Math.min(1, (cx - p.pos.x) / 3)), Math.max(-1, Math.min(1, (cz - p.pos.z) / 1.5))];
      },
      script: stage2Scripts.roofB,
    },
    office: {
      room: OFFICE,
      entries: { hole: { x: 1.05, z: 9.4, facing: -1, from: 'above', surprise: true } },
      exits: [{ id: 'west-door', kind: 'door', x0: -9, x1: -3.25, z0: 8.5, z1: 9.45, to: 'corridor', entry: 'east', locked: true }],
      tracker: [-0.9, 0],
      script: stage2Scripts.office,
    },
    corridor: {
      room: CORRIDOR,
      entries: { east: { x: 2.9, z: 8.8, facing: -1, from: 'walk' } },
      // on to the elevator (M10): the end of the built stage for now
      exits: [{ id: 'west-door', kind: 'door', x0: -9, x1: -3.25, z0: 8.3, z1: 9.25, to: null, entry: 'east', locked: true }],
      tracker: [-0.9, 0.3],
      script: stage2Scripts.corridor,
    },
  },
};

/** Room order (tests, `?stage=2&room=`). */
export const STAGE2_ROOMS = ['wall', 'corner', 'roofA', 'roofB', 'office', 'corridor'] as const;
