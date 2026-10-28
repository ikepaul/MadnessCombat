# Controls & combat audit (CMB = CTL + CMB lenses)

## 1. Coverage
- **Read**: `src/input/playerInput.ts`, `debugKeys.ts`, `src/sim/command.ts`, `src/sim/clock.ts`, `src/settings.ts`, `src/ui/settingsMenu.ts` (controls), `src/sim/movement.ts` (jump/dive/prone), `src/sim/combat.ts` (stepActor, attacks, connect, applyHit, chains; the rest by grep), `src/sim/hitscan.ts`, `src/sim/guns.ts` (stepHands, fire, reload, pick-up), `src/sim/melee.ts` (swing targets, toss), `src/data/weapons.ts`, `src/data/melee.ts`, `TUNING.move/jump/prone/health/melee/combo/juggle/hit/sweep/flyKick/grab`, `src/sim/difficulty.ts`, GameScene input/clock wiring (`GameScene.ts` update, debug-key binding).
- **Probe**: `tests/audit/cmb/cmb.test.ts` (`AUDIT=1 npx vitest run tests/audit/cmb`, ~5 s, type-clean). Ten probes: latency per verb, a buffering matrix, TTK verb × enemy, knockback per hit kind, verb × target-state matrix, combo reliability, hit fairness, style comparison (S1 wave A, S2 office, S2 lobby, S3 street), dominant tactics (prone, shield, stun-lock), knife LMB context. Raw output: scratchpad `audit\cmb\out2.txt`.
- **Re-run on the current `m14b-audit` head (1ec6731, with M17–M19 and difficulty merged)**. The first pass ran on the older base. Every finding below still reproduces on the new head. Two old results changed: M17's depth band now hits up to |Δz| 0.3, and the armed-grunt jab TTK dropped because of the pop-up disarm.
- **Not covered**: the boss state machines (`bossHit`), co-op moves (M18), rage (M19) beyond its key binding, real browser behaviour (no browser by brief: the browser-trap findings are from code plus known Chrome behaviour), hit-stop/kill-cam buffering only by code (the sim never sees hit-stop). S3 street: no bot style clears it in 150 s, so its rows are inconclusive (passed to ENC).

## 2. What works (protect it)
- **Edges are never lost between frames**: `mergeEdges` keeps a press latched through hit-stop and the kill-cam slow-mo until a tick consumes it (`GameScene.ts` update, `command.ts:51`). Walking is instant on and off (0 decel, the turn flips on tick 1): snappy.
- **The fast verbs feel fast**: light hit on tick 9 (150 ms), knife 117 ms, pistol shot and Q throw on tick 1, grab on tick 1. The punch buffer (0.2 s) and grab buffer (0.25 s) work: light→light/heavy inside the last 6 ticks executes 100%.
- **The combo system is reliable at human timings**: L → uppercut → 3 jabs → heavy launches 80–100% and spikes/punts 75–100% when each press comes ≥0.25 s after the previous one (±2-tick jitter, 20 tries per cell).
- **Focus and the mouse are handled**: Phaser resets keys on blur (`KeyboardPlugin.js:224`), the context menu is off, Space/Ctrl/Shift/Tab are captured (no page scroll).
- **The verb × state matrix has few holes**: punches on stun, juggle, down (finisher) and zombies (weaker, by design) all do what the controls list says. The agent block and the brute flinch read as intended.

## 3. Findings

