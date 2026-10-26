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
}

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
