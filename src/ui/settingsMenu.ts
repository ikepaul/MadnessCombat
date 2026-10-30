// The settings rows (PLAN.md M13): volumes, effect intensity, reduced motion, blood, key bindings,
// reset progress. Shared by the title screen and the pause menu.
import Phaser from 'phaser';
import { audio } from '../audio/mixer';
import { resetProgress } from '../progress';
import { type Action, ACTION_LABELS, DEFAULT_KEYS, FRIENDLY_FIRE_LABELS, type FriendlyFire, keyText, RISKY_KEYS, SETTINGS, saveSettings } from '../settings';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '../sim/difficulty';
import type { MenuItem } from './menu';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const step = (v: number, d: number) => Math.max(0, Math.min(1, Math.round((v + d * 0.1) * 10) / 10));
const apply = () => { saveSettings(); audio()?.applySettings(); };

export function settingsItems(onControls: () => void, onBack: () => void): MenuItem[] {
  const vol = (name: string, k: 'master' | 'music' | 'sfx'): MenuItem => ({
    label: () => `${name}   ◀ ${pct(SETTINGS[k])} ▶`,
    adjust: (d) => { SETTINGS[k] = step(SETTINGS[k], d); apply(); },
  });
  const effects = ['full', 'reduced', 'off'] as const;
  const ff: FriendlyFire[] = ['damage', 'knockdown', 'through'];
  const cycleFriendly = (d: number) => { SETTINGS.friendlyFire = ff[(ff.indexOf(SETTINGS.friendlyFire) + d + 3) % 3]; apply(); };
  const cycleDifficulty = (d: number) => { SETTINGS.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(SETTINGS.difficulty) + d + 4) % 4]; apply(); };
  return [
    { label: () => `Difficulty   ◀ ${DIFFICULTY_LABELS[SETTINGS.difficulty]} ▶`, action: () => cycleDifficulty(1), adjust: (d) => cycleDifficulty(d) },
    vol('Master volume', 'master'),
    vol('Music', 'music'),
    vol('Sound effects', 'sfx'),
    {
      label: () => `Screen effects   ◀ ${SETTINGS.effects} ▶`,
      adjust: (d) => { SETTINGS.effects = effects[(effects.indexOf(SETTINGS.effects) + d + 3) % 3]; apply(); },
      action: () => { SETTINGS.effects = effects[(effects.indexOf(SETTINGS.effects) + 1) % 3]; apply(); },
    },
    { label: () => `Reduced motion   ${SETTINGS.reducedMotion ? 'on' : 'off'}`, action: () => { SETTINGS.reducedMotion = !SETTINGS.reducedMotion; apply(); }, adjust: () => { SETTINGS.reducedMotion = !SETTINGS.reducedMotion; apply(); } },
    { label: () => `Blood   ${SETTINGS.blood === 'stage' ? 'as each stage has it' : 'off'}`, action: () => { SETTINGS.blood = SETTINGS.blood === 'stage' ? 'off' : 'stage'; apply(); }, adjust: () => { SETTINGS.blood = SETTINGS.blood === 'stage' ? 'off' : 'stage'; apply(); } },
    { label: () => `Thrown weapons hit your ally   ◀ ${FRIENDLY_FIRE_LABELS[SETTINGS.friendlyFire]} ▶`, action: () => cycleFriendly(1), adjust: (d) => cycleFriendly(d) },
    { label: () => `Co-op move hints   ◀ ${SETTINGS.coopHints ? 'on' : 'off'} ▶`, action: () => { SETTINGS.coopHints = !SETTINGS.coopHints; apply(); }, adjust: () => { SETTINGS.coopHints = !SETTINGS.coopHints; apply(); } },
    { label: 'Controls', action: onControls },
    { label: () => 'Reset progress', action: () => resetProgress() },
    { label: 'Back', action: onBack },
  ];
}

/** Phaser key name for a browser key event (KeyCodes is keyed by name). */
function keyName(e: KeyboardEvent): string | undefined {
  const codes = Phaser.Input.Keyboard.KeyCodes as Record<string, number>;
  return Object.keys(codes).find((n) => codes[n] === e.keyCode);
}

/** One row per action: Enter, then press the new key (Esc cancels). Plus "Defaults" and "Back". */
export function controlsItems(scene: Phaser.Scene, listening: (on: boolean) => void, onBack: () => void): MenuItem[] {
  let waiting: Action | undefined;
  const rows: MenuItem[] = (Object.keys(ACTION_LABELS) as Action[]).map((a) => ({
    // CMB-01: Ctrl (Alt, Meta) can be bound, with a warning: Ctrl + W closes the tab mid-fight
    label: () => `${ACTION_LABELS[a]}   ${waiting === a ? 'press a key…' : keyText(SETTINGS.keys[a])}${waiting !== a && RISKY_KEYS.includes(SETTINGS.keys[a]) ? '   ⚠ with W / Tab it can close or switch the tab' : ''}`,
    action: () => {
      waiting = a;
      listening(true);
      scene.input.keyboard!.once('keydown', (e: KeyboardEvent) => {
        const n = keyName(e);
        if (n && n !== 'ESC') { SETTINGS.keys[a] = n; saveSettings(); }
        waiting = undefined;
        // let this key press finish before the menu listens again
        scene.time.delayedCall(50, () => listening(false));
      });
    },
  }));
  return [
    ...rows,
    { label: 'Defaults', action: () => { SETTINGS.keys = { ...DEFAULT_KEYS }; saveSettings(); } },
    { label: 'Back (applies on the next room)', action: onBack },
  ];
}
