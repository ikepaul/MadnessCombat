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

export type PropDef = TableDef | PoleDef;

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
  doors: DoorDef[];
  props: PropDef[];
  lamps: LampDef[];
  vents: VentDef[];
  boards: BoardDef[];
}

/** Walls and ceiling are drawn from this depth so they run off the screen edges. */
export const ROOM_DRAW_NEAR_Z = 7;
