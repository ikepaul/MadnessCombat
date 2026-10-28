# Stability & bugs audit (STB)

Branch `m14b-audit` at `1ec6731` (main with M17–M20 and the difficulty setting merged; the work started on `3f94afd`, and every probe below was re-run on `1ec6731`). Lean mode: no browser driver; console errors were checked by reading the code only.

## 1. Coverage
- **Read fully:** `src/sim/world.ts`, `sequencer.ts`, `stage.ts`, `waves.ts`, `clock.ts`, `actor.ts` (types + factory), `src/progress.ts`, `src/net/snapshot.ts` (puppet rules). **Partly:** `items.ts` (spawn, step, detonate), `room.ts`/`collision.ts` (bounds, void clamp), `combat.ts` (`stepActor` state switch, `applyHit` flow, grabs/shields), `melee.ts` (grenade cooking), `improbability.ts`, `GameScene.ts` (setup, restart, death watch, guest snapshots), `UIScene.ts` (pause), `feelFx.ts`, stage scripts (stage1Script beats, stage2Script corridor, stage2Late final/ending, stage3Script camera/street, stage3Late lift ending).
- **Harness + soak (kept for M14b):** `tests/audit/harness.ts` (`stageWorld`, bots `idle` / `masher(seed)` / `brawler` / `gunner` / `progress(inner)`, `run()` with invariants 1–9 every tick, `stateHash` for 10), `tests/audit/soak.test.ts` (`SOAK=1`: every room/beat of stages 1–3 × seeds × 5 bots × 1p/2p, 120 s; smoke + determinism run with `AUDIT=1`). Soak run: seeds 1–2 on `3f94afd` (520 runs, 272 s), seed 1 again on `1ec6731`. Output: `…\scratchpad\audit\stb\soak.txt`, `soak2.txt`.
- **Probes** (`tests/audit/stb/`, `AUDIT=1 npx vitest run tests/audit/stb`). Each `it` asserts the *correct* behaviour, so a failing probe = a confirmed bug and the probe is its acceptance test: `crash.test.ts` (STB-16, STB-01), `probes.test.ts` (STB-02…05, STB-10, plus passing checks: exits, coop, lock), `checkpoint.test.ts` (restart vs arrival diff, every exit of stages 2–3), `grab.test.ts`, `corridor.test.ts` (diagnostics).
- **Not covered:** the browser driver and the first 30 s of each stage in a real browser (no console-error list); stage 4 (no room graph yet, labs only); co-op over the network (snapshot code read, no two-client run); the M17–M20 features merged after this audit started (not read). The soak's `progress` bot can't solve scripted gates (elevator roof + cables, disarming the stage 2 target, pinning the street mini-boss to the tank, the stage 1 intro talk), so those rooms show up as timeouts or "softlock suspects" without being bugs. Triaged below in §4.

## 2. What works (protect it)
- **The sim is deterministic per world:** same seed + same commands gave the same state hash after 600 ticks in stage 1 riot, stage 2 office and stage 3 street (`soak.test.ts` "determinism").
- **On `3f94afd`, one exception class in 520 soak runs** (STB-01; `1ec6731` adds STB-16), no NaN/Infinity positions, no duplicate ids, no actor out of bounds, no item-ownership violation, no actor stuck >15 s in stun/knockback/grabbed/getUp/down (outside an intended stun-lock of the protected target). Room data is sound: every exit leads to an existing room and entry (STB probe "exits").
- **Room changes are clean in the common case:** `enterRoom` clears the cast, items, tokens, director, scripts and input lock; the checkpoint diff found only the differences listed under STB-02 and STB-10. A script cancelled by a room change doesn't leave input locked.
- **Co-op exits:** a downed partner comes along and is up in the next room with 1 hp, as designed.
- **Sim cost is low:** p50 ≈ 0.03–0.1 ms/tick, p95 ≤ 0.8 ms in every room on a busy machine (§4).

## 3. Findings

