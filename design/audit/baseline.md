# M14b baseline (before slice A)

Measured 2026-10-28 on `origin/main` at `71a12ca` (PR #44 merged, PR #43 spawn variety merged), before any M14b fix. Windows 11 laptop, Node 24.22.1, other agents running on the same machine (absolute times are noisy; compare ratios). The M14b perf gates compare against this file.

## Tooling

| Command | Wall time | Result |
|---|---|---|
| `npm run typecheck` (tsc 7) | 1.3 s | clean |
| `npm test` (vitest 5) | 11.8 s (vitest: 10.1 s) | 36 files passed, 13 skipped; 402 tests passed, 57 skipped |
| `npm run build` (vite 8) | 3.5 s (vite: 1.7 s) | ok, one chunk-size warning |

## Bundle (`npm run build`)

| Asset | Size | gzip |
|---|---|---|
| `index-*.js` (the whole game, labs included) | 1,876 kB | 522 kB |
| `index-*.css` | 5.6 kB | 0.9 kB |
| `MadnessCombat.V1-*.wav` (the music stem, UXS-21) | 48,066 kB | – |
| everything in `dist/` | 50.9 MB | – |

Fonts (woff/woff2) are 28–49 kB each; the gun sound WAVs 27–77 kB each.

## Soak (`SOAK=1 npx vitest run tests/audit/soak.test.ts -t "every room"`)

Seed 1, 120 s per run (or until the room is left), 5 bots × 1p/2p per room: 260 runs, 49 s. Bots other than `mortal-gun` are kept at ≥ 2 hp.

| Room | Runs | Exceptions | Violations | Deaths | Outcomes | worst p95 ms/tick (max) | Max items |
|---|---|---|---|---|---|---|---|
| 1/intro | 10 | 0 | 8 | 0 | timeout 10 | 0.153 (4.717) | 14 |
| 1/riot | 10 | 0 | 0 | 2 | timeout 8, died 2 | 0.141 (3.308) | 47 |
| 1/grenade | 10 | 0 | 0 | 2 | timeout 8, died 2 | 0.154 (14.696) | 22 |
| 1/boss | 10 | 0 | 0 | 2 | timeout 6, cleared 2, died 2 | 0.053 (1.496) | 22 |
| 1/waveB | 10 | 0 | 0 | 3 | died 3, timeout 1, cleared 6 | 0.12 (0.82) | 23 |
| 1/ending | 10 | 0 | 0 | 0 | cleared 10 | 0.027 (0.513) | 3 |
| 2/wall | 10 | 0 | 0 | 0 | timeout 6, ->corner 4 | 0.06 (3.481) | 2 |
| 2/corner | 10 | 0 | 0 | 0 | timeout 3, ->roofA 7 | 0.047 (0.716) | 3 |
| 2/roofA | 10 | 0 | 0 | 3 | timeout 6, ->roofB 1, died 3 | 0.06 (2.557) | 3 |
| 2/roofB | 10 | 0 | 0 | 1 | timeout 9, died 1 | 0.044 (0.591) | 5 |
| 2/office | 10 | 0 | 0 | 1 | timeout 7, ->corridor 2, died 1 | 0.151 (29.447) | 31 |
| 2/corridor | 10 | 0 | 0 | 10 | died 10 | 0.08 (0.765) | 5 |
| 2/elevator | 10 | 0 | 4 | 2 | timeout 8, died 2 | 0.057 (3.43) | 12 |
| 2/swords | 10 | 0 | 0 | 1 | timeout 2, ->lobby 7, died 1 | 0.369 (5.573) | 26 |
| 2/lobby | 10 | 0 | 0 | 3 | timeout 3, ->crates 4, died 3 | 0.141 (3.327) | 10 |
| 2/crates | 10 | 0 | 0 | 0 | timeout 7, ->final 3 | 0.079 (3.863) | 14 |
| 2/final | 10 | 0 | 5 | 2 | timeout 8, died 2 | 0.122 (1.413) | 3 |
| 3/outside | 10 | 0 | 0 | 0 | timeout 3, ->vent 7 | 0.079 (4.144) | 8 |
| 3/vent | 10 | 0 | 0 | 0 | timeout 7, ->tables 3 | 0.066 (2.732) | 11 |
| 3/tables | 10 | 0 | 0 | 2 | timeout 5, ->camera 3, died 2 | 0.095 (2.935) | 16 |
| 3/camera | 10 | 0 | 0 | 2 | timeout 2, ->street 6, died 2 | 0.142 (23.75) | 22 |
| 3/street | 10 | 0 | 5 | 1 | timeout 9, died 1 | 0.287 (19.335) | 28 |
| 3/desert | 10 | 0 | 0 | 2 | timeout 2, ->vending 6, died 2 | 0.173 (6.082) | 31 |
| 3/vending | 10 | **1** | 0 | 1 | timeout 6, ->console 2, died 1, EXCEPTION 1 | 0.113 (3.172) | 14 |
| 3/console | 10 | 0 | 0 | 4 | timeout 4, died 4, ->lift 2 | 0.236 (4.685) | 27 |
| 3/lift | 10 | 0 | 0 | 3 | timeout 3, cleared 6, died 1 | 0.096 (3.08) | 10 |

**Total: 260 runs, 1 exception, 22 violations.** The exception is STB-16 (`alive(undefined)` in `melee.ts` `pullable` ← `pickUp`, 3/vending 2p masher tick 2696). All 22 violations are `softlock` suspects in the rooms that wait on one scripted trick (1/intro talk, 2/elevator roof + cables, 2/final disarm, 3/street pin to the tank; STB-14), not broken state. Max-ms spikes are single ticks (JIT/GC, a busy machine).

## Sim cost in the heavy rooms (harness)

2 players, two `masher` bots (seeds 1 and 101, kept alive), 60 s or until the room ended; "60 bodies" = `world.spawnCorpses(60)` after 0.5 s (the K debug key ×3).

| Room | Bodies | Ticks run | Max actors | p50 ms/tick | p95 ms/tick | max ms |
|---|---|---|---|---|---|---|
| s1 wave B | 0 | 965 | 21 | 0.118 | 0.462 | 5.167 |
| s1 wave B | 60 | 1949 | 83 | 0.096 | 0.285 | 3.227 |
| s2 office | 0 | 3600 | 26 | 0.076 | 0.202 | 3.741 |
| s2 office | 60 | 3600 | 83 | 0.066 | 0.149 | 0.711 |
| s3 street | 0 | 3600 | 15 | 0.052 | 0.183 | 3.658 |
| s3 street | 60 | 2117 | 75 | 0.103 | 0.343 | 3.857 |
| s3 desert | 0 | 3600 | 16 | 0.065 | 0.18 | 2.048 |
| s3 desert | 60 | 3600 | 76 | 0.057 | 0.189 | 1.808 |

The sim stays far below the 16.7 ms frame (worst p95 0.46 ms): frame time is the renderer's.

## Not measured here

- **GPU frame times** (visible pane, real GPU, 60 bodies and full effects) and **co-op bytes/s**: measured later in the browser pane. (The audit's harness estimate for co-op is in `design/audit/uxs.md`, TEC.)
