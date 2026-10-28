// ENC audit: the difficulty curve and the beat sheet (AUDIT=1 npx vitest run tests/audit/enc).
// Bots play every room of stages 1-3 at three reaction speeds; deaths restart the room (stage 1:
// the beat). Prints one table per stage plus the arrival baseline for the spawn-variety work.
import { describe, it } from 'vitest';
import { arrivalSummary, type BotKind, playStage } from './harness';

const SEEDS = (process.env.ENC_SEEDS ?? '1,2,3').split(',').map(Number);
const REACTIONS = (process.env.ENC_REACT ?? '0.1,0.2,0.35').split(',').map(Number);
const BOTS = (process.env.ENC_BOTS ?? 'brawler,gunner').split(',') as BotKind[];
const STAGES = (process.env.ENC_STAGES ?? '1,2,3').split(',').map(Number) as (1 | 2 | 3)[];

describe.skipIf(!process.env.AUDIT)('ENC difficulty curve', () => {
  it('stages 1-3, bots x reactions x seeds', () => {
    const out: string[] = [];
    for (const stage of STAGES) {
      for (const bot of BOTS) {
        for (const reaction of REACTIONS) {
          const agg = new Map<string, { n: number; s: number; hits: number; deaths: number; failed: number; locked: number; combat: number; lull: number; toExit: number; cheats: Set<string> }>();
          let total = 0;
          const t0 = Date.now();
          let stuck: string[] = [], off = 0, shots = 0, ff = 0, maxTok = 0;
          for (const seed of SEEDS) {
            const r = playStage({ stage, bot, reaction, seed });
            total += r.total;
            for (const x of r.rooms) {
              const a = agg.get(x.room) ?? { n: 0, s: 0, hits: 0, deaths: 0, failed: 0, locked: 0, combat: 0, lull: 0, toExit: 0, cheats: new Set<string>() };
              a.n++; a.s += x.seconds; a.hits += x.hits; a.deaths += x.deaths; a.failed += x.failed ? 1 : 0;
              a.locked += x.locked; a.combat += x.combat; a.lull += x.lull; a.toExit += x.toExit;
              x.cheats.forEach((c) => a.cheats.add(c));
              agg.set(x.room, a);
            }
            stuck = stuck.concat(r.extra.stuck); off += r.extra.offscreenShots; shots += r.extra.enemyShots; ff += r.extra.friendlyKills; maxTok = Math.max(maxTok, r.extra.maxAttackersSeen);
            if (bot === 'gunner' && reaction === 0.2 && seed === SEEDS[0]) out.push(`ARRIVALS stage ${stage} (gunner 0.2, seed ${seed})\n` + arrivalSummary(r.arrivals).join('\n'));
          }
          out.push(`STAGE ${stage} ${bot} r=${reaction} (${SEEDS.length} seeds, sim ${(total / SEEDS.length).toFixed(0)} s/run, wall ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
          out.push('room      | s/run | hits | deaths | failed | combat | locked | lull | toExit | assists');
          for (const [room, a] of agg) {
            const k = SEEDS.length;
            out.push(`${room.padEnd(9)} | ${(a.s / k).toFixed(0).padStart(5)} | ${(a.hits / k).toFixed(1).padStart(4)} | ${(a.deaths / k).toFixed(1).padStart(6)} | ${String(a.failed).padStart(6)} | ${(a.combat / k).toFixed(0).padStart(6)} | ${(a.locked / k).toFixed(0).padStart(6)} | ${(a.lull / k).toFixed(0).padStart(4)} | ${(a.toExit / k).toFixed(0).padStart(6)} | ${[...a.cheats].join(',')}`);
          }
          out.push(`enemy shots ${shots}, from off-screen ${off}; enemy-on-enemy kills ${ff}; max token holders ${maxTok}; stuck ${stuck.length}${stuck.length ? ': ' + stuck.slice(0, 6).join(' | ') : ''}`);
          console.log(out.splice(0).join('\n'));
        }
      }
    }
  }, 3_600_000);
});