### STB-16 · A blade stuck in an actor that a script removes crashes the game (stage 3: the boss teleports, the mini-boss flies off)
- Type: bug **S1 crash** (numbered last because it was found last, on `1ec6731`; ranked first)
- Where: `src/sim/melee.ts:318` `pullable`: `alive(world.actorById(it.stuckTo)!)` when that actor is gone. Scripts splice actors out in `seq.step`, before the actors move: `stage3Late.ts:163` (the boss's teleport, vending room), `:218` (the target fleeing, console room), `stage3Script.ts:58` and `:286` (jetpack exits), `stage2Script.ts:123/146`. `followStuck` (`items.ts`) unsticks the blade only later in the same tick. `guns.ts:149/359` calls `pullable` every tick for a player standing still with both hands empty (the "stand on a stuck blade" pull), so no E press is needed.
- Evidence: soak on `1ec6731`: 2 of 10 vending-room runs threw `TypeError: Cannot read properties of undefined (reading 'state')` at `alive <- pullable <- pickUp`. Direct repro: `tests/audit/stb/crash.test.ts` "STB-16" (fails).
- Player impact: stage 3 starts you with two throwing knives. Throw them into the boss, then stand still with empty hands when he folds away: the game freezes. Same for knives in the street's mini-boss when he jetpacks off.
- Proposal: in `pullable`, treat a missing `stuckTo` actor as "not alive" (`const host = world.actorById(it.stuckTo); if (host && alive(host)) continue;`). Route every script removal through one `removeActor(world, a)` that also unsticks its items and clears holders' `holding` in the same tick.
- Test: the STB-16 repro passes; the soak shows 0 exceptions in vending/console/street.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: none.

### STB-01 · The vending-machine brute crashes the game when he's hit during his own attack
- Type: bug **S1 crash**
- Where: `src/sim/combat.ts:585` (`applyHit`: `if (o.state === 'attack') o.attack = undefined`) then `:630-634` (the hover/vending "no flinch" branch: `if (o.state !== 'attack') …stun`, so the state stays `'attack'`), then `stepAttack` `:438` (`a.attack!.t`) throws. `/?stage=3&room=street`, after the tank lands.
- Evidence: soak, 3 runs of 40 in the street threw `TypeError: Cannot read properties of undefined (reading 't')` (3/street 1p prog-brawl s1 tick 1417, 3/street 2p masher s1 tick 2674, 3/camera 1p prog-gun s1 tick 3927 after it reached the street). The actor at the crash: `grunt/vending hp 2/6, state 'attack', attack undefined`. Direct repro: `tests/audit/stb/crash.test.ts` "direct" (fails on `1ec6731`). The hover half of the branch (`:631`) has the same hole for a hovering actor in `'attack'` (the jetpack mini-boss's shove is an `act` attack).
- Player impact: an uncaught exception in `World.step` freezes the game in stage 3's street (the scene's update loop throws every frame). Punching the brute while he swings is the natural thing to do.
- Proposal: in that branch, when the state is `'attack'`, also `enter(o, 'stun')` with `stunFor = 0.12` (or keep the attack: move line 585 below the no-flinch return). Optional safety: `stepAttack` returns to `'free'` when `a.attack` is missing instead of throwing.
- Test: `crash.test.ts` both cases pass (direct + street × seeds 1–5, 120 s); soak shows 0 exceptions.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: the brute's swing gets interrupted by a punch (he used to keep swinging before the crash). CMB may prefer "keeps swinging": then don't clear `attack` for him at all.

### STB-02 · Restarting the street (stage 3) from its checkpoint drops improbability mode and the axe-throw rule
- Type: bug S2 (wrong rule after a restart)
- Where: `src/data/stages/stage3Script.ts:117` (`flags.add('axeThrows')`) and `:128` (`setImprobable(world, true)`) run in the camera room only; `:291` turns improbability off when the street is left. `GameScene.setupRoomStage` (`src/scenes/GameScene.ts:380`) builds a new `World` (physics `'normal'`, empty flags) for a restart.
- Evidence: `probes.test.ts` STB-02: played through camera → street: `{ physics: 'improbable', axe: true }`; restarted at the street: `{ physics: 'normal', axe: false }`. `checkpoint.test.ts` also flags `s3 camera -> street flags: arrival=axeThrows | restart=`. In a continuous run `axeThrows` also stays on for desert, vending, console and lift (never cleared), but not after any restart there.
- Player impact: die in the street and its whole look and feel changes: no 2.4× knockback, no wall/ceiling bounces, no tape wobble, enemies don't fly in, axe grunts stop throwing. Later rooms differ between a first try and a retry.
- Proposal: make room rules part of the room, not of history: the street script sets `setImprobable(world, true)` (and `axeThrows`) on entry; a room-rules hook in `enterRoom` (e.g. `StageRoom.rules?: { physics?, flags? }`) applied on entry and reset on leaving. Decide whether `axeThrows` is camera-only (then clear it on leaving) or the rest of the stage.
- Test: STB-02 probe passes; `checkpoint.test.ts` shows no `physics`/`flags` diff for any room.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: the music/wobble hook (`improbability` event) fires on entry; FAS should check the mixer wobble starts cleanly under the wipe.

### STB-03 · A grenade cooked while walking out of a room goes off in the next room
- Type: bug S2
- Where: `src/sim/stage.ts` `checkExits` (only `state === 'free' && !holding` is checked, not `cook`), `placeAtEntry` (`:282`, clears flight/holding/traversing but not `cook` / `pose.grenade`); `src/sim/melee.ts:268` `stepGrenade` keeps counting in the new room.
- Evidence: `probes.test.ts` STB-03: cook 0.33 s, walk out of stage 2 `wall`; arriving in `corner` the hero still has `cook = 0.35`; holding G on, 1 explosion goes off in the new room at the entry point (the room's checkpoint).
- Player impact: a grenade cooked at the door explodes in your hand at the next room's entry (or gets lobbed the instant the wipe opens if G is released). Can kill you at a checkpoint before you see the room.
- Proposal: in `placeAtEntry` clear `cook`, `pose.grenade`, `attack`, `queued`, `grabQueued`, `guard` (give the grenade back: `grenades++` if `cook` was set). Or block walk-in exits while cooking (`p.cook === undefined` in `checkExits`/`coopExit`), which also reads better.
- Test: STB-03 probe passes (0 explosions in the new room, grenade count restored).
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none known; CTL may prefer the "blocked while cooking" variant.

### STB-04 · Killed on the exit: the hero comes back alive in the next room with 1 hp
- Type: bug S2
- Where: `src/sim/stage.ts:284` (`placeAtEntry`: `if (p.state === 'downed' || !alive(p)) p.hp = Math.max(1, p.hp)` revives anyone, meant for co-op downed partners); traversal + wipe is 0.45 + 0.35 s, shorter than `RESTART_DELAY` 2 s (`GameScene.ts:546`).
- Evidence: `probes.test.ts` STB-04: exit taken in stage 2 `wall`, hero killed on that tick (blast), 0.82 s later `roomEnter corner` with the hero `free`, hp 1. Co-op variant (read in code): partner A goes ahead up a ladder (parked); B is killed outright (no "active" teammate, so no downed state); `coopExit` then takes the exit and B is revived too.
- Player impact: a death that the screen showed (kill cam, body flying) is undone by the wipe; the checkpoint saved at that `roomEnter` then holds a 1-hp hero. Rare, but confusing when it happens; with grenades and shotguns around doors it will.
- Proposal: revive only `downed` players in `placeAtEntry` (a dead single player stays dead, the scene restarts in the old room); in co-op, a partner killed while the other is parked should go `downed` instead (count parked players as "a teammate still standing" in `applyHit`'s co-op branch).
- Test: STB-04 probe passes; a co-op probe: parked A + B killed → B `downed`, revived next room.
- Effort S · Impact ★★ · Confidence confirmed (single player), likely (co-op)
- Risk: touches the co-op revive rule (M18 co-op moves): check with `tests/coop.test.ts`.

### STB-05 · Stage 3's ending soft-locks if the hero dies in the 0.6 s before the stab
- Type: bug **S1 softlock**
- Where: `src/data/stages/stage3Late.ts:254-257`: `yield 0.6; world.flags.add('ending'); const p = world.activePlayers[0]; if (!p) return;` returns without `s.clear()`; `GameScene.watchPlayerDeath` (`:545`) never restarts while `flags.has('ending')`.
- Evidence: `probes.test.ts` STB-05: lift room, both guards down, hero killed in that window → after 10 s: hero dead, `ending` set, no `roomCleared`. Dead hero, no restart, no end card, forever. (A late grenade from a guard, a shotgun pellet in flight, a thrown knife all do it.) Stage 2's ending checks `activePlayers` *before* setting the flag, so it can't hit this.
- Player impact: the last room of the last stage freezes on a dead hero; only quitting to the title helps (and Continue drops you back into the lift).
- Proposal: set `ending` only after the `!p` check, and on `!p` let the normal restart happen (or `s.clear()`). Same audit for any other `flags.add('ending')`.
- Test: STB-05 probe passes (either a restart is allowed or the end card shows).
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### STB-06 · Stage 1 has no checkpoint: dying anywhere replays it from the title card and the intro
- Type: bug S2 (lost progress) / decision
- Where: `src/scenes/GameScene.ts:407-420` `setupStage`: stage 1 isn't a room graph, `restart()` (`:355`, `resume: true`) re-runs `stage1From(data.beat ?? 'intro')`, ignoring `resume`; stage 1 never emits `roomEnter`, so no checkpoint is saved and "Continue" can't resume it either. The pause menu's "Restart room" does the same.
- Evidence: code read. `research/design-decisions.md`: "dying restarts the room you died in, with the weapons and body count you entered it with". Stage 1 is one room but five beats (riot, grenade, boss, wave B, ending); `STAGE1_BEATS` already lets the script start at any beat.
- Player impact: die to the boss or in wave B and you sit through the "STAGE 1" card, the intro conversation, the whole riot and the grenade beat again (~3–4 min). Quitting mid-stage and Continue also starts over.
- Proposal: treat beats as checkpoints: the stage 1 script emits a `roomEnter`-like `checkpoint` event (stage 1, room `arena`, entry = beat) at each beat; `setupStage` honours `resume` with that beat (the `?beat=` path already builds the later beats' state: corpses, cannon, SMG).
- Test: a probe that starts at `boss` from a saved checkpoint and sees no `card('STAGE 1')`; GameScene restart passes `beat` from `PROGRESS.checkpoint`.
- Effort S · Impact ★★★ · Confidence confirmed (code)
- Risk: the user decides whether beats count as checkpoints (§6). LVL owns pacing.

### STB-07 · The death-restart timer runs while the game is paused
- Type: bug S3
- Where: `src/scenes/GameScene.ts:540-547` `watchPlayerDeath(delta)` is called every frame (`:526`) with real time, ignoring `clock.paused`; `deadFor` is never reset except in `create()`.
- Evidence: code read. `UIScene.togglePause` (`UIScene.ts:131`) only sets `clock.paused`.
- Player impact: die, press Esc to open Settings: 2 s later the room restarts under you and the menu vanishes (the UI scene is relaunched). In co-op, both downed / a revive moment adds to the same `deadFor`, so a later wipe restarts sooner than 2 s.
- Proposal: `if (this.clock.paused) return;` in `watchPlayerDeath`; reset `deadFor = 0` whenever `activePlayers.length > 0`.
- Test: a scene-free unit around the watch (extract it into a tiny pure function) or a driver run: die, Esc, wait 3 s, menu still open.
- Effort S · Impact ★ · Confidence likely
- Risk: none.

### STB-08 · A room isn't reproducible from its checkpoint: the RNG and ids carry over from earlier rooms
- Type: tech
- Where: `src/sim/world.ts:61` one seed per `World`, never reseeded by `enterRoom`/`setRoom` (`:185`); `src/sim/actor.ts` `newId()` is a module-global counter (ids feed the idles and `separate()`'s tie-break).
- Evidence: `checkpoint.test.ts`: 3 s after entering, arrival vs restart differ in `swords -> lobby` (an enemy grenade lobbed only in one: `enemyGrenades 0 vs 1`) and `console -> lift` (a decapitated head only after the restart). Both come from different `world.rng()` streams.
- Player impact: none directly; but a bug seen on arrival may not reproduce after a restart, co-op hosts and replays can't rebuild a room from its checkpoint, and M14b's acceptance probes for a room depend on how it was reached.
- Proposal: reseed in `enterRoom` from (stage, room, entry, attempt) and give `World` its own id counter (or offset ids per world). Keep the seed in the checkpoint.
- Test: `checkpoint.test.ts` shows no diff at all (after STB-02); `stateHash` equal for arrival vs restart after 600 idle ticks.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: changes every seeded test outcome once (balance tests stay statistically the same); TEC owns determinism.

### STB-09 · Room entry leaves per-actor action state behind
- Type: bug S3
- Where: `src/sim/stage.ts:282` `placeAtEntry` clears `flight`, `holding`, `traversing`, `parked`, `tuck`, state, root, velocity, but not `grabbedBy`, `attack`/`queued`/`grabQueued`, `cook` (STB-03), `guard`, `pose.grenade`, `pose.telegraph`, `pose.react`, `chain`, `catchAt`, `useHeldAt`, `fallingAway`, `skyFall`, `hover`, `stunFor`.
- Evidence: code read; the `cook` case is confirmed (STB-03). `fallingAway` matters for the camera room's void exit: a player who falls has `fallingAway > 0.8` when `takeExit('void')` runs.
- Player impact: odd first frames in a new room (a queued punch firing at entry, a guard pose held, a fall timer still running).
- Proposal: one `resetForRoom(actor)` that clears every transient field, called from `placeAtEntry` (and from the warp path, `stage.ts:484`).
- Test: a probe that sets each field before an exit and checks they're all clear after `roomEnter`.
- Effort S · Impact ★ · Confidence likely
- Risk: M17's hold-E (`useHeldAt`) and M19 rage fields need to be in the list or deliberately kept (rage is saved with the checkpoint).

### STB-10 · The pause menu and F3 fight over `clock.paused`; F4 steps run through hit-stop
- Type: bug S3 (dev tools)
- Where: `UIScene.closePause` (`:161`) sets `paused = false` unconditionally; `FixedClock.advance` (`src/sim/clock.ts`) runs `pendingSteps` ignoring `hitStopTicks`.
- Evidence: code read; `probes.test.ts` STB-05/clock: two F4 steps during a hit-stop both step the world, the hit-stop still runs after unpausing.
- Player impact: dev only: F3 pause + Esc + Resume unpauses; frame-stepping a hit misses the freeze frames, so measured timings around hits are off by the hit-stop.
- Proposal: keep `pausedByMenu` separate from the debug pause (paused = either); F4 consumes a hit-stop tick like a real tick.
- Test: clock unit test (F4 during a 0.2 s hit-stop advances `tick` but not the world for 12 steps).
- Effort S · Impact ★ · Confidence confirmed (clock), likely (menu)
- Risk: none.

### STB-11 · Kill cam, shakes and chromatic play on under the pause menu
- Type: bug S3 (cosmetic)
- Where: `src/render/feelFx.ts:73` `update(realDt)` is called every frame with real time even while `clock.paused` (`GameScene.ts` update).
- Evidence: code read.
- Player impact: pause on a kill: the zoom and the tint finish (and the kill-cam audio filter sweeps) behind the menu; unpausing shows the end of nothing.
- Proposal: pass 0 to `feelFx.update` while paused (or scale by `clock.paused ? 0 : 1`).
- Test: driver: kill, Esc in the same frame, screenshot after 1 s and after Resume.
- Effort S · Impact ★ · Confidence likely
- Risk: FAS owns the feel; the audio filter must also freeze.

### STB-12 · A wave script with a wrong spawn id or door index crashes the game mid-room
- Type: tech (spawn safety)
- Where: `src/sim/waves.ts` `spawn()` throws `unknown spawn point`; `stepDoors` reads `world.room.doors[d.door].wall` without a check; nothing catches exceptions around `World.step` in `GameScene.update`.
- Evidence: code read. Today's data is clean (0 such exceptions in the soak), but spawning is being reworked on another branch right now (several points, groups), which is exactly where a typo slips in, and it only throws when that entry comes up, minutes into a room.
- Player impact: a hard freeze in the middle of a fight.
- Proposal: a data lint test that builds every `RoomScript` used by stages 1–3 (the exported wave functions + `STAGE1.rooms.arena.script`) and checks each entry's spawn id exists and each door index exists in its room. Optionally, `World.step` wrapped in dev to report and skip the faulty entry. (No change to spawn patterns.)
- Test: the lint test itself; it fails on a deliberately broken entry.
- Effort S · Impact ★★ · Confidence likely
- Risk: none; coordinate with the spawn-variety branch so its new scripts are in the lint list.

### STB-13 · Squad heads are remembered per world, not per room
- Type: bug S3 (latent, spawning)
- Where: `src/sim/waves.ts:201` `squadHeads = WeakMap<World, Map<squad, id>>`, never cleared on `enterRoom`.
- Evidence: code read. Squad names today are unique per stage (`riot` in the stage 2 corridor, `D` in stage 3 late), so no symptom yet. A later room reusing a name (likely as spawns get more group-based) makes new members follow a leader id from an earlier room (dead/gone: `ai.leader` points nowhere), or bodyguards counting the old room's guards for their side.
- Player impact: none today; squad AI silently broken in a later room once names repeat.
- Proposal: clear the map in `enterRoom` (or key it by `world.director`/room), and resolve `leader` only to a living actor.
- Test: a probe spawns squad 'A' in room 1, changes room, spawns squad 'A' again: members follow the new leader.
- Effort S · Impact ★ · Confidence likely
- Risk: hand to the spawn-variety branch (they may already restructure squads).

### STB-14 · The "softlock" rooms all hinge on one scripted action with no fallback
- Type: friction (for LVL/UXS; reported because the soak sees them as softlock suspects)
- Where: stage 2 `elevator` (roof + cables after the ambush), `final` (disarm the target: `stage2Late.ts:273` waits on a `disarm` event forever), stage 3 `street` (only pinning the protected mini-boss to the tank ends it, `stage3Script.ts`), stage 1 intro (talk to the boombox guy).
- Evidence: soak: every bot × seed in these rooms ends with "60 s: no enemy, no open exit, no script activity" (§4), no exception or broken state. In `final`, the melee bot stun-locks the protected target for 15 s+ (punches keep stunning him) without progress.
- Player impact: a player who doesn't get the trick stands in an empty room. Not a bug; a hint escalation (the caption again after ~20 s idle, the tracker pointing at the cable/tank) would remove the dead end.
- Proposal: a generic "stuck hint" in the stage runner: if no activity for 20 s with no enemy alive, re-emit the room's last caption. LVL/UXS to decide.
- Test: soak shows no 60 s softlock suspect with the idle bot except where the room expects the player to talk/move.
- Effort S · Impact ★★ · Confidence confirmed (measured), opinion (fix)
- Risk: none.

### STB-15 · Stage 2 corridor: the shotgun pair kills a fresh hero 3–5 s after the entry
- Type: balance (hand-off to ENC)
- Where: `src/data/stages/stage2Script.ts:187` `corridorShotguns()` first, at the corridor entry.
- Evidence: soak: 19 of 20 runs died there (every bot, including bots kept at ≥ 2 hp each tick); `corridor.test.ts`: at 3.52 s three pellets in one tick take an idle hero from 3 hp to dead.
- Player impact: the corridor checkpoint is a near-instant death on arrival; repeated restarts there.
- Proposal: ENC's call (a longer telegraph on the first shot after a room entry, or the spawn-variety work); listed for the triage only.
- Test: soak death rate in the corridor for `prog-gun`.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: ENC lens.

## 4. Baseline metrics

**Soak, `3f94afd`, seeds 1–2, 120 s per run, 520 runs** (5 bots × 1p/2p; all bots but `mortal-gun` are held at ≥ 2 hp; a run continues through later rooms until the stage ends). Outcome per room (both player counts, both seeds): `->room` = left the room, `cleared` = finished the stage, `t/o` = 120 s up.

| Room | Exceptions | Violations (triaged) | Typical outcome | p95 ms/tick (max) | Max items |
|---|---|---|---|---|---|
| 1/intro | 0 | softlock suspect, all bots (needs the talk) | t/o | 0.16 (35) | – |
| 1/riot | 0 | boss-grab false positives (harness fixed) | t/o; mortal died | 0.38 (16) | 54 |
| 1/grenade | 0 | same | t/o | 0.18 (9) | 20 |
| 1/boss | 0 | – | prog-gun cleared stage | 0.15 (4) | 20 |
| 1/waveB | 0 | – | cleared mostly | 0.43 (8) | 22 |
| 1/ending | 0 | – | cleared (all) | 0.07 (8) | 3 |
| 2/wall | 0 | – | ->corner (1p) | 0.17 (20) | 6 |
| 2/corner | 0 | – | ->roofA | 0.40 (39) | 6 |
| 2/roofA | 0 | – | ->roofB | 0.57 (59) | 6 |
| 2/roofB | 0 | – | t/o (bots can't blow the breach reliably) | 0.26 (6) | 5 |
| 2/office | 0 | – | ->corridor | 0.77 (26) | 35 |
| 2/corridor | 0 | – | **died in 3–8 s, 19/20** (STB-15) | 0.44 (10) | 19 |
| 2/elevator | 0 | softlock suspect (roof/cables) | t/o | 0.45 (28) | 12 |
| 2/swords | 0 | – | ->lobby | 0.83 (25) | 25 |
| 2/lobby | 0 | – | ->crates / died | 0.45 (6) | 17 |
| 2/crates | 0 | – | ->final / t/o | 0.37 (25) | 16 |
| 2/final | 0 | softlock suspect (disarm), target stun-locked 15 s | t/o | 2.1 (34) | 4 |
| 3/outside | 0 | – | ->vent | 0.39 (18) | 17 |
| 3/vent | 0 | – | ->tables (1p) | 0.30 (7) | 16 |
| 3/tables | 0 | – | ->camera (1p) | 0.44 (23) | 24 |
| 3/camera | 1 (in the street) | – | ->street | 0.45 (7) | 27 |
| 3/street | **2** (STB-01) | softlock suspect (pin to the tank) | t/o; died | 0.30 (6) | 29 |
| 3/desert | 0 | – | ->vending; prog-gun cleared stage | 0.40 (19) | 32 |
| 3/vending | 0 | – | t/o; prog-gun cleared | 0.24 (6) | 20 |
| 3/console | 0 | – | died / ->lift / cleared | 0.30 (4) | 28 |
| 3/lift | 0 | – | cleared | 0.27 (4) | 10 |

Max-ms spikes (up to 59 ms) are single ticks on a machine running several agents (first-tick JIT / GC); use `baseline.md` for absolute numbers. Re-run on `1ec6731` with seed 1: see the note under the table in §4b.

**§4b `1ec6731` (seed 1, 260 runs, `soak2.txt`):** 2 exceptions, both STB-16 (3/vending 1p masher tick 3321, 3/vending 2p masher tick 1632; `alive(undefined)` in `melee.ts` `pullable`). STB-01 didn't trigger on this seed (the trajectories changed with the merged features), but its direct repro still fails. 1 dangling-hold violation (3/camera 2p masher tick 3725: a player holding an actor removed by the void fall; `updateHeld` clears it on the next tick). Softlock suspects as before (intro, elevator, final, street). 50 deaths (the corridor 10/10 again), 24 stage completions, worst p95 1.4 ms/tick (3/tables).

**Probes on `1ec6731`:** STB-16 crash fails · STB-01 crash (direct) fails · STB-02 street restart fails · STB-03 cooked grenade fails · STB-04 exit-tick death fails · STB-05 stage 3 ending softlock fails · checkpoint diff: 4 differences (STB-02, STB-08) · determinism passes · exits/entries valid passes · co-op downed partner carried passes · input lock after room change passes.

**Commands:** `AUDIT=1 npx vitest run tests/audit/stb` (probes, ~10 s) · `AUDIT=1 npx vitest run tests/audit/soak.test.ts` (smoke + determinism) · `SOAK=1 SOAK_SEEDS=1,2 SOAK_OUT=<file> npx vitest run tests/audit/soak.test.ts -t "every room"` (~4.5 min for 2 seeds).

## 5. Top 5
1. STB-16: a knife stuck in the boss when he teleports (or in the jetpack mini-boss when he flies off) crashes stage 3 for an empty-handed hero standing still.
2. STB-01: hitting the vending brute mid-swing throws in `stepAttack`: the street (stage 3) freezes.
3. STB-05: dying in the 0.6 s before stage 3's stab soft-locks the last room.
4. STB-06: stage 1 has no checkpoints: every death replays the intro and every beat.
5. STB-02: restarting the street loses improbability mode and the axe-throw rule. Together with STB-03/04/09 (room entry keeps a cooked grenade, revives a hero killed on the exit) this is the room-change class, fixed by room-owned rules plus one `resetForRoom`.

## 6. Questions for the user
- Stage 1: should each beat (riot, grenade, boss, wave B, ending) be a checkpoint, the way each room is in stages 2–3? (STB-06)
- `axeThrows`: only the camera room, or the rest of stage 3 from there on? Today it depends on whether you restarted. (STB-02)
- When a scripted room waits on one trick (cables, disarm, pin to the tank), may it repeat its hint after ~20 s of nothing happening? (STB-14)
