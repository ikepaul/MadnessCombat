// Audit soak (design/audit/README.md §2a), opt-in: `SOAK=1 npx vitest run tests/audit/soak.test.ts`.
// Every room of stages 1-3 × seeds × {idle, masher, progress∘brawler, progress∘gunner} × {1p, 2p},
// `SOAK_SECONDS` (default 120) each or until the room is left. Prints one table plus every
// violation with its repro (stage, room, players, bot, seed, tick). `SOAK_SEEDS=1,2,3` (default 1),
// `SOAK_STAGES=2,3`, `SOAK_OUT=<file>` also writes the report there.
// The smoke test (AUDIT=1 or SOAK=1): one room, 30 s, every bot.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Bot, brawler, gunner, idle, masher, progress, run, type RunResult, STAGE_ROOMS, stageWorld, stateHash } from './harness';

const BOTS: Record<string, (seed: number) => Bot> = {
  idle: () => idle,
  masher: (s) => masher(s),
  'prog-brawl': () => progress(brawler(0.15)),
  'prog-gun': () => progress(gunner(0.2)),
  /** the only mortal bot: the others keep 2 hp so they exercise the whole room */
  'mortal-gun': () => progress(gunner(0.2)),
};

function row(label: string, r: RunResult): string {
  const how = r.exceptions.length ? 'EXCEPTION' : r.cleared ? 'cleared' : r.roomsVisited.length > 1 ? `-> ${r.roomsVisited[1]}` : r.deaths ? 'died' : 'timeout';
  return `${label.padEnd(34)} ${String(Math.round(r.ticks / 60)).padStart(4)}s ${how.padEnd(12)} d${r.deaths} v${r.violations.length} kills${r.events.kill ?? 0} items<=${r.maxItems} actors<=${r.maxActors} ms p50 ${r.msPerTick.p50} p95 ${r.msPerTick.p95} max ${r.msPerTick.max}`;
}

describe.skipIf(!process.env.SOAK && !process.env.AUDIT)('audit soak', () => {
  it('smoke: one room, 30 s, every bot', () => {
    const lines: string[] = [];
    for (const [name, mk] of Object.entries(BOTS)) {
      const w = stageWorld(2, 'office', 1, 1);
      const r = run(w, [mk(1)], { seconds: 30, stopOnRoomChange: true });
      lines.push(row(`2/office 1p ${name}`, r));
      expect(r.exceptions).toEqual([]);
    }
    console.log(lines.join('\n'));
  });

  it('determinism: same seed and bot give the same state after 600 ticks', () => {
    for (const [stage, room] of [[1, 'riot'], [2, 'office'], [3, 'street']] as const) {
      const a = stageWorld(stage, room, 1, 3), b = stageWorld(stage, room, 1, 3);
      run(a, [masher(3)], { seconds: 10 });
      run(b, [masher(3)], { seconds: 10 });
      expect(stateHash(a), `${stage}/${room}`).toBe(stateHash(b));
    }
  });

  it.skipIf(!process.env.SOAK)('soak: every room', () => {
    const seeds = (process.env.SOAK_SEEDS ?? '1').split(',').map(Number);
    const stages = (process.env.SOAK_STAGES ?? '1,2,3').split(',').map(Number) as (1 | 2 | 3)[];
    const seconds = Number(process.env.SOAK_SECONDS ?? 120);
    const table: string[] = [], details: string[] = [];
    for (const stage of stages) {
      for (const room of STAGE_ROOMS[stage]) {
        for (const players of [1, 2]) {
          for (const [name, mk] of Object.entries(BOTS)) {
            for (const seed of seeds) {
              const label = `${stage}/${room} ${players}p ${name} s${seed}`;
              const w = stageWorld(stage, room, players, seed);
              const r = run(w, [mk(seed), mk(seed + 100)], { seconds, stopOnRoomChange: true, keepAlive: name !== 'mortal-gun' });
              table.push(row(label, r));
              for (const v of [...r.exceptions, ...r.violations]) details.push(`${label} tick ${v.tick} [${v.room}] ${v.rule}: ${v.detail}`);
            }
          }
        }
      }
    }
    const out = `${table.join('\n')}\n\n--- violations (${details.length}) ---\n${details.join('\n')}`;
    console.log(out);
    if (process.env.SOAK_OUT) writeFileSync(process.env.SOAK_OUT, out);
  }, 3_600_000);
});
