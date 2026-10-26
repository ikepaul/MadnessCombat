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
}

export type PropDef = TableDef;

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
  /** Back wall. */
  zBack: number;
  doors: DoorDef[];
  props: PropDef[];
  lamps: LampDef[];
  vents: VentDef[];
  boards: BoardDef[];
}

/** Walls and ceiling are drawn from this depth so they run off the screen edges. */
export const ROOM_DRAW_NEAR_Z = 7;
