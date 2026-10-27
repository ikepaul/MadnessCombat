// Actor state that the sim steps and the renderer reads: movement body, combat state machine,
// hit points and the pose (clip + root) the painter draws.
import { type Root, STANDING } from '../anim/skeleton';
import { TUNING } from '../data/tuning';
import type { MeleeId } from '../data/melee';
import { isWeapon, WEAPONS, type WeaponId } from '../data/weapons';

/** `boss` = the stage-1 necromancer (M8, src/sim/boss.ts): hovers, stepped by its own state machine. */
export type ActorKind = 'hero' | 'grunt' | 'zombie' | 'boss';
/** M8 stage 1 NPCs (design/art-direction.md, style frame "Stage 1 cast"): no AI, driven by scripts. */
export type NpcVariant = 'boombox' | 'dancer';
/** What a hand holds: a gun (src/data/weapons.ts) or a melee weapon / throwable (src/data/melee.ts). */
export type HeldItem = WeaponId | MeleeId | null;

/** One hand's weapon state (PLAN.md M5: two hands, LMB / RMB). */
export interface Hand {
  item: Exclude<HeldItem, null>;
  /** Rounds in the magazine and spare magazines (at most 1, design-decisions: throw & scavenge). */
  ammo: number;
  spare: number;
  /** Seconds until the next shot is allowed. */
  cooldown: number;
  /** Seconds of reload left (0 = not reloading). */
  reload: number;
  /** The empty trigger clicked once: the next press throws the gun (gun-empty-throw). */
  clicked: boolean;
  /** Extreme gore: a blade or club with blood on it. */
  bloody?: boolean;
  /** M14 gun-fire-mode: a rifle switched to single shot (one round per click, tighter spread). */
  semi?: boolean;
}

/** A full hand for `item`: guns come loaded with one spare magazine. */
export function newHand(item: Exclude<HeldItem, null>, ammo?: number, spare?: number): Hand {
  const mag = isWeapon(item) ? WEAPONS[item].mag : 0;
  return { item, ammo: ammo ?? mag, spare: spare ?? (isWeapon(item) ? 1 : 0), cooldown: 0, reload: 0, clicked: false };
}

export interface Vec3 { x: number; y: number; z: number }

/** Everything the character painter needs. Positions in H; the pose is in actor-local H. */
export interface Pose {
  /** Walk cycle phase in radians; undefined = standing. */
  walkPhase?: number;
  /** Extra body lean in radians (hit reactions), on top of the clip. */
  lean: number;
  /** World point the gun hand aims at (dummies without a cursor). */
  aimAt?: Vec3;
  /** Front hand (hand 0, LMB) and back hand (hand 1, RMB) items, mirrored from Actor.hands for the painter. */
  held: HeldItem;
  heldB?: HeldItem;
  /** Screen points the front / back gun hand aim at (the cursor; split aim moves the back one). */
  aim?: [number, number];
  aimB?: [number, number];
  /** M10b over-the-shoulder: a backward shot just fired with this hand at this screen point (drawn until `until`). */
  backShot?: { hand: 0 | 1; until: number; target: [number, number] };
  /** Recoil kick per hand (H), decaying. */
  kick?: [number, number];
  /** Scenery corpses placed lying (no sim history). */
  lying: boolean;
  dead: boolean;
  headless: boolean;
  /** Wound marks in actor-local H (drawn only on stages with blood). */
  wounds: [number, number][];
  /** Extreme gore: hands that came off (not drawn). */
  lostHands?: { F?: boolean; B?: boolean };
  /** Extreme gore: blood on the body, 0..1 (the hero after close kills). */
  stain?: number;
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
  /** Revamp A1: the clip before the last switch and its time then; the painter crossfades out of it. */
  prevClip?: string;
  prevT?: number;
  /** Revamp A6: a hit reaction layered on top of the clip (head snaps back, body folds, pitched forward from behind). */
  react?: { part: 'head' | 'body' | 'back'; age: number; v: number };
  /** M14 melee-blade-deflect: the sword held up as a guard (drawn diagonally in front). */
  guard?: boolean;
  /** Revamp A7: how this body dies (knees-first drop, flung spin, clutching crumple); undefined = the plain tumble. */
  death?: 'drop' | 'fling' | 'crumple';
  /** Whole-body transform (lying, prone, spin, squash). */
  root: Root;
  /** Seconds of impact frame (drawn bright) left. */
  impact: number;
  /** Seconds of player hurt flash left. */
  hurt: number;
  /** A cooked grenade in the front hand (M6). */
  grenade?: boolean;
  /** M10: stars over the head (dazed / knocked out). */
  dazed?: boolean;
  /** M10: hands up. */
  handsUp?: boolean;
  /** M12: the boss has his sword out (the dive, the stab). */
  sword?: boolean;
  /** M11: the twin-tank jetpack on the mini-boss's back (flames while hovering). */
  jetpack?: boolean;
  /** M10 enemy-welder: cutting (sparks, the torch). */
  welding?: boolean;
  /** M10: ducked behind cover (the target behind his desk). */
  ducked?: boolean;
  /** Enemy aim telegraph progress 0..1 (gun raised, red line); undefined = not aiming (M7). */
  telegraph?: number;
  /** Zombie green spreading over the body while it rises, 0..1 (M7). */
  green?: number;
  /** enemy-behaviours: the last enemy of a wave sweats (M7). */
  sweat?: boolean;
  /** M8 boss: ward strength 0..1 (drawn in front of him), lightning telegraph progress 0..1 (hand up). */
  ward?: number;
  cast?: number;
  /** M8 boss: 0..1 both hands up, holding the hero overhead (body slams). */
  grip?: number;
  /** M8 boss: 0..1 the telekinetic sweep gesture (front hand swept out flat). */
  push?: number;
  /** M8 ending: the dance emote (the dancer NPC's loop: bounce, sway, hands pumping). */
  dancing?: boolean;
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
  /** Actors already swept by this dive (or hit by this flying kick). */
  swept: number[];
  /** Playtest 2026-10-27: a flying kick (dive in mid-air) is under way. */
  kick?: boolean;
}

