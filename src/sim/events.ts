// Typed event bus. The sim emits; rendering, VFX, audio and HUD subscribe. The sim never
// calls them directly, so feel code stays out of gameplay code and events can be asserted
// in tests. Later milestones add their events to GameEvents.

import type { WeaponId } from '../data/weapons';

interface At { actorId: number; x: number; y: number; z: number }

export interface GameEvents {
  /** A world tick finished. */
  tick: { tick: number };
  /** The room changed (load, palette swap); static layers must re-bake. */
  roomChanged: { roomId: string };
  /** Half a walk cycle completed (one foot down). */
  footstep: At;
  jump: At;
  /** Touched down after a jump or fall. */
  land: At & { fallSpeed: number };
  /** Started a dive or drop to prone. */
  dive: At;
  standUp: At;
  cannonFire: { x: number; z: number };
  cannonHit: { actorId: number };

  /** A punch reached its active frames (smear arc). `x, y, z` = fist. */
  punch: At & { kind: HitKind; facing: 1 | -1 };
  /** Something connected. `x, y, z` = contact point; dirX/dirZ = push direction. */
  hit: At & {
    attackerId: number; kind: HitKind; part: 'head' | 'body'; damage: number; killed: boolean; dirX: number; dirZ: number;
    /** This hit got the combo bonus; `chain` = its position in the chain (1 = first hit). */
    combo: boolean; chain: number;
  };
  kill: At & { byId: number; kind: HitKind; decap: boolean };
  /** A gun fired (M5): muzzle/eject on screen, barrel angle, one ray per pellet (tracer end, impact). */
  shot: At & {
    hand: 0 | 1; weapon: WeaponId; muzzle: [number, number]; eject: [number, number]; angle: number;
    rays: import('./guns').ShotRay[]; suppressed: boolean;
  };
  /** Trigger pulled on an empty gun (the next press throws it). */
  dryFire: At & { hand: 0 | 1; weapon: WeaponId };
  /** Reload started (magazine out) or finished (magazine in). */
  reload: At & { hand: 0 | 1; phase: 'start' | 'end'; weapon: WeaponId };
  /** A weapon picked up off the floor. */
  pickup: At & { itemId: number; hand: 0 | 1; item: string };
  /** Co-op: a hero ran out of lives and lies in a revive circle. */
  playerDown: At;
  /** Co-op: a teammate finished the revive; the hero gets up. */
  revive: At;
  /** The player got a life back (a kill). */
  heal: { actorId: number; hp: number };
  /** A body landed on the floor (knockback, death, throw). */
  bodyFall: At & { speed: number };
  /** A flying body hit a wall. */
  wallHit: At & { wall: 'left' | 'right' | 'back'; speed: number };
  grab: At & { targetId?: number; itemId?: number };
  throw: At & { targetId?: number; itemId?: number; vx: number; vz: number };
  /** A held weapon or a severed head left the body. */
  itemDrop: { itemId: number; x: number; y: number; z: number };
  /** Corpse lifecycle: settled (pool starts), frozen (baked), thawed (picked up again). */
  corpseSettled: At;
  corpseFrozen: { actorId: number };
  corpseThawed: { actorId: number };

  /** An enemy appeared (walking in from an edge, or stepping out of a door). */
  spawn: At;
  /** A door started opening (spawn telegraph) or closing. */
  doorOpen: { door: number };
  doorClose: { door: number };
  waveStart: { wave: string };
  /** Every wave of the room's script ran and every enemy is dead. */
  roomCleared: { kills: number };

  // M6: throwing, explosives, disarms, shields, melee weapons
  /** A weapon left a hand without its holder dying: stolen, knocked away, shot out of the hand. */
  disarm: At & { byId: number; how: 'steal' | 'knock' | 'shot'; item: string };
  /** A thrown weapon was caught out of the air (throw-catch-return). */
  catch: At & { itemId: number; item: string };
  /** A thrown blade stuck in a body or a wall (throw-knives, melee-weapons). */
  stick: { itemId: number; surface: 'flesh' | 'wall'; x: number; y: number; z: number };
  /** Pulling a stuck blade or the planted sign out: started, done. */
  pull: At & { itemId: number; phase: 'start' | 'end'; item: string };
  /** A grenade's pin came out (cooking started; the pin drops as debris). */
  grenadePin: At;
  grenadeBounce: { itemId: number; x: number; y: number; z: number };
  /** A blast at a floor point: kills in `radius`, scorch decal, breakable floors (M9). */
  explosion: { x: number; y: number; z: number; radius: number; byId: number };
  /** A corpse was blown apart (can't be raised any more). */
  gib: At;
  /** A held body took a hit meant for its holder (combat-human-shield); `broke` = it fell apart. */
  shieldHit: At & { holderId: number; broke: boolean };
  /** A long-weapon thrust pinned a body to a wall or prop (melee-environment-weapon). */
  pin: At & { targetId: number };

