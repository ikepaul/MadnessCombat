import { TUNING } from '../data/tuning';
import type { Actor } from './actor';
import { type Ball, type Cannon, stepCannons } from './cannon';
import { IDLE_COMMAND, type PlayerCommand } from './command';
import { EventBus } from './events';
import { stepPlayer } from './movement';
import type { RoomDef } from './room';

/** The simulation state. Stepped only by FixedClock, at 60 Hz. */
export class World {
  readonly events = new EventBus();
  readonly actors: Actor[] = [];
  readonly dt = 1 / TUNING.simHz;
  tick = 0;
  /** The actor driven by player commands. */
  player?: Actor;
  /** Command for the next tick; edges (jump/dive) are cleared after use. */
  command: PlayerCommand = { ...IDLE_COMMAND };
  cannons: Cannon[] = [];
  balls: Ball[] = [];

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
    if (this.player) stepPlayer(this, this.player, this.command, this.dt);
    this.command = { ...this.command, jump: false, dive: false };
    stepCannons(this, this.dt);
    this.events.emit('tick', { tick: this.tick });
  }
}
