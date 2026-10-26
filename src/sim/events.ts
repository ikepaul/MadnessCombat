// Typed event bus. The sim emits; rendering, VFX, audio and HUD subscribe. The sim never
// calls them directly, so feel code stays out of gameplay code and events can be asserted
// in tests. Later milestones add their events to GameEvents.

export interface GameEvents {
  /** A world tick finished. */
  tick: { tick: number };
  /** The room changed (load, palette swap); static layers must re-bake. */
  roomChanged: { roomId: string };
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
