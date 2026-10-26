import { TUNING } from '../data/tuning';
import type { Actor } from './actor';
import { EventBus } from './events';
import type { RoomDef } from './room';

/** The simulation state. Stepped only by FixedClock, at 60 Hz. */
export class World {
  readonly events = new EventBus();
  readonly actors: Actor[] = [];
  tick = 0;

  constructor(public room: RoomDef) {}

  /** Seconds of world time (hit-stop and pause don't advance it). */
  get time(): number {
    return this.tick / TUNING.simHz;
  }

  setRoom(room: RoomDef): void {
    this.room = room;
    this.events.emit('roomChanged', { roomId: room.id });
  }

  step(): void {
    this.tick++;
    this.events.emit('tick', { tick: this.tick });
  }
}
