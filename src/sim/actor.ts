// Actor state that the renderer reads. M0 only has static poses; the state machine,
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
}

export interface Actor {
  id: number;
  kind: ActorKind;
  pos: Vec3;
  facing: 1 | -1;
  pose: Pose;
}

let nextId = 1;

export function createActor(kind: ActorKind, x: number, z: number, facing: 1 | -1, pose: Partial<Pose> = {}): Actor {
  return {
    id: nextId++,
    kind,
    pos: { x, y: 0, z },
    facing,
    pose: { lean: 0, held: null, lying: false, dead: false, wounds: [], flash: false, ...pose },
  };
}
