// M14b (UXS-15): single player pauses when the window loses focus (alt-tab to a chat message).

/** Seconds after focus returns in which key / click edges don't skip the death wait. invented */
export const FOCUS_GUARD = 0.3;

export interface BlurState {
  /** Co-op on two laptops: the host's world runs on (the guest sends idle instead, UXS-07). */
  coop?: 'host' | 'guest';
  /** Labs and the test room are dev tools (the console steals focus all the time). */
  dev: boolean;
  menuOpen: boolean;
  /** The end card is up. */
  cleared: boolean;
  /** Nobody is standing: the restart wait runs (pausing it would only stall the restart). */
  dead: boolean;
}

/** Does a window blur open the pause menu? */
export function pauseOnBlur(s: BlurState): boolean {
  return !s.coop && !s.dev && !s.menuOpen && !s.cleared && !s.dead;
}

/** May a key / click edge skip the death wait, `sinceFocus` seconds after the window got focus back? */
export function edgeCounts(sinceFocus: number): boolean {
  return sinceFocus > FOCUS_GUARD;
}
