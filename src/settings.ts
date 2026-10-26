// Settings stub (PLAN.md M4; the full menu comes in M13): volumes and effect intensity.
// Kept in localStorage, which may be unavailable (private windows): every access is guarded.
import type { EffectIntensity } from './data/feel';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  /** Shake, flashes and chromatic split (accessibility). */
  effects: EffectIntensity;
}

const KEY = 'madness-like.settings';
const DEFAULTS: Settings = { master: 0.8, music: 0.7, sfx: 0.9, effects: 'full' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS };
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
