// Saved progress (PLAN.md M13, decided 2026-10-27): stages unlock as you go (stage 1 from the
// start, finishing a stage unlocks the next) and "Continue" resumes at the last room checkpoint.
// localStorage may be unavailable (private windows): every access is guarded.
// M14b (UXS-03 + UXS-12, STB-06 / UXS-01): saves carry a version and are sanitized on load; the
// saved checkpoint only moves forward (by its order key: stage, room index, beat index), so a
// replayed earlier stage never moves Continue back. Restarts after a death use the run's own
// latest checkpoint (`RUN`), which follows a replay wherever it is.
import type { Actor } from './sim/actor';
import { STAGE1_BEATS } from './data/stages/stage1Script';
import { STAGE2 } from './data/stages/stage2';
import { STAGE3 } from './data/stages/stage3';

/**
 * A room checkpoint: the room entered last, with the loadout and body count it was entered with.
 * Stage 1 (one room, five beats): room 'arena', entry = the beat (riot, grenade, boss, waveB, ending).
 */
export interface Checkpoint {
  stage: number;
  room: string;
  entry: string;
  /** STB-08: the room's seed (`world.roomSeed`), so a restart replays the same room. */
  seed?: number;
  kills: number;
  /** M19: the rage bar too (a death restores the value the room was entered with). */
  players: (Pick<Actor, 'hands' | 'grenades'> & { rage?: Actor['rage'] })[];
}

export interface Progress {
  /** Highest stage that can be picked (1-3). */
  unlocked: number;
  /** The furthest checkpoint reached (Continue). */
  checkpoint?: Checkpoint;
  /** UXS-12: the save format. */
  version: number;
}

const KEY = 'madness-like.progress';
export const LAST_STAGE = 3;
/** UXS-12: 1 = M14b (versioned, stage 1 beat checkpoints). */
export const PROGRESS_VERSION = 1;

/** Room ids in play order per stage (the order key's room index). Stage 1 is one room. */
const ROOM_ORDER: Record<number, string[]> = { 1: ['arena'], 2: Object.keys(STAGE2.rooms), 3: Object.keys(STAGE3.rooms) };

type Place = Pick<Checkpoint, 'stage' | 'room' | 'entry'>;

/** The checkpoint's place in the game: [stage, room index, beat index]. A stage's start (room '') sorts before its first room. */
export function orderKey(cp: Place): [number, number, number] {
  const room = cp.room ? (ROOM_ORDER[cp.stage]?.indexOf(cp.room) ?? -1) : -1;
  const beat = cp.stage === 1 ? Math.max(0, (STAGE1_BEATS as readonly string[]).indexOf(cp.entry)) : 0;
  return [cp.stage, room, beat];
}

/** -1 / 0 / 1: `a` comes before, at, or after `b` by order key. */
export function compareCheckpoints(a: Place, b: Place): number {
  const ka = orderKey(a), kb = orderKey(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  return 0;
}

/** UXS-12: a checkpoint naming a stage / room / beat that exists, with sane numbers; otherwise undefined. */
function sanitizeCheckpoint(raw: unknown): Checkpoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const stage = c.stage;
  if (typeof stage !== 'number' || !Number.isInteger(stage) || stage < 1 || stage > LAST_STAGE) return undefined;
  const room = typeof c.room === 'string' ? c.room : '';
  const entry = typeof c.entry === 'string' ? c.entry : '';
  if (room && !ROOM_ORDER[stage].includes(room)) return undefined;
  if (stage === 1 && room && !(STAGE1_BEATS as readonly string[]).includes(entry)) return undefined;
  const kills = typeof c.kills === 'number' && Number.isFinite(c.kills) ? Math.max(0, Math.floor(c.kills)) : 0;
  const players = (Array.isArray(c.players) ? c.players : []).filter((p) => !!p && typeof p === 'object' && Array.isArray((p as { hands?: unknown }).hands)) as Checkpoint['players'];
  const seed = typeof c.seed === 'number' && Number.isInteger(c.seed) ? c.seed : undefined;
  return { stage, room, entry, seed, kills, players };
}

/** UXS-12: a saved (or hand-edited, or older) progress object -> valid progress; bad fields come back as defaults. */
export function sanitizeProgress(raw: unknown): Progress {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const u = typeof p.unlocked === 'number' && Number.isFinite(p.unlocked) ? Math.floor(p.unlocked) : 1;
  const checkpoint = sanitizeCheckpoint(p.checkpoint);
  const unlocked = Math.max(1, Math.min(LAST_STAGE, u), checkpoint?.stage ?? 1);
  return { unlocked, checkpoint, version: PROGRESS_VERSION };
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeProgress(JSON.parse(raw));
  } catch { /* storage unavailable, or not JSON */ }
  return { unlocked: 1, version: PROGRESS_VERSION };
}

export const PROGRESS: Progress = load();

/**
 * This run's latest checkpoint (memory only): a death restarts here, also while replaying a stage
 * behind the saved one. Set when a stage starts from a menu (`beginRun`) and on every checkpoint.
 */
export const RUN: { checkpoint?: Checkpoint } = {};

/** A stage started from the title / lobby: Continue picks up the saved checkpoint, anything else starts fresh. */
export function beginRun(resume: boolean): void {
  RUN.checkpoint = resume && PROGRESS.checkpoint ? structuredClone(PROGRESS.checkpoint) : undefined;
}

/** Where a restart or a resume picks up: the run's own checkpoint, else the saved one. */
export function resumePoint(): Checkpoint | undefined {
  return RUN.checkpoint ?? PROGRESS.checkpoint;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(PROGRESS));
  } catch { /* storage unavailable */ }
}

/**
 * Entered a room (or a stage 1 beat): a death restarts here, and "Continue" picks up here unless
 * the saved checkpoint is further on (UXS-03).
 */
export function saveCheckpoint(cp: Checkpoint): void {
  RUN.checkpoint = structuredClone(cp);
  PROGRESS.unlocked = Math.min(LAST_STAGE, Math.max(PROGRESS.unlocked, cp.stage));
  if (!PROGRESS.checkpoint || compareCheckpoints(cp, PROGRESS.checkpoint) >= 0) PROGRESS.checkpoint = structuredClone(cp);
  save();
}

/** Finished a stage: the next one opens and the checkpoint moves to its start (never back, UXS-03). */
export function stageFinished(stage: number): void {
  PROGRESS.unlocked = Math.min(LAST_STAGE, Math.max(PROGRESS.unlocked, stage + 1));
  RUN.checkpoint = undefined;
  if (stage >= LAST_STAGE) {
    // the last stage done: nothing further to continue
    if (!PROGRESS.checkpoint || PROGRESS.checkpoint.stage <= stage) PROGRESS.checkpoint = undefined;
  } else {
    const next: Checkpoint = { stage: stage + 1, room: '', entry: '', kills: 0, players: [] };
    if (!PROGRESS.checkpoint || compareCheckpoints(next, PROGRESS.checkpoint) >= 0) PROGRESS.checkpoint = next;
  }
  save();
}

/** Forget everything (settings: "reset progress"). */
export function resetProgress(): void {
  PROGRESS.unlocked = 1;
  PROGRESS.checkpoint = undefined;
  RUN.checkpoint = undefined;
  save();
}
