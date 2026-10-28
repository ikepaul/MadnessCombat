// Settings (PLAN.md M4 stub, the full menu in M13): volumes, effect intensity, reduced motion,
// blood, key bindings. Kept in localStorage, which may be unavailable (private windows): every
// access is guarded.
import type { EffectIntensity } from './data/feel';

/** Rebindable actions (M13 settings); mouse buttons stay LMB / RMB. */
export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'dive' | 'grab' | 'use' | 'reload' | 'throw' | 'grenade' | 'split' | 'rage' | 'fireMode';

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move back (depth)', down: 'Move forward (depth)', left: 'Move left', right: 'Move right', jump: 'Jump',
  dive: 'Dive / prone', grab: 'Grab / throw / catch', use: 'Pick up / use / takedown', reload: 'Reload',
  throw: 'Throw held weapon', grenade: 'Grenade (hold)', split: 'Split aim (hold)', rage: 'Rage fatality', fireMode: 'Fire mode (rifles)',
};

/** Phaser key names (Phaser.Input.Keyboard.KeyCodes). */
export const DEFAULT_KEYS: Record<Action, string> = {
  up: 'W', down: 'S', left: 'A', right: 'D', jump: 'SPACE', dive: 'CTRL', grab: 'F', use: 'E',
  reload: 'R', throw: 'Q', grenade: 'G', split: 'SHIFT', rage: 'TAB', fireMode: 'B',
};

export type FriendlyFire = 'damage' | 'knockdown' | 'through';
export const FRIENDLY_FIRE_LABELS: Record<FriendlyFire, string> = { damage: 'full damage', knockdown: 'knockdown only', through: 'flies through' };

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  /** Shake, flashes and chromatic split (accessibility). */
  effects: EffectIntensity;
  /** M13: reduced motion: no shake, flashes or chromatic split, whatever the intensity says. */
  reducedMotion: boolean;
  /** M13: blood as each stage has it (stage 1 none, 2-3 on), or off everywhere. */
  blood: 'stage' | 'off';
  /** Co-op: a thrown weapon hitting your ally does full damage, only knocks them down, or flies through (playtest 2026-10-27). */
  friendlyFire: FriendlyFire;
  /** M18: the key glyphs that teach the co-op moves (lift, pass, tear, spin...). */
  coopHints: boolean;
  keys: Record<Action, string>;
}

const KEY = 'madness-like.settings';
const DEFAULTS: Settings = { master: 0.8, music: 0.7, sfx: 0.9, effects: 'full', reducedMotion: false, blood: 'stage', friendlyFire: 'damage', coopHints: true, keys: { ...DEFAULT_KEYS } };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) } };
    }
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
}

export const SETTINGS: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(SETTINGS));
  } catch { /* storage unavailable */ }
}

const ORDER: EffectIntensity[] = ['full', 'reduced', 'off'];

export function cycleEffects(): EffectIntensity {
  SETTINGS.effects = ORDER[(ORDER.indexOf(SETTINGS.effects) + 1) % ORDER.length];
  saveSettings();
  return SETTINGS.effects;
}

/** The effect intensity actually in force (reduced motion turns them all off). */
export function effectLevel(): EffectIntensity {
  return SETTINGS.reducedMotion ? 'off' : SETTINGS.effects;
}
