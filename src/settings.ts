// Settings (PLAN.md M4 stub, the full menu in M13): volumes, effect intensity, reduced motion,
// blood, key bindings. Kept in localStorage, which may be unavailable (private windows): every
// access is guarded.
import type { EffectIntensity } from './data/feel';
import { type Difficulty, DIFFICULTIES } from './sim/difficulty';

/** Rebindable actions (M13 settings); mouse buttons stay LMB / RMB. */
export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'dive' | 'grab' | 'use' | 'reload' | 'throw' | 'grenade' | 'split' | 'rage' | 'fireMode';

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move back (depth)', down: 'Move forward (depth)', left: 'Move left', right: 'Move right', jump: 'Jump',
  dive: 'Dive / prone', grab: 'Grab / throw / catch', use: 'Pick up / use / takedown', reload: 'Reload',
  throw: 'Throw held weapon', grenade: 'Grenade (hold)', split: 'Split aim (hold)', rage: 'Rage fatality', fireMode: 'Fire mode (rifles)',
};

/**
 * Phaser key names (Phaser.Input.Keyboard.KeyCodes). M14b (CMB-01, decided): dive on C, not Ctrl
 * (Ctrl + W closes the tab, Ctrl + Tab switches it); Ctrl can still be bound, with a warning.
 */
export const DEFAULT_KEYS: Record<Action, string> = {
  up: 'W', down: 'S', left: 'A', right: 'D', jump: 'SPACE', dive: 'C', grab: 'F', use: 'E',
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
  /** Enemies per room and boss health: Noob, Pro (as designed), Hacker, Notch. */
  difficulty: Difficulty;
  keys: Record<Action, string>;
  /** M14b (CMB-02): M mutes and unmutes without touching the master volume. */
  muted: boolean;
  /** M14b (UXS-12): the save format; older saves are migrated on load. */
  version: number;
}

const KEY = 'madness-like.settings';
/** UXS-12: 1 = M14b (dive moved from Ctrl to C, `muted`). */
export const SETTINGS_VERSION = 1;
const DEFAULTS: Settings = { master: 0.8, music: 0.7, sfx: 0.9, effects: 'full', reducedMotion: false, blood: 'stage', friendlyFire: 'damage', coopHints: true, difficulty: 'pro', keys: { ...DEFAULT_KEYS }, muted: false, version: SETTINGS_VERSION };

/** A Phaser key name ('W', 'SPACE', 'NUMPAD_ONE'...); anything else falls back to the default. */
const KEY_NAME = /^[A-Z][A-Z0-9_]{0,23}$/;

/**
 * UXS-12: a saved (or hand-edited, or older) settings object -> valid settings. Every field that
 * is missing or of the wrong type comes back as its default; volumes are clamped to 0..1.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  const oneOf = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const version = typeof s.version === 'number' && Number.isFinite(s.version) ? s.version : 0;
  const savedKeys = (s.keys && typeof s.keys === 'object' ? s.keys : {}) as Record<string, unknown>;
  const keys = { ...DEFAULT_KEYS };
  for (const a of Object.keys(DEFAULT_KEYS) as Action[]) {
    const k = savedKeys[a];
    if (typeof k === 'string' && KEY_NAME.test(k)) keys[a] = k;
  }
  // version 0 saved every key, so dive was Ctrl for everyone: move them to the new default
  if (version < 1 && keys.dive === 'CTRL') keys.dive = DEFAULT_KEYS.dive;
  return {
    master: vol(s.master, DEFAULTS.master), music: vol(s.music, DEFAULTS.music), sfx: vol(s.sfx, DEFAULTS.sfx),
    effects: oneOf(s.effects, ['full', 'reduced', 'off'] as const, DEFAULTS.effects),
    reducedMotion: bool(s.reducedMotion, DEFAULTS.reducedMotion),
    blood: oneOf(s.blood, ['stage', 'off'] as const, DEFAULTS.blood),
    friendlyFire: oneOf(s.friendlyFire, Object.keys(FRIENDLY_FIRE_LABELS) as FriendlyFire[], DEFAULTS.friendlyFire),
    coopHints: bool(s.coopHints, DEFAULTS.coopHints),
    difficulty: oneOf(s.difficulty, DIFFICULTIES, DEFAULTS.difficulty),
    keys,
    muted: bool(s.muted, DEFAULTS.muted),
    version: SETTINGS_VERSION,
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeSettings(JSON.parse(raw));
  } catch { /* storage unavailable, or not JSON */ }
  return sanitizeSettings({ version: SETTINGS_VERSION });
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

/** M14b (CMB-02): M mutes / unmutes; the master volume is kept. */
export function toggleMute(): boolean {
  SETTINGS.muted = !SETTINGS.muted;
  saveSettings();
  return SETTINGS.muted;
}

/** How a Phaser key name reads in text: 'CTRL' -> 'Ctrl', 'SPACE' -> 'Space', 'E' -> 'E'. */
export function keyText(name: string): string {
  return name.length <= 1 ? name : name.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

/** The key bound to `action`, as text (captions, prompts). */
export function keyFor(action: Action): string {
  return keyText(SETTINGS.keys[action]);
}

/**
 * M14b caption key helper (CMB-01, CMB-17 / UXS-10): `{key:dive}` in a caption becomes the key the
 * player bound to dive. Unknown actions are left as they are.
 */
export function fillKeys(text: string): string {
  return text.replace(/\{key:(\w+)\}/g, (m, a: string) => (a in SETTINGS.keys ? keyFor(a as Action) : m));
}

/** Keys the browser keeps for itself in chords (Ctrl + W closes the tab): bindable, with a warning (CMB-01). */
export const RISKY_KEYS = ['CTRL', 'ALT', 'META'];

/** The effect intensity actually in force (reduced motion turns them all off). */
export function effectLevel(): EffectIntensity {
  return SETTINGS.reducedMotion ? 'off' : SETTINGS.effects;
}
