// Stage 3, first half (PLAN.md M11, research/stages.md Stage 3 rooms 1-6): the revenge run. Our
// own layouts: outside the building by day, the vent room, the table room, the camera room (where
// improbability mode starts and the floor falls away), and the clock-sky toy street (signed off
// 2026-10-27). The street's far end leads on to the desert (M12), which ends the stage for now.
import type { RoomDef } from '../../sim/room';
import type { StageDef } from '../../sim/stage';
import { newHand } from '../../sim/actor';
import { stage3Scripts } from './stage3Script';

export const OUTSIDE: RoomDef = {
  id: 's3-outside', halfWidth: 3.5, height: 3.8, zFront: 8, zBack: 10.4, outdoor: true, scene: 'street',
  doors: [], props: [], lamps: [], vents: [], boards: [], manhole: { x: 1.2, z: 8.8 },
};
export const VENT_ROOM: RoomDef = {
  id: 's3-vent', halfWidth: 3.6, height: 3.6, zFront: 8, zBack: 10.4,
  doors: [{ wall: 'right', z0: 8.6, z1: 9.35, height: 1.9, open: false }],
  props: [], lamps: [{ x: 1.2, z: 9.6, shadeY: 2.3, poolR: 1.2 }],
  vents: [{ x0: -1.5, x1: -0.7, z0: 8.9, z1: 9.5 }], boards: [{ x0: 0.2, x1: 1.5, y0: 1.3, y1: 2.0 }],
};
export const TABLES: RoomDef = {
  id: 's3-tables', halfWidth: 3.6, height: 3.6, zFront: 8, zBack: 10.4,
  doors: [{ wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: true }, { wall: 'right', z0: 8.6, z1: 9.35, height: 1.9, open: false }],
  props: [{ kind: 'table', x0: 0.4, x1: 1.6, z0: 9.35, z1: 9.95, top: 0.55 }],
  lamps: [{ x: 1.0, z: 9.6, shadeY: 2.3, poolR: 1.3 }], vents: [], boards: [],
};
export const CAMERA: RoomDef = {
  id: 's3-camera', halfWidth: 3.6, height: 3.6, zFront: 8, zBack: 10.4,
  doors: [{ wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: true }, { wall: 'right', z0: 8.6, z1: 9.35, height: 1.9, open: false }],
  props: [{ kind: 'crate', x0: 1.4, x1: 2.1, z0: 9.5, z1: 10.0, top: 0.72 }],
  lamps: [{ x: -1.4, z: 9.6, shadeY: 2.3, poolR: 1.1 }, { x: 1.6, z: 9.6, shadeY: 2.3, poolR: 1.1 }], vents: [], boards: [],
  camera: { x: 0.2, y: 2.7 },
};
export const STREET: RoomDef = {
  id: 's3-street', halfWidth: 3.5, height: 4, zFront: 8, zBack: 10.4, outdoor: true, scene: 'toyStreet',
  doors: [], props: [], lamps: [], vents: [], boards: [], vending: { x: 2.6, z: 10.15 },
};

const EAST = { x0: 3.15, x1: 9, z0: 0, z1: 99 };

export const STAGE3: StageDef = {
  stage: 3,
  palette: 'warm',
  // research/stages.md: the episode's body count
  targetBodyCount: 91,
  start: { room: 'outside', entry: 'west' },
  loadout(p) {
    // research/stages.md Stage 3: two knives
    p.hands = [newHand('knife'), newHand('knife')];
    p.grenades = 0;
  },
  rooms: {
    outside: {
      room: OUTSIDE,
      entries: { west: { x: -2.9, z: 9.0, facing: 1, from: 'walk' } },
      // a vent grille low in the wall (the old one is boarded over)
      exits: [{ id: 'vent', kind: 'vent', x0: 2.3, x1: 3.2, z0: 9.9, z1: 10.4, to: 'vent', entry: 'vent' }],
      script: stage3Scripts.outside,
    },
    vent: {
      room: VENT_ROOM,
      entries: { vent: { x: -1.1, z: 9.2, facing: 1, from: 'above' } },
      exits: [{ id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'tables', entry: 'west', locked: true }],
      script: stage3Scripts.vent,
    },
    tables: {
      room: TABLES,
      entries: { west: { x: -3.0, z: 9.0, facing: 1, from: 'walk' } },
      exits: [{ id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'camera', entry: 'west', locked: true }],
      script: stage3Scripts.tables,
    },
    camera: {
      room: CAMERA,
      entries: { west: { x: -3.0, z: 9.0, facing: 1, from: 'walk' } },
      // shoved (or knocked) into the void: down to the street
      exits: [{ id: 'void', kind: 'fall', x0: 99, x1: 99, z0: 99, z1: 99, to: 'street', entry: 'sky', locked: true }],
      script: stage3Scripts.camera,
    },
    street: {
      room: STREET,
      entries: { sky: { x: 0.2, z: 9.2, facing: 1, from: 'sky' } },
      // on to the desert (M12): the end of the built stage for now
      exits: [{ id: 'desert', kind: 'edge', ...EAST, to: null, entry: 'west', locked: true }],
      script: stage3Scripts.street,
    },
  },
};

export const STAGE3_ROOMS = ['outside', 'vent', 'tables', 'camera', 'street'] as const;
void EAST;