/**
 * Combat state machine (PLAN.md M2). `free` = the movement controller is in charge
 * (idle / walk / jump / prone, see stateLabel()). `downed` = a co-op hero out of lives, lying
 * in a revive circle until a teammate stands in it (PLAN.md co-op milestone).
 */
export type ActorState = 'free' | 'attack' | 'stun' | 'knockback' | 'down' | 'getUp' | 'grabbed' | 'dead' | 'downed' | 'rising';

/**
 * Punches (M2), the body throw, and the M6 actions: `swing` a melee weapon, `thrust` the long
 * weapon (pins), `toss` a held weapon (knife, axe, ...), `lob` a cooked grenade, `pull` a stuck
 * blade / the planted sign, `steal` an enemy's weapon.
 */
export type AttackKind = 'light' | 'heavy' | 'uppercut' | 'finisher' | 'throw' | 'swing' | 'thrust' | 'toss' | 'lob' | 'pull' | 'steal' | 'flip' | 'takedown';

export interface Attack {
  kind: AttackKind;
  /** M17 depth snap: the depth the hero slides toward during the startup, and how far he has slid (H). */
  snapZ?: number;
  snapped?: number;
  /** Pressed as a heavy (RMB): sets finisher damage and decapitation. */
  heavy: boolean;
  t: number;
  /** Already connected (one target per swing). */
  done: boolean;
  /** Which hand acts (swing, toss). */
  hand?: 0 | 1;
  /** Actors already hit by this swing (multi-hit long weapons). */
  hits?: number[];
  /** Pull / steal target: an item id or an actor id. */
  itemId?: number;
  targetId?: number;
  /** Aim point when the action started (toss, lob). */
  aim?: [number, number];
  /** Grenade: fuse left when the lob started. */
  fuse?: number;
  /** The weapon a swing / toss started with (a stolen or dropped one stops the swing). */
  weapon?: string;
  /** Table flip: index of the prop in room.props (M7). */
  prop?: number;
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
  /** M10b: a launched grunt being juggled (jabs so far, who launched him). */
  juggle?: { jabs: number; by?: number };
  /** M10b: spiked into the floor: bounces once on landing. */
  spiked?: boolean;
  /** M10b: seconds of hang time banked by juggle jabs (spent at the top of the arc). */
  hang?: number;
}

