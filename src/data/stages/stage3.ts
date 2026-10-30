// Stage 3, first half (PLAN.md M11, research/stages.md Stage 3 rooms 1-6): the revenge run. Our
// own layouts: outside the building by day, the vent room, the table room, the camera room (where
// improbability mode starts and the floor falls away), and the clock-sky toy street (signed off
// 2026-10-27). The street's far end leads on to the desert (M12), which ends the stage for now.
import type { RoomDef } from '../../sim/room';
import { exitTracker, type StageDef } from '../../sim/stage';
import { newHand } from '../../sim/actor';
import { stage3Scripts } from './stage3Script';

export const OUTSIDE: RoomDef = {
  id: 's3-outside', halfWidth: 3.5, height: 3.8, zFront: 8, zBack: 10.4, outdoor: true, scene: 'street',
  doors: [], props: [], lamps: [], vents: [], boards: [], manhole: { x: 1.2, z: 8.8 },
  // the vent exit's grille (x 2.3-3.2, at the back wall); no drainpipe here, it read as a pole to climb
  wallVents: [{ x0: 2.35, x1: 3.15, y0: 0.08, y1: 0.62 }], pipeX: null,
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

/** M12 rooms 7-8: the desert, which the walls turn into a sealed box. */
export const DESERT: RoomDef = {
  id: 's3-desert', halfWidth: 3.5, height: 3.6, zFront: 8, zBack: 10.4, outdoor: true, scene: 'desert',
  doors: [], props: [], lamps: [], vents: [], boards: [],
};
/** Room 9: the vending room (blasted into through the left wall). */
export const VENDING: RoomDef = {
  id: 's3-vending', halfWidth: 3.6, height: 3.6, zFront: 8, zBack: 10.4, wallHole: 'left',
  doors: [{ wall: 'right', z0: 8.6, z1: 9.35, height: 1.9, open: false }],
  props: [{ kind: 'vending', x0: 2.2, x1: 3.0, z0: 9.85, z1: 10.3, top: 1.55 }],
  lamps: [{ x: 0, z: 9.6, shadeY: 2.3, poolR: 1.3 }], vents: [], boards: [],
};
/** Room 10: the console room. */
export const CONSOLE: RoomDef = {
  id: 's3-console', halfWidth: 3.6, height: 3.8, zFront: 8, zBack: 10.67,
  doors: [{ wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: false }, { wall: 'right', z0: 8.6, z1: 9.35, height: 1.9, open: false }],
  props: [{ kind: 'table', x0: -0.9, x1: 0.9, z0: 10.0, z1: 10.5, top: 0.75 }],
  lamps: [{ x: 0, z: 9.8, shadeY: 2.5, poolR: 1.4 }], vents: [], boards: [{ x0: -2.2, x1: -0.4, y0: 1.2, y1: 2.3 }, { x0: 0.4, x1: 2.2, y0: 1.2, y1: 2.3 }],
};
/** Room 11: the final lift room. */
export const LIFT: RoomDef = {
  id: 's3-lift', halfWidth: 3.6, height: 3.8, zFront: 8, zBack: 10.67,
  doors: [{ wall: 'left', z0: 8.6, z1: 9.35, height: 1.9, open: true }],
  props: [], lamps: [{ x: 1.6, z: 9.9, shadeY: 2.5, poolR: 1.3 }], vents: [], boards: [],
};

const EAST = { x0: 3.15, x1: 9, z0: 0, z1: 99 };

export const STAGE3: StageDef = {
  gore: 'extreme',
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
      // M14b ENC-21: stage 3 has a tracker too: it points at the way on
      tracker: exitTracker,
    },
    vent: {
      room: VENT_ROOM,
      entries: { vent: { x: -1.1, z: 9.2, facing: 1, from: 'above' } },
      exits: [{ id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'tables', entry: 'west', locked: true }],
      script: stage3Scripts.vent,
      tracker: exitTracker,
    },
    tables: {
      room: TABLES,
      entries: { west: { x: -3.0, z: 9.0, facing: 1, from: 'walk' } },
      exits: [{ id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'camera', entry: 'west', locked: true }],
      script: stage3Scripts.tables,
      tracker: exitTracker,
    },
    camera: {
      room: CAMERA,
      entries: { west: { x: -3.0, z: 9.0, facing: 1, from: 'walk' } },
      // shoved (or knocked) into the void: down to the street
      exits: [{ id: 'void', kind: 'fall', x0: 99, x1: 99, z0: 99, z1: 99, to: 'street', entry: 'sky', locked: true }],
      script: stage3Scripts.camera,
      // STB-02 (decision 10): axe throws from the camera room to the end of the stage
      rules: { flags: ['axeThrows'] },
    },
    street: {
      room: STREET,
      entries: { sky: { x: 0.2, z: 9.2, facing: 1, from: 'sky' } },
      exits: [{ id: 'desert', kind: 'edge', ...EAST, to: 'desert', entry: 'west', locked: true }],
      script: stage3Scripts.street,
      tracker: exitTracker,
      rules: { physics: 'improbable', flags: ['axeThrows'] },
    },
    desert: {
      room: DESERT,
      entries: { west: { x: -2.9, z: 9.2, facing: 1, from: 'walk' } },
      // boss-halo clip 6: blasted through the box's wall into the next room
      exits: [{ id: 'blast', kind: 'blasted', x0: 99, x1: 99, z0: 99, z1: 99, to: 'vending', entry: 'hole', locked: true }],
      script: stage3Scripts.desert,
      rules: { flags: ['axeThrows'] },
    },
    vending: {
      room: VENDING,
      entries: { hole: { x: -2.9, z: 9.2, facing: 1, from: 'thrown' } },
      exits: [{ id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'console', entry: 'west', locked: true }],
      script: stage3Scripts.vending,
      tracker: exitTracker,
      rules: { flags: ['axeThrows'] },
    },
    console: {
      room: CONSOLE,
      entries: { west: { x: -2.9, z: 9.0, facing: 1, from: 'walk' } },
      exits: [{ id: 'east-door', kind: 'door', x0: 3.25, x1: 9, z0: 8.55, z1: 9.4, to: 'lift', entry: 'west', locked: true }],
      script: stage3Scripts.console,
      tracker: exitTracker,
      rules: { flags: ['axeThrows'] },
    },
    lift: {
      room: LIFT,
      entries: { west: { x: -2.9, z: 9.0, facing: 1, from: 'walk' } },
      exits: [],
      script: stage3Scripts.lift,
      rules: { flags: ['axeThrows'] },
    },
  },
};

export const STAGE3_ROOMS = ['outside', 'vent', 'tables', 'camera', 'street', 'desert', 'vending', 'console', 'lift'] as const;
void EAST;
