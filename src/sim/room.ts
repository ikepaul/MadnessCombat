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

/** M11: the tank that fell out of the sky (world-falling-hazard): a solid block, tall enough to pin against. */
export interface TankDef {
  kind: 'tank';
  x0: number; x1: number; z0: number; z1: number;
  top: number;
  facing: 1 | -1;
}

/** M12: the vending room's machine (our design: the brute's twin, asleep). Solid; a thrown body smashes it. */
export interface VendingDef {
  kind: 'vending';
  x0: number; x1: number; z0: number; z1: number;
  top: number;
  smashed?: boolean;
}

export type PropDef = TableDef | PoleDef | CannonPropDef | CrateDef | TankDef | VendingDef;

/** A floor area (H). */
export interface Zone { x0: number; x1: number; z0: number; z1: number }

/** An upper floor at height `y` (H); `holes` are open gaps you fall through. */
export interface Deck extends Zone { y: number; holes: Zone[] }

export const inZone = (z: Zone, x: number, zz: number) => x >= z.x0 && x <= z.x1 && zz >= z.z0 && zz <= z.z1;

/**
 * M14 move-stairs: a staircase across the zone; the floor ramps from y0 at x0 to y1 at x1 (H).
 * Walking actors follow it up and down; bodies that die on it slide to the low end.
 */
export interface Stairs extends Zone { y0: number; y1: number }

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
  scene?: 'ground' | 'street' | 'roof' | 'toyStreet' | 'desert';
  /** Night sky (stage 2's opening). */
  night?: boolean;
  /** Ladders up the back wall (a ladder exit's picture). */
  ladders?: { x: number; z: number; top: number }[];
  /** world-breach: the marked roof tile; holes = blasted holes in the ceiling (persistent). */
  breach?: Zone;
  holes?: Zone[];
  /** Street flavour: a manhole cover at (x, z). */
  manhole?: { x: number; z: number };
  /** A vent grille low in the back wall (a vent exit's picture in a street scene), x and height in H. */
  wallVents?: { x0: number; x1: number; y0: number; y1: number }[];
  /** The street's drainpipe (x on the back wall); null = none (it read as a climbable pole). */
  pipeX?: number | null;
  /**
   * M10: walkable upper floors with no solid sides (the elevator cab's roof). You stand on one once
   * your feet are at its height; open holes in it (the hatch, a cut slot) drop you through.
   */
  decks?: Deck[];
  /** M14 move-stairs: ramps between floor levels (a staircase). */
  stairs?: Stairs[];
  /** M11 world-arena-collapse: the floor beyond x on `side` has fallen away. */
  void?: { side: -1 | 1; x: number };
  /** M12 world-arena-lock: the walls that have come down so far (the painter draws them). */
  lockWalls?: ('right' | 'back' | 'left')[];
  /** M12: a hole blasted through a wall (the vending room's left wall: you came through it). */
  wallHole?: 'left' | 'right';
  /** M11: the crack before the collapse (drawn as a jagged line). */
  crack?: { side: -1 | 1; x: number };
  /** M11 decor: a security camera high on the back wall (the camera room). */
  camera?: { x: number; y: number };
  /** M11 decor: a vending machine standing at the back (it comes alive: the brute). */
  vending?: { x: number; z: number };
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