/** Corpse lifecycle (world-persistence-decals): tumble -> settle -> freeze (baked). */
export interface CorpseState {
  phase: 'tumble' | 'headless' | 'settled' | 'frozen';
  t: number;
  /** Intact corpses can be raised as zombies later (halo boss). */
  raisable: boolean;
  gibbed: boolean;
  slumped: boolean;
  /** M14: sliding down a staircase. */
  sliding?: boolean;
  /** Pinned upright against a wall or prop by a long weapon (melee-environment-weapon). */
  pinned?: boolean;
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
  /** A grab (F) pressed during a move: world time of the press (playtest: chaining). */
  grabQueued?: number;
  /** M10b pop & catch: world time a weapon was caught; the next hit with it starts as a chain hit. */
  primedAt?: number;
  /** Combo chain being landed on this actor (src/sim/combat.ts chainBonus). */
  chain?: { by: number; count: number; t: number; last: string; /** M18: hits from both players in it. */ team?: boolean };
  /** M18 double-team: the last damaging hit a player landed on this one. */
  lastHeroHit?: { by: number; t: number };
  /** Walk speed factor this tick (the machine gun slows you while firing). */
  walkFactor?: number;
  /** M14 melee-blade-deflect: guarding since (world time), blows turned so far. */
  guard?: { since: number; n: number };
  /** Hand 0 (front, LMB) and hand 1 (back, RMB). */
  hands: [Hand | null, Hand | null];
  /** Length of the current stun (s). */
  stunFor: number;
  /** Root rotation the get-up starts from. */
  getUpFrom?: number;
  /** Wall the last flight ended against (corpses slump against side walls). */
  slumpWall?: 'left' | 'right' | 'back';
  /** Direction of the throw being wound up. */
  throwDir?: { x: number; z: number };
  /** Co-op: which player controls this hero (0 = host / single player, 1 = player 2). */
  playerIndex?: number;
  /** Co-op: the current knockdown ends downed (out of lives, a teammate still up). */
  goingDown?: boolean;
  /** Co-op: 0..1 revive progress while downed. */
  revive?: number;
  /** Still walking in from off-screen or a door (may be outside the side bounds). */
  entering?: boolean;
  /** Grenades carried (thrown with G: hold to cook, release to lob). */
  grenades: number;
  /** Cooking a grenade: seconds since the pin was pulled. */
  cook?: number;
  /** M17: world time E went down with both hands full (a click picks the hand, the release takes the smart pick). */
  useHeldAt?: number;
  /** World time F was last pressed (catching a thrown weapon, throw-catch-return). */
  catchAt?: number;
  /** M14: when the last low slash from the ground was made (world time). */
  lowSlashAt?: number;
  /** Hits absorbed while held as a human shield (combat-human-shield). */
  shieldHits?: number;
  /** M12: share of the damage this one actually takes (the zombie mini-boss holding the sign: 0.1). */
  damageScale?: number;
  /** M11: stuck head-first in the ceiling (improbability mode). */
  ceilingStuck?: boolean;
  /** M11: falling into the void after the arena collapse (seconds so far). */
  fallingAway?: number;
  /** M11: hovering at this height (the jetpack): no gravity, the script moves him. */
  hover?: number;
  /** M10: a melee kill leaves this one dazed instead (stars, ~5 s), once. */
  dazeOnDefeat?: boolean;
  /** M10: lying dazed until this world time. */
  dazedUntil?: number;
  /** M10: knocked out after an interrogation: stays down, out of the fight. */
  koed?: boolean;
  /** M10: hands up (a hold-up, the target's surrender). */
  surrendered?: boolean;
  /** M10: hits only make him flinch (the target in his last room: shoot the gun out of his hand). */
  protected?: boolean;
  /** M9: can't be hurt (the target before his final room, the boss's cameo); rays pass through. */
  invulnerable?: boolean;
  /** M9 room transitions: climbing out, vaulting in, walking out (moved by the stage runner, not stepped). */
  traversing?: { kind: 'vault' | 'climb' | 'crawl' | 'crawlIn' | 'leap' | 'out' | 'drop' | 'hatch' | 'shoved' | 'brace' | 'pulled' | 'ride'; t: number };
  /** Co-op exits (playtest 2026-10-27): gone ahead through this exit, waiting for the partner (out of the fight). */
  parked?: string;
  /** M11 move-fall-transition: falling in from the sky (lands face down). */
  skyFall?: boolean;
  /** M7 grunt variants: squad leader (shades, gun), elite bodyguard (2 hits, headshot 1), the VIP they guard. */
  variant?: 'leader' | 'bodyguard' | 'vip' | 'riot' | 'target' | 'welder' | 'vending' | 'agent' | NpcVariant;
  /** M8: something carried that isn't a weapon (the boombox NPC's boombox), drawn at the front hand. */
  carry?: 'boombox';
  /** Being taken down (stealth kill) by this actor: held still until the kill (M7). */
  takenBy?: number;
  /** Enemy AI memory (src/sim/ai.ts). */
  ai?: import('./ai').AiState;
  /** M8: a corpse the boss swept away, sliding off the screen at this speed (removed once off it). */
  swept?: { vx: number; vy: number };
  /** M8 boss state machine (src/sim/boss.ts). */
  boss?: import('./boss').BossState;
  /** Lab/AI controller; the player is driven by World.command instead. */
  brain?: Brain;
}

/** Produces the actor's intent each tick (labs now, grunt AI in M3). */
export type Brain = (actor: Actor, dt: number) => import('./command').PlayerCommand;

let nextId = 1;

export function newId(): number {
  return nextId++;
}

/** Dummies created with `held` get that item loaded in their front hand. */
const handFor = (h: HeldItem | undefined): Hand | null => (h ? newHand(h) : null);

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
    hands: [handFor(pose.held), null],
    grenades: 0,
  };
  // scenery corpses (style-frame cast): already dead and settled
  if (a.pose.dead) {
    a.state = 'dead';
    a.hp = 0;
    a.corpse = { phase: 'settled', t: 0, raisable: true, gibbed: false, slumped: false };
  }
  return a;
}

/**
 * M17 (design/qol-pass.md 3a): the depth band a melee blow reaches. Heroes get a wider band than
 * enemies (depth is hard to read from this camera); `base` = the weapon's band.
 */
export function meleeBand(a: Actor, base: number = TUNING.melee.depthBand): number {
  return a.playerIndex !== undefined ? base + TUNING.melee.hero.depthBand - TUNING.melee.depthBand : base;
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