  // M7: armed enemies, stealth, zombies
  /** An enemy raised its gun at a player: the aim telegraph (shot follows after TUNING.ai.ranged.telegraph). */
  aimStart: At & { targetId: number; weapon: WeaponId };
  /** The telegraph was broken off (the target got out of reach or the shooter was hit). */
  aimCancel: At;
  /** An unaware enemy noticed something (head snap, "!" mark). */
  alert: At;
  /** A stealth takedown started (victim grabbed) or finished (silent kill). */
  takedown: At & { targetId: number; how: 'knife' | 'wire'; phase: 'start' | 'kill' };
  /** A grunt kicked a table over for cover (combat-cover); `tableLand` = it hit the floor. */
  tableFlip: At & { prop: number };
  tableLand: { x: number; y: number; z: number };
  /** A corpse started rising as a zombie, or is up. */
  zombieRise: At & { phase: 'start' | 'up' };
  /** A zombie lost its head and keeps coming. */
  zombieHeadless: At;
  // M9: room graph
  /** A player took an exit (walked in, pressed E, or a blast on a breach tile). */
  exitTaken: { exit: string; kind: string; byId: number };
  exitOpen: { exit: string; kind: string };
  /** Entered a room (a checkpoint). */
  roomEnter: { stage: number; room: string; entry: string };
  /** The ink wipe: `out` covers the screen, `in` uncovers the next room. */
  roomTransition: { phase: 'out' | 'in'; kind: string };
  /** enemy-squad-leader: the leader died, his squad charges (one per member). */
  squadCharge: At;

  // M8: scripted beats (src/sim/sequencer.ts)
  /** A text card from a script: `title` = full screen on black, `caption` = a line at the bottom. */
  card: { text: string; seconds: number; style: 'title' | 'caption' };
  /** A script switched the music cue (assets/music/cues.json track id; null = ambience only). */
  music: { cue: string | null };
  /** A scripted screen shake (a landing boss, a falling cannon). */
  cameraShake: { px: number; seconds: number };

  // M8: the stage-1 boss (src/sim/boss.ts)
  /** He starts floating down from above the frame, or has settled at his hover height. */
  bossArrive: At & { phase: 'descend' | 'land' | 'leave' };
  /** M9 (boss-halo clip 5): the telekinetic fling across the room; the mass raise (`count` corpses). */
  bossFling: At & { targetId: number; dir: 1 | -1 };
  massRaise: At & { count: number };
  /** The target ran out of the room (boss-target). */
  targetFled: At;
  /** Lightning telegraph: his hand goes up toward a corpse (the bolt follows after TUNING.boss.castTime). */
  bossCast: At & { targetId: number };
  /** A lightning bolt from his hand to its target (raise: a corpse). */
  lightning: { actorId: number; targetId: number; from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } };
  /** The ward came up or went down. */
  ward: At & { up: boolean };
  /** A ray stopped on the ward: ricochet sparks at that screen point. */
  wardHit: { actorId: number; at: [number, number] };
  /** Hover dash: the wind-up (leans back), then the glide toward `targetId`. */
  bossDash: At & { targetId: number; phase: 'windup' | 'go' };
  /** He slammed the held hero into the floor (shake, dust); `n` counts up from 1. */
  bossSlam: At & { targetId: number; n: number };
  /** Telekinetic sweep: the gesture starts, then the corpses fly off the screen (`dir` = away from him). */
  bossSweep: At & { phase: 'windup' | 'push'; dir: 1 | -1; count: number };
  /** The summoned cannon: its shadow appears, it starts falling, it lands (crushing what's under it). */
  cannonDrop: { x: number; z: number; phase: 'shadow' | 'fall' | 'land' };
}

export type HitKind =
  | 'light' | 'heavy' | 'uppercut' | 'finisher' | 'sweep' | 'body' | 'head' | 'wall' | 'bullet' | 'gun'
  // M6: knife stab, blade swing, blunt swing, thrown blade, explosion, long-weapon pin
  | 'stab' | 'slash' | 'smash' | 'knife' | 'blast' | 'pin'
  // M7: silent stealth kill
  | 'takedown'
  // M8: the boss's lightning strike
  | 'lightning'
  // M9: the boss's telekinetic fling (boss-halo clip 5)
  | 'fling'
  // M8: a cannonball, or the cannon landing on you
  | 'cannon';

/** Melee hits (combos chain these). */
export const MELEE_KINDS: HitKind[] = ['light', 'heavy', 'uppercut', 'finisher', 'stab', 'slash', 'smash'];

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();
  private any = new Set<(type: keyof E, payload: unknown) => void>();

  /** Every event, in order (co-op: the host forwards them all to player 2). */
  onAny(fn: (type: keyof E, payload: unknown) => void): () => void {
    this.any.add(fn);
    return () => this.any.delete(fn);
  }

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const fn of this.any) fn(type, payload);
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<E[K]>)(payload);
  }
}