### CMB-01 · Ctrl dive + W move = Ctrl+W closes the tab; Ctrl + Tab (rage) switches tabs
- Type: bug S1 (lost progress inside the room)
- Where: `src/settings.ts:18` (`dive: 'CTRL'`, `up: 'W'`, `rage: 'TAB'`), `src/input/playerInput.ts:31` (`addCapture`)
- Evidence: Ctrl+W, Ctrl+Tab, Ctrl+T, Ctrl+N and Ctrl+Shift+W are reserved by Chrome. A page can't `preventDefault` them outside fullscreen + Keyboard Lock. `addCapture('CTRL')` can't stop them. The controls ask for exactly these chords: "Ctrl dive, WASD crawls on the belly" (W = crawl away), Shift = split aim, Tab = rage. Nothing in `src/` listens to `beforeunload` (grep). Not run in a browser (no browser by brief): likely.
- Player impact: dive and crawl up-screen, and the game is gone. Rage while still holding Ctrl jumps to another tab.
- Proposal: make C the default dive key and keep Ctrl only as an opt-in binding with a warning. Add a `beforeunload` confirm while a stage runs (Chrome then asks "Leave site?" on Ctrl+W). Optionally use `navigator.keyboard.lock()` in fullscreen.
- Test: a unit test that the default bindings contain no Ctrl and that no default key pairs with a modifier into a reserved Chrome chord. Manual: Ctrl+W in a stage shows the leave dialog.
- Effort S · Impact ★★★ · Confidence likely
- Risk: muscle memory from the show/earlier builds. UXS (settings), LVL (stage 1 caption "Ctrl into him").

### CMB-02 · Debug keys are live in release builds (F2 slow-mo, F3 pause, L free guns, Z mass raise…)
- Type: bug S2 / balance
- Where: `src/scenes/GameScene.ts:257` (`bindDebugKeys` is called unconditionally; only F6 is behind `import.meta.env.DEV`), `src/input/debugKeys.ts:25-44`
- Evidence: from the code. F2 = 0.25× time (a cheat that beats every fight), F3/F4 = freeze/step, L = a gun at your feet any time, K = 20 corpses, Z = every corpse rises as a zombie, 1/2/3/P/V/M change palette/post/effects/mute. Z and V sit next to C (the alt dive key) and X: accidental presses.
- Player impact: one stray Z in a gore room raises a horde. Anyone who reads the README can trivialise the game. Rebinding an action onto one of these keys fires both (see CMB-17).
- Proposal: bind them only when `import.meta.env.DEV` or `?debug=1`. Keep F1 in the overlay only.
- Test: build check: with DEV false, `bindDebugKeys` registers nothing (or a stub world receives no `raiseAll` on Z).
- Effort S · Impact ★★★ · Confidence confirmed (code)
- Risk: playtesters lose the keys: give them `?debug=1`. STB/UXS overlap.

