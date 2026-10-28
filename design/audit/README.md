# Game audit → milestone M14b: the plan

Planned 2026-10-27 (extra effort). Executed at medium effort by following this file top to bottom. Stop at every 🛑: that step needs the user.

**Decided with the user**
- Audit base: `main` **after the user merges #34** (M14 part 1+2) **and #36** (coop-exits).
- The resulting milestone is **M14b**: after M14, before M15. M17–M20 stay as planned; the audit doesn't re-propose their items.
- Goal of the audit: a less buggy game that feels smoother, looks better, plays better and is more fun. Features are allowed where they fit, not required.

**Changed at execution (2026-10-27, the user):** the **lean** team (§10): five lenses, STB · CTL+CMB (`CMB`) · ENC+LVL (`ENC`) · FAS+VIS (`VIS`) · UXS+TEC (`UXS`), no debate round, and no lead-built tools: each auditor writes its own headless probes from the patterns in `tests/balance.test.ts` / `tests/stage2.test.ts` (STB builds the soak). Only VIS uses the browser pane. Plus, in parallel, **spawn variety** is implemented right away on its own branch (the user: enemies arriving one at a time from one door let you farm headshots; they should arrive more together, from several points, less predictably, even where it departs from the episodes).

**Why this shape**
- **One auditor per lens, nine lenses.** Several agents on the same lens mostly find the same things twice. The "many eyes" happen in round 2 instead: every auditor reviews *every* proposal from its own angle (the perf auditor prices a VFX idea, the balance auditor checks a controls idea), and a fresh skeptic argues against. That's nine opinions per proposal at a fraction of the cost of nine audits per lens.
- **Evidence over opinion.** The sim runs headless, so most claims can be measured with bots and probes; the look can be checked with deterministic headless screenshots. Every finding carries the test that later proves it fixed, and those tests become M14b's acceptance checks.
- **Files, not chat.** Each agent writes a report in one fixed template. Round 2 continues the same agents with `SendMessage`, so they keep what they read in round 1.

| Phase | Who | Output | Gate |
|---|---|---|---|
| 0 Pre-flight | lead | branch, dev server, two shared tools, baseline | 🛑 PRs merged · tools smoke-tested |
| 1 Independent audit | 9 auditors in parallel | `design/audit/<id>.md` | every report in the template · `git status` clean outside the allowed paths |
| 2 Cross-review + skeptic | the same 9 + 1 fresh skeptic | `review-<id>.md`, `skeptic.md` | a vote on every row in each reviewer's domain |
| 3 Debate | lead + proposers | resolutions in `proposals.md` | ≤ 8 contested items settled or escalated |
| 4 Synthesis + pick | lead, 🛑 user | `design/audit-pass.md`, the user's choices | the user picked the bundle |
| 5 Milestone draft | lead, 🛑 user | `PLAN.md` M14b + the audit PR | the user approves the draft |
| 6 Implementation | lead + parallel sessions | one PR per slice | the slice gates (§8) |
| 7 Playtest & tune | 🛑 user + lead | final tuning commit | the user signs off |

---

## 1. Phase 0: pre-flight (lead)

1. 🛑 `gh pr view 34 --json state` and the same for 36. Both must be `MERGED`. If not, stop and ask the user.
2. `git fetch origin && git switch -c m14b-audit origin/main` (this folder is untracked and comes along). Read M14 in `PLAN.md`: copy its still-open items into §3.3 ("Already planned").
3. `npm ci` only if `package-lock.json` changed. Run `npm run typecheck`, `npm test`, `npm run build`; write results, durations and the bundle size into `design/audit/baseline.md`. A failure on `main` is finding #1: note it, don't fix it.
4. `preview_start` **"dev-npm"** (port 5174). The system Node here is 24, which runs Vite 8; the "dev" entry needs nvm, which this machine doesn't have.
5. Build and smoke-test the two tools (§2). Commit them on the branch ("Audit tools: headless harness and browser driver").
6. **Perf baseline on the idle machine**, before nine agents load the CPU: sim ms/tick in the heaviest rooms (harness) and frame times in real-time mode (driver) for stage 1 wave B, stage 2 office, stage 3 street and desert, with 60 bodies (K) and full effects → `baseline.md`. Headless Chrome renders in software, so its frame times only compare rooms with each other; the absolute "60 fps" check is done in the visible browser pane (real GPU), once here and again at the slice gates. Auditors must not trust their own timings (the machine is busy); TEC re-measures only what the baseline lacks.
7. Create `design/audit/roster.md` (lens → agent id, filled at launch) so round 2 survives a context compaction.

