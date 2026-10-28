// Difficulty (settings): how many enemies each room sends and how much health the bosses and
// mini-bosses have. Pro is the game as designed; the others scale it. All numbers invented.
import type { World } from './world';

export type Difficulty = 'noob' | 'pro' | 'hacker' | 'notch';

export const DIFFICULTIES: Difficulty[] = ['noob', 'pro', 'hacker', 'notch'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { noob: 'Noob', pro: 'Pro', hacker: 'Hacker', notch: 'Notch' };

/** enemies: share of each room's enemies that spawn; bossHp: boss / mini-boss health scale. invented */
export const DIFFICULTY: Record<Difficulty, { enemies: number; bossHp: number }> = {
  noob: { enemies: 0.5, bossHp: 0.5 },
  pro: { enemies: 1, bossHp: 1 },
  hacker: { enemies: 1.5, bossHp: 1.75 },
  notch: { enemies: 2.5, bossHp: 3 },
};

/**
 * How many enemies the `i`-th spawn (0-based) of a room stands for at this difficulty: spread
 * evenly, so Noob drops every other one (keeping the first) and Notch doubles or triples them.
 */
export function spawnCount(world: World, i: number): number {
  const m = DIFFICULTY[world.difficulty].enemies;
  return Math.round((i + 1) * m) - Math.round(i * m);
}

/** A boss's or mini-boss's health at this difficulty (never below 1). */
export function bossHp(world: World, hp: number): number {
  return Math.max(1, Math.round(hp * DIFFICULTY[world.difficulty].bossHp));
}
