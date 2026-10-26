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
   * A punch at a downed body turns into the finisher. Ignored for a hand holding a gun.
   */
  attack: Exclude<AttackKind, 'finisher' | 'throw'> | null;
  /** Pressed this tick (edge): grab, or throw what is held. */
  grab: boolean;
  /** Cursor in screen pixels; facing follows the aim side. */
  aim?: ScreenPoint;
  /** Explicit facing (brains, which have no cursor). */
  face?: 1 | -1;
  /** LMB / RMB pressed this tick (edges): semi-auto shots, dry click, throw when empty (M5). */
  press?: [boolean, boolean];
  /** LMB / RMB held: full-auto fire. */
  hold?: [boolean, boolean];
  /** Pressed this tick (edges): E pick up, R reload, Q throw the held gun. */
  pickup?: boolean;
  reload?: boolean;
  throwGun?: boolean;
  /** Shift held: split aim, the back hand locks onto the nearest enemy on the other side. */
  split?: boolean;
}

export const IDLE_COMMAND: PlayerCommand = { moveX: 0, moveZ: 0, jump: false, dive: false, attack: null, grab: false };

/** Edge fields, cleared once a tick consumed them. */
export function clearEdges(c: PlayerCommand): PlayerCommand {
  return { ...c, jump: false, dive: false, attack: null, grab: false, press: [false, false], pickup: false, reload: false, throwGun: false };
}

/** Keep edges latched between frames until a tick runs. */
export function mergeEdges(pending: PlayerCommand, next: PlayerCommand): PlayerCommand {
  const p = pending.press ?? [false, false], n = next.press ?? [false, false];
  return {
    ...next,
    jump: pending.jump || next.jump,
    dive: pending.dive || next.dive,
    attack: next.attack ?? pending.attack,
    grab: pending.grab || next.grab,
    press: [p[0] || n[0], p[1] || n[1]],
    pickup: !!(pending.pickup || next.pickup),
    reload: !!(pending.reload || next.reload),
    throwGun: !!(pending.throwGun || next.throwGun),
  };
}

export function hasEdges(c: PlayerCommand): boolean {
  return c.jump || c.dive || c.attack !== null || c.grab || !!c.press?.[0] || !!c.press?.[1] || !!c.pickup || !!c.reload || !!c.throwGun;
}
