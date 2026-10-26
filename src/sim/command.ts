import type { ScreenPoint } from '../render/camera';

/** One tick of player intent, built by the input layer and consumed by the sim. */
export interface PlayerCommand {
  /** -1..1 left/right. */
  moveX: number;
  /** -1..1, positive = away from the camera (W). */
  moveZ: number;
  /** Pressed this tick (edge). */
  jump: boolean;
  /** Pressed this tick (edge): go prone / dive, or get up again. */
  dive: boolean;
  /** Cursor in screen pixels; facing follows the aim side. */
  aim?: ScreenPoint;
}

export const IDLE_COMMAND: PlayerCommand = { moveX: 0, moveZ: 0, jump: false, dive: false };
