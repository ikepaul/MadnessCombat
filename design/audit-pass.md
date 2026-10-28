# Audit pass → M14b: options

Status (2026-10-28): the lean audit is done (five lenses: STB stability · CMB controls+combat · ENC enemies+pacing · VIS feel+look+sound · UXS shell+tech; five cross-reviews). 108 findings → **97 rows** after merging duplicates (`design/audit/proposals.md`, scored). Reports: `design/audit/{stb,cmb,enc,vis,uxs}.md`; reviews: `design/audit/review-*.md`. **Decided 2026-10-28 (the user): the suggested bundle as is (all 60 rows, slices A–F), decisions in §4.** Planned as M14b in `PLAN.md`.

Spawn variety is **already done on PR #43** (groups of 2–3, all spawn points, flanks with whistle + chevron, pressure timing, switch `TUNING.waves.variety.on`). Everything about arrival patterns (ENC-06, ENC-18's trickle lull) is covered there, and the ENC-07 order couplings are being fixed on that PR.

Effort: **S** ≈ an afternoon, **M** ≈ a day or two, **L** ≈ a milestone. Impact ★ to ★★★. Votes = `+/0/−` from the five reviews (nobody voted −1; the cuts are the lead's). ✅ = in the suggested bundle.

Run a repro: `AUDIT=1 npx vitest run tests/audit/<lens>` (`stb`, `cmb`, `enc`, `uxs`, `vis`); soak: `SOAK=1 npx vitest run tests/audit/soak.test.ts`. A failing probe = the bug is still there; each probe is that bug's acceptance test.

## 1. State of the game

| Area | One line |
|---|---|
| Stability | Two crash classes in stage 3, one softlock at the end; otherwise clean: 780 soak runs, no NaN, no stuck actors, no ownership breaks. Room changes and restarts leak a few rules and fields. |
| Controls | Fast verbs feel fast (jab 150 ms, shot/grab on tick 1, edges never lost). Holes: only punches buffer, no jump buffer/coyote, Ctrl is a browser trap. |
| Combat | Combos are reliable at human timings (80–100 %). But guns-to-the-head dominate, jab-lock and prone are free wins, and overloaded verbs misfire near bodies. |
| Enemies & difficulty | Token rule, no off-screen fire, generous set-piece tells all hold. No mercy window makes the curve bimodal; the stage 2 corridor is the hardest room in the game; difficulty scales counts, not causes of death. |
| Pacing & teaching | Rooms are short and chain fast. Stage 1 has no checkpoint; grab/throw, prone and combos are never taught; exits open silently. |
| Animation & look | Clip blending and overlap hold (no pops in normal moves). Bodies pop into the slump and out of the hands; the facing flip is instant; feet slide. |
| Feel | Hit-stop budget holds in normal play; breaks inside the kill cam. Big set pieces land with no screen response. |
| Audio | Mix structure is right. Music restarts and re-decodes 48 MB per room; overlapping kill cams detune every loop; the SMG chops its own tails. |
| Shell & UX | Restarts are fast; storage is guarded. Debug keys ship; pause leaks input; Continue can move backwards; reduced motion doesn't cover flashes. |
| Tech, perf, net | Sim is cheap (p95 ≤ 1.4 ms/tick) and deterministic. Co-op guest keeps stale input and ghosts; snapshots ~450 KB/s. Not measured: real frame times (no `baseline.md` was written in lean mode). |

**Strengths to protect**
- Determinism per world (same seed + commands → same hash) and the edge latch (`mergeEdges`: no press lost through hit-stop/slow-mo).
- The fast verbs' latencies and the combo reliability at ≥ 0.25 s gaps (`tests/audit/cmb` latency + combo tables are the floor).
- The melee token rule (≤ 2 attackers, 0.45 s gap), gun grunts never firing off-screen, set-piece tells ≥ 0.55 s.
- Clip crossfades/overlap (no pops in walk/jump/dive/prone/get-up/hit reactions) and the hit-stop budget outside the kill cam.
- Fast room restarts (control 0.02 s after load), guarded storage, the menu "born" guard.

## 2. Bugs (default in)

**S1: crash, softlock, lost progress**
| ID | Bug | Repro | Eff |
|---|---|---|---|
| STB-01 = ENC-01 | Hitting the vending brute (or the jetpack) mid-attack throws in `stepAttack`; stage 3 street freezes | `tests/audit/stb/crash.test.ts` "direct"; `enc/probes.test.ts` ENC-01 | S |
| STB-16 = ENC-02 | Knife stuck in an actor a script removes (boss teleport, jetpack exit) → `pullable` throws when you stand empty-handed | `stb/crash.test.ts` "STB-16"; soak 3/vending | S |
| STB-05 | Hero dies in the 0.6 s before stage 3's stab → `ending` set, no restart, forever | `stb/probes.test.ts` STB-05 | S |
| ENC-16 | Sword duel counts only gun/knife hits → a melee player with no ammo can't finish | `enc/curve.test.ts` brawler in vending (93–281 s lull) | S |
| CMB-01 | Ctrl dive + W/Tab = Ctrl+W (tab closes) / Ctrl+Tab. Likely (Chrome-reserved chords; verify by hand) | manual: `/?stage=2&room=office`, Ctrl+W | S |
| STB-06 = ENC-05 = UXS-01 | Stage 1 has no checkpoint: every death replays intro + all beats; Continue can't resume stage 1 (needs Q1) | `uxs/sim.test.ts` "stage 1 timeline" | S |

**S2: wrong rule the player sees**
| ID | Bug | Repro | Eff |
|---|---|---|---|
| CMB-02 = UXS-04 | Debug keys live in production (F2, F3, K, L, Z, 1/2/3, P, M) | `vite build` → bundle has `keydown-K`/`Z`/`F3` | S |
| VIS-02 = UXS-02 | Music re-decodes a 48 MB WAV per room/death, restarts at bar 1; looping sources never stopped (~100 MB each, unmeasured) | code: `src/audio/music.ts:55-103` | S |
| STB-02 | Restart in the street loses improbability + `axeThrows` | `stb/probes.test.ts` STB-02, `stb/checkpoint.test.ts` | S |
| STB-03 | Cooked grenade goes off at the next room's entry | `stb/probes.test.ts` STB-03 | S |
| STB-04 | Killed on the exit tick → alive with 1 hp next room | `stb/probes.test.ts` STB-04 | S |
| VIS-01 | Two kill cams within 0.6 s → every loop stuck at 0.6× pitch | reproduced in the pane on `AudioEngine.killCam` | S |
| VIS-04 = UXS-17 | Reduced motion / effects off still flash (booms, lightning, muzzle light) and pulse (kill-cam wash, grain, vignette) | code: `vfx.ts`, `gunFx.ts:153`, `feelFx.ts:79`, `post.ts:125` | S |
| CMB-05 | Bodyguard dies to one jab | `cmb/cmb.test.ts` TTK | S |
| CMB-12 | Whiffed punch near a corpse = planted 0-damage finisher | `cmb/cmb.test.ts` verb × state | S |
| CMB-13 | Knife LMB at a downed/rising enemy throws the knife | `cmb/cmb.test.ts` "knife LMB context" | S |
| ENC-14 | Crate room's dug-in guards leave cover at once | `enc/probes.test.ts` ENC-14 | S |
| ENC-15 | Cannon lands on the ending's boombox (7/20): 60 s of nothing | `enc/probes.test.ts` ENC-15 | S |
| ENC-08 | Noob drops the lobby's unarmed last entry → no hold-up | arithmetic on `waves.ts scaled()`; **verify on PR #43** (ENC-07 tags fix it) | S |
| UXS-03 | Replaying an earlier stage moves Continue back | `uxs/shell.test.ts` | S |
| UXS-05 | Keys pressed in the pause menu reach the game (Space on Resume jumps; guest walks) | code: `GameScene.ts:465-472` | S |
| UXS-07 | Guest stops sending → P2 repeats his last input forever | `uxs/net.test.ts` | S |
| UXS-08 | Guest keeps ghosts of actors the host removed | `uxs/net.test.ts` | S |
| UXS-06 | Co-op dead ends (no Esc from lobby / co-op end card; guest can't see host pause/quit; Co-op shown in production). Shrunk to the S parts | code: `CoopLobbyScene.ts:214`, `UIScene.ts:200` | S (was M) |

**S3: cosmetic / rare** (in when grouped with a fix above): STB-07 ⊂ UXS-14 death timer runs while paused · STB-09 room entry leaves action state (`resetForRoom`, covers STB-03) · STB-10 menu vs F3 pause, F4 skips hit-stop · STB-11 feel FX run under pause · CMB-15 get-up i-frames eat bullets silently · UXS-11 controls screen overlap · UXS-12 unvalidated saves · STB-13 squad heads per world (→ PR #43).

## 3. Improvement menu

### A. Stability & tech
| ID | Idea | Eff | Imp | Votes | |
|---|---|---|---|---|---|
| STB-08 | Reseed RNG + per-world ids on room entry: rooms reproducible from their checkpoint | S | ★★ | 2/0/0 | ✅ |
| STB-12 | Data lint: every wave entry's spawn id and door exist (include PR #43's scripts) | S | ★★ | 2/0/0 | ✅ |
| — | Promote the soak (`tests/audit/soak.test.ts`): fast subset always on, full run `SOAK=1` | S | ★★ | — | ✅ |
| UXS-22 | Stage registry + `src/shell.ts` with tests (stage count in ~10 places) | M | ★★ | 1/0/0 | M15 start |
| UXS-23 | Split the conflict magnets | M | ★ | 0 | cut |

### B. Controls & combat
| ID | Idea | Eff | Imp | Votes | |
|---|---|---|---|---|---|
| ENC-03 | Hero mercy window 0.3 s (decided) after a hit; hero-only; scripted lethal hits exempt; "absorbed" flash + soft thud | S | ★★★ | 3/1/0 | ✅ |
| CMB-06 | Stun shrinks within a chain (0.7 → 0.45 → 0.25 s); tough targets shrug off the 4th jab | S | ★★★ | 2/0/0 | ✅ |
| CMB-08 | One generic 0.15 s edge buffer (jump/dive/attack/grab/E) + weapon swings queue | M | ★★★ | 2/0/0 | ✅ |
| CMB-09 | Jump buffer 0.1 s, coyote 0.08 s | S | ★★ | 2/0/0 | ✅ |
| CMB-16 | First different press inside a move wins (uppercut not overwritten) | S | ★★ | 2/0/0 | ✅ |
| CMB-10 | Latch a shot pressed in the last 0.1 s of cooldown | S | ★★ | 1/0/0 | ✅ |
| CMB-11 | Air kick only ≥ 0.3 H above the ground; lower = buffered dive | S | ★★ | 1/0/0 | ✅ |
| CMB-13 + CMB-14 | Weapon finisher: swing/stab at a downed body hits it (fixes the knife toss) | S | ★★ | 2/0/0 | ✅ |
| CMB-04 | Shotgun pellet damage 1 (or cap on agent/riot) | S | ★★ | 1/0/0 | ✅ |
| CMB-03 | Gun cost (melee-only heal / aim-settle / range falloff) | M | ★★★ | 0/2/0 | decision Q2 |
| CMB-18 | Weapon durability or knife recovery 5→9 frames | S | ★★ | 0/1/0 | deferred |
| CMB-19 | Heavy kills launch the decapitated body | S | ★ | 1/0/0 | deferred |
| CMB-20 | Takedown recovery vs doc (1.75 vs 1.5 s) | S | ★ | 0/1/0 | doc fix |

### C. Encounters & pacing
| ID | Idea | Eff | Imp | Votes | |
|---|---|---|---|---|---|
| ENC-09 | Zombies get their own cap (4), charge uncapped only ≤ 3 alive | S | ★★★ | 1/0/0 | ✅ |
| ENC-17 | Scripted teaching/cutscene hits deal no damage | S | ★★ | 3/0/0 | ✅ |
| ENC-13 | Jetpack caption teaches prone; teach prone once in wave B | S | ★★ | 3/0/0 | ✅ |
| ENC-20 | Captions for grab/throw and the launcher in wave A, prone in wave B; teaching-map test | S | ★★ | 3/0/0 | ✅ |
| ENC-21 + STB-14 | `exitOpen` → edge arrow + sting; stage 3 tracker; re-show the room's caption after 20 s with nothing happening | S | ★★ | 2/0/0 | ✅ |
| ENC-12 (shrunk) | Draw the existing wind-up for the knockdown heavy (and the stomp) ≥ 0.3 s | S | ★★ | 2/0/0 !1 | ✅ |
| CMB-07 | Adjacent unarmed grunts stomp a prone hero after a drawn tell; prone stays the bullet dodge | M | ★★★ | 2/0/0 | ✅ |
| ENC-11 | Boss cannon aims across the whole depth (no safe strip) | S | ★★ | 0/1/0 | ✅ |
| ENC-18 (shrunk) | Grenade-beat timeout 10 s with the caption again at 5 s (trickle lull → PR #43) | S | ★★ | 1/0/0 | ✅ |
| ENC-22 | Difficulty scales the mercy window proportionally (Noob 0.5 s, Notch 0.15 s) | S | ★★ | 1/1/0 | ✅ (Q3) |
| ENC-04 | Flatten the curve (corridor split, wave A maxAlive 2, pressure in late rooms) | M | ★★★ | 2/0/0 | measure after ENC-03/09 + #43 |
| ENC-10 | Boss wards during the volley, 2 s untouchable after a wound, 4 head hits | M | ★★ | 1/1/0 | deferred |
| ENC-19 | Mid-room checkpoints (corridor, desert) | M | ★★ | 1/1/0 | deferred |
| ENC-06, ENC-07 | Arrival metrics, tags for order-coupled entries | S | ★★★ | — | PR #43 |

### D. Look & sound
| ID | Idea | Eff | Imp | Votes | |
|---|---|---|---|---|---|
| VIS-06 | Blend the drawn root into the slump; ease the landing angle | S | ★★★ | 0/0/0 | ✅ |
| VIS-07 | Throw starts from the drawn hand position; grab lerps in over 3 ticks | S | ★★ | 1/0/0 | ✅ |
| VIS-08 + VIS-19 | Sounds for jump, playerDown, revive, edge spawn; shield hits/break with mist + thud | S | ★★ | 3/0/0 | ✅ |
| VIS-03 | One-stem track plays through the room (with the VIS-02 music rewrite) | S | ★★ | 1/0/0 | ✅ (Q8) |
| UXS-21 (stem) + UXS-24 | Ship the stem as OGG, renamed without the show's name; `<title>` = game title | S | ★ | 1/0/0 | ✅ (Q8) |
| VIS-15 | Facing turn over 2 frames, render only (= revamp A3) | S | ★★ | 1/0/0 | ✅ |
| VIS-16 | Walk swing to a full stride (quick step of revamp A4) | S | ★★ | 0/0/0 | ✅ |
| VIS-17 | Hero drawn last at equal depth | S | ★★ | 1/0/0 | ✅ |
| VIS-11 + VIS-12 | Shake/hit-stop for tank, walls, door smash, toppled props, sword dive; use `bossPhaseKill` | S | ★★ | 1/0/0 | ✅ |
| VIS-09 | SMG voice-steal rule | S | ★★ | 1/0/0 | deferred |
| VIS-13 | Loudness outliers (block, alert, shotgun, desert hits) | S | ★★ | 0 | F (gains) |
| VIS-14 | Outdoor ambience beds, per-room reverb | S | ★★ | 0/1/0 | deferred |
| VIS-05 | Particles in the depth sort | M | ★★ | 0/1/0 | deferred |
| VIS-24 | Thrown-body speed lines (B7) | S | ★★ | 0 | deferred |
| VIS-18, VIS-20, VIS-23 | Red awnings / head snap on 1-frame hits / delayed voices in the pool | S | ★ | — | deferred |

### E. Shell & UX
| ID | Idea | Eff | Imp | Votes | |
|---|---|---|---|---|---|
| CMB-17 = UXS-10 | Rebinding swaps duplicates, refuses debug/reserved keys, applies on menu close, drops the C alias | S | ★★ | 3/0/0 | ✅ |
| UXS-15 | Single player pauses on blur (not while dead) | S | ★★ | 3/0/0 | ✅ |
| UXS-09 | "Reset progress" needs a second press; gone from the pause menu | S | ★★ | 0 | ✅ |
| UXS-13 | End card ignores keys for 0.6 s; replay is hold R | S | ★★ | 1/0/0 | ✅ |
| UXS-16 (shrunk) | Minimum 26 px for readable text, captions 34 px | S | ★★ | 2/0/0 | ✅ (Q7) |
| UXS-21 (labs) | Labs lazy-loaded behind `?lab`; chunk warning back at 1000 | S | ★ | 1/0/0 | ✅ |
| UXS-25 | "TUNED · n" tag in dev when F6 overrides are active | S | ★ | 0 | ✅ |
| UXS-18, UXS-19 | Text re-raster, draw-list closures, elevator repaint | S | ★ | 1/0/0 | deferred (measure first) |
| UXS-20 | Smaller snapshots, guest jitter buffer | M | ★ | 0 | deferred |

## 4. Decisions (decided by the user, 2026-10-28)

1. ✅ **Stage 1 checkpoints** (STB-06/ENC-05/UXS-01): every beat (riot, grenade, boss, wave B, ending) is a checkpoint; Continue resumes it.
2. ✅ **Gun cost** (CMB-03): no nerf in the code yet. Re-run the CMB style probe on PR #43 (after ENC-03), then **melee-only healing as an F6 switch** (default off), decided in the playtest. **No aim-settle.**
3. ✅ **Mercy window, shorter than proposed** (ENC-03, ENC-22): **0.3 s** base, hero only, scripted lethal hits exempt; scales proportionally with difficulty: **Noob 0.5 s · Pro 0.3 s · Notch 0.15 s** (Hacker in between, same proportion). The gun telegraph is not part of the decision: it stays a number (today's 0.4 s on every level) that F may try.
4. ✅ **Prone** (CMB-07): stays the bullet dodge; adjacent unarmed grunts stomp a prone hero after a **≥ 0.3 s drawn tell**. The low slash stays.
5. ✅ **Dive key** (CMB-01): **C** by default, Ctrl bindable with a warning, `beforeunload` confirm while a stage runs.
6. ✅ **Debug keys** (CMB-02/UXS-04): only in dev or with `?debug`. M (mute, restores your volume) stays a player key; V moves to Settings only.
7. ✅ **Text size** (UXS-16): minimums 26 px, captions 34 px; no "Large text" setting yet.
8. ✅ **Music** (VIS-02/03, UXS-02/21/24): the one-stem track plays straight through rooms (and across rooms that share it); shipped as OGG under a neutral name, the WAV kept as the master outside `assets/`. `music(null)` silences stay.
9. ✅ **Scripted hits** (ENC-17): the tutorial cross and the boss flings knock down without damage; the sparring jabs may still cost a life.
10. ✅ **Room rules & stuck hints** (STB-02, STB-14): `axeThrows` on from the camera room to the end of stage 3, owned by the rooms; rooms that wait on one trick re-show their hint after 20 s with nothing happening.

Smaller calls, accepted as recommended: Continue = the furthest point reached (UXS-03) · Co-op hidden in production builds until there's a server (UXS-06) · the toy street keeps its signed-off red; only the welder's green visor goes grey (VIS-18) · melee durability (CMB-18) and the boss's length (ENC-10) wait for the #43 re-measure · the head moving with the fist on 1-frame hits stays (VIS-20).

## 5. Features

VIS-24 (thrown-body speed lines, revamp B7) was the only feature. **Deferred**: opinion only, and VIS-06/07 fix the release motion it would hide. Look again after slice D.

## 6. Suggested bundle: M14b (one L milestone)

**60 rows** in 6 slices: every S1, every S2, the grouped S3s and about 35 improvements. Everything is S except CMB-08 and CMB-07 (M). Every feel change is a `TUNING`/`FEEL` number whose old value gives the old behaviour (README §7 A/B rule).

| Slice | Ids | Size |
|---|---|---|
| **A Stability** (first, alone) | STB-16/ENC-02 (guard `pullable` **and** one `removeActor()` that unsticks items, clears holders, emits `actorRemoved`) · STB-01/ENC-01 · STB-05 · ENC-16 · CMB-01 (+ the caption key helper from CMB-17/UXS-10) · STB-06/ENC-05/UXS-01 · STB-02 · STB-03 + STB-09 (`resetForRoom`) · STB-04 · STB-08 · STB-12 · CMB-02/UXS-04 · CMB-05 · CMB-12 · ENC-14 · ENC-15 · VIS-01 · VIS-04/UXS-17 · UXS-03 + UXS-12 · UXS-05 · UXS-06 (S parts) · UXS-07 · UXS-08 · the clock group (VIS-10, STB-10, STB-11, STB-07/UXS-14) · UXS-11 · soak promotion · ENC-08 verified on #43 | 27 rows, all S (~2 weeks; may go as A1 sim + A2 shell/audio) |
| **B Controls & combat** | ENC-03 (+ CMB-15 absorbed response) · CMB-06 · CMB-08 · CMB-09 · CMB-16 · CMB-10 · CMB-11 · CMB-13 + CMB-14 · CMB-04 | 9 rows (1 M) |
| **C Encounters & pacing** | ENC-09 · ENC-17 · ENC-13 · ENC-20 · ENC-21 + STB-14 · ENC-12 (shrunk) → CMB-07 · ENC-11 · ENC-18 (shrunk) · ENC-22 | 9 rows (1 M) |
| **D Look & sound** | music (VIS-02/UXS-02, VIS-03, UXS-21 stem, UXS-24) · VIS-06 · VIS-07 · VIS-08 + VIS-19 · VIS-15 · VIS-16 · VIS-17 · VIS-11 + VIS-12 | 8 rows |
| **E Shell & tech** | CMB-17/UXS-10 (rest) · UXS-15 · UXS-09 · UXS-13 · UXS-16 (shrunk) · UXS-21 (labs) · UXS-25 | 7 rows |
| **F Tuning & playtest** | ENC-03 window, CMB-06 stun steps, CMB-08/09 windows, CMB-04 pellets, VIS-13 gains; CMB-03 melee-heal switch (Q2); re-run the ENC curve (`tests/audit/enc/curve.test.ts`) and the CMB style probe on #43 + B + C | the user's pass |

Exceptions to "A owns every bug": the music bug (VIS-02/UXS-02) lands in D so `music.ts` has **one owner**; CMB-13 goes to B with CMB-14 (same fix); CMB-15 goes to B with ENC-03 (same absorbed response).

**Ordering constraints** (from the reviews)
- `removeActor()` lands **with** the STB-16 guard; unsticking in `stepItems` alone still crashes (scripts splice in `seq.step` before `pullable` runs). UXS-08's guest prune uses its `actorRemoved`.
- STB-08 (reseed) first in A, then re-baseline every seeded probe once. STB-02 + STB-08 before any mid-room checkpoint (ENC-19, deferred).
- **One clock change** for VIS-10 + STB-10 + STB-11 + STB-07 + UXS-05: the menu pauses everything (sim, feel FX, kill-cam filter, death timer, input), hit-stop counts in real time and is skipped (or divided) inside slow-mo, F4 consumes hit-stop ticks. Cover M19's rage beat, which calls `hitStop` inside its own slow-mo. One test in `tests/clock.test.ts`.
- Stage 1 beat checkpoints + UXS-03 forward-only Continue share one **order key** (stage, room index, beat index) defined in `progress.ts` with UXS-12's version field.
- The **caption key helper** before CMB-01 moves dive off Ctrl, and before any new caption (ENC-13, ENC-20, ENC-21/STB-14).
- The **input buffer** (CMB-08/09/16) is cleared on pause close and on room entry (UXS-05, STB-09), and the host buffers the guest's edges through `mergeEdges`.
- The **mercy window** is hero-only and exempts scripted lethal hits (stage 2 ending, stage 3 stab, last stand) or STB-05-type stalls return. Its "absorbed" response (flash + soft thud, no hit-stop) is shared with CMB-15 and VIS-19.
- ENC-03 before the CMB-03 decision (melee-only heal makes the gun rooms deadlier); CMB-03 re-measured on PR #43.
- CMB-06 before ENC-22 (boss-hp scaling means nothing while the riot can be jab-locked). CMB-06's shorter stuns need a shorter or blended `stun` clip (VIS).
- ENC-12's drawn tell before CMB-07's stomp; the stomp ships with its pose, sound and VFX.
- VIS-06 (root blend) before CMB-19 (deferred) or any change that throws more bodies into walls.
- UXS-15 blur-pause must not fire while dead, and the click that returns focus must not skip the restart.
- STB-12's lint includes PR #43's new wave scripts; STB-13 (squad heads) is handed to #43.
- CMB-04 (weaker shotgun) makes the corridor longer: re-check the corridor in F before deciding on ENC-19.
- Merge order A → B/C → D/E → F; at most four writers at once.

**Before slice A**: write `design/audit/baseline.md` (typecheck/test/build times, bundle size, frame times in the heaviest rooms in the visible pane). Lean mode skipped it, and the M14b perf gates compare against it.

## 7. Deferred and cut

| ID | Verdict | Why |
|---|---|---|
| CMB-21 | cut | Not reproduced: STB's 40 riot runs and ENC's harness saw no stall; the probe revives the hero by force. |
| VIS-21 | cut | No proposal; kept as the smoothness baseline. |
| UXS-23 | cut | Opinion; a refactor without behaviour tests. Revisit with UXS-22. |
| VIS-22 rejects | cut for M14b | Revamp A11 (pose editor), C3 (victim-only hit-stop: the budget holds), D1–D4 (no evidence of a problem), B4 (partly built). |
| ENC-06, ENC-07, ENC-08, STB-13, ENC-18 (trickle) | → PR #43 | Arrival patterns and order couplings are that PR's. ENC-06's table is its acceptance metric. |
| CMB-03 | decision, not built | Fights the 1-head/2-body decision; needs the #43 numbers (Q2). |
| ENC-04 | measure only | Its targets are opinion and most of its cause is ENC-03/ENC-09; re-run the curve in F. Wave data changes belong to #43. |
| ENC-10 | deferred | M; the boss's length depends on the gun decision and #43. |
| ENC-19 | deferred | M; needs STB-02/08 first; may be unnecessary once ENC-03 + ENC-09 halve the corridor deaths. |
| CMB-18 | deferred | Opinion; decide after CMB-03. |
| CMB-19 | deferred | Opinion fix; after VIS-06. |
| CMB-20 | doc fix only | Fix the controls text (1.75 s), not the timing. |
| UXS-22 | start of M15 | The stage registry is M15's seam; GameScene conflicts would hit every M14b slice. |
| UXS-18, UXS-19 | deferred | Perf unmeasured; do them if slice D/E frame times show long frames. |
| UXS-20 | deferred | M; fine on a LAN; no stutter measured. |
| VIS-05 | deferred | M; after UXS-19's draw list. |
| VIS-09, VIS-14, VIS-23 | deferred | Sound polish, low votes; VIS-09 waits for CMB-10 (more shots). |
| VIS-13 | → F | Gains are numbers for the playtest. |
| VIS-18, VIS-20 | your call, default keep | Signed-off look / the show's 1-frame hit. |
| VIS-24 | deferred | Opinion; after VIS-06/07. |
| ENC-12 (full G2) | shrunk | Only the knockdown heavy and the stomp get drawn tells now; the full telegraph language waits. |
| UXS-16 (setting, DPR) | shrunk | Minimum sizes now; a text-size setting and >1080 rendering later. |
| UXS-06 (messages) | shrunk | Esc paths, "host paused/left" and hiding Co-op in production are in; the rest waits for M18. |

**Not covered by anyone**: stage 4 rooms (M15–M16, no room graph yet), a real two-laptop co-op run, browser console errors in the first 30 s of each stage (no driver in lean mode), real frame times, the first 60 seconds as a new player would see them, and reasons to replay (end-card stats, revamp F3).
