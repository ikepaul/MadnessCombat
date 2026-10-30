// Dev tuning overrides (M13 playtest pass): numbers changed in the F6 tuning panel are kept in
// localStorage and applied to the data objects as they load, so a reload keeps them (and values
// derived at load time, like the jump's gravity, pick them up). Production builds and tests
// (no localStorage) never apply anything.

const KEY = 'madness-like.tuning';

/** Overrides by path, e.g. "TUNING.move.hero.walkSpeed" -> 1.6. */
export function loadOverrides(): Record<string, number> {
  if (!import.meta.env?.DEV) return {};
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(o: Record<string, number>): void {
  try {
    if (Object.keys(o).length === 0) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, JSON.stringify(o));
  } catch { /* storage unavailable */ }
}

/** Set a number deep in `root` by path segments (the data objects are `as const`, but plain objects). */
export function setPath(root: object, path: string[], value: number): boolean {
  let o = root as Record<string, unknown>;
  for (const k of path.slice(0, -1)) {
    const next = o[k];
    if (typeof next !== 'object' || next === null) return false;
    o = next as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (typeof o[last] !== 'number') return false;
  o[last] = value;
  return true;
}

/** Apply the saved overrides for the object registered as `name` (e.g. "TUNING"). */
export function applyOverrides(name: string, root: object): void {
  for (const [k, v] of Object.entries(loadOverrides())) {
    const [head, ...path] = k.split('.');
    if (head === name) setPath(root, path, v);
  }
}

/**
 * M14b (UXS-25): the HUD tag while F6 overrides are in force ("TUNED · 3"), so a playtest never
 * runs on numbers that aren't in the repo without saying so. Empty without overrides.
 */
export function tunedTag(o: Record<string, number> = loadOverrides()): string {
  const n = Object.keys(o).length;
  return n > 0 ? `TUNED · ${n}` : '';
}
