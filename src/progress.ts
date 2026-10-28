// Saved progress (PLAN.md M13, decided 2026-10-27): stages unlock as you go (stage 1 from the
// start, finishing a stage unlocks the next) and "Continue" resumes at the last room checkpoint.
// localStorage may be unavailable (private windows): every access is guarded.
import type { Actor } from './sim/actor';

/** A room checkpoint: the room entered last, with the loadout and body count it was entered with. */
export interface Checkpoint {
  stage: number;
  room: string;
  entry: string;
  kills: number;
  /** M19: the rage bar too (a death restores the value the room was entered with). */
  players: (Pick<Actor, 'hands' | 'grenades'> & { rage?: Actor['rage'] })[];
}

export interface Progress {
  /** Highest stage that can be picked (1-3). */
  unlocked: number;
  checkpoint?: Checkpoint;
}

const KEY = 'madness-like.progress';
export const LAST_STAGE = 3;

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { unlocked: 1, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { unlocked: 1 };
}

export const PROGRESS: Progress = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(PROGRESS));
  } catch { /* storage unavailable */ }
}

/** Entered a room (or started a stage): this is where "Continue" picks up. */
export function saveCheckpoint(cp: Checkpoint): void {
  PROGRESS.checkpoint = structuredClone(cp);
  PROGRESS.unlocked = Math.max(PROGRESS.unlocked, cp.stage);
  save();
}

/** Finished a stage: the next one opens and the checkpoint moves to its start. */
export function stageFinished(stage: number): void {
  PROGRESS.unlocked = Math.min(LAST_STAGE, Math.max(PROGRESS.unlocked, stage + 1));
  PROGRESS.checkpoint = stage < LAST_STAGE ? { stage: stage + 1, room: '', entry: '', kills: 0, players: [] } : undefined;
  save();
}

/** Forget everything (settings: "reset progress"). */
export function resetProgress(): void {
  PROGRESS.unlocked = 1;
  PROGRESS.checkpoint = undefined;
  save();
}
