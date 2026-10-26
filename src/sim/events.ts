// Typed event bus. The sim emits; rendering, VFX, audio and HUD subscribe. The sim never
// calls them directly, so feel code stays out of gameplay code and events can be asserted
// in tests. Later milestones add their events to GameEvents.

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
}

export type HitKind = 'light' | 'heavy' | 'uppercut' | 'finisher' | 'sweep' | 'body' | 'head' | 'wall';

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<E[K]>)(payload);
  }
}
