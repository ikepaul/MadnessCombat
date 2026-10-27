// Stage 2, first half (PLAN.md M9, research/stages.md Stage 2 rooms 1-6): infiltration to the
// target. Our own layouts: a street under the building's wall, the corner with a ladder, two
// rooftops (a box for cover, the breach tile), the target's office and the corridor. Exits are
// one-way; the corridor's far door leads on to the elevator (M10), which ends the stage for now.
import type { RoomDef } from '../../sim/room';
import type { StageDef } from '../../sim/stage';
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

/** M10 room 7, the elevator cab (world-elevator-fight): a small box in the shaft, its roof walkable. */
const HATCH = { x0: 0.8, x1: 1.35, z0: 8.6, z1: 9.1 };
export const ELEVATOR: RoomDef = {
  id: 's2-elevator', halfWidth: 1.9, height: 2.3, zFront: 8.2, zBack: 9.5,
  doors: [{ wall: 'right', z0: 8.45, z1: 9.15, height: 1.9, open: false }],
  props: [], lamps: [], vents: [], boards: [],
  decks: [{ x0: -1.9, x1: 1.9, z0: 8.2, z1: 9.5, y: 2.3, holes: [HATCH] }],
  elevator: { cable: { x: 0.25, z: 9.2 }, hatch: HATCH, slot: { x0: -0.95, x1: -0.3, z0: 8.6, z1: 9.1 } },
};
/** Room 8, the sword room: blades from the left door and the lift on the right. */
export const SWORDS: RoomDef = {
  id: 's2-swords', halfWidth: 3.6, height: 3.6, zFront: 8, zBack: 10.4,
  doors: [
    { wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: false },
    { wall: 'right', z0: 8.6, z1: 9.4, height: 2.0, open: false },
  ],
  props: [], lamps: [{ x: 0, z: 9.4, shadeY: 2.3, poolR: 1.3 }], vents: [], boards: [{ x0: -1.6, x1: -0.2, y0: 1.3, y1: 2.0 }],
};
/** Room 9, the lobby: out of the lift into a crossfire from both doors. */
export const LOBBY: RoomDef = {
  id: 's2-lobby', halfWidth: 3.6, height: 3.8, zFront: 8, zBack: 10.67,
  doors: [
    { wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: false },
    { wall: 'right', z0: 8.6, z1: 9.4, height: 2.0, open: false },
  ],
  props: [{ kind: 'table', x0: -2.6, x1: -1.8, z0: 10.0, z1: 10.45, top: 0.55 }],
  lamps: [{ x: -1.6, z: 9.8, shadeY: 2.5, poolR: 1.2 }, { x: 1.6, z: 9.8, shadeY: 2.5, poolR: 1.2 }], vents: [], boards: [],
};
/** Room 10, the crate room: guards dug in behind a crate facing the lift; a ceiling vent goes round. */
export const CRATES: RoomDef = {
  id: 's2-crates', halfWidth: 3.6, height: 3.6, zFront: 8, zBack: 10.4,
  doors: [
    { wall: 'left', z0: 8.6, z1: 9.4, height: 2.0, open: false },
    { wall: 'right', z0: 8.6, z1: 9.35, height: 1.9, open: false },
  ],
  props: [{ kind: 'crate', x0: 1.2, x1: 2.0, z0: 9.05, z1: 9.75, top: 0.75 }],
  lamps: [{ x: 0.4, z: 9.5, shadeY: 2.3, poolR: 1.2 }],
  vents: [{ x0: -2.7, x1: -1.9, z0: 8.7, z1: 9.3 }, { x0: 2.7, x1: 3.4, z0: 8.7, z1: 9.3 }],
  boards: [],
};
/** Room 11, the final office: the target behind his desk, two bodyguards. */
export const FINAL: RoomDef = {
  id: 's2-final', halfWidth: 3.6, height: 3.8, zFront: 8, zBack: 10.67,
  doors: [{ wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: true }],
  props: [{ kind: 'table', x0: 1.4, x1: 2.8, z0: 9.55, z1: 10.05, top: 0.62 }],
  lamps: [{ x: 2.1, z: 10.0, shadeY: 2.5, poolR: 1.2 }], vents: [], boards: [{ x0: -1.2, x1: 0.4, y0: 1.3, y1: 2.15 }],
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
    // research/stages.md Stage 2: fiber wire (empty hands) + the suppressed pistol (drawn in room 2)
    p.hands = [null, null];
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
      exits: [{ id: 'west-door', kind: 'door', x0: -9, x1: -3.25, z0: 8.3, z1: 9.25, to: 'elevator', entry: 'door', locked: true }],
      tracker: [-0.9, 0.3],
      script: stage2Scripts.corridor,
    },
    elevator: {
      room: ELEVATOR,
      entries: { door: { x: 1.2, z: 8.85, facing: -1, from: 'walk' } },
      // once the cab has fallen: up the cable (solo the script takes it; co-op it opens, E at the cable)
      exits: [{ id: 'cable', kind: 'climb', x0: -0.25, x1: 0.75, z0: 8.8, z1: 9.5, to: 'swords', entry: 'shaft', locked: true }],
      tracker: [0.2, -0.9],
      script: stage2Scripts.elevator,
    },
    swords: {
      room: SWORDS,
      entries: { shaft: { x: -2.7, z: 9.3, facing: 1, from: 'vault' } },
      exits: [{ id: 'lift', kind: 'lift', x0: 3.0, x1: 9, z0: 8.55, z1: 9.45, to: 'lobby', entry: 'lift', locked: true }],
      tracker: [0.9, 0.2],
      script: stage2Scripts.swords,
    },
    lobby: {
      room: LOBBY,
      entries: { lift: { x: 0, z: 9.6, facing: 1, from: 'walk' } },
      exits: [{ id: 'lift', kind: 'lift', x0: 3.0, x1: 9, z0: 8.55, z1: 9.45, to: 'crates', entry: 'lift', locked: true }],
      tracker: [0.7, 0.6],
      script: stage2Scripts.lobby,
    },
    crates: {
      room: CRATES,
      entries: { lift: { x: -3.0, z: 9.0, facing: 1, from: 'walk' } },
      exits: [
        // research/stages.md room 10: the ceiling vent comes out behind the guards
        { id: 'vent', kind: 'vent', x0: -2.75, x1: -1.85, z0: 8.65, z1: 9.35, to: 'crates', entry: 'lift', warp: { x: 3.05, z: 9.0, facing: -1, from: 'above' } },
        { id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'final', entry: 'west', locked: true },
      ],
      tracker: [0.9, 0],
      script: stage2Scripts.crates,
    },
    final: {
      room: FINAL,
      entries: { west: { x: -2.9, z: 9.0, facing: 1, from: 'walk' } },
      exits: [],
      tracker: [0.05, 0],
      script: stage2Scripts.final,
    },
  },
};

/** Room order (tests, `?stage=2&room=`). */
export const STAGE2_ROOMS = ['wall', 'corner', 'roofA', 'roofB', 'office', 'corridor', 'elevator', 'swords', 'lobby', 'crates', 'final'] as const;
