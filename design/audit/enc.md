# Enemies, difficulty & level pacing audit (ENC, lenses ENC + LVL)

Audited on `m14b-audit` at `1ec6731` (M17–M20 and the difficulty setting merged; spawn variety not merged yet). All numbers are at difficulty **Pro** (the game as designed) unless noted.

## 1. Coverage
- **Read fully:** `src/sim/ai.ts`, `waves.ts`, `stage.ts`, `src/data/stages/stage1*.ts`, `stage2*.ts`, `stage3*.ts`, `src/sim/difficulty.ts`, `TUNING.ai` / `waves` / `boss` / `duel` / `stage` / `stealth`. Read in parts: `boss.ts` (choose, ward, dash/grab, volley, bossHit), `cannon.ts`, `combat.ts` (applyHit, the hover/brute branch), `melee.ts` (`pullable`), `guns.ts` (pickUp), `GameScene` (restart / checkpoints), `research/stages.md`. Skimmed: `stealth.ts`, `zombies.ts`, `interrogate.ts`, `arena.ts`, `elevator.ts`, `improbability.ts`.
- **Probes** (all `describe.skipIf(!process.env.AUDIT)`):
  - `tests/audit/enc/harness.ts`: bots (`brawler` = melee only, `gunner` = picks up guns, aims at heads with an aim error proportional to reaction, falls back to melee), `playStage()` (whole stage, a death restarts the room; stage 1 restarts the *beat*), per-room time split (combat / locked / lull / to-exit), arrival tracking, stuck detection, off-screen fire. `assist()` does the few verbs a bot can't (breach grenade, elevator roof + cables, the target's gun, the pin, the sign steal, the stage 1 grenade lob); the tables mark which rooms used one.
  - `tests/audit/enc/curve.test.ts`: stages 1–3 × {brawler, gunner} × reaction {0.1, 0.2, 0.35} s × seeds {1, 2, 3}. ~2 min. Full output: `…\scratchpad\audit\enc\curve.txt`.
  - `tests/audit/enc/probes.test.ts`: 14 focused probes (crash repros, bursts, telegraphs, free windows, boss, cannon, crates, boombox, intro, passive pressure). ~2 s.
- **Not covered:** stage 4 (M14–M16), co-op (2p curve not run), the look of tells (no browser), Hacker/Notch tuning beyond reading the scaler. Bots don't dodge, block, prone or use cover, so absolute death counts are pessimistic for a skilled human; **relative** spikes between rooms are the signal.