## 2. The shared tools (build in Phase 0)

### 2a. Headless sim harness: `tests/audit/harness.ts`
A helper module (not a test file; vitest only runs `*.test.ts`). Generalise what `tests/balance.test.ts` (bot) and `tests/stage2.test.ts` (`setup`, `tick`, `until`, `stageRunner`) already do. No Phaser imports.

- `stageWorld(stage: 1|2|3|4, room?, entry?, players = 1)`: a `World` running that stage's script from that room (stage 1: its sequencer script and beats; stages 2–3: `stageRunner`; 4: the M14 test room if there is one).
- Bots (`(world, actor, state) => PlayerCommand`), composable:
  - `idle`: nothing (scripts and enemies must cope with a passive player).
  - `masher(seed)`: fuzz. A random verb from every verb in `PlayerCommand` (moves, jump, dive, light/heavy, grab, throw, pick-up, E, Q, R, G cook/release, split aim), aim at random screen points near enemies, held for 3–20 ticks.
  - `brawler(reaction)`: the balance bot, melee only.
  - `gunner(reaction)`: picks up guns, aims at the nearest head through `project()`, fires, reloads, throws empties, falls back to `brawler`.
  - `progress(inner)`: plays `inner` while there are enemies, then walks to the open exit and takes it (E where needed), like the stage tests' bots.
- `run(world, bots, { seconds, stopWhen })` → `{ events: counts by type, timeline, roomsVisited, deaths, cleared, exceptions, violations, msPerTick: {p50, p95, max} }`.
- `checkInvariants(world)`, every tick, each violation logged once with stage, room, seed, bot, tick and a small state dump (that's the repro):
  1. `world.step()` throws nothing.
  2. Every position and velocity is finite.
  3. Actors stay inside the room bounds ± 0.5 H unless entering, traversing, falling, hovering, flying in or over the void.
  4. No living actor stays in stun/knockback/grabbed/getUp/down for more than 15 s (co-op downed players excepted).
  5. Grabs are symmetric (holder ↔ held), hands point at items that exist and are held by that actor, an item is in exactly one place (floor, hand, flight, stuck).
  6. Ids are unique.
  7. Items, projectiles and decals stay under their caps and don't grow while nothing happens.
  8. Softlock suspect: no living enemy, no open exit, no script beat advancing for 60 s.
  9. A cleared room opens an exit (or runs a beat) within 10 s.
  10. Determinism: the same seed and commands give the same state hash after 600 ticks.
- `tests/audit/soak.test.ts`, opt-in (`SOAK=1`): every room of stages 1–3 (and the M14 test room) × seeds 1–5 × {idle, masher, progress∘brawler, progress∘gunner} × {1p, 2p}, 120 s each or until the room is left. Prints one table.
- Smoke test: one room, 30 s, every bot, finishes and prints the table.

### 2b. Headless browser driver: `tools/audit/drive.mjs`
So nine agents can look at the game at once without fighting over the browser pane. Plain Node 24 (global `fetch` and `WebSocket`), **no npm packages**.

- `node tools/audit/drive.mjs --url "/?stage=2&room=office" --script <steps.json> --out <dir> [--base http://localhost:5174] [--size 1920x1080]`
- Launches its own headless Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, or `$CHROME`) with a fresh `--user-data-dir` in the OS temp folder, `--remote-debugging-port=0` (read `DevToolsActivePort`), `--mute-audio`, device scale 1. Parallel runs never share anything. Kills Chrome on exit, including on errors.
- Waits for `window.__game` and the scene, then **stops the Phaser loop** (`__game.loop.sleep()`) and drives it by hand (`__game.step(t, 16.667)` per tick), so every run is deterministic and frame-exact. Fallback if that misbehaves: let it run and use the F3 pause / `.` step debug keys.
- Injects `window.__w = () => <the GameScene's world>` for evals.
- Steps (JSON array): `{"t": 30}` step ticks · `{"down": "KeyD"}` / `{"up": "KeyD"}` / `{"tap": "Space"}` (key events with `key`, `code` and `windowsVirtualKeyCode`) · `{"mouse": [x, y]}` · `{"click": "left"|"right", "at": [x, y], "hold": 3}` · `{"shot": "name"}` · `{"strip": "name", "every": 2, "count": 12, "cols": 6, "scale": 0.5}` (a contact sheet stitched in the page on a 2D canvas) · `{"eval": "js"}` (result into the log) · `{"realtime": 300}` (let the loop run that many frames, record frame times).
- Writes `<out>/<name>.png` and `<out>/log.json` (eval results, frame times, **every console error and page exception**: those are bug evidence too).
- Smoke test: stage 2 office, 120 ticks, a shot and a 6-frame strip; open the PNGs and check they show the room.

