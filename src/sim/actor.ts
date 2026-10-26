// Actor state that the sim steps and the renderer reads: movement body, combat state machine,
// hit points and the pose (clip + root) the painter draws.
import { type Root, STANDING } from '../anim/skeleton';
import { TUNING } from '../data/tuning';

export type ActorKind = 'hero' | 'grunt' | 'zombie';
export type HeldItem = 'pistol' | 'baton' | null;

export interface Vec3 { x: number; y: number; z: number }

/** Everything the character painter needs. Positions in H; the pose is in actor-local H. */
export interface Pose {
  /** Walk cycle phase in radians; undefined = standing. */
  walkPhase?: number;
  /** Extra body lean in radians (hit reactions), on top of the clip. */
  lean: number;
  /** World point the gun hand aims at. */
  aimAt?: Vec3;
  held: HeldItem;
  /** Scenery corpses placed lying (no sim history). */
  lying: boolean;
  dead: boolean;
  headless: boolean;
  /** Wound marks in actor-local H (drawn only on stages with blood). */
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
  /** Keyframed clip and its time (src/anim/clips.ts). */
  clip: string;
  clipT: number;
  /** Whole-body transform (lying, prone, spin, squash). */
  root: Root;
  /** Seconds of impact frame (drawn bright) left. */
  impact: number;
  /** Seconds of player hurt flash left. */
  hurt: number;
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
  /** The current dive is a low sweep (feet first, on the back). */
  sweep: boolean;
  /** Actors already swept by this dive. */
  swept: number[];
}

/**
 * Combat state machine (PLAN.md M2). `free` = the movement controller is in charge
 * (idle / walk / jump / prone, see stateLabel()).
 */
export type ActorState = 'free' | 'attack' | 'stun' | 'knockback' | 'down' | 'getUp' | 'grabbed' | 'dead';

export type AttackKind = 'light' | 'heavy' | 'uppercut' | 'finisher' | 'throw';

export interface Attack {
  kind: AttackKind;
  t: number;
  /** Already connected (one target per swing). */
  done: boolean;
}

/** Ballistic flight of a knocked-back, killed or thrown body. */
export interface Flight {
  vx: number;
  vz: number;
  vy: number;
  /** Body rotation now; unthrown bodies turn from r0 to rTo over the airtime, thrown ones spin. */
  r: number;
  r0: number;
  rTo: number;
  /** rad/s, thrown bodies only. */
  spin: number;
  /** 'air' while airborne, then 'skid' on the floor. */
  phase: 'air' | 'skid';
  t: number;
  /** Airtime the rotation is timed against. */
  airtime: number;
  /** Thrown by someone: knocks down what it hits, kills on a fast wall impact. */
  thrownBy?: number;
  /** Actors this projectile already hit. */
  hit: number[];
  /** Wall touched during the flight (slump against it). */
  wall?: 'left' | 'right' | 'back';
}

/** Corpse lifecycle (world-persistence-decals): tumble -> settle -> freeze (baked). */
export interface CorpseState {
  phase: 'tumble' | 'headless' | 'settled' | 'frozen';
  t: number;
  /** Intact corpses can be raised as zombies later (halo boss). */
  raisable: boolean;
  gibbed: boolean;
  slumped: boolean;
}

export type Holding = { kind: 'actor'; id: number } | { kind: 'item'; id: number };

export interface Actor {
  id: number;
  kind: ActorKind;
  pos: Vec3;
  facing: 1 | -1;
  pose: Pose;
  body: Body;
  state: ActorState;
  /** Seconds in the current combat state. */
  stateT: number;
  hp: number;
  maxHp: number;
  attack?: Attack;
  flight?: Flight;
  corpse?: CorpseState;
  holding?: Holding;
  grabbedBy?: number;
  /** Punch pressed during the previous swing (input buffer). */
  queued?: { kind: Exclude<AttackKind, 'finisher' | 'throw'>; aim?: [number, number]; at: number };
  /** Length of the current stun (s). */
  stunFor: number;
  /** Root rotation the get-up starts from. */
  getUpFrom?: number;
  /** Wall the last flight ended against (corpses slump against side walls). */
  slumpWall?: 'left' | 'right' | 'back';
  /** Direction of the throw being wound up. */
  throwDir?: { x: number; z: number };
  /** Lab/AI controller; the player is driven by World.command instead. */
  brain?: Brain;
}

/** Produces the actor's intent each tick (labs now, grunt AI in M3). */
export type Brain = (actor: Actor, dt: number) => import('./command').PlayerCommand;

let nextId = 1;

export function newId(): number {
  return nextId++;
}

export function createActor(kind: ActorKind, x: number, z: number, facing: 1 | -1, pose: Partial<Pose> = {}): Actor {
  const hp = kind === 'hero' ? TUNING.health.hero : TUNING.health.grunt;
  const a: Actor = {
    id: newId(),
    kind,
    pos: { x, y: 0, z },
    facing,
    pose: {
      lean: 0, held: null, lying: false, dead: false, headless: false, wounds: [], flash: false, prone: 0, tuck: 0, squash: 0,
      groundY: 0, clip: 'idle', clipT: 0, root: { ...STANDING }, impact: 0, hurt: 0, ...pose,
    },
    body: {
      vel: { x: 0, y: 0, z: 0 }, state: 'ground', stateTime: 0, groundY: 0, height: 1, squashLeft: 0, takeoff: { x: 0, z: 0 }, cycle: 0,
      sweep: false, swept: [],
    },
    state: 'free',
    stateT: 0,
    hp,
    maxHp: hp,
    stunFor: 0,
  };
  // scenery corpses (style-frame cast): already dead and settled
  if (a.pose.dead) {
    a.state = 'dead';
    a.hp = 0;
    a.corpse = { phase: 'settled', t: 0, raisable: true, gibbed: false, slumped: false };
  }
  return a;
}

/** Can be hit / grabbed as a living body. */
export function alive(a: Actor): boolean {
  return a.state !== 'dead';
}

/** The plan's state names: idle / walk / jump / prone / attack / stun / knockback / down / get-up / grabbed / dead. */
export function stateLabel(a: Actor): string {
  if (a.state !== 'free') return a.state === 'getUp' ? 'get-up' : a.state;
  switch (a.body.state) {
    case 'air': return 'jump';
    case 'ground': return a.pose.walkPhase !== undefined ? 'walk' : 'idle';
    default: return 'prone';
  }
}