### CMB-03 · Guns, and headshots specifically, dominate every fight on their own
- Type: balance / decision
- Where: `src/data/weapons.ts` (every gun `damageHead: 4` = a grunt's 4 hp), `TUNING.health.healPerKill`, `combat.ts:950`
- Evidence (probe "style comparison", pistol + 1 spare mag, scavenging, current head):

  | fight | brawler hits taken / deaths / s | gun-head | gun-body |
  |---|---|---|---|
  | S2 lobby | 35 / 10 / 18.3 | **0 / 0 / 7.8** | 7 / 2 / 7.6 |
  | S2 office | 21 / 5 / 37.8 | **0 / 0 / 24.2** | 4 / 0 / 26.9 |
  | S1 wave A, 0.35 s reaction | 12–15 / 3–4 | 3 (seed 2) | 3–6 |

  TTK (probe): pistol to the head kills a grunt on the first tick from 3 H. The best fist line (L→H) needs 0.63 s at contact, the knife 0.12 s at contact. Head aim versus body aim is the whole gap: 1 bullet per kill keeps the 16 rounds going, while 2 body shots with a 0.3 s flinch in between let grunts close and the ammo run out.
- Player impact: as soon as there's a gun, the right play is to stand back and click heads. Fists, combos and fatalities become optional flavour. It's the user's "headshot farming", and it happens without the trickle spawns too.
- Proposal (user decides, it touches the 2026-10-26 "1 head / 2 body" decision): the cheapest lever is **heal on kill for melee kills only** (guns kill without healing), plus an **aim-settle**: a shot within 0.12 s of a cursor jump > 120 px gets ×3 spread (invented). Alternative: head = 3 damage at > 3 H (still a kill after any punch or a body shot).
- Test: rerun the style probe. Target: gun-head no better than brawler +50% on hits taken in S2 lobby/office at 0.25 s reaction.
- Effort S–M · Impact ★★★ · Confidence confirmed
- Risk: ENC's difficulty curve. The spawn-variety branch changes the inputs, so rerun after it lands.

### CMB-04 · The shotgun one-shots everything, incl. the 12-hp agent and the riot mini-boss
- Type: balance
- Where: `weapons.ts` shotgun (6 pellets × `damageBody: 2`), `combat.ts` `agentDamage`
- Evidence: TTK probe at 2 H: grunt, agent, riot, bodyguard and zombie all die in 0.02 s (one shot, 2–5 pellet hits). The agent is meant to take "three head shots".
- Player impact: any shotgun deletes the stage-4 elite and the stage-2 mini-boss.
- Proposal: pellet damage 1 (a grunt still dies to ≥4 pellets up close), or cap one shot's damage on `agent`/`riot` at 4.
- Test: TTK probe, agent ≥ 2 shotgun shots at 2 H.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: the point-blank decap rule. ENC (stage 4).

### CMB-05 · The bodyguard (an elite, "2 hits") dies to a single jab
- Type: bug S2
- Where: `src/sim/combat.ts:459` (`variant === 'bodyguard' ? (part === 'head' || base >= 99 ? o.hp : 1)`)
- Evidence: punches hit at face height, so `circleHits` reports `head`, which counts as an instant kill. TTK probe: a light kills a bodyguard in 0.15 s (1 hit), faster than a plain grunt (0.98 s, 3 hits). A bat (body part) needs 2 hits / 2.0 s.
- Player impact: the "tough" guards are the weakest thing in the room for fists.
- Proposal: apply the head rule only to `bullet`, `gun`, `knife` (aimed or thrown hits). Punches deal 1.
- Test: TTK probe, bodyguard with fists ≥ 2 hits.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-06 · Endless jab stun-lock: nothing survives 0.4 s jabs, the riot mini-boss included
- Type: balance / exploit
- Where: `TUNING.hit.stun` 0.7 s vs the light cycle (4+3+5)/30 = 0.4 s, `combat.ts:549`
- Evidence: probe "dominant tactics": a light every 0.4 s on a 40-hp grunt or riot means 0 hits back in 10 s, 8 free ticks in total, dead. The riot (8 hp) dies to fists in 1.82 s with no risk, so "the steal is the way in" is skipped. Difficulty's `bossHp` scaling (×1.75/×3) doesn't help: it's locked.
- Player impact: one rhythm beats every non-agent melee enemy and mini-boss.
- Proposal: stun shrinks within a chain (0.7 → 0.45 → 0.25 s, invented). The 4th consecutive jab on a riot/tough target is shrugged off (agent-style block).
- Test: probe: a riot under 0.4 s jabs swings back within 2 s.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: breaks the "light×3 kills" grunt line only if the shrink is too aggressive (grunts die on hit 3 anyway). ENC.

### CMB-07 · Lying prone makes you immune to unarmed grunts; prone + blade kills them for free
- Type: balance / exploit
- Where: `src/sim/movement.ts` prone, `combat.ts:86` (`lowSlash` every `LOW_SLASH.every` 0.5 s), grunt punches aim at face height
- Evidence: probe: hero prone vs 3 unarmed AI grunts for 20 s takes **0 hits** (standing: 11 in 15 s against one). Prone with a knife: **3 kills, 0 hits**. A pistol grunt still lands 5 vs 11 standing.
- Player impact: lie down in a crowd and slash. The voluntary prone also bypasses all melee pressure.
- Proposal: grunts stomp a prone or downed hero (a low hit using the finisher geometry, 0.3 s telegraph, invented). Or limit `lowSlash` to knocked-down (`state 'down'`), not voluntary prone.
- Test: probe: prone vs 3 unarmed grunts takes ≥ 1 hit in 5 s. Prone + knife no longer clears them hitless.
- Effort S–M · Impact ★★★ · Confidence confirmed
- Risk: the stage 1 caption teaches prone as a dodge. ENC (AI).

### CMB-08 · Only punches and grab buffer; every other press during a move is dropped
- Type: friction
- Where: `combat.ts:91-95, 121` (queue only while `state 'attack'` and only for punch kinds), `movement.ts` (no queue)
- Evidence (buffer probe, press at −12/−6/−3/−1/0 ticks before ready):

  | during | light | heavy | jump | dive | grab |
  |---|---|---|---|---|---|
  | light | ok ×4 | ok ×4 | DROP | DROP | ok |
  | heavy | ok ×4 | ok ×4 | DROP | DROP | (target out of reach) |
  | knife swing | DROP | DROP | DROP | DROP | n/a |
  | prone get-up (0.28 s) | DROP | DROP | DROP | DROP | DROP |
  | hero flinch (0.25 s) | DROP | DROP | DROP | DROP | DROP |
  | body throw recovery | DROP | DROP | DROP | DROP | DROP |

- Player impact: jump or dive out of a punch fails silently. A knife combo (the stage 3 loadout) needs frame-exact clicks. Inputs after getting hit vanish.
- Proposal: one generic edge buffer per actor (0.15 s, invented) for jump/dive/attack/press/grab/E, replayed on the first tick in `free` + `ground`. Add weapon swings to `a.queued`.
- Test: the buffer probe, all cells "ok" within −6 ticks.
- Effort M · Impact ★★★ · Confidence confirmed
- Risk: buffered dodges in hit-stun can feel like a cancel. STB (state machine).

### CMB-09 · No jump buffer and no coyote time
- Type: friction
- Where: `movement.ts` `case 'air'` ignores `cmd.jump`. The ledge fall (`ground` → `air`, ~line 88) gives no grace.
- Evidence: probe: jump pressed 1, 2, 4 or 6 ticks before landing gets DROPPED every time. By code, a jump 1 tick after walking off a table edge is ignored.
- Player impact: bunny-hops and table hops feel sticky. The genre norm is 4–6 frames for both.
- Proposal: `TUNING.jump.buffer 0.1`, `coyote 0.08` (invented).
- Test: probe: jump 6 ticks early → jumps on landing. Jump 4 ticks after leaving a prop → jumps.
- Effort S · Impact ★★ · Confidence confirmed (buffer), likely (coyote)

### CMB-10 · Clicking a semi-auto faster than its rate fires fewer shots
- Type: friction
- Where: `src/sim/guns.ts:127` (a press while `cooldown > 0` is dropped)
- Evidence: pistol (0.15 s = 9 ticks): pressing every 9 ticks gives 14 shots in 2 s, but every 8 ticks only **8** (half the presses land in the cooldown). Every 2 ticks gives 12.
- Player impact: panic-clicking makes the gun stutter. Shots feel eaten.
- Proposal: latch a press in the last 0.1 s of cooldown and fire it on the first ready tick (invented).
- Test: probe: presses every 8 ticks → ≥ 13 shots in 2 s.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-11 · Ctrl just before landing is a flying kick, not a dive
- Type: friction (overloaded key)
- Where: `movement.ts` `case 'air'` (`cmd.dive` → kick at any height)
- Evidence: buffer probe: "dive" during the jump registers at every offset up to the landing tick, and each one is the air kick (lunge 4.2 H/s, committed until it lands).
- Player impact: "land and drop prone" lunges you forward into the enemy instead.
- Proposal: a kick only while ≥ 0.3 H above the ground. Lower, buffer the dive for the landing (with CMB-08).
- Test: probe: dive 3 ticks before landing → `prone` after landing, no kick.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-12 · A whiffed punch near a corpse becomes a planted 0-damage finisher
- Type: bug S2 (overloaded verb)
- Where: `combat.ts:304` (finisher when nobody stands in reach and `downedInReach`), `combat.ts:334` `isDowned` counts settled corpses
- Evidence: probe: LMB while walking at a grunt 0.95 H away with a corpse at the feet throws `finisher` and moves **0.00 H in 30 ticks** (finishers are planted, 17/30 s). Matrix: finisher on a corpse does 0 damage.
- Player impact: in stage 2–3 rooms full of bodies, punches that should step in root you for over half a second.
- Proposal: only living downed bodies (and corpses held as a shield) trigger the finisher. Optional: on a corpse only when the cursor aims below the hip.
- Test: probe: same setup → `light`, hero keeps walking.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-13 · Knife LMB at a downed or rising enemy throws the knife away
- Type: bug S2 (overloaded verb)
- Where: `src/sim/melee.ts:106` (knife with no *standing* swing target → `toss`), `swingTargets` excludes `down`/`getUp`
- Evidence: probe "knife LMB context": a target down at 0.45 H, getting up, or only a corpse → knife **THROWN**, no hit. Just out of reach (0.75 H) → thrown (it hits).
- Player impact: stage 3 starts with two knives. Finishing a downed enemy loses the weapon over his head.
- Proposal: with a downed body in reach, LMB is a downward stab (the weapon finisher, CMB-14). Toss only when the nearest enemy along the facing is beyond reach and within the throw line.
- Test: probe: down/getUp → knife still in hand, hit on the down target.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-14 · Melee weapons can't touch a downed enemy (no weapon finisher); uppercut aim at a body whiffs too
- Type: balance / hole
- Where: `melee.ts:116`, `combat.ts:304` (`kind !== 'uppercut'`)
- Evidence: verb × state matrix, "down" row: LMB/RMB fists → finisher. **Knife, sweep, uppercut → nothing.** TTK: bat/sign on 2-hit targets (agent, riot, zombie) = 2.0 s, because the knockdown → 0.8 s lie → 0.4 s invulnerable get-up must pass before hit 2.
- Player impact: armed, you stand and wait for the enemy you just floored.
- Proposal: a swing at a downed body = weapon finisher (swing damage, planted, invented). Treat an uppercut at a downed body as a heavy finisher.
- Test: matrix "down" row: knife/bat deal damage.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-15 · Get-up i-frames silently eat bullets
- Type: bug S3 / readability
- Where: `hitscan.ts:164` (rays don't skip `getUp`), `combat.ts` `applyHit` returns early on `getUp` without an event
- Evidence: probe: 3 pistol shots at a grunt getting up give 0 `hit` events, ammo spent, hp unchanged, no `block`. The ray still stops on him.
- Player impact: shots vanish with no spark or sound. It reads as a miss or a bug.
- Proposal: emit `block` (how: 'iframe') for the spark/thud, or let rays pass through `getUp` bodies.
- Test: probe: shot at a rising grunt → `block` event (or a hit on the target behind him).
- Effort S · Impact ★ · Confidence confirmed

### CMB-16 · The punch buffer is one slot, last press wins: quick inputs overwrite the uppercut
- Type: friction
- Where: `combat.ts:121` (`a.queued = …` overwrites)
- Evidence: combo probe: L, uppercut and the first jab all pressed inside the jab's 0.4 s give a **0% launch** (gaps 0.15/0.1, 0.25/0.1). From 0.25 s/0.2 s it's 80–100%.
- Player impact: an eager player gets a jab where he asked for the launcher.
- Proposal: inside one move, the first press of a *different* kind wins (or a 2-deep queue).
- Test: combo probe, gap 0.25/0.1 → launch ≥ 80%.
- Effort S · Impact ★★ · Confidence confirmed

### CMB-17 · Rebinding: no duplicate check, a hidden second dive key, pause-menu changes only apply after a restart, captions hard-code keys
- Type: friction / bug S3
- Where: `src/ui/settingsMenu.ts:53-55` (any key accepted, no clash check), `playerInput.ts` (C stays a dive key while dive = CTRL), `GameScene.ts:205` (keys are read once in `new PlayerInput`), captions such as `stage1Script.ts:70` ("Ctrl"), `:121` ("E", "G"), `stage2Script.ts:44,54`, `stage2Late.ts:139,182,212,219`, `stage3Script.ts:52,92,254`, `stage3Late.ts:131`
- Evidence: from the code. The HUD prompts follow `SETTINGS.keys` (`hud.ts:192-212`), the script captions don't. Binding grab to C fires grab and dive. Binding to Z/L/K also fires a debug key (CMB-02). Mouse buttons can't be rebound.
- Player impact: a left-handed or AZERTY player rebinds and gets double actions, or nothing until the room restarts, and captions that lie.
- Proposal: refuse or swap duplicates (and reserved/debug keys). Rebuild `PlayerInput` when the pause menu closes. Captions take `{key:use}` placeholders filled from the settings.
- Test: unit: binding a used key swaps. Caption strings contain no bare key letters.
- Effort S–M · Impact ★★ · Confidence likely (live-apply), confirmed (rest)
- Risk: UXS and LVL own the menu and the captions. Coordinate.

### CMB-18 · Melee weapons make the fist system dead weight
- Type: balance
- Where: `src/data/melee.ts` (every weapon damage 4 = one-hit kill on grunts), knife 3+3+5 frames
- Evidence: TTK: knife 0.12 s, bat 0.22 s, sign 0.25 s per grunt vs fists 0.63–2.0 s. The knife beats the jab on startup (117 vs 150 ms) and also kills. Weapons have no durability (grep).
- Player impact: from stage 3 on (two knives at the start) the combo/juggle/fatality verbs never come up.
- Proposal (user's call): weapons keep the one-hit kill but go through a durability count (blunt 6–8 hits, blades stay), or knife recovery 5→9 frames so fists win at tempo. Pair with CMB-03's melee heal.
- Test: style probe in S3 outside/street: the fist and fatality event share > 20% of kills.
- Effort S · Impact ★★ · Confidence opinion (numbers confirmed)

### CMB-19 · Killing heavies barely move the body; a killing jab throws it 1.5 H
- Type: look / feel
- Where: `combat.ts` decap on heavy/uppercut/slash kills (+ `corpse.headlessStand` 0.3 s)
- Evidence: knockback probe, lethal: light 1.53 H, heavy 0.19 H, uppercut 0.19 H, slash 0.19 H. Non-lethal heavy: 1.03 H.
- Player impact: the hardest blow looks the weakest. FAS/VIS to judge.
- Proposal: give the decapitated body the heavy's launch after the 0.3 s stand (or shorten the stand to 0.1 s for heavies).
- Test: knockback probe, heavy lethal ≥ 1.0 H.
- Effort S · Impact ★ · Confidence confirmed (numbers), opinion (fix)

### CMB-20 · The E takedown with empty hands roots you for 1.75 s
- Type: friction
- Where: `src/sim/stealth.ts` `takedownTiming`
- Evidence: latency probe: E → kill hit at tick 90, ready at tick 105 (1.75 s). The controls list says 1.5 s.
- Player impact: in stage 2 rooms with a second guard, the wire is a long helpless window. That's fine if intended, but the doc and the code disagree by 0.25 s of recovery.
- Proposal: keep the 1.5 s kill and cut the recovery to ≤ 0.1 s, or fix the doc.
- Test: latency probe, ready ≤ 96 ticks.
- Effort S · Impact ★ · Confidence confirmed

### CMB-21 · Possible bot-visible stall: S1 wave A, seed 1, gun bot at 0.35 s reaction
- Type: bug S? (for STB to triage)
- Where: `/?wave=A`. Probe `style comparison` row "S1 wave A seed 1 gunHead 0.35"
- Evidence: on the new head only, the run never clears in 240 s, with 395 hits taken / 131 "deaths". My bot revives the hero in place by force, so it may be a probe artefact, but the old head cleared the same seed in 32.8 s. Same for `mixed`.
- Player impact: unknown. Possibly an enemy pinning a player who can't act.
- Proposal: STB reruns it with the real death→checkpoint flow.
- Test: STB's soak on wave A, seed 1.
- Effort S · Impact ? · Confidence opinion

## 4. Baseline metrics
**Latency (60 Hz ticks, tick 1 = the command tick)**

| verb | active / event | ready again |
|---|---|---|
| light | hit 9 (150 ms) | 25 (417 ms) |
| heavy / uppercut | hit 13 (217 ms) | 35 / 37 |
| jump | land 39 (650 ms) | 39 |
| prone → get up | standUp on press, +17 ticks | |
| sweep | hit 6 (100 ms) | prone after |
| flying kick (Ctrl at tick 7) | hit 9 | 29 |
| grab / throw | grab 1, throw +10 | throw ready +14 |
| pistol | shot 1 | cadence 9 ticks |
| reload pistol | end at 37 (0.6 s) | |
| knife / bat / sign LMB / sign RMB | hit 7 / 13 / 15 / 11 | 23 / 35 / 35 / 33 |
| grenade (hold 30 ticks) | lob at 36 | 48 |
| E takedown (wire) | kill at 90 | 105 |

**TTK seconds (hits) — melee at contact, guns at 3 H (shotgun at 2 H)**

| | grunt | zombie | agent | brute | bodyguard | riot |
|---|---|---|---|---|---|---|
| fists L mash | 0.98 (3) | 2.23 | 3.07 | 2.23 | **0.15 (1)** | 1.82 |
| fists L→H | 0.63 (2) | 2.23 | 3.07 | 2.23 | 0.15 | 3.05 |
| knife | 0.12 | 0.52 | 0.92 | 2.12 | 0.12 | 0.52 |
| bat / sign | 0.22 / 0.25 | 2.0 | 2.0 | 3.2 | 2.0 | 2.0 |
| pistol head / body | 0.02 / 0.18 | – / 0.35 | 0.35 / 0.68 | 2.32 | 0.02 / 0.18 | 0.18 / 0.52 |
| smg body | 0.12 | 0.22 | 0.42 | 1.12 | 0.12 | 0.32 |
| shotgun | **0.02** | 0.02 | **0.02** | 0.62 | 0.02 | **0.02** |

**Knockback H** (survive / lethal): light 0 / 1.53 · heavy 1.03 / 0.19 · sweep 0.69 / 1.19 · bullet 0 / 0.84 · smash/body/gun 1.03 / 1.53.

**Other**: prone vs 3 unarmed grunts for 20 s = 0 hits taken. Jab-lock on a 40-hp riot = 0 hits back. Depth band (M17) now hits to |Δz| 0.3. A pistol aimed at the head of a grunt 0.6 H deeper with another grunt 0.15–0.45 H to the side in front hits the front one 3/3 times (screen-space rule, as designed). Combo launch ≥ 80% at ≥ 0.25 s gaps. Style table in CMB-03.

## 5. Top 5
1. CMB-01: Ctrl-dive + W/Tab are browser-reserved chords (Ctrl+W closes the game). Move dive to C and add a `beforeunload` guard.
2. CMB-03: gun headshots dominate on their own (S2 lobby 0 hits vs a brawler's 35). Make heal-on-kill melee-only and add an aim-settle.
3. CMB-02: debug keys (F2 slow-mo, L guns, Z raise) ship to players. Gate them behind DEV/`?debug`.
4. CMB-06 + CMB-07: endless jab stun-lock (the riot never swings back) and prone immunity/knife camping. Shrink the stun in a chain, have grunts stomp prone heroes.
5. CMB-08: only punches buffer (jump/dive/swings/get-up/flinch drop their input). One generic 0.15 s edge buffer, plus a jump buffer and coyote time (CMB-09).

## 6. Questions for the user
- CMB-03: may the "1 head shot kills" rule get a cost (melee-only healing, an aim-settle, or a range falloff), or should guns stay this strong?
- CMB-01: OK to change the default dive key from Ctrl to C (Ctrl stays bindable)?
- CMB-18: should melee weapons wear out, or should fists get a tempo edge, so the combo system matters once you hold a knife?
- CMB-07: should prone stay a full dodge against unarmed grunts (it's how the show uses it), with only the blade slash limited?
