import type { ScreenPoint } from '../render/camera';
import type { AttackKind } from './actor';

/** One tick of actor intent: built by the input layer for the player, by a Brain for others. */
export interface PlayerCommand {
  /** -1..1 left/right. */
  moveX: number;
  /** -1..1, positive = away from the camera (W). */
  moveZ: number;
  /** Pressed this tick (edge). */
  jump: boolean;
  /** Pressed this tick (edge): go prone / dive, or get up again. */
  dive: boolean;
  /**
   * Pressed this tick (edge): LMB = light, RMB = heavy (an uppercut when aimed steeply up).
   * A punch at a downed body turns into the finisher.
   */
  attack: Exclude<AttackKind, 'finisher' | 'throw'> | null;
  /** Pressed this tick (edge): grab, or throw what is held. */
  grab: boolean;
  /** Cursor in screen pixels; facing follows the aim side. */
  aim?: ScreenPoint;
  /** Explicit facing (brains, which have no cursor). */
  face?: 1 | -1;
}

export const IDLE_COMMAND: PlayerCommand = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false };

/** Edge fields, cleared once a tick consumed them. */
export function clearEdges(c: PlayerCommand): PlayerCommand {
  return { ...c, jump: false, dive: false, attack: null, grab: false };
}

/** Keep edges latched between frames until a tick runs. */
export function mergeEdges(pending: PlayerCommand, next: PlayerCommand): PlayerCommand {
  return {
    ...next,
    jump: pending.jump || next.jump,
    dive: pending.dive || next.dive,
    attack: next.attack ?? pending.attack,
    grab: pending.grab || next.grab,
  };
}

export function hasEdges(c: PlayerCommand): boolean {
  return c.jump || c.dive || c.attack !== null || c.grab;
}