Agents look at the PNGs with `Read`. Scratch output goes under the lead session's scratchpad, `C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-Documents-MadnessCombat\0fc25448-3933-4cb5-8194-0ec109223704\scratchpad\audit\<id>\` (if a different session runs the audit, it puts its own scratchpad path in the launch prompts instead). Images are evidence for the reports, not for git.

---

## 3. Phase 1: the independent audit

### 3.1 Rules for every auditor
- **Read-only on the game.** Never edit `src/`, `assets/`, `design/` (except your report), `PLAN.md`, `CLAUDE.md`, configs or other lenses' files. No git commands that change anything (no commit, switch, stash, reset).
- You may write: your report `design/audit/<id>.md`, probes in `tests/audit/<id>/*.test.ts` (wrap every `describe` in `describe.skipIf(!process.env.AUDIT)`, keep them type-correct), and images/logs in your scratch folder.
- Run only your own probes (`AUDIT=1 npx vitest run tests/audit/<id>`), never the whole `npm test`: eight others are running too. Timings you measure are unreliable on a busy machine: use `design/audit/baseline.md` for absolute numbers, and only compare relative ones.
- The dev server is already running on `http://localhost:5174`. Don't start servers. Don't use the in-app browser pane: use `tools/audit/drive.mjs`, one run at a time, ≤ 60 s of game time per run.
- Read your "read fully" files completely; elsewhere use grep and line ranges, not whole files.
- Respect the project's rules: mechanics only, never names/designs/music/text from the show (do-not-copy list in `design/art-direction.md`); measured values follow the show; decisions in `research/design-decisions.md` stand. If one clearly doesn't work, file it as type `decision` with your evidence: the user decides.
- **Evidence or it isn't a finding.** Each one cites `file:line`, a probe result or a screenshot. Bugs need a repro (a probe that shows the bad state, or a URL + driver script). Mark confidence: **confirmed** (reproduced/measured), **likely** (read in code), **opinion** (taste).
- Aim for 15–30 findings, most important first. At most 3 of type `feature`, each built from existing systems. Stop when your lens is covered, not when you run out of ideas.
- The report must stand on its own: the lead and eight other auditors read it without your context.

### 3.2 Report template (`design/audit/<id>.md`)
```
# <Lens name> audit
## 1. Coverage
Files read fully, probes run (paths), rooms/moments looked at, what I did NOT cover.
## 2. What works (protect it)
≤ 5 bullets: strengths the polish must not break.
## 3. Findings
### <ID>-NN · <short title>
- Type: bug (S1 crash/softlock/lost progress · S2 wrong rule the player sees · S3 cosmetic/rare) | friction | balance | look | sound | perf | tech | feature | decision
- Where: `src/sim/melee.ts:212` (`swing`), lab `melee-weapons`, `/?stage=2&room=office`
- Evidence: what was measured or seen; probe path; screenshot path
- Player impact: what the player experiences (1–2 sentences)
- Proposal: the smallest change that fixes it; new numbers marked invented
- Test: how we prove it fixed (an automated check, a metric threshold, a lab/screenshot comparison)
- Effort S/M/L · Impact ★/★★/★★★ · Confidence confirmed/likely/opinion
- Risk: what could break; which other lens it touches
## 4. Baseline metrics
The numbers M14b can use as before/after (tables).
## 5. Top 5
One line each, by ID.
## 6. Questions for the user
Decisions only the user can make.
```
Effort: **S** ≈ an afternoon, **M** ≈ a day or two, **L** ≈ a milestone of its own (the scale of `design/animation-ux-revamp.md`).

