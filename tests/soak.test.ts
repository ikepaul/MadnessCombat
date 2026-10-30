// The soak (design/audit/README.md §2a, promoted from tests/audit in M14b): every room of stages
// 1-3 under bots, with the invariants (src/sim/invariants.ts) checked every tick.
// Always on (fast subset): every room, 1 player, the masher bot, seed 1, 20 s each.
// Full run: `SOAK=1 npx vitest run tests/soak.test.ts`: every room × seeds × {idle, masher,
// progress∘brawler, progress∘gunner, mortal gunner} × {1p, 2p}, `SOAK_SECONDS` (default 120) each
// or until the room is left. Prints one table plus every violation with its repro (stage, room,
// players, bot, seed, tick). `SOAK_SEEDS=1,2,3` (default 1), `SOAK_STAGES=2,3`, `SOAK_OUT=<file>`.
// Both fail on any exception or violation.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Bot, brawler, gunner, idle, masher, progress, run, type RunResult, STAGE_ROOMS, stageWorld, stateHash, type Violation } from './soakHarness';

const BOTS: Record<string, (seed: number) => Bot> = {
  idle: () => idle,
  masher: (s) => masher(s),
  'prog-brawl': () => progress(brawler(0.15)),
  'prog-gun': () => progress(gunner(0.2)),
  /** the only mortal bot: the others keep 2 hp so they exercise the whole room */
  'mortal-gun': () => progress(gunner(0.2)),
};

/**
 * Rooms that wait on one scripted trick the bots can't do (STB-14: the intro talk, the elevator's
 * roof and cables, disarming the target, pinning the street's mini-boss to the tank) were exempt
 * from the softlock rule until M14b slice C's stuck hints (src/sim/stage.ts `stuckHint`); no
 * longer: every violation counts. Add a room here only with a reason.
 */
const TRICK_ROOMS = new Set<string>();
const counts = (key: string, v: Violation) => !(v.rule === 'softlock' && TRICK_ROOMS.has(key));

function row(label: string, r: RunResult): string {
  const how = r.exceptions.length ? 'EXCEPTION' : r.cleared ? 'cleared' : r.roomsVisited.length > 1 ? `-> ${r.roomsVisited[1]}` : r.deaths ? 'died' : 'timeout';
  return `${label.padEnd(34)} ${String(Math.round(r.ticks / 60)).padStart(4)}s ${how.padEnd(12)} d${r.deaths} v${r.violations.length} kills${r.events.kill ?? 0} items<=${r.maxItems} actors<=${r.maxActors} ms p50 ${r.msPerTick.p50} p95 ${r.msPerTick.p95} max ${r.msPerTick.max}`;
}

function soak(stages: (1 | 2 | 3)[], seeds: number[], bots: string[], players: number[], seconds: number): { out: string; bad: string[] } {
  const table: string[] = [], details: string[] = [], bad: string[] = [];
  for (const stage of stages) {
    for (const room of STAGE_ROOMS[stage]) {
      for (const n of players) {
        for (const name of bots) {
          for (const seed of seeds) {
            const label = `${stage}/${room} ${n}p ${name} s${seed}`;
            const w = stageWorld(stage, room, n, seed);
            const mk = BOTS[name];
            const r = run(w, [mk(seed), mk(seed + 100)], { seconds, stopOnRoomChange: true, keepAlive: name !== 'mortal-gun' });
            table.push(row(label, r));
            for (const v of [...r.exceptions, ...r.violations]) {
              const line = `${label} tick ${v.tick} [${v.room}] ${v.rule}: ${v.detail}`;
              details.push(line);
              if (counts(`${stage}/${room}`, v)) bad.push(line);
            }
          }
        }
      }
    }
  }
  return { out: `${table.join('\n')}\n\n--- violations (${details.length}, ${bad.length} counted) ---\n${details.join('\n')}`, bad };
}

describe('soak (fast subset): every room, masher, seed 1, 20 s', () => {
  it('no exceptions, no violations', () => {
    const { bad } = soak([1, 2, 3], [1], ['masher'], [1], 20);
    expect(bad).toEqual([]);
  }, 300_000);

  it('determinism: same seed and bot give the same state after 600 ticks', () => {
    for (const [stage, room] of [[1, 'riot'], [2, 'office'], [3, 'street']] as const) {
      const a = stageWorld(stage, room, 1, 3), b = stageWorld(stage, room, 1, 3);
      run(a, [masher(3)], { seconds: 10 });
      run(b, [masher(3)], { seconds: 10 });
      expect(stateHash(a), `${stage}/${room}`).toBe(stateHash(b));
    }
  });
});

describe.skipIf(!process.env.SOAK)('soak (full, SOAK=1)', () => {
  it('every room × seeds × bots × 1p/2p', () => {
    const seeds = (process.env.SOAK_SEEDS ?? '1').split(',').map(Number);
    const stages = (process.env.SOAK_STAGES ?? '1,2,3').split(',').map(Number) as (1 | 2 | 3)[];
    const { out, bad } = soak(stages, seeds, Object.keys(BOTS), [1, 2], Number(process.env.SOAK_SECONDS ?? 120));
    console.log(out);
    if (process.env.SOAK_OUT) writeFileSync(process.env.SOAK_OUT, out);
    expect(bad).toEqual([]);
  }, 3_600_000);
});
