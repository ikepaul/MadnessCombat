// Actor state that the renderer reads. M1 adds the movement body; the combat state machine,
// hurtboxes and pose animator arrive in M2.

export type ActorKind = 'hero' | 'grunt' | 'zombie';
export type HeldItem = 'pistol' | 'baton' | null;

export interface Vec3 { x: number; y: number; z: number }

/** Everything the character painter needs. Positions in H; the pose is in actor-local H. */
export interface Pose {
  /** Walk cycle phase in radians; undefined = standing. */
  walkPhase?: number;
  /** Body lean in radians (hit reactions). */
  lean: number;
  /** World point the gun hand aims at. */
  aimAt?: Vec3;
  held: HeldItem;
  lying: boolean;
  dead: boolean;
  /** Wound marks in actor-local H. */
  wounds: [number, number][];
  /** Muzzle flash this frame. */
  flash: boolean;
  /** 0 = standing, 1 = flat on the floor (prone/dive), blended during transitions. */
  prone: number;
  /** 0..1 airborne tuck (feet and hands pulled in). */
  tuck: number;
  /** 0..1 landing squash. */
  squash: number;
  /** Height of the surface under the actor; the contact shadow is drawn there. */
  groundY: number;
}

export type MoveState = 'ground' | 'air' | 'goingProne' | 'diving' | 'prone' | 'standingUp';

/** Movement body (sim only). */
export interface Body {
  vel: Vec3;
  state: MoveState;
  /** Seconds in the current state. */
  stateTime: number;
  /** Surface height under the actor (floor 0 or a prop top). */
  groundY: number;
  /** Hurtbox height: 1 H standing, 0.3 H prone. */
  height: number;
  /** Seconds left of landing squash. */
  squashLeft: number;
  /** Horizontal velocity at takeoff (jumps keep it). */
  takeoff: { x: number; z: number };
  /** Walk cycle phase accumulator (radians, 2 pi per stride). */
  cycle: number;
}

export interface Actor {
  id: number;
  kind: ActorKind;
  pos: Vec3;
  facing: 1 | -1;
  pose: Pose;
  body: Body;
}

let nextId = 1;

export function createActor(kind: ActorKind, x: number, z: number, facing: 1 | -1, pose: Partial<Pose> = {}): Actor {
  return {
    id: nextId++,
    kind,
    pos: { x, y: 0, z },
    facing,
    pose: { lean: 0, held: null, lying: false, dead: false, wounds: [], flash: false, prone: 0, tuck: 0, squash: 0, groundY: 0, ...pose },
    body: { vel: { x: 0, y: 0, z: 0 }, state: 'ground', stateTime: 0, groundY: 0, height: 1, squashLeft: 0, takeoff: { x: 0, z: 0 }, cycle: 0 },
  };
}
