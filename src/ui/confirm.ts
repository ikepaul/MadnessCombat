// M14b (UXS-09): a menu row that needs a second press (Reset progress). Phaser-free, so it's tested.
import type { MenuItem } from './menu';

/**
 * The first press only arms the row ("press again to confirm"); the second runs `act` and shows
 * `done`. Moving the cursor off the row disarms it.
 */
export function confirmItem(label: string, act: () => void, done: string): MenuItem {
  let state: 'idle' | 'armed' | 'done' = 'idle';
  return {
    label: () => (state === 'armed' ? `${label}: press again to confirm` : state === 'done' ? done : label),
    action: () => {
      if (state === 'armed') { act(); state = 'done'; } else state = 'armed';
    },
    leave: () => { state = 'idle'; },
  };
}