### 3.3 Already planned: don't re-propose
You may **endorse** one of these by its id with new evidence ("A4: feet slide 0.3 H per step at hero speed, measured"); don't write it up as new.
- **M14** open items (filled in during Phase 0) and **M15–M16** (stage 4 rooms). Stage 4 mechanics already on `main` are in scope for bugs and conflicts; polish them only if M14 is ticked done.
- **M17** quality of life, `design/qol-pass.md`: auto pickup into the empty hand, the pickup plan and E prompt, smart swap, depth snap + wider band for hero melee, the catch window and auto-catch, the 3D cover test, bullets hitting the cursor, the grenade marker, throws that find depth, grabbing with any free hand.
- **M18** co-op moves (`design/coop-moves.md`), **M19–M20** rage (`design/rage.md`).
- **M13** open items: the music integration (waits on the user's stems) and the playtest pass on invented numbers (this audit feeds it).
- **Revamp menu**, `design/animation-ux-revamp.md`, still unbuilt: A3–A5, A8–A11, B2–B4, B6–B8, C2, C3, C5, D1–D4, E3, E5, E6, F1, F3–F6, G2, G3. E4 (the crosshair) was built and taken out at the user's request: don't bring it back.
- Open questions in `research/design-decisions.md` ("Still open"), e.g. the pistol-whip.

### 3.4 Launch (lead)
One message, nine `Agent` calls, `subagent_type: "general-purpose"`, background, default model. Prompt template:

> You're the **{name}** auditor (**{ID}**) in a nine-agent audit of this game. Repo: `C:\Users\alexa\Documents\MadnessCombat`, branch `m14b-audit` (don't change branches). Read `CLAUDE.md`, then `design/audit/README.md` sections 3.1–3.3 and your lens in 3.5 (**{ID}**). Do that audit as described. Your report goes to `design/audit/{id}.md`, probes to `tests/audit/{id}/`, images to `…\scratchpad\audit\{id}\`. The dev server is on http://localhost:5174 (don't start another; use `tools/audit/drive.mjs`, not the browser pane). End your final message with the report path and your top 5 in one line each.

Write each returned agent id into `roster.md`. While they run, the lead starts `proposals.md` as reports land (§4). When all nine are done: `git status` must show changes only under `design/audit/` and `tests/audit/`; revert anything else and note which auditor did it. A run that died early is resumed with `SendMessage` to the same agent. Tell the user in one line when round 1 is done.

### 3.5 The nine lenses

#### STB · Stability & bugs
**Mission:** everything that crashes, soft-locks, corrupts state or breaks its own rules, each with a repro.
**Read fully:** `src/sim/world.ts`, `sequencer.ts`, `stage.ts`, `waves.ts`, `clock.ts`, `actor.ts`, `items.ts`, `room.ts`, `collision.ts`, `src/progress.ts`. Skim the state transitions in `combat.ts` and the puppet rules in `src/net/snapshot.ts`.
**Must do:**
- Run the soak (§2a) on every room; the table goes in "Baseline metrics". Triage every exception, violation and softlock suspect into findings (S1–S3) with the seed/bot/tick repro.
- Restart from the checkpoint in every room (kill the hero mid-fight, restart) and diff the state against a fresh entry: actors, items, flags, timers, music cue, decals, the script position.
- Stacked time effects: hit-stop + kill cam + F2 slow-mo + pause + the last stand at once.
- Room changes mid-action: leaving while grabbing, holding a body, cooking a grenade, juggling; a partner downed during the exit (co-op); dying on the exit tick.
- One-shot gates (`world.flags`, script beats): can any run twice, or never?
- Driver: the first 30 s of every stage and of the title screen; list every console error.
**Not yours:** balance, look.

#### CTL · Controls & movement feel
**Mission:** how the hero answers input: latency, buffering, consistency, surprises, discoverability.
**Read fully:** `src/input/*`, `src/sim/command.ts`, `movement.ts`, the player paths in `combat.ts` (attack start, grab, dive/sweep/flying kick), `src/anim/aim.ts`, the bindings in `src/settings.ts`, `TUNING.move` / `jump` / `prone` / `hero`, the fire timings in `src/data/weapons.ts`.
**Must measure (probe tables):**
- Per verb: ticks from the command to the first visible change, to the active frame, and until the next action is accepted. Verbs: walk start/stop, turn, jump, land → act, dive, get up, light, heavy, uppercut, grab, throw, pick up, swing, thrust, fire, reload, Q throw, grenade cook/lob, each E interaction.
- Buffering: a press during recovery, landing, hit-stop or the kill-cam slow-mo: executed, queued or dropped? Per verb.
- Acceleration, stopping, turnaround, air control; does a jump buffer or coyote time exist (genre norm 4–6 frames)?
- Overloaded keys (Ctrl/C, F, E, RMB): write down each context rule, then probe the situations where the outcome surprises.
- Browser traps: Ctrl+W/T/N/R/Tab while Ctrl dives, Space scrolling, the right-click menu, the pointer leaving the canvas, focus loss with keys held (stuck keys?), resizing mid-game.
- Rebinding: is every action rebindable, are duplicates caught, do hints and prompts follow the binding?
- The full verb list vs. what the game actually teaches (share with LVL).
**Not yours:** the M17 items (pickup, hand choice, depth snap, catch window).

#### CMB · Combat systems
**Mission:** are the fighting rules coherent, readable and fun, with no dead verbs, no dominant one and no holes between systems?
**Read fully:** `src/sim/combat.ts`, `melee.ts`, `guns.ts`, `hitscan.ts`, `items.ts`, `explosives.ts`, `gore.ts`, `hurtbox.ts`, `src/data/melee.ts`, `weapons.ts`, `TUNING.combo` / `juggle`, `design/combos-and-fatalities.md`.
**Must measure:**
- Hits and time to kill per weapon/verb × enemy type (grunt, armed grunt, brute, agent, zombie, bosses where it applies), and knockback distance per hit.
- Verb × target-state matrix (free, stun, knockback, down, getting up, grabbed, juggled, shield, prone, airborne, zombie, boss): the outcome of each pair. Mark holes (nothing happens and nothing says why), contradictions and exploits (endless stun-locks, bosses that can be juggled forever).
- Style comparison: brawler-only vs gunner vs mixed bots on three representative fights. Is one style dominant?
- Combo and fatality reliability: plausible-timing attempts → % that trigger.
- Hit fairness: near misses in depth (|Δz| 0.2–0.3 H), rays that hit someone you didn't aim at.
**Not yours:** M17's depth snap/catch/cover/aim fixes, M18–M20.

#### ENC · Enemies, AI & difficulty
**Mission:** fair, readable, varied enemies, and a difficulty that rises in a good curve across the three stages.
**Read fully:** `src/sim/ai.ts`, `waves.ts`, `stealth.ts`, `zombies.ts`, `boss.ts`, `cannon.ts`, `cover.ts`, `interrogate.ts`, `arena.ts`, `TUNING.ai`, the wave scripts in `src/data/stages/*`.
**Must measure:**
- The difficulty curve: `progress∘brawler` and `progress∘gunner` at reactions 0.1 / 0.2 / 0.35 s, three seeds, through every wave and room of stages 1–3: clear rate, hits taken, lives used, time. One table, plus where it spikes or goes flat.
- Behaviour: enemies standing idle or stuck, crowding, spawning on the player, shooting from off-screen, the telegraph length of every attack (readable ≥ 0.3 s?), friendly-fire rate, how many attack at once vs. the token rule.
- Each boss, phase by phase: a safe spot, a stun-lock, a stall, an unreadable phase?
- Lives and checkpoints: how many restarts a 0.35 s player needs per room.
**Not yours:** stage 4 crowd and agent tuning (M14/M16).

#### LVL · Stages, pacing & onboarding
**Mission:** each stage from the player's seat: teaching, pacing, clarity, set pieces, dead time.
**Read fully:** `src/data/stages/*`, `src/sim/stage.ts` (exits, traversal), the `sequencer.ts` API, `elevator.ts`, `improbability.ts`, `arena.ts`, `src/render/stageHud.ts`, `research/stages.md` (what the episode did, to see what we left out).
**Must measure:**
- A beat sheet per stage (progress bot + sequencer timings): per room, seconds of free combat, locked input/cutscene, dead time (nothing to do) and traversal; total stage length.
- The teaching map: every verb in the controls list → where the game teaches it (hint, prompt, a room built for it) or "never".
- Where to go: per room, is the exit visible, prompted, obvious when the room clears? A driver still at the moment each room clears.
- Checkpoint spacing against the difficulty curve (ENC's numbers if they're in, else own quick runs).
- Set pieces (elevator cables, the cannon, the improbability device, the arena lock, the collapse, the last stand): would a first-time player know what to do? Stills + the hint text.
- Replay: can cutscenes be skipped on a replay? Is the stage select fine-grained enough?
- First-time walkthrough: the driver from the title screen through New game into stage 1, a still at every beat; note every confusion.
**Not yours:** stage 4 rooms (M15–M16).

#### FAS · Feel & audio
**Mission:** every action lands with the right weight (not mushy, not noisy, not silent) and the mix is sane.
**Read fully:** `src/feel/feel.ts`, `src/data/feel.ts`, `src/render/feelFx.ts`, `src/render/post.ts`, `src/audio/*`, `src/data/audio.ts`, `assets/music/cues.json`, the effect settings in `src/settings.ts`.
**Must measure:**
- Feel load in the five busiest fights (stage 1 wave B and the boss, the stage 2 office, the stage 3 street and desert): per second, hit-stop frames, shakes (amplitude), kill cams, chromatic splits, impact frames. Do the caps hold? Where does it go mushy (hit-stop stacking under auto fire, kill-cam spam on multi-kills)?
- Coverage matrix: every event type in `src/sim/events.ts` → feel response, sound id, VFX (from `src/audio/hooks.ts`, `feel.ts`, the render subscribers). List silent or effect-less events and doubled responses.
- A loudness table: render every sound id offline (an `OfflineAudioContext` in the page through the driver, or from the synth parameters) → peak, RMS, length; flag outliers within their bus.
- Voice limits and ducking under event storms (the mixer logic with simulated bursts).
- Music: every room's cues exist and fire; cuts vs. crossfades; the boombox.
- Every effect respects effect intensity and reduced motion (grep each effect's code path).
**Not yours:** the music itself (the user composes it), M19's rage look.

#### VIS · Visuals, animation & VFX
**Mission:** it looks like the style frame everywhere, reads clearly in chaos and moves without pops or slides.
**Read fully:** `src/render/canvas/*`, `src/render/vfx.ts`, `gunFx.ts`, `decals.ts`, `camera.ts`, `src/anim/*`, `design/art-direction.md`, `design/animation-ux-revamp.md`. Skim `design/style-frame/index.html`.
**Must do:**
- Driver strips (every 2 ticks) of: walk/turn/stop, light/heavy/uppercut, each hit reaction, each death type, getting up, dive/prone/crawl, jump/land, grab/throw, reload, gun throw, swing/thrust, a takedown. Look for pops, foot sliding, floating hands, z-sort errors, clipping into walls and props.
- A pop detector (probe): sample the pose skeleton every tick through a scripted fight and flag part jumps per tick above a threshold (H and degrees). The list of transitions that snap is the "smoothness" baseline.
- Chaos readability: stills of FAS's busiest moments at 1×. Can you find the hero, the threats, the telegraphs? At the back of the room (smallest scale)?
- Art-direction rules: red only for blood and telegraphs, green only for zombies, line weights, M14's new characters.
- The unbuilt revamp items (§3.3): endorse or reject each with evidence.
**Not yours:** M19's rage look, stage 4's club lighting.

#### UXS · UX, HUD & the shell
**Mission:** everything between the player and the game: menus, HUD, prompts, death and restart, settings, saves, the co-op lobby.
**Read fully:** `src/ui/*`, `src/scenes/TitleScene.ts`, `UIScene.ts`, `CoopLobbyScene.ts`, `BootScene.ts`, `src/settings.ts`, `src/progress.ts`, `src/ui/credits.ts`.
**Must do:**
- Click through every menu path with the driver (title → each item → back; pause → each item; every settings control; rebinding; stage select; Continue; end card → next/replay/title), stills and times per transition. Dead ends, inconsistent Esc/back, unlabeled states.
- Death → restart: seconds until the player has control again, what they see, what carries over.
- HUD readability in the busiest moments, and at 1280×720, 1920×1080, 2560×1440, a non-16:9 window and a small one: scaling, cut-off text.
- Saves: corrupt or old localStorage, New game over a save, Continue after a stage end, settings that persist.
- Accessibility: effect intensity, reduced motion, text size, colour carrying meaning.
- The co-op lobby on one machine (two driver runs, host and join): the join link, waiting, disconnect messages.
**Not yours:** M17's prompt redesign.

#### TEC · Performance, co-op net & code health
**Mission:** smoothness at the frame level, and the health of the code the next milestones build on.
**Read fully:** `src/net/*`, `src/render/canvasLayer.ts`, `src/scenes/GameScene.ts`, `src/render/post.ts`, `src/dev/*`, `research/performance.md`. Skim the rest for hotspots.
**Must measure:**
- Frame pacing beyond the lead's baseline: what causes the long frames (> 20 ms): bakes, room entry, explosions, the kill cam, raises.
- Allocation churn: per-frame object/array/closure creation in painters and sim hot loops (read the code + heap growth over 60 s with the driver).
- Memory over a long session: heap after each room through a whole stage.
- Loading: bundle size, time to the title, time to a stage's first frame.
- Co-op: snapshot bytes per tick and per second in the busiest room, input delay, behaviour under latency and loss (net.test style), joining mid-stage, the host or the guest leaving, rejoining. Determinism (invariant 10).
- Dev features in the production build (debug keys, `window.__game`, the tuning panel).
- Code health: the largest functions, duplicated logic, the files every milestone touches (conflict magnets like `combat.ts`), mechanics without tests, timing-fragile tests.
**Not yours:** rewrites. Propose only seams that pay off for M15–M20.

---

## 4. Phase 2: cross-review and the skeptic

**`design/audit/proposals.md`** (lead, built as reports land): every finding as one row, merging obvious duplicates (keep both ids, mark `= CTL-04`).

| ID | Lens | Type | Title | Eff | Imp | Conf | Same as |
|---|---|---|---|---|---|---|---|

**Cross-review**: `SendMessage` (a deferred tool: load it first with `ToolSearch` "select:SendMessage") to each of the nine auditors by the id in `roster.md`; they still have their round-1 context:

> Round 2. All nine reports are in `design/audit/`, and every finding is a row in `design/audit/proposals.md`. From your lens, write `design/audit/review-{id}.md`:
> 1. A table `| ID | Vote | Why (≤ 15 words) | Cost/risk to my area | Depends on |` for every row that touches your area (vote +1 / 0 / −1; add `!` to a −1 that should block it).
> 2. Conflicts: pairs of proposals that fight each other.
> 3. Checked claims: "likely" findings from other lenses you could verify cheaply with your tools; say confirmed/refuted and how.
> 4. Your top 10 overall for "smoother, better-looking, more fun" (not only your lens).
> Same rules as round 1 (read-only on the game). Keep it short.

**Skeptic** (a fresh `general-purpose` agent, sent in parallel with the cross-review):

> You're the design director and skeptic for an audit of this game. Read `CLAUDE.md`, `design/audit/README.md` §3.1 and §3.3, `research/design-decisions.md`, the do-not-copy list in `design/art-direction.md`, then the nine reports in `design/audit/` and `proposals.md`. Argue against: for every finding of impact ★★★, every `feature` and every `decision`, say **keep / shrink / defer / cut** with one reason. Is the evidence real? Is there a smaller fix? Does it fight a decision, a measured value or planned work (M14–M20)? Is it worth a slot in one milestone? Then name what nobody covered (the session arc, the first 60 seconds, reasons to replay, anything between the lenses). Write `design/audit/skeptic.md`. Read-only on the game.

## 5. Phase 3: the debate (lead-moderated)
- **Contested** = a blocking −1! against a +1 from another lens, or the skeptic says *cut* to a finding in the provisional top 30. At most 8 items.
- For each, one `SendMessage` to the proposer with the objection verbatim: defend it with evidence, revise it, or concede. One exchange only.
- The lead records the outcome in `proposals.md` (a "Resolution" column). Still split → a question for the user in Phase 4.

## 6. Phase 4: synthesis and the user's pick
**Score** = impact (1–3) × confidence (confirmed 1.0, likely 0.7, opinion 0.4) × (1 + net votes / 9) ÷ effort (S 1, M 2, L 4). S1 bugs are in automatically, S2 bugs if effort ≤ M. The score ranks; the lead's judgment adjusts, with a reason written down.

**`design/audit-pass.md`** (in the style of `design/animation-ux-revamp.md`):
1. State of the game per area: one line each, plus the strengths to protect.
2. Bugs, by severity, each with its repro (default in).
3. The improvement menu by area: ID, one line, effort, impact, votes, ✅ on the suggested bundle.
4. `decision` challenges: the user's call.
5. Features (if any survived).
6. The suggested bundle, sized as one L milestone split into slices (§7).
7. Deferred and cut, with reasons, so they don't come back next time.

🛑 Then ask the user (`AskUserQuestion`): the bundle as suggested, smaller or bigger; which optional groups go in (features, decision challenges, endorsed revamp items); each split debate item. Offer the doc as an Artifact page in one line if they'd rather read it there.

## 7. Phase 5: the milestone draft
In `PLAN.md`: a table row `| M14b | Audit & polish pass (added <date>) | … | L |` after M14, and a section in the usual shape (Goal · Read first · Build · Look & sound · Acceptance · Labs). Every checklist line starts with its audit id (`- [ ] CTL-03 jump buffer, 5 ticks (invented)`), so a finding can be followed to its test and its PR. Plus a short "Playtest script" (§9).

Slices, each one PR, each owning its files:

| Slice | Owns | Content |
|---|---|---|
| **A Stability** (first, alone) | anything needed for the fixes | every bundled bug; `tests/soak.test.ts` promoted from the harness (a fast subset always on: every room 20 s, masher seed 1; the full run opt-in `SOAK=1`); invariant checks reusable in dev builds |
| **B Controls & combat** | `src/input/`, `sim/movement.ts`, `combat.ts`, `melee.ts`, `guns.ts`, `items.ts`, `hitscan.ts`, `anim/aim.ts` | input feel, buffering, combat rule fixes |
| **C Encounters & pacing** | `sim/ai.ts`, `waves.ts`, `boss.ts`, `stealth.ts`, `zombies.ts`, `stage.ts`, `src/data/stages/*` | AI, difficulty curve, hints, dead time, checkpoints |
| **D Look & sound** | `src/render/`, `src/anim/` (not aim), `poses.json`, `src/feel/`, `src/data/feel.ts`, `src/audio/`, `src/data/audio.ts` | animation, VFX, feel budgets, mix |
| **E Shell & tech** | `src/ui/`, `src/scenes/`, `settings.ts`, `progress.ts`, `src/net/`, `src/dev/` | menus, HUD, restart flow, perf, co-op robustness |
| **F Tuning & playtest** | `src/data/tuning.ts` values | the user's pass (§9) |

Shared files: `tuning.ts` and `feel.ts`: each slice adds or edits only its own blocks · `events.ts`: new event types appended at the end of the union · `PLAN.md` boxes are ticked by the lead at merge time, not in the slice branches · `CLAUDE.md` is updated once per slice for new architecture.

**Acceptance** comes from each item's "Test" line, plus global gates measured against `baseline.md`: the soak has 0 violations and 0 exceptions · the latency table meets its targets · the pop detector shows no unintended snap above its threshold · p99 frame time in the heaviest rooms ≤ 16.7 ms on the dev machine, sim ms/tick no worse than baseline +10% · the 0.35 s bot still loses wave A and the difficulty curve stays inside the bands the milestone sets · every stage bot finishes · co-op bytes/s no worse than baseline.

**A/B rule for feel**: every change to how the game *feels* (windows, speeds, hit-stop, camera, effect strength) is a `TUNING` / `FEEL` number whose old value gives the old behaviour (0 = off for something new), so the user can flip it live in the F6 panel during the playtest. The switch goes away only after the user keeps the change.

🛑 Show the user the draft; on approval, commit `design/audit/` (reports, reviews, `proposals.md`, `skeptic.md`, `baseline.md`), `design/audit-pass.md`, `tools/audit/`, `tests/audit/harness.ts` + `soak.test.ts` + the probes that are bug repros (delete the rest), and `PLAN.md`; open the PR "Plan M14b: audit & polish pass".

## 8. Phase 6: implementing M14b
- **Start condition**: M14 is ticked done in `PLAN.md` (🛑 ask the user if it isn't) and the audit PR is merged.
- **Order**: slice A first, alone (it touches everything, and its soak is the safety net for the rest). Then B here, with C, D and E proposed as parallel sessions in their own worktrees (one card each, brief = the slice's checklist + §7's file rules + §8's loop). At most four writers at once, never two on the same files. F last.
- **Per item**: (1) turn its "Test" into a failing test or a metric probe; (2) make the smallest change; (3) run the related tests; (4) for anything visible, a lab update or driver strip, and a browser-pane screenshot in the PR; (5) tick it in the PR description.
- **Slice gate** before its PR: `npm run typecheck`, `npm test`, `npm run build`; `SOAK=1` soak; `BALANCE=1` report vs. baseline; the stage bots; perf re-measured for D and E; the lead checks the result in the browser pane with screenshots.
- **The PR**: what changed, a before/after metrics table, screenshots, deviations, items dropped and why. Merge order A → B/C → D/E → F; whoever merges second resolves conflicts in the shared files.

## 9. Phase 7: playtest and tune (the user)
- 🛑 A script of about 15 minutes: per slice, 3–6 concrete things to try, each rated 1–5, and the A/B switches to flip in F6 (old vs. new) with the question "which feels better?".
- The lead applies the user's "Copy changes" from F6, removes the switches the user kept (and reverts the ones they didn't), commits the final tuning, ticks M14b in `PLAN.md`, updates `CLAUDE.md`.

## 10. Cost and knobs
- **Default (this plan):** nine long auditor runs in parallel (each reads ~100–200 KB of code and runs probes and driver sessions), nine short round-2 continuations, one skeptic, ≤ 8 debate messages. Expensive: roughly nine research sessions' worth of reading at once, plus a short second round, all before a line of game code changes.
- **Lean, if the user wants it cheaper:** five lenses (STB · CTL+CMB · ENC+LVL · FAS+VIS · UXS+TEC), no debate round. About half the cost; fewer cross-checks.
- Auditors use the default model. Running STB and TEC on Sonnet would save some; judgment-heavy lenses stay on the default.
