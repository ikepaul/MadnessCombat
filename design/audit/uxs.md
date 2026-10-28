# UX, shell & tech audit (UXS + TEC)

## 1. Coverage
- **Read fully:** `src/ui/*` (menu, settingsMenu, hud, transition, credits), `src/scenes/TitleScene.ts`, `UIScene.ts`, `CoopLobbyScene.ts`, `BootScene.ts`, `GameScene.ts`, `src/settings.ts`, `src/progress.ts`, `src/net/*` (link, relay, snapshot), `src/render/canvasLayer.ts`, `src/render/post.ts`, `src/dev/*`, `src/input/playerInput.ts`, `src/input/debugKeys.ts`, `src/main.ts`, `index.html`, `vite.config.ts`, `research/performance.md`. Line ranges of `src/audio/music.ts`, `src/render/feelFx.ts`, `src/sim/world.ts`, `src/sim/clock.ts`, `src/data/stages/stage1Script.ts`, `roomPainter.ts`, Phaser's `TextStyle.js`.
- **Probes** (`AUDIT=1 npx vitest run tests/audit/uxs --silent=false`): `tests/audit/uxs/shell.test.ts` (corrupt/old localStorage, replaying a stage, reset), `tests/audit/uxs/sim.test.ts` (time to control after a restart in every stage 2–3 room, the stage 1 timeline, snapshot bytes + sim ms/tick in busy rooms, determinism), `tests/audit/uxs/net.test.ts` (guest ghosts, P2's stale input). All type-correct (the `tsc` errors on the branch are in `tests/audit/vis/`).
- **Build:** `vite build` into my scratch folder (bundle sizes, dev strings in the bundle).
- **Not covered (lean mode, no browser):** real frame times, stills of menus at each resolution, heap growth over a session, the co-op lobby on two tabs, time-to-title. Everything about rendering/layout below is from code and geometry, marked *likely*. Frame-time claims are unmeasured; the sim timings are relative only (busy machine).

## 2. What works (protect it)
- **Determinism holds:** same room + same commands gives the same state after 600 ticks (office ×3 runs, street ×2), seeded `World.rng`. Invariant 10 passes.
- **Room restarts are fast and cheap:** `CanvasLayer` reuses its canvas (research/performance.md: 10–30 ms), and control returns 0.02 s after the room loads in 17 of 20 rooms (0.6–0.9 s in roomA, swords, vending). Checkpoints carry loadout and body count.
- **Storage is guarded everywhere** (private windows don't crash), unparseable JSON falls back to defaults (probe), a checkpoint naming a room that no longer exists falls back to the stage start (`GameScene.ts:335`).
- **The menu's "born" timestamp guard** (`menu.ts:203`) and the pause's `pauseClosedAt` stop one key press from opening and closing a menu at once. Keep that pattern.
- **The HUD prompt reads the rebound key** (`hud.ts:192`: `SETTINGS.keys.use`), lost lives change shape as well as colour (dead face X), and the last life has sound + visual: good accessibility basics.

## 3. Findings

### UXS-01 · Stage 1 has no checkpoint: a death anywhere replays the whole stage from the intro
- Type: bug S1 (lost progress)
- Where: `src/scenes/GameScene.ts:360-375` (`setupStage` ignores `resume` and always runs `stage1From('intro')` unless `?beat=`), `restart()` at `:307`; `src/scenes/TitleScene.ts:114` (Continue needs `cp.room`, which stage 1 never writes)
- Evidence: probe `sim.test.ts` "stage 1 timeline", with *instant kills*: first control 1.8 s, riot 2.8 s, grenade beat 21.6 s, boss 46.6 s. A real player reaches the boss after several minutes; dying to the boss or in wave B throws all of that away, intro card and caption included. Quitting mid-stage-1 leaves Continue disabled.
- Player impact: The first stage, the one new players die in most, is the only one with no checkpoints. Dying to the boss means replaying the boombox, the riot and the grenade every time.
- Proposal: a checkpoint per beat. `stage1From(beat)` already rebuilds what earlier beats leave (corpses, cannon, SMG). On each beat start, `saveCheckpoint({ stage: 1, room: 'arena', entry: beat, kills, players })`. `setupStage` with `resume` reads `entry` as the beat, and Continue accepts a stage 1 checkpoint with a beat.
- Test: headless: start stage 1, reach 'boss', kill the hero, rebuild like `restart()`: the script starts at 'boss' with the saved kills; a shell test that `canContinue` is true for `{stage:1, entry:'boss'}`.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: kills counted against the episode's 32 must be restored (the card compares them); ENC/LVL (beat pacing).

### UXS-02 · Combat music: a 48 MB WAV is fetched and decoded again on every room entry and death, and the old looping sources are never stopped
- Type: perf / tech (memory leak; S1 risk on long sessions)
- Where: `src/audio/music.ts:55-60` (`setRoom` → `stop()` clears `current`), `:90` (fetch + `decodeAudioData` each time), `:94-103` (looping `AudioBufferSource`s; `stop()` at `:124` and `setTrack` only `disconnect()` the gains, never `src.stop()`); `assets/music/cues.json` (23 rooms use `madness-combat-v1`)
- Evidence: build output `MadnessCombat.V1-*.wav 48,066 kB`. A 272 s stereo track decodes to about 100 MB of float32. A playing looping source node stays alive until it is stopped, even disconnected, so each room change or restart keeps another ~100 MB buffer playing into nothing. Ten deaths in a room ≈ 1 GB. The boombox already caches its decode (`music.ts:27-34`); combat music doesn't.
- Player impact: The music comes in late after every room change or death, memory climbs through a session, and the tab can be killed on a long stage 3 run.
- Proposal: cache decoded buffers per track id (like `decoded`), keep the source nodes and `stop()` them in `setTrack`/`stop`, and keep a track that is already playing when the next room uses the same one (crossfade instead of a restart). Ship the stem as OGG/Opus (~4–6 MB) and keep the WAV as the master outside `assets/`.
- Test: unit test with a fake `AudioContext` counting `decodeAudioData` calls and live (started, not stopped) sources across 10 `setRoom` calls: 1 decode, ≤ 1 live source per layer. Bundle check: no asset over 10 MB.
- Effort S · Impact ★★★ · Confidence likely (code read; the leak is how Web Audio source lifetime works, not measured on a heap)
- Risk: FAS (music continuity across rooms is a feel change, probably for the better).

### UXS-03 · Replaying an earlier stage moves Continue back
- Type: bug S2 (lost progress)
- Where: `src/progress.ts:41-53` (`saveCheckpoint` always overwrites; `stageFinished(1)` sets the checkpoint to stage 2's start)
- Evidence: probe `shell.test.ts`: with a checkpoint at stage 3 desert (140 kills), finishing a replayed stage 1 leaves `{"stage":2,"room":""}`. Merely entering the first room of a replayed stage 2 overwrites the stage 3 checkpoint too.
- Player impact: Someone who replays stage 1 from Stage select to show a friend loses their place in stage 3. Continue now says "stage 2".
- Proposal: the checkpoint only moves forward. Ignore `saveCheckpoint` / `stageFinished` for a stage lower than the saved checkpoint's stage, or keep one checkpoint per stage and have Continue use the furthest. Co-op host runs follow the same rule.
- Test: the probe flipped: after a stage 3 checkpoint, `stageFinished(1)` and `saveCheckpoint({stage:2,…})` leave stage 3.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: a player who really wants to restart stage 2 uses Stage select (unchanged).

### UXS-04 · Debug keys are live in the production build
- Type: bug S2 / tech
- Where: `src/input/debugKeys.ts:25-43`, bound unconditionally from `GameScene.ts:240` (only F6 is gated on `import.meta.env.DEV`). The built bundle contains `keydown-K`, `keydown-Z`, `keydown-F3`.
- Evidence: in a shipped build K drops 20 corpses, L drops a loaded gun at each player's feet, Z raises every corpse, F2 is 0.25× slow-mo, F3 freezes the game with no indicator (the overlay is off), `.` steps, 1/2/3 switch palette (pressing 3 in stage 1 turns on blood the stage was decided without), P turns post FX off, M sets master to 0 and back to 0.8 (not to your volume). These are common keys right next to WASD/E/Q/R/F/G/C.
- Player impact: A stray key spawns guns or zombies or freezes the game, and nothing explains what happened. It also breaks rebinding: a player who binds grab to K drops corpses with every grab.
- Proposal: bind the debug set only when `import.meta.env.DEV` or `?debug` is in the URL. Keep V (effects) and M (mute) as player shortcuts if wanted, with M restoring the previous volume.
- Test: unit: `bindDebugKeys` with `dev=false` registers only the allowed keys; bundle grep shows no `keydown-K` handler.
- Effort S · Impact ★★★ · Confidence confirmed (bundle strings + code)
- Risk: playtests on a production build lose K/L/Z (use `?debug`). STB/VIS use these keys in probes on the dev server, so no change for them.

### UXS-05 · Keys pressed in the pause menu reach the game: Space on "Resume" makes the hero jump, and a co-op guest moves P2 while in the menu
- Type: bug S2
- Where: `GameScene.ts:465-472` (input is read and edges latched into `world.command` every frame even while the clock is paused; an edge stays latched "until a tick actually consumes it"), `menu.ts:214` (Space activates a menu item), `GameScene.ts:454-458` (the guest sends input every frame, menu open or not)
- Evidence: code path: Space down → `PlayerInput.jumpLatch` → `mergeEdges` into `world.command` → `steps === 0` while paused, so it stays latched → the first tick after Resume jumps. Same for E/F/R/Q pressed in the menu. Guest: W/S navigate the menu and are also P2's depth movement on the host, and Space jumps.
- Player impact: Leaving the pause menu with Space jumps the hero (sometimes into a fight). In co-op, the guest walks around while changing a setting.
- Proposal: while the pause menu is open, GameScene neither reads nor merges input (host) and sends `IDLE_COMMAND` (guest). On close, `input_.consumeEdges()` and clear the edges in `world.command`.
- Test: a `PlayerInput` unit test or a driver script: open pause, Space on Resume, step 10 ticks: `hero.pos.y === 0` and no `jump` event.
- Effort S · Impact ★★ · Confidence likely
- Risk: CTL (the edge latch exists so no press is lost; keep it outside the menu).

### UXS-06 · Co-op shell dead ends: no way back from the lobby, from the co-op end card, or out of a host pause or quit the guest can't see
- Type: friction (bug S2 for the guest)
- Where: `CoopLobbyScene.ts:214` (only host Enter; no Esc anywhere; a guest with no host "Retrying…" forever, `link.ts:29`); `TitleScene.ts:119-120` (the Co-op items appear in production, where `link.ts:22-24` can only say "Co-op needs the dev server"); `GameScene.ts:270` (Esc on the end card does nothing in co-op), `UIScene.ts:200` (the guest's card says "waiting for the host" and has no keys); `UIScene.ts:119-120` (the host pauses the clock and the guest sees a frozen world, no message); `GameScene.ts:317` (host "Quit to title": the relay still pairs them, so the guest gets no `peer:false` and stays frozen); the guest's `onPeer` is never set (`GameScene.ts:387-392`), so a host that leaves shows nothing either.
- Evidence: code read (no two-tab run in lean mode).
- Player impact: In co-op, either player can end up on a frozen or "waiting" screen, and the only way out is closing the tab. In a production build the Co-op items lead to a dead end.
- Proposal: (1) Esc in the lobby → title (and drop the link: `relay.closed`). (2) Esc on the co-op end card → title for both. (3) Snapshot carries `paused` and `hostLeft`: the guest shows "Host paused" / "Host left (Esc: title)". (4) The host shows "Player 2 left" on `onPeer(false)`. (5) Hide Co-op on the title when `!import.meta.hot`, or grey it out with "needs npm run dev:lan".
- Test: relay unit tests for leaving the lobby; a snapshot test that `paused` reaches the puppet; two driver runs (host, join) for the messages.
- Effort M · Impact ★★ · Confidence likely
- Risk: M18 (co-op moves) builds on the same scenes; do this first.

### UXS-07 · When the guest stops sending (leaves, tab asleep), player 2 keeps doing his last input forever
- Type: bug S2 (TEC: co-op net)
- Where: `GameScene.ts:381-383` (`onInput` merges into `world.commands[1]`; `onPeer(false)` resets nothing); `world.ts:231` (only edges are cleared each tick, so holds persist)
- Evidence: probe `net.test.ts`: P2 with a last command of `moveX: 1` walks 2.75 H in 3 s with no new input. Holding LMB with an SMG keeps firing, and holding G cooks a grenade.
- Player impact: The guest alt-tabs or the browser throttles the tab, and the host's partner runs into enemies or empties a full-auto magazine.
- Proposal: on `onPeer(false)` and when no input has arrived for 250 ms (invented), `world.commands[1] = IDLE_COMMAND`. Optionally the guest sends idle on `visibilitychange`/`blur`.
- Test: the probe flipped: no input for 0.3 s → P2's velocity is 0 and `hold` is false.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### UXS-08 · The guest never removes actors the host removed: ghosts of the boss's cameo, the teleporting boss, bodies that fell into the void
- Type: bug S2 (TEC: co-op net)
- Where: `src/net/snapshot.ts:151-189` (`applySnapshot` adds or updates, never prunes); removals on the host at `world.ts:230` (swept bodies), `improbability.ts:107` (void), `stage2Script.ts:123,146` (the boss's peek/cameo), `stage3Late.ts:162,217`, `stage3Script.ts:57,285`
- Evidence: probe `net.test.ts`: host removes an actor → after a delta *and* a full snapshot, the host has 2 actors and the guest 3, the removed one frozen where it was last.
- Player impact: Player 2 sees the boss standing frozen after he left, or a body hanging over the void, until the room changes.
- Proposal: full snapshots prune every actor not listed. Deltas carry `ids` (all live actor ids, a few bytes each) or an `actorRemoved` event emitted wherever the sim splices.
- Test: the probe flipped (the guest drops the actor after the next snapshot); add to `tests/net.test.ts`.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: frozen corpses are left out of deltas on purpose: prune against the id list, not against `actors`.

### UXS-09 · "Reset progress" wipes everything in one press, one row above Back
- Type: friction (lost progress by accident)
- Where: `src/ui/settingsMenu.ts:284` (`action: () => resetProgress()`), in both the title settings and the pause settings
- Evidence: probe `shell.test.ts`: one call leaves `{"unlocked":1}`. The menu skips nothing and wraps around, so Up from Settings' first row lands on Back and Reset.
- Player impact: One Enter in the wrong place re-locks every stage and erases Continue, and nothing says it happened.
- Proposal: the first press changes the label to "Reset progress: press again to confirm" (resets when the cursor leaves), the second resets and shows "Progress reset". Hide it from the pause menu.
- Test: unit on the item: one action → progress unchanged; two → reset.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### UXS-10 · Key rebinding: conflicts are allowed, bindings apply only on the next room, and captions name the default keys
- Type: friction
- Where: `settingsMenu.ts:296-317` (any key accepted, including one already bound, a debug key or a hard-wired one; only Esc is refused); `playerInput.ts:36` (C stays a second dive key, so binding grab to C dives too); `settingsMenu.ts:315` "Back (applies on the next room)" (`PlayerInput` is built in `GameScene.create`); captions hard-code keys: `stage1Script.ts:70` "Ctrl into him", `:121` "Pick it up (E), hold G", `stage2Late`/`stage2Script` "press E" (4 captions)
- Evidence: code read.
- Player impact: A rebound player gets two actions on one key and stale instructions, and from the pause menu the new keys only work after dying or changing rooms.
- Proposal: (1) Binding a key that is in use swaps the two actions and says so ("Jump ↔ Grab"). Refuse F1–F6, Esc and Enter. (2) Rebuild `PlayerInput` when the pause menu closes. (3) Captions use a `key('use')` helper reading `SETTINGS.keys`. (4) Drop the C alias once dive is rebound.
- Test: unit: binding `grab` to `SPACE` swaps it with jump; a caption snapshot after rebinding use to `T` contains "T".
- Effort S · Impact ★★ · Confidence likely
- Risk: M17 changes the E prompt (not this); CTL.

### UXS-11 · The Controls screen's last row overlaps the help line at the bottom
- Type: look (S3)
- Where: `TitleScene.ts:150-152`: 15 rows at y = 530 + i·36 (26 px Anton, origin 0.5) put "Back (applies on the next room)" centred at y 1034 (≈ 1018–1050). The help text is drawn from y 1040 (top-left origin) to ≈ 1064, inside the same x range (1000+ vs 1060+).
- Evidence: geometry from the code; not screenshotted (no browser in lean mode).
- Player impact: The row you need to leave the screen is drawn over the instructions, at the very bottom of a 1080 screen and cut off at small window sizes.
- Proposal: start the controls list at y 500 with a 34 px gap, or put the help line under the heading at y 490.
- Test: a VIS still of `/` → Settings → Controls at 1280×720: no overlap.
- Effort S · Impact ★ · Confidence likely
- Risk: none.

### UXS-12 · Saves aren't validated: wrong-typed values load as they are
- Type: tech / bug S3
- Where: `settings.ts:41-50`, `progress.ts:23-29`
- Evidence: probe `shell.test.ts`: `{"master":"loud","effects":"banana","reducedMotion":"yes"}` loads exactly that. `effects:'banana'` gives `INTENSITY_SCALE[...] = undefined` (NaN shake), and `master:'loud'`/`null` reach `AudioParam.value` (`mixer.ts:116`), which throws on non-finite values in Chrome, inside the engine constructor. Progress `{"unlocked":"9","checkpoint":{"stage":7,"room":42}}` loads as is: the title shows "Continue · stage 7" and plays a stage that doesn't exist (BootScene/GameScene fall back to stage 1).
- Player impact: Rare (an old build's save, a hand edit), but the failure is silent breakage or no sound, not a reset.
- Proposal: a `version` field and a per-field sanitizer (numbers clamped 0–1, enums checked, keys must be Phaser key names, `unlocked` an integer 1..LAST_STAGE, a checkpoint whose stage/room doesn't exist dropped).
- Test: the probe flipped: every corrupt field comes back as its default.
- Effort S · Impact ★ · Confidence confirmed (load); likely (the AudioParam throw)
- Risk: none.

### UXS-13 · R on the end card restarts the stage, and R is reload
- Type: friction
- Where: `GameScene.ts:267` (`keydown-R` while `cleared`, a hard-coded R that ignores rebinding), the card appears 1.5 s after `roomCleared` (`:178`)
- Evidence: code read. The last kill is often followed by a reload press; Enter (next stage) has the same risk for players who rebind.
- Player impact: The stage's body-count card, the payoff, vanishes into a restart of the whole stage because of a reflex reload press.
- Proposal: the card ignores keys for its first 0.6 s (invented), and replay is "hold R" (0.5 s fill) or a key that isn't bound to an action.
- Test: driver: clear the room, tap R 1.6 s later → still on the card.
- Effort S · Impact ★★ · Confidence likely
- Risk: none.

### UXS-14 · Death to control: 2.4–3.3 s, no feedback, no skip, and the timer runs while paused
- Type: friction (minor bug)
- Where: `GameScene.ts:102,487-495` (`deadFor += dt * timeScale` is not gated on `clock.paused`)
- Evidence: probe `sim.test.ts`: after the room loads, control comes back in 0.02 s (0.60–0.90 s in roofA, swords, vending), plus the 2.00 s delay and the 0.35 s wipe-in, so 2.37–3.27 s in total. Opening the pause menu while dead still restarts the room 2 s later under the menu.
- Player impact: The restart is quick (keep it), but nothing says "restarting", and pausing on the death doesn't hold it.
- Proposal: stop `deadFor` while the clock is paused. After 0.8 s (invented), any action key restarts at once. A small "the room again" line on the ink is optional.
- Test: unit on a shell helper (see UXS-22): paused → `deadFor` unchanged.
- Effort S · Impact ★ · Confidence confirmed (timings) / likely (pause)
- Risk: none.

### UXS-15 · No pause on focus loss
- Type: friction
- Where: no `blur`/`visibilitychange` handler anywhere in `src/`. The clock clamps hitches (`clock.ts:47`), but a visible, unfocused window keeps running, and Phaser drops held keys on blur, so the hero stops defending.
- Evidence: grep.
- Player impact: Alt-tab to a chat message in single player and you come back dead.
- Proposal: single player: `window` blur → `openPause()`. Co-op: blur → the guest sends idle (see UXS-07), and the host's world keeps running.
- Test: driver: dispatch `blur` → the pause menu is open and `clock.paused`.
- Effort S · Impact ★★ · Confidence likely
- Risk: none.

### UXS-16 · Small text at small windows, blur on high-DPI screens, no text-size option
- Type: friction / look (accessibility)
- Where: `main.ts:14-23` (a fixed 1920×1080 canvas, `Scale.FIT`, no resolution handling). Text sizes at 1080: pip labels 20 px, lobby footer 22 px, controls help 20 px, credits 22 px, captions 30 px.
- Evidence: at a 1280×720 window everything scales by 0.67: 20 px becomes 13 px, the 30 px caption 20 px. On 2560×1440 or a Retina laptop the 1080 canvas is upscaled 1.33–1.5×, so lines and text soften. Not screenshotted (lean mode). VIS should confirm.
- Player impact: The tutorial captions and co-op labels are hard to read on a laptop window, and everything is slightly soft on good screens.
- Proposal: a minimum of 26 px at 1080 for anything the player must read (captions to 34), plus a "Text size: normal / large" setting scaling the UIScene texts by 1.25. Rendering above 1080 (canvas layers at DPR) is a separate L-sized decision.
- Test: VIS stills at 1280×720 and 2560×1440; a lint-style check that UI font sizes are ≥ 26.
- Effort S (sizes) / L (DPR) · Impact ★★ · Confidence likely / opinion
- Risk: VIS (layout), the art direction's type scale.

### UXS-17 · Reduced motion still flashes and flickers
- Type: friction (accessibility)
- Where: `feelFx.ts:79` (the kill-cam red wash uses `Math.max(0.5, k)`, so at intensity off it still pulses at 5% on every kill cam), `post.ts:125-127` (grain re-rolled every frame under any setting), `hud.ts:248-255` (pulsing red last-life vignette), `hud.ts:243-247` (red hurt edges), ink wipes and the card slide
- Evidence: code read. Reduced motion maps to `effectLevel() === 'off'` (`settings.ts:70`) and covers shake, chromatic and zoom only.
- Player impact: A player who turns on reduced motion for photosensitivity still gets full-screen red pulses and a flickering noise layer.
- Proposal: under reduced motion: no kill-cam tint, grain static (no per-frame re-roll), a steady low-life vignette (no beat), hurt edges at half alpha, wipes as a 0.2 s fade.
- Test: unit on `FeelFx` with `reducedMotion`: `post.killCam` is always called with 0; `PostFx.update` doesn't move the tile.
- Effort S · Impact ★★ · Confidence likely
- Risk: FAS/VIS (the look at default settings is unchanged).

### UXS-18 · HUD texts re-rasterize every frame
- Type: perf (TEC)
- Where: `UIScene.ts:187` (the kill counter: `setText(...).setColor(...)` every frame, even while hidden), `hud.ts:149` (`setColor('#ffffff')` on every weapon label every frame), `UIScene.ts:221` (co-op pip labels). Phaser's `TextStyle.setColor` always calls `parent.updateText()` (node_modules/phaser/src/gameobjects/text/TextStyle.js:756-761, 525-535), which redraws the text's canvas and re-uploads its texture. `setText` is guarded; `setColor` is not.
- Evidence: code read. That is 2–6 canvas text renders and texture uploads per frame (the 96 px Anton counter with a 10 px stroke is the largest).
- Player impact: Steady frame cost for nothing; it adds to the long frames during busy fights on weaker GPUs.
- Proposal: a `setColorIf(t, c)` helper (compare `t.style.color`) everywhere in UIScene/hud/stageHud. Skip the counter's update entirely while `kills === lastKills` and no pop is running.
- Test: spy on `Text.prototype.updateText` in a driver eval: 0 calls over 60 idle frames with a gun in hand.
- Effort S · Impact ★ · Confidence likely
- Risk: none.

### UXS-19 · Per-frame allocation in the render loop, and the elevator repaints its room every frame
- Type: perf (TEC)
- Where: `GameScene.ts:515-542` (one `{z, draw}` object plus one closure per actor, item, prop, cannon, ball, wall and block every frame, sorted; 50–100 per frame in busy rooms), `:503-507` (while `world.elevator` exists the whole room layer is repainted and re-uploaded every frame, stopped or not, a second full-screen upload per frame), `:99` and `:283` (`filter` per frame), `UIScene.ts:266-285` (new `Vector2`s per hurtbox per frame, debug only)
- Evidence: code read; sim side is cheap (probe: p50 0.11–0.39 ms/tick in office, lobby, street, desert, relative only).
- Player impact: GC pauses show up as occasional long frames. The elevator ride pays two full-screen uploads per frame.
- Proposal: a reused draw-list array of `{z, kind, ref}` with a switch instead of closures. Repaint the elevator room only when `offset`/`cut`/`phase` changed since the last paint (cache the three numbers).
- Test: a driver heap sample over 60 s in stage 2 office (allocation rate down). The elevator: count `roomLayer.upload` calls while stopped = 0.
- Effort S · Impact ★ · Confidence likely
- Risk: draw order must stay identical (VIS screenshot diff).

### UXS-20 · Co-op snapshots: ~8 KB a frame of JSON (~450 KB/s), half of it static item data, and no jitter buffer on the guest
- Type: perf / tech (TEC: co-op net)
- Where: `snapshot.ts:127-144` (`items: w.items` whole, `pose` whole, every frame), `GameScene.ts:477`, `GameScene.ts:391` (the guest applies whatever arrived this frame)
- Evidence: probe `sim.test.ts`, 2 players, 30 s brawl: office p50 7.9 KB (max 12.7) ≈ 457 KB/s; street 8.3 KB ≈ 462 KB/s; desert 7.5 KB; lobby 3.2 KB. A full snapshot with 60 bodies is 30 KB. In one street frame, items take 4207 B of 8389, actors 3545 (poses ~400 B each).
- Player impact: Fine on a good LAN. On busy home Wi-Fi the guest gets uneven frames (two snapshots in one frame, none in the next) and sees stutter, since there is no buffer or interpolation.
- Proposal: send only items' dynamic fields (pos, vel, state, ammo, holder) and round floats to 3 decimals (roughly halves the size, invented estimate). The guest plays out 1–2 frames behind (a tiny queue) for smoothness. No prediction needed.
- Test: the probe with a threshold: p50 < 4 KB in office/street; a net test feeding bunched snapshots shows one applied per frame.
- Effort M · Impact ★ · Confidence confirmed (bytes) / opinion (stutter)
- Risk: the guest's VFX/events replay order must hold; M18 adds co-op state on top.

### UXS-21 · Production bundle: one 1.8 MB chunk with every lab and the pose editor, plus a 48 MB WAV
- Type: tech / perf (loading)
- Where: `BootScene.ts:3-7`, `GameScene.ts:8-19` (all labs imported eagerly), `vite.config.ts:66` (`chunkSizeWarningLimit: 2000` hides the warning)
- Evidence: `vite build`: `index-*.js 1,809.86 kB │ gzip 500.46 kB`, `MadnessCombat.V1-*.wav 48,066 kB`, everything else < 80 kB. `?lab=pose-editor` and every lab work in the production build; the pose editor's Save posts to `/__poses`, which only the dev server has.
- Player impact: A slower first load than needed, and hidden dev pages reachable by URL.
- Proposal: lazy-load labs (`import()` behind `?lab`) or drop them from production (`import.meta.env.DEV`). Convert the stem (UXS-02). Put the warning limit back to 1000 so growth shows.
- Test: build output: main chunk < 1.2 MB (invented), no asset over 10 MB.
- Effort S · Impact ★ · Confidence confirmed
- Risk: labs are the replica checks: keep them in dev and `?lab` builds.

### UXS-22 · The number of stages is hard-coded in about ten places, and the shell logic lives untested in Phaser scenes
- Type: tech (code health, a seam for M15–M16)
- Where: `BootScene.ts:29,42` (`?stage=4` silently runs stage 1), `GameScene.ts:72` (`stage?: 1|2|3`), `:84` (`ROOMS_BY_ID` lists stages 1–3), `:87` (`ROOM_STAGES`), `:301-304` (`nextStage`), `progress.ts:30` (`LAST_STAGE = 3`, comment "1-3"), `TitleScene.ts:64` (`STAGE_NAMES`), `:90` ("three stages"), `UIScene.ts:202` (`stage === 3` for the credits line), `CoopLobbyScene` route parse. Death watch, end-card text, Continue rules and restart routing are methods on GameScene/UIScene/TitleScene, so no test reaches them (tests/shell.test.ts covers progress and settings only).
- Evidence: grep and code read. Stage 4 (M15) will need every one of these edits, and co-op guests will fail to find stage 4 rooms in `ROOMS_BY_ID`.
- Player impact: None today. M15's stage 4 ships with missing pieces (no card name, wrong end-card text, guests stuck on the arena) unless all ten are found.
- Proposal: a `src/data/stages/index.ts` registry `{ n, name, def | script, next }` used by boot, title, game, UI, progress and the guest's room lookup. Move the pure shell decisions (canContinue, nextStage, endCardText, shouldRestart(deadFor, paused)) into `src/shell.ts` with tests.
- Test: a test that iterates the registry: every stage has a name, a route, its rooms in the guest lookup, and an end-card line.
- Effort M · Impact ★★ · Confidence confirmed
- Risk: touches GameScene (conflict magnet, below); do it at the start of M15.

### UXS-23 · Conflict magnets: GameScene, combat.ts, actor.ts and tuning.ts are touched by almost every milestone
- Type: tech (code health)
- Where: commits since 2026-10-01: `GameScene.ts` 32, `combat.ts` 31, `actor.ts` 30, `tuning.ts` 29, `events.ts` 24, `world.ts` 19. Longest functions: `applyHit` 153 lines, `stepActor` 130, `ai.ts rangedStep` 94, `stage.ts stepTraversal` 84.
- Evidence: `git log --name-only`, an awk scan of function lengths.
- Player impact: None directly. Parallel slices of M14b and M17–M20 (rage hooks in `applyHit`, co-op moves in `stepActor`) will collide.
- Proposal (seams, no rewrites): (1) M19's rage meter listens to the existing `hit`/`kill`/`fatality` events instead of editing `applyHit`. (2) Split GameScene into `setup` (stage/room/test routing), `netSession` (host/guest) and `render` modules; it mixes all three at 550 lines. (3) A per-state handler table in `stepActor` so M18's states are added, not interleaved.
- Test: none mechanical; slices touch fewer shared lines (review the diff stat).
- Effort M · Impact ★ · Confidence opinion
- Risk: refactors without behaviour tests are risky; do (2) only together with UXS-22's shell tests.

### UXS-24 · The show's name is in the browser tab and in shipped file names
- Type: decision
- Where: `index.html:6` `<title>Madness-like</title>`; `package.json` name; localStorage keys `madness-like.*`; the shipped asset `MadnessCombat.V1-*.wav` (its URL is visible in the network tab); `TitleScene.ts:60` says "the show's name stays out of the game".
- Evidence: build output and code.
- Player impact: The tab shows a name derived from the show next to our own title "BODY COUNT", against the art direction's do-not-copy list (names, title).
- Proposal: `<title>` = `GAME_TITLE`, rename the stem file (e.g. `combat_v1.ogg`) and its cues entry. Leave storage keys as they are (renaming them loses saves) or migrate once.
- Test: grep the built `dist/` for the show's name: 0 hits outside source maps.
- Effort S · Impact ★ · Confidence confirmed
- Risk: `tests/hazard.test.ts:77` names the stem file and must change with it.

### UXS-25 · Dev tuning overrides persist silently
- Type: tech
- Where: `src/dev/overrides.ts:9-17` (applied on every dev load from localStorage), `tuningPanel.ts` (the only marker is red labels inside the closed panel)
- Evidence: code read.
- Player impact: The user's playtests (and co-op sessions, which always run on the dev server) can run on numbers that aren't in the repo, weeks after a panel session, with nothing on screen to say so. That undermines the M13/M14b playtest pass.
- Proposal: in dev, when overrides exist, a small "TUNED · n" tag in a HUD corner (click or F6 opens the panel).
- Test: unit: `loadOverrides()` non-empty → the tag text is "TUNED · n".
- Effort S · Impact ★ · Confidence likely
- Risk: none.

## 4. Baseline metrics

| Build (vite build, prod) | Size |
|---|---|
| main JS chunk | 1,809.86 kB (gzip 500.46 kB) |
| combat music stem (WAV) | 48,066 kB |
| CSS | 5.61 kB |
| largest other asset | 76.8 kB (mosin WAVs) |
| build time | 1.7 s |

| Death → control (probe, per room) | After the room loads | Total incl. 2.00 s delay + 0.35 s wipe |
|---|---|---|
| 17 of 20 rooms in stages 2–3 | 0.02 s | 2.37 s |
| s2 roofA, s2 swords | 0.90 s | 3.25 s |
| s3 vending | 0.60 s | 2.95 s |
| stage 1 (any beat) | replays from the intro: boss at ≥ 46.6 s with instant kills | ≥ 49 s |

| Co-op snapshot (2 players, 30 s brawl) | p50 | max | per second | full |
|---|---|---|---|---|
| s2 office | 7.9 KB | 12.7 KB | 457 KB/s | — |
| s2 office + 60 bodies | 7.8 KB | 10.9 KB | 446 KB/s | 30.1 KB |
| s2 lobby | 3.2 KB | 10.3 KB | 238 KB/s | — |
| s3 street | 8.3 KB | 11.2 KB | 462 KB/s | — |
| s3 street + 60 bodies | 8.2 KB | 11.4 KB | 454 KB/s | 30.3 KB |
| s3 desert | 7.5 KB | 10.6 KB | 423 KB/s | — |

| Sim ms/tick (relative only; busy machine) | p50 | p95 |
|---|---|---|
| s2 office / +60 bodies | 0.29 / 0.19 | 1.06 / 0.59 |
| s2 lobby | 0.11 | 0.67 |
| s3 street / +60 bodies | 0.39 / 0.21 | 1.63 / 0.72 |
| s3 desert | 0.21 | 0.77 |

Determinism: office 3/3 runs identical, street 2/2 (ids excluded from the hash).

## 5. Top 5
1. UXS-01: stage 1 has no checkpoint; a death anywhere replays the stage from the intro.
2. UXS-02: the 48 MB music WAV is re-fetched and re-decoded on every room and death, and the looping sources leak (~100 MB each).
3. UXS-04: debug keys (K corpses, L guns, Z raise, F3 freeze, 1/2/3 palette and blood) are live in production.
4. UXS-05: keys pressed in the pause menu reach the game (Space on Resume jumps; the guest walks while in the menu).
5. UXS-03: replaying an earlier stage moves Continue back (a stage 3 checkpoint becomes stage 2).

## 6. Questions for the user
- **Stage 1 checkpoints (UXS-01):** one per beat (intro, riot, grenade, boss, wave B, ending)? Or keep "the room" = the whole arena as decided, accepting a full replay?
- **Continue after a replay (UXS-03):** should Continue always mean the furthest point reached, or "the last thing I played"?
- **Debug keys in builds you share (UXS-04):** gate them behind `?debug`, and keep V/M as player shortcuts?
- **Co-op in production (UXS-06):** hide the Co-op items in a production build until there's a real server, or keep them greyed out with the hint?
- **Music format (UXS-02):** OK to ship the delivered stem as OGG/Opus (keeping your WAV as the master outside `assets/`), and to rename it without the show's name (UXS-24)?
- **Text size (UXS-16):** a "large text" setting, or just a bigger minimum size?
