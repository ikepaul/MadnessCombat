// Room definitions: a one-point-perspective box (design/art-direction.md, "Rooms").
// All units are H; z is the distance from the camera.

export interface DoorDef {
  wall: 'left' | 'right';
  z0: number;
  z1: number;
  height: number;
  open: boolean;
}

export interface TableDef {
  kind: 'table';
  x0: number; x1: number; z0: number; z1: number;
  top: number;
  /**
   * Kicked over onto its side toward the camera (combat-cover, M7): the original footprint and
   * the tip progress 0..1. Once tipped the table's own fields describe the upright top (cover).
   */
  tip?: { t: number; z0: number; z1: number; top: number };
}

/**
 * Outdoor landmark (stage 1 arena, own design): a leaning wooden utility pole with a crossbar
 * and a sagging wire. Solid, far too tall to stand on.
 */
export interface PoleDef {
  kind: 'pole';
  x0: number; x1: number; z0: number; z1: number;
  top: number;
  /** Lean in radians (+ = toward +x). */
  lean: number;
}

/**
 * M8: the boss's cannon once it has landed (world-falling-hazard: becomes terrain). Solid, low
 * enough to jump onto (move-jump-onto-object), but not cover: shots pass under the barrel (ep1 f2469).
 * Drawn by the cannon painter, not the room painter.
 */
export interface CannonPropDef {
  kind: 'cannon';
  x0: number; x1: number; z0: number; z1: number;
  top: number;
}

/** M9: a waist-high crate on a rooftop (combat-cover: slip behind it, lean out). Solid, can be stood on. */
export interface CrateDef {
  kind: 'crate';
  x0: number; x1: number; z0: number; z1: number;
  top: number;
}

export type PropDef = TableDef | PoleDef | CannonPropDef | CrateDef;

/** A floor area (H). */
export interface Zone { x0: number; x1: number; z0: number; z1: number }

/** An upper floor at height `y` (H); `holes` are open gaps you fall through. */
export interface Deck extends Zone { y: number; holes: Zone[] }

export const inZone = (z: Zone, x: number, zz: number) => x >= z.x0 && x <= z.x1 && zz >= z.z0 && zz <= z.z1;

export interface LampDef {
  x: number;
  z: number;
  /** Height of the lamp shade above the floor. */
  shadeY: number;
  /** Radius of the light pool on the floor. */
  poolR: number;
}

export interface VentDef { x0: number; x1: number; z0: number; z1: number }

export interface BoardDef { x0: number; x1: number; y0: number; y1: number }

export interface RoomDef {
  id: string;
  halfWidth: number;
  height: number;
  /** Front edge of the walkable floor. */
  zFront: number;
  /** Back wall (outdoors: the back edge of the walkable ground). */
  zBack: number;
  /** Open air: sky and ground, no walls or ceiling, bodies don't slam into the bounds. */
  outdoor?: boolean;
  /** M9 outdoor scenery: open ground (stage 1), a street under a building's wall, a flat roof. */
  scene?: 'ground' | 'street' | 'roof';
  /** Night sky (stage 2's opening). */
  night?: boolean;
  /** Ladders up the back wall (a ladder exit's picture). */
  ladders?: { x: number; z: number; top: number }[];
  /** world-breach: the marked roof tile; holes = blasted holes in the ceiling (persistent). */
  breach?: Zone;
  holes?: Zone[];
  /** Street flavour: a manhole cover at (x, z). */
  manhole?: { x: number; z: number };
  /**
   * M10: walkable upper floors with no solid sides (the elevator cab's roof). You stand on one once
   * your feet are at its height; open holes in it (the hatch, a cut slot) drop you through.
   */
  decks?: Deck[];
  /** M10 world-elevator-fight: this room is the elevator cab in its shaft. */
  elevator?: { cable: { x: number; z: number }; hatch: Zone; slot: Zone };
  doors: DoorDef[];
  props: PropDef[];
  lamps: LampDef[];
  vents: VentDef[];
  boards: BoardDef[];
}

/** Walls and ceiling are drawn from this depth so they run off the screen edges. */
export const ROOM_DRAW_NEAR_Z = 7;