## 2. What works (protect it)
- The **token rule** holds for grunts: max 2 melee attackers per player, a 0.45 s swing gap, a 1 s cooldown after a knockdown. A passive player in the riot takes at most 3 hits in any 1 s window (probe ENC-06).
- **Gun grunts never fire from off-screen** (0 of ~5,000 enemy shots across all runs), keep 3–5 H, and hold fire with an ally in line 75 % of the time; friendly fire still happens and reads as chaos (9–105 enemy-on-enemy kills per run).
- **Set-piece hazard tells are generous**: arena walls 0.55 s, the floor crack 1.0 s, the tank shadow 0.9 s, the cannon shadow 0.8 s, sword dive 0.6 s, gun telegraph 0.4 s with a red line.
- **Rooms are short and chain fast**: a competent run of stage 1 is ~2.5 min, stage 3 ~5 min; cards and traversals cost 1–5 s per room (locked time is low everywhere except the camera room's cutscene, ~8 s).
- No AI got stuck for real: the "stuck" hits were ring-waiters drifting in depth; no enemy idled with nothing to do.

## 3. Findings

### ENC-01 · Hitting the vending brute (or the jetpack) mid-swing crashes the sim
- Type: bug S1 crash
- Where: `src/sim/combat.ts` applyHit: line ~488 clears `o.attack` for anyone in `attack`, then the hover/vending branch (~525) keeps `state === 'attack'`; next tick `stepAttack` reads `a.attack!.t` → TypeError. `/?stage=3&room=street` (the brute), camera room (jetpack).
- Evidence: the curve bot crashed in the street at 157 s and 209 s (`TypeError: reading 't'` at `stepAttack`); probe `ENC-01` reproduces it deterministically (punch the brute during his swing).
- Player impact: the game freezes in stage 3's street fight, the first time a player trades blows with the brute.
- Proposal: in that branch, `enter(o, 'stun')` (or `'free'`) whenever `o.attack` was cleared; never leave `state: 'attack'` without an attack.
- Test: `ENC-01` flips (no throw); a 600-tick brute brawl runs clean.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: none; tell STB (it's their lens, found by my bots).

### ENC-02 · A blade stuck in an actor that leaves the room crashes `pullable()`
- Type: bug S1 crash
- Where: `src/sim/melee.ts:296` `alive(world.actorById(it.stuckTo)!)`; scripts splice live actors out (stage 3 outside guard walking off, the jetpack mini-boss leaving, the target fleeing, the void).
- Evidence: curve bot crashed in the camera room at 18 s (`reading 'state'` in `pullable` ← `pickUp`); probe `ENC-02` (knife stuck in a grunt, grunt removed, step) reproduces it.
- Player impact: throw a knife into someone a script then removes, walk near it: freeze.
- Proposal: treat a missing `stuckTo` actor as "drop the blade to the floor" (`it.state = 'air'`, clear `stuckTo`) in `stepItems`, and guard the lookup.
- Test: `ENC-02` flips.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: STB lens.

### ENC-03 · No mercy window: one burst of automatic fire takes all three lives
- Type: balance (the root of most spikes below)
- Where: `src/sim/combat.ts` applyHit (`o.kind === 'hero' ? 1` per hit, no post-hit invulnerability); `TUNING.ai.ranged.burst` 0.35 s; the jetpack MG in `stage3Script.ts` `burst`.
- Evidence (probe `ENC-13b`, 10 seeds each): a grunt SMG burst at 3 H: **4.0 hits, 10/10 bursts kill a full-health hero**. The jetpack MG: 17 hits per 1.4 s burst (min gap 0.08 s). Prone: 0–0.7 hits. The difficulty setting only scales counts and boss HP, so **Noob dies to one SMG burst exactly like Pro**.
- Player impact: health is "3 lives" but against SMGs it is one: the 0.4 s telegraph is the only defence, and missing it is instant death. This is why the curve is bimodal (0 deaths or many) and why the corridor, tables, camera and street spike.
- Proposal: a hero mercy window: after a hit, further hits within `TUNING.health.mercy` = 0.5 s (invented) do nothing (flash the body). Optional: Noob 0.8 s, Notch 0.25 s.
- Test: `ENC-13b`: one SMG burst takes ≤ 1 life; the curve's deaths in corridor/tables/camera fall by half at r = 0.2.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: kill-cam and last-stand scripts set `hp = 1` and rely on one hit; CMB (bullet economy), co-op downs.

### ENC-04 · The difficulty curve is spiky and not rising: the stage 2 corridor is the hardest room in the game
- Type: balance
- Where: `src/data/stages/stage2Script.ts` `corridor` (shotguns → riot squad → boss fling → 8 zombies → stragglers), `stage3Script.ts` `tables` / `camera` / `street`, `stage1.ts` wave A.
- Evidence: curve table in §4 (deaths per room, mean of 3 seeds). The corridor costs 1.7–9.7 deaths in **all six** bot configs and was failed (≥ 5 deaths) in 13 of 18 runs; nothing in stage 3 is as consistent. Flat stretches: stage 2 swords → lobby → final and stage 3 vending → console → lift cost ~0 for a gunner. Stage 1 wave A has a cliff between reaction 0.2 s (0 deaths) and 0.35 s (2.7 deaths, 1 run failed): it is the first fight of the game.
- Player impact: a new player hits a wall in the first wave if slow, then a much bigger one halfway through stage 2, then stage 3 feels easier after its first rooms.
- Proposal: (1) fix ENC-03 and ENC-09 first (they cause most of it), then (2) split the corridor (ENC-21's mid-room checkpoint after the boss cameo), (3) wave A: start with maxAlive 2 for the first 6 grunts (invented), (4) late stage 2 / 3 rooms: add one pressure element each (e.g. lobby: shotgun pair together; console: an SMG pair).
- Test: rerun `curve.test.ts`: no room above 2× the median deaths of its stage at r = 0.2; stage averages rise 1 → 2 → 3.
- Effort M · Impact ★★★ · Confidence confirmed (bots), opinion (targets)
- Risk: spawn-variety branch changes the same waves; rerun after it lands.

### ENC-05 · Stage 1 has no checkpoint: any death restarts the whole stage from the intro
- Type: friction
- Where: `src/scenes/GameScene.ts:420` (stage 1 always runs `stage1From(data.beat ?? 'intro')`; `restart()` passes `resume: true`, which only room-graph stages read); no `roomEnter` in stage 1.
- Evidence: code read; the curve shows the boss and wave B are where stage 1 deaths happen (gunner: boss 0.3–2.0 deaths, wave B up to 1.7), i.e. ~2 min into the stage.
- Player impact: dying to the boss means replaying the title card, getting punched, the intro fight, 18 grunts and the grenade beat again.
- Proposal: save the beat as the checkpoint (`STAGE1_BEATS`; the `?beat=` restore already exists: corpses, cannon, SMG); restart at `boss` or `waveB`.
- Test: a shell test: die in wave B → the restart runs `stage1From('waveB')`.
- Effort S · Impact ★★★ · Confidence confirmed (code)
- Risk: the beat restore gives 8 generic corpses; fine.

### ENC-06 · Baseline for spawn variety: door and edge waves are single-file headshot galleries
- Type: balance (baseline, not a duplicate: the other branch implements the fix)
- Where: `WaveDirector.step` (`maxAlive`, one entry per timer), wave data in all stage files; probe `ENC-09`.
- Evidence (gunner r = 0.2, seed 1, `arrivalSummary`):

  | room | spawned | groups (max) | singles | entry points | killed < 1.5 s after entering | killed near the edge | head kills |
  |---|---|---|---|---|---|---|---|
  | s1 wave B | 9 | 8 (2) | 7 | 6 | 9/9 | 9/9 | 9/9 |
  | s2 office | 16 | 16 (1) | 16 | 2 | 16/16 | 15/16 | 16/16 |
  | s2 swords | 10 | 10 (1) | 10 | 2 | 4/8 | 4/8 | 8/8 |
  | s2 lobby | 8 | 5 (2) | 2 | 2 | 5/7 | 7/7 | 6/7 |
  | s3 tables | 8 | 7 (2) | 6 | 1 | 5/6 | 2/6 | 6/6 |
  | s3 console | 10 | 10 (1) | 10 | 2 | 10/10 | 10/10 | 10/10 |
  | s1 riot (melee) | 18 | 15 (2) | 12 | 6 | 0/17 | 0/17 | 10/17 |

  The free window (probe `ENC-09`, hero 2 H away): a pistol grunt is through a door in 0.25 s, then stands **in the doorway** (x 3.06, his keep range puts him there) for 0.8 s `settle` + 0.4 s telegraph = **1.2 s** before his first shot. Edge entries: 1.2 s walking in + the same 1.2 s. The office spends 14 of its 28 s in "lull" (nobody alive, waiting for the next single grunt).
- Player impact: as the user said: aim at the door, click, repeat.
- Proposal: for the spawn-variety branch, acceptance metrics from this table: in door rooms, ≤ 50 % of kills within 1.5 s of entering, ≥ 40 % of arrivals in groups of 2+, lull ≤ 20 % of room time. Also shorten `ranged.settle` to 0.3 s for door entries only (invented), so a grunt shoots soon after stepping in or steps aside first.
- Test: rerun `curve.test.ts` and compare the ARRIVALS lines.
- Effort S (metrics) · Impact ★★★ · Confidence confirmed
- Risk: coordinate with the spawn-variety agent; see ENC-07.

### ENC-07 · Where the new spawn system should and shouldn't apply (and the couplings it can break)
- Type: tech / decision
- Where: wave scripts in `src/data/stages/*`, `swords` in `stage2Late.ts:167`.
- Evidence: per room, from the scripts and the arrival table:
  - **Apply** (generic trickles): s1 wave A, wave B; s2 office, swords, lobby, crates (second phase), corridor shotguns + stragglers; s3 tables, camera axe/baton waves, street ambush, vending grunts, console.
  - **Don't apply** (placement is the design): s2 wall / corner / roofA / roofB and s3 outside / vent (unaware guards); the elevator (drop-ins through the hole, the door ambush in a 1.9 H cab); the riot squad (already enters together behind his leader: group of 9); the desert drop-ins (already a group of 5–6); bodyguards in s2 final and s3 lift; the crate room's dug-in three; scripted flyers in the camera room.
  - **Couplings that break silently:** the sword room's dazed grunt is "the 5th spawn" (`world.director?.spawned !== 5`); the lobby's hold-up needs the **last** entry unarmed and alone; wave B's first entry is the cannoneer (`role`); the office shotgun drops after 5 kills. Groups, flanks and difficulty copies all change spawn order/count.
- Player impact: none yet; prevents regressions.
- Proposal: tag these entries in the data (`opts.keep: true` / a `last` flag) instead of relying on the spawn index; the director never groups or reorders tagged entries.
- Test: stage2 tests + a check that the 5th-spawn daze and the lobby hold-up still fire at every difficulty with variety on.
- Effort S · Impact ★★ · Confidence confirmed (code)
- Risk: touches the other branch's files; hand it over as a checklist.

### ENC-08 · On Noob the lobby's hold-up never happens
- Type: bug S2
- Where: `src/sim/waves.ts` `scaled()`; `lobbyWaves()` in `stage2Late.ts`.
- Evidence: Noob keeps entry `i` when `round((i+1)·0.5) − round(i·0.5) = 1`; for 8 plain entries that is i = 0, 2, 4, 6, so the 8th (the unarmed one) is dropped. No unarmed last enemy → no hold-up, the interrogation hint never shows.
- Player impact: Noob players never see the interrogation (stage 2's teaching beat for E-on-surrendered).
- Proposal: covered by ENC-07's tag: tagged entries always spawn once. Or give the lobby's last entry `role: 'holdup'` (roles are kept today).
- Test: lobby at Noob ends with a `holdUp` event.
- Effort S · Impact ★★ · Confidence confirmed (arithmetic on the code)
- Risk: none.

### ENC-09 · Zombies and charging squads skip the token cap: up to 9 attackers at once
- Type: balance
- Where: `src/sim/ai.ts:105` `uncapped` (zombies, `ai.charge`) → `assignTokens` hands them tokens past `maxAttackers`.
- Evidence: max simultaneous token holders in stage 2 runs = **9** (corridor: 8 raised zombies + a charging squad member) vs the rule's 2; stage 3 = 5 (the desert's 5 raised). The corridor is the game's deadliest room (ENC-04).
- Player impact: right after the boss's fling (which costs a life, ENC-17) eight zombies converge with no queue.
- Proposal: zombies get a separate, higher cap (`TUNING.zombie.maxAttackers` = 4, invented) and keep the swing gap; the squad charge keeps `uncapped` only while ≤ 3 alive.
- Test: corridor probe: token holders ≤ 4 + 2; corridor deaths at r = 0.2 halve.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: zombies were meant to feel like a horde (enemy-zombie note): keep them slow, which they are.

### ENC-10 · The stage 1 boss melts once you have the SMG; his ward barely matters
- Type: balance / boss cheese
- Where: `src/sim/boss.ts` `bossHit` (first wound → `startPhase2` → sweep → summon → volley), `stepVolley` (no ward check, he stands still behind the cannon), `stepWard` (only rises with no `act`).
- Evidence (probe `ENC-10`, 5 seeds × 2 reactions): typical **SMG pickup → dead in 2.4–5.7 s**, the ward raised 0–1 times; outliers either stall (2 of 10 runs never landed a wound in 120 s while taking 55+ hits) or take 28 s. The research beat is ~37 s with two phases. The two killing hits come during the volley, where he can't ward.
- Player impact: the stage's climax is over before the cannon fires twice; or (when caught in dash-grabs) it's a wall. Neither reads as a two-phase fight.
- Proposal: (1) he can ward during the volley (hovering behind the cannon, shield toward the shooter) and the cannon gives cover to his head; (2) after a wound, `untouchable` for 2 s (invented) instead of "until the cannon lands"; (3) 4 head hits at Pro (invented).
- Test: `ENC-10` median fight length 20–40 s with ≥ 3 wards, no 120 s stalls at r = 0.35.
- Effort M · Impact ★★ · Confidence confirmed
- Risk: CMB (gun TTK).

### ENC-11 · Cannon safe strip: stand at the front edge and no ball can hit you
- Type: balance / cheese
- Where: `cannon.ts` (`DEPTH_BAND` 0.25), `TUNING.boss.cannon.aimBand` 0.8; boss volleys and wave B's cannoneer.
- Evidence (probe `ENC-11`): cannon at z 9.6: balls cover z 8.55–10.65, the front 0.55 H is never reached; measured: hero at z 8.05: **0 hits of 12 balls**; at z 9.6: 12/12. Cannon at z 10.2 leaves 1.15 H safe.
- Player impact: once found, the cannon (the stage's signature hazard, and wave B's "they took the cannon") stops mattering.
- Proposal: `aimBand` = the whole room depth for the boss, or move the cannon's z toward the target before each volley; keep wave B's narrower so it stays a choice.
- Test: `ENC-11`: no z band ≥ 0.3 H unreachable during a boss volley.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: dodging becomes jump/prone only, which is the episode's lesson.

### ENC-12 · Melee tells are under 0.3 s; the 0.5 s wind-up exists but isn't drawn
- Type: look / fairness
- Where: `ai.ts` `meleeStep` (`ai.ready` accumulates `AI.windUp` 0.5 s, nothing renders it), `TUNING.melee.light.startup` 4/30 s, heavy 6/30 s; knife throws (3/30 s startup from 1.8–4.5 H); boss dash wind-up 0.25 s.
- Evidence: probe `ENC-08` table: SHORT light punch 0.13 s, heavy (knockdown) 0.20 s, knife throw 0.10 s, boss dash 0.25 s → grab → 6 slams → a life. Gun tells are 0.4 s with a red line by comparison.
- Player impact: hits from the crowd feel random; the knockdown heavy can't be read at all.
- Proposal: draw the wind-up: from `ready ≥ windUp − 0.25 s` raise the fist / lean back (`pose.telegraph`, as guns do); a 0.15 s cock-back pose for knife throws; boss dash wind-up 0.4 s.
- Test: `ENC-08`: every enemy attack ≥ 0.3 s of visible tell (headless: `pose.telegraph > 0` that long before the active frame).
- Effort M · Impact ★★ · Confidence confirmed (constants), opinion (feel)
- Risk: VIS draws it; FAS may want a sound.

### ENC-13 · The jetpack caption teaches the wrong answer; prone, the real one, is never taught
- Type: friction / teaching
- Where: `stage3Script.ts` camera caption ("Get behind the crate, or grab one of them as a shield"); no caption anywhere mentions prone as a dodge.
- Evidence (probe `ENC-13b`): standing behind the camera-room crate (x 1.75, z 10.25): **4.1 hits per burst, 10/10 lethal** (he fires down from 1.3 H over the 0.72 H crate); prone in the open: **0 hits** (10/10). Curve: the camera room is stage 3's spike (gunner r = 0.1: 6.7 deaths, failed every seed).
- Player impact: players do what the game says and die three times in a row.
- Proposal: caption: "Down! (Ctrl) Lie flat under his fire, or hold one of them as a shield." Teach prone once earlier too (wave B's cannon caption: "Jump the balls, or drop flat (Ctrl)").
- Test: text change + `ENC-13b` (unchanged numbers; the teaching now matches them).
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### ENC-14 · The crate room's "dug-in" guards walk out from behind the crate at once
- Type: bug S2
- Where: `stage2Late.ts` `crates`: `g.ai!.keep = Math.abs(g.pos.x + 3)` gives 5.45 / 5.85 / 6.2, outside `R.keep` [3, 5], so `positionFor` re-rolls it on the first tick; `waitZ` is overwritten by drift too.
- Evidence (probe `ENC-14`): keep 5.45 / 6.20 → 3.16 / 4.86 at once; x 2.45 / 3.20 → 1.55 / 2.00 in 4 s (the crate spans x 1.2–2.0): they leave cover toward the hero.
- Player impact: the room built around "peek, retreat, or flank through the vent" is a plain shoot-out; the vent flank has no reason to exist.
- Proposal: a `hold` spot for the AI (`ai.hold = {x, z}` until the player is within 1.5 H or behind them); or clamp keep into the allowed range and add a room flag so positionFor keeps them there.
- Test: `ENC-14`: they stay within 0.3 H of their spots until flanked.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### ENC-15 · The boss's cannon lands on the ending's boombox in 35 % of runs
- Type: bug S2 (soft stall)
- Where: `stage1Script.ts` (`dropBoombox` at the intro NPC's spot 1.2, 9.5), `boss.ts` summon (cannon `offset` 1.0 from where he hovers); `ending` waits 60 s (`ENDING.waitPickup`).
- Evidence (probe `ENC-15`, 20 seeds): the cannon's footprint covers the boombox in **7/20**; the curve's ending shows ~20 s of lull per run and 60 s when the box is unreachable (the bot can't reach it; a human can't see it under the barrel).
- Player impact: "Go and get the music": it's nowhere; a minute of nothing, then the card.
- Proposal: in `ending`, if a solid prop overlaps the boombox, move it to the nearest free floor spot (or the boss's sweep pushes it clear); show a marker over it.
- Test: `ENC-15` reports 0/20 unreachable at the ending.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### ENC-16 · The sword duel only counts gun or thrown-knife hits; a melee player is stuck
- Type: friction / soft lock
- Where: `stage3Late.ts` `vending`: hits count only for kinds `bullet | gun | knife`; caption "hit him three times".
- Evidence: the brawler (no pickups) sat in the vending room for 93–281 s of "lull" per run (all three reactions) and failed at r = 0.2 and 0.35; the gunner clears it in 14–22 s.
- Player impact: a player who swings a sword/axe at the diving boss sees hits land and nothing happen; if the SMG is spent, the loop never ends.
- Proposal: count melee hits (slash/smash/stab) too, or say "shoot him" and re-drop a loaded gun if the player has none for 10 s (invented).
- Test: a brawler clears the duel in < 60 s.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### ENC-17 · Scripted hits cost lives: the tutorial punch and the boss flings
- Type: balance / onboarding
- Where: `stage1Script.ts` `intro` (heavy cross + sparring jabs), `stage2Script.ts` `bossInterruption`, `stage3Late.ts` desert blast (`hitActor 'fling'`).
- Evidence (probes `ENC-05`, `ENC-12`): every seed takes 2 hits in the intro and starts wave A on **2/3 lives**; the corridor fling takes 3 → 2 right before the 8-zombie raise (ENC-09).
- Player impact: the first lesson is "you got hurt for walking up"; the corridor's worst moment starts a life down through no fault of the player.
- Proposal: scripted teaching/cutscene hits do no damage (`hitActor(..., { scripted: true })` → damage 0, knockdown only); the intro sparring jabs may still cost one.
- Test: `ENC-05` hp at the first wave = 3; `ENC-12` hp unchanged.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none.

### ENC-18 · Dead time: the trickle, the grenade beat and the ending
- Type: friction / pacing
- Where: `WaveDirector` gaps, `GRENADE_BEAT.timeout` 25 s, `ENDING.waitPickup` 60 s.
- Evidence (beat sheet §4): "lull" (nothing alive, nothing to do) is 14 of 28 s in the office, 12 s in the corridor, 7–9 s in elevator/vending/console, 12 s in the desert (walls + script pauses). A player who doesn't understand the grenade beat waits 25 s; the ending can wait 60 s (ENC-15).
- Player impact: the action stops between single enemies; the stage's tempo drops exactly where the user feels "one at a time".
- Proposal: the spawn-variety work removes most trickle lull; also cap any between-spawn lull at 1.5 s (invented: spawn the next entry early when nothing is alive), grenade beat timeout 10 s with the caption repeated at 5 s.
- Test: beat sheet: lull ≤ 20 % of each wave room.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: overlaps the spawn-variety branch; measure after it lands.

### ENC-19 · Long rooms with one checkpoint: corridor and desert
- Type: friction
- Where: `stage.ts` (checkpoint = room entry only), corridor (6 phases), desert (squad → walls → drops → zombie mini-boss → boss raise → blast).
- Evidence: corridor takes 114–300 s per attempt for the gunner with 1.7–9.7 deaths; each death replays the shotguns, the squad and the boss cameo. Desert 40–57 s, 0–1.7 deaths.
- Player impact: the hardest room is also the longest to retry.
- Proposal: a mid-room checkpoint API (`s.checkpoint('afterCameo')` saving the script position as an entry) used once in the corridor (after the boss leaves) and once in the desert (after the walls land).
- Test: die after the corridor cameo → restart at the zombie phase.
- Effort M · Impact ★★ · Confidence likely
- Risk: STB (restart-state diffs).

### ENC-20 · Teaching map: core verbs never taught
- Type: friction / onboarding
- Where: captions in `stage1Script.ts`, `stage2*.ts`, `stage3*.ts` (full list grepped).

  | verb | taught where | |
  |---|---|---|
  | move, light/heavy punch | intro (implicit: "go and have a word", "punch him") | no key named |
  | get up, low sweep, finisher | intro caption | ok |
  | grab & throw (F) | never in stage 1 (research: wave A teaches it); first F mention is stage 2 corridor (steal) | **gap** |
  | prone / dive dodge (Ctrl) | never | **gap** (ENC-13) |
  | jump (Space) | wave B cannon, s3 tables | ok |
  | grenade pick/cook/lob | s1 grenade beat | ok |
  | pick up guns (E) / auto pickup | "An SMG." (no key) | weak |
  | reload (R), Q throw, fire mode (B) | never (B: stage 4) | gap |
  | empty-gun throw | s3 tables | late (needed from s1 wave B) |
  | split aim (Shift) | wave B cannon caption, lobby | ok |
  | uppercut, juggle, spike, wall bounce, head punt (M10b) | never | **gap** |
  | over-the-shoulder shot (RMB) | last stand says "him behind you" only | gap |
  | flying kick | never | gap |
  | takedown / wire, drop kill | s2 wall; s3 vent (implicit) | ok |
  | steal, catch, pin, human shield, interrogation, ladder/lift/hatch/vent E | each at its room | ok |
  | rage (Tab, M19), co-op moves (M18) | not in stage scripts (check the M18/M19 hints) | — |

  Also: captions hard-code keys ("E", "G", "F", "Ctrl", "Shift", "LMB") although every key is rebindable.
- Player impact: the combo system (M10b) and prone are invisible to anyone who doesn't read the controls page.
- Proposal: three captions: wave A after 4 kills "F grabs him; F again throws him onto the pile"; wave A after 10 kills "RMB with the cursor high launches him; LMB keeps him up"; wave B "Ctrl: drop flat under fire". Format keys from the bindings.
- Test: a teaching-map test: each verb in the controls list maps to a caption or "never" (fails on new "never"s).
- Effort S · Impact ★★ · Confidence confirmed (grep)
- Risk: UXS (caption system, key names).

### ENC-21 · Where to go: nothing reacts to `exitOpen`, stage 3 has no tracker
- Type: friction
- Where: `exitOpen` is emitted (`stage.ts:253`) with no listener anywhere in `src/`; `tracker` set only in stage 2 rooms.
- Evidence: rooms whose exit opens with only a door swinging (no caption, no sound cue in code): s2 office (end), s3 vent room, tables, vending, console; s3 street says "He went that way." with no direction; the crate room door is mostly blocked by the crate (z 9.05–9.4 of the door's 8.55–9.4).
- Player impact: the room goes quiet and the player looks around; worst in stage 3 where the tracker is gone.
- Proposal: on `exitOpen`, a pulsing arrow at the exit zone's screen edge and a short sting (FAS); the tracker for stage 3 pointing at the target.
- Test: every exit opening produces a HUD cue event (headless: a listener count > 0).
- Effort S · Impact ★★ · Confidence confirmed (code)
- Risk: UXS / VIS.

### ENC-22 · The difficulty setting scales numbers, not the causes of death
- Type: decision
- Where: `src/sim/difficulty.ts` (enemies 0.5–2.5×, boss HP 0.5–3×, maxAlive × √m).
- Evidence: the deaths in §4 come from bursts (ENC-03), the zombie pile-on (ENC-09) and unreadable melee (ENC-12); none of those change with the setting. Noob still dies to one SMG burst (`ENC-13b`); Notch at 2.5× enemies with maxAlive ×1.6 mostly makes the door galleries longer (ENC-06).
- Player impact: Noob isn't much kinder where it matters; Notch is more of the same.
- Proposal (user decides): make difficulty also scale the mercy window (ENC-03), the gun telegraph (Noob 0.6 s, Notch 0.3 s) and aim error, and on Notch let groups arrive together (spawn variety) rather than only more copies.
- Test: curve at Noob r = 0.35: no room fails.
- Effort S · Impact ★★ · Confidence likely
- Risk: tests/difficulty.test.ts.

## 4. Baseline metrics

**Difficulty curve** (deaths per room = restarts, mean of seeds 1–3; F = rooms failed (≥ 5 deaths) out of 3; `curve.test.ts`, Pro, 1 player). Rooms with an assist: grenade, roofB (breach), elevator (roof), street (pin), desert (sign), s2 final (disarm).

| room | brawler 0.1 | 0.2 | 0.35 | gunner 0.1 | 0.2 | 0.35 |
|---|---|---|---|---|---|---|
| s1 intro | 0 | 0 | 0 | 0 | 0 | 0 |
| s1 riot | 0 | 0 | 2.7 (1F) | 0 | 0 | 2.7 (1F) |
| s1 boss | 7.7 (3F)* | 8.0 (3F)* | 7.7 (3F)* | 1.7 (1F) | 2.0 (1F) | 0.3 |
| s1 wave B | – | – | – | 0 | 1.7 (1F) | 0 |
| s2 corner | 2.7 (1F) | 2.7 (1F) | 3.0 (1F) | 0 | 0 | 0 |
| s2 roofA / roofB | 1.3 / 2.3 | 2.3 / 1.0 | 1.7 / 3.3 | 3.3 / 0 | 0 / 1.7 | 0 / 0 |
| s2 office | 1.7 | 3.0 (1F) | 3.7 (2F) | 0 | 0 | 1.7 (1F) |
| **s2 corridor** | **5.7 (3F)** | **7.0 (3F)** | **4.0 (2F)** | **1.7 (1F)** | **4.7 (2F)** | **9.7 (2F)** |
| s2 elevator | 1.7 | 3.3 (2F) | 3.3 (2F) | 0 | 0 | 0 |
| s2 swords / lobby | 1.7 / 0 | 0 / 3.7 | 1.7 / 1.7 | 0 / 0 | 0 / 0 | 0 / 0 |
| s2 crates | 0 | 0 | 4.3 (2F) | 0 | 2.0 (1F) | 0 |
| s3 vent | 5.0 (3F) | 0.3 | 4.7 (2F) | 0 | 0.3 | 4.7 (2F) |
| s3 tables | 1.7 | 4.0 (2F) | 1.7 | 0 | 4.0 (2F) | 1.7 |
| **s3 camera** | 0 | 3.3 (2F) | 1.7 | **6.7 (3F)** | 2.3 (1F) | 0 |
| s3 street | 4.0 (2F)† | 5.3 (3F) | 3.7 (2F) | 0 | 1.7 (1F) | 1.7 (1F) |
| s3 desert | 0 | 0.3 | 1.7 | 0 | 0 | 0 |
| s3 vending | 1.7 | 5.0 (3F)‡ | 5.3 (3F)‡ | 0 | 0 | 1.7 |
| s3 console / lift | – | – | – | 0 / 0 | 0 / 0 | 0 / 0 |

\* fists can't hurt the boss (by design). † crashed (ENC-01). ‡ the duel needs a gun (ENC-16). The bots don't dodge or prone; read the columns relative to each other.

**Beat sheet** (gunner r = 0.2, seconds per room, mean of 3 seeds; lull = nothing alive and no exit open, to-exit = exit open, walking there):

| stage | room | total | combat | locked | lull | to-exit |
|---|---|---|---|---|---|---|
| 1 | intro / riot / grenade / boss / wave B / ending | 7 / 27 / 4 / 63 / 32 / 23 | 4 / 25 / 0 / 60 / 25 / 0 | 2 / 0 / 0 / 0 / 0 / 2 | 1 / 2 / 4 / 4 / 7 / 21 | 0 |
| 2 | wall / corner / roofA / roofB | 7 / 3 / 5 / 21 | 2 / 0 / 1 / 18 | 3 / 1 / 2 / 0 | 0 | 3 / 2 / 3 / 2 |
| 2 | office / corridor / elevator | 28 / 114 / 20 | 11 / 100 / 11 | 1 / 1 / 1 | 14 / 12 / 7 | 2 / 1 / 0 |
| 2 | swords / lobby / final | 16 / 12 / 4 | 10 / 8 / 1 | 2 / 1 / 3 | 3 / 2 / 0 | 1 / 2 / 0 |
| 3 | outside / vent / tables / camera | 6 / 5 / 18 / 124 | 3 / 4 / 17 / 104 | 3 / 1 / 1 / 8 | 0 / 0 / 0 / 13 | 0 / 1 / 1 / 0 |
| 3 | street / desert / vending / console / lift | 47 / 40 / 22 / 14 / 12 | 35 / 27 / 10 / 5 / 3 | 4 / 0 / 1 / 1 / 5 | 8 / 12 / 9 / 7 / 3 | 0 / 0 / 2 / 2 / 0 |

(The crate room's to-exit times in `curve.txt` are a bot artifact: the crate blocks its straight path to the door.)

**Arrivals:** the table in ENC-06. **Telegraphs:** probe `ENC-08`. **Passive pressure** (hero immortal, does nothing, 60 s): riot 52 hits (worst 1 s: 3), wave B 36 (2), office 36 (1). **Bursts:** SMG 4.0 hits/burst standing, 0.7 prone; MG 17 standing, 4.1 behind the crate, 0 prone. **Boss:** SMG → dead 2.4–5.7 s typical, 0–1 wards. **Enemy shots from off-screen:** 0. **Max token holders:** 2 (stage 1), 9 (stage 2), 5 (stage 3).

## 5. Top 5
1. ENC-03: no mercy window: one SMG burst takes all 3 lives (10/10), on every difficulty.
2. ENC-01 (+ ENC-02): two sim crashes in stage 3 (the brute mid-swing, a blade in a removed actor), both reproduced.
3. ENC-05: stage 1 has no checkpoint; a boss death replays the whole stage.
4. ENC-09: zombies/charging squads skip the token cap (9 attackers), making the corridor the hardest room (ENC-04).
5. ENC-06/07: trickle baseline (office: 16 singles, 16/16 head kills within 1.5 s at the door) + where spawn variety should and must not apply.

## 6. Questions for the user
- ENC-03: is a short post-hit mercy window acceptable within "every hit costs exactly 1 life" (decided)? It keeps the rule but stops one burst from being three hits.
- ENC-10: how long should the stage 1 boss last for a competent player (episode beat ~37 s)?
- ENC-22: should the difficulty setting also change telegraphs/mercy, or stay counts-only?
- ENC-17: should scripted cutscene hits (tutorial punch, flings) cost lives?
