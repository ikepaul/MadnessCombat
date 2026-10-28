# Audit proposals: every finding, scored

Lean mode (5 lenses, 5 reviewers, no debate round). One row per finding; duplicates merged (all ids listed). Sorted by score.

**Score** = impact (★=1…★★★=3) × confidence (confirmed 1.0 · likely 0.7 · opinion 0.4) × (1 + net votes / 5) ÷ effort (S 1 · M 2 · L 4). Votes come only from the review tables (`review-*.md` §1); a reviewer who voted on several ids of one merged row counts once. Votes are `+/0/−`, `!n` = n blocking. **No reviewer cast a −1**, so the cuts and shrinks are the lead's (see the notes under the table and `design/audit-pass.md` §7).

Lens: STB stability · CMB controls+combat · ENC enemies+pacing · VIS feel+look+sound · UXS shell+tech. Type: bug S1/S2/S3, friction, balance, look, sound, perf, tech, feature, decision.

| ID | Lens | Type | Title | Eff | Imp | Conf | Votes (+/0/−, ! blocking) | Same as | Score |
|---|---|---|---|---|---|---|---|---|---|
| STB-01 | STB | bug S1 | Vending brute / jetpack hit mid-attack: `stepAttack` throws (street freezes) | S | 3 | confirmed | 5/0/0 !5 | ENC-01 | 6.00 |
| STB-16 | STB | bug S1 | Blade stuck in a script-removed actor: `pullable` throws (stage 3 boss teleport, jetpack exit) | S | 3 | confirmed | 5/0/0 !5 | ENC-02 (root shared with UXS-08) | 6.00 |
| CMB-02 | CMB | bug S2 | Debug keys (F2 slow-mo, F3, K, L, Z, 1/2/3, P, M) live in production | S | 3 | confirmed | 4/0/0 !2 | UXS-04 | 5.40 |
| STB-06 | STB | bug S1 | Stage 1 has no checkpoint: any death replays intro + every beat; Continue can't resume it | S | 3 | confirmed | 3/0/0 !2 | ENC-05, UXS-01 | 4.80 |
| ENC-03 | ENC | balance | No hero mercy window: one SMG burst = 3 lives (10/10), on every difficulty | S | 3 | confirmed | 3/1/0 !1 | root of STB-15 | 4.80 |
| CMB-06 | CMB | balance | Endless 0.4 s jab stun-lock; riot mini-boss never swings back | S | 3 | confirmed | 2/0/0 | | 4.20 |
| STB-03 | STB | bug S2 | Grenade cooked while leaving explodes at the next room's entry | S | 2 | confirmed | 4/0/0 | fixed by STB-09 | 3.60 |
| ENC-09 | ENC | balance | Zombies / charging squads skip the token cap: 9 attackers at once (corridor) | S | 3 | confirmed | 1/0/0 | | 3.60 |
| VIS-10 | VIS | friction | Hit-stop × kill cam multiply (3.3× freeze), per-second cap broken | S | 2 | confirmed | 4/0/0 | one clock change with STB-10, STB-11 | 3.60 |
| ENC-06 | ENC | balance | Door/edge waves are single-file headshot galleries (baseline metrics) | S | 3 | confirmed | 1/0/0 | → PR #43 (spawn variety) | 3.60 |
| CMB-01 | CMB | bug S1 | Ctrl dive + W = Ctrl+W closes the tab; Ctrl+Tab (rage) switches tabs | S | 3 | likely | 3/0/0 !3 | | 3.36 |
| VIS-02 | VIS | bug S2 / perf | Music re-fetches + re-decodes a 48 MB WAV per room/death, restarts at bar 1, old sources leak | S | 3 | likely | 3/0/0 !3 | UXS-02 | 3.36 |
| STB-04 | STB | bug S2 | Killed on the exit tick: revived in the next room with 1 hp | S | 2 | confirmed | 3/0/0 | | 3.20 |
| VIS-01 | VIS | bug S2 | Two kill cams within 0.6 s leave every loop at 0.6× pitch for good | S | 2 | confirmed | 3/0/0 !2 | | 3.20 |
| VIS-08 | VIS | sound | Silent events: jump, playerDown, revive, edge spawn, shield bullets; shield break no feedback | S | 2 | confirmed | 3/0/0 | VIS-19 | 3.20 |
| ENC-13 | ENC | friction | Jetpack caption teaches cover (4.1 hits/burst); prone (0 hits) never taught | S | 2 | confirmed | 3/0/0 | needs key helper (CMB-17) | 3.20 |
| ENC-17 | ENC | balance | Scripted hits cost lives (tutorial cross, boss flings) | S | 2 | confirmed | 3/0/0 | | 3.20 |
| ENC-20 | ENC | friction | Teaching map: grab/throw, prone, combos, reload, flying kick never taught | S | 2 | confirmed | 3/0/0 | ENC-13, CMB-17 | 3.20 |
| VIS-06 | VIS | look | Corpse against a wall pops 1–1.6 H lying → slumped; 55° snap on landing | S | 3 | confirmed | 0/0/0 | before CMB-19 | 3.00 |
| STB-02 | STB | bug S2 | Restarting the street drops improbability mode + axeThrows (rules live in history) | S | 2 | confirmed | 2/0/0 !1 | | 2.80 |
| STB-05 | STB | bug S1 | Stage 3 ending soft-locks if the hero dies in the 0.6 s before the stab | S | 2 | confirmed | 2/0/0 !2 | | 2.80 |
| STB-08 | STB | tech | Room not reproducible from its checkpoint (RNG + ids carry over) | S | 2 | confirmed | 2/0/0 | before ENC-19 | 2.80 |
| CMB-09 | CMB | friction | No jump buffer, no coyote time | S | 2 | confirmed | 2/0/0 | with CMB-08 | 2.80 |
| CMB-14 | CMB | balance | Melee weapons / uppercut can't touch a downed enemy (no weapon finisher) | S | 2 | confirmed | 2/0/0 | with CMB-13 | 2.80 |
| CMB-16 | CMB | friction | Punch buffer is one slot, last press wins: eager inputs overwrite the uppercut | S | 2 | confirmed | 2/0/0 | with CMB-08 | 2.80 |
| ENC-16 | ENC | bug S1 (likely) | Sword duel counts only gun/knife hits: a melee player with no ammo is stuck | S | 2 | confirmed | 2/0/0 !1 | STB-14 family | 2.80 |
| ENC-21 | ENC | friction | Nothing reacts to `exitOpen`; stage 3 has no tracker | S | 2 | confirmed | 2/0/0 | STB-14 | 2.80 |
| VIS-04 | VIS | bug S2 | Reduced motion / effects off still flash (explosions, lightning, muzzle light, kill-cam wash, grain, vignette pulse) | S | 2 | likely | 4/0/0 | UXS-17 | 2.52 |
| CMB-04 | CMB | balance | Shotgun one-shots everything incl. the 12-hp agent and the riot | S | 2 | confirmed | 1/0/0 | | 2.40 |
| CMB-05 | CMB | bug S2 | Bodyguard ("2 hits") dies to one jab (punches count as head) | S | 2 | confirmed | 1/0/0 | | 2.40 |
| CMB-10 | CMB | friction | Clicking a semi-auto faster than its rate fires fewer shots | S | 2 | confirmed | 1/0/0 | | 2.40 |
| CMB-11 | CMB | friction | Ctrl just before landing = flying kick, not a dive | S | 2 | confirmed | 1/0/0 | | 2.40 |
| CMB-13 | CMB | bug S2 | Knife LMB at a downed / rising enemy throws the knife away | S | 2 | confirmed | 1/0/0 | with CMB-14 | 2.40 |
| ENC-08 | ENC | bug S2 | On Noob the lobby's hold-up never happens (`scaled()` drops the last entry) | S | 2 | confirmed | 1/0/0 | → PR #43 (ENC-07 tags) | 2.40 |
| ENC-15 | ENC | bug S2 | Boss cannon lands on the ending's boombox in 35 %: 60 s of nothing | S | 2 | confirmed | 1/0/0 | | 2.40 |
| ENC-18 | ENC | friction | Dead time: trickle lull, 25 s grenade beat timeout, 60 s ending wait | S | 2 | confirmed | 1/0/0 | trickle part → PR #43 | 2.40 |
| VIS-07 | VIS | look | Thrown bodies hop 0.5 H on release; grabs snap 0.16–0.47 H | S | 2 | confirmed | 1/0/0 | | 2.40 |
| VIS-15 | VIS | look | Facing flip is an instant 0.38 H mirror | S | 2 | confirmed | 1/0/0 | = revamp A3 | 2.40 |
| UXS-03 | UXS | bug S2 | Replaying an earlier stage moves Continue back | S | 2 | confirmed | 1/0/0 | with UXS-12 | 2.40 |
| UXS-07 | UXS | bug S2 | Guest stops sending: P2 repeats his last input forever | S | 2 | confirmed | 1/0/0 !1 | | 2.40 |
| UXS-08 | UXS | bug S2 | Guest never removes actors the host removed (ghosts) | S | 2 | confirmed | 1/0/0 | root STB-16 (`removeActor`) | 2.40 |
| CMB-17 | CMB | friction / S3 | Rebinding: no duplicate check, hidden C dive alias, applies next room, captions hard-code keys | S | 2 | likely | 3/0/0 | UXS-10 | 2.24 |
| UXS-05 | UXS | bug S2 | Keys pressed in the pause menu reach the game (Space on Resume jumps; guest walks) | S | 2 | likely | 3/0/0 !1 | | 2.24 |
| UXS-15 | UXS | friction | No pause on focus loss | S | 2 | likely | 3/0/0 | | 2.24 |
| CMB-07 | CMB | balance | Prone = immune to unarmed grunts; prone + blade kills them free | M | 3 | confirmed | 2/0/0 | needs ENC-12 tell | 2.10 |
| CMB-08 | CMB | friction | Only punches/grab buffer; jump/dive/swing/get-up/flinch drop presses | M | 3 | confirmed | 2/0/0 | CMB-09, CMB-16 | 2.10 |
| CMB-12 | CMB | bug S2 | Whiffed punch near a corpse = planted 0-damage finisher (roots 0.57 s) | S | 2 | confirmed | 0/0/0 | | 2.00 |
| ENC-07 | ENC | tech | Where spawn variety must not apply + order couplings | S | 2 | confirmed | 0/0/0 | → PR #43 (being fixed there) | 2.00 |
| ENC-11 | ENC | balance | Cannon safe strip at the front edge (0 of 12 balls) | S | 2 | confirmed | 0/1/0 | | 2.00 |
| ENC-14 | ENC | bug S2 | Crate room's dug-in guards walk out of cover at once | S | 2 | confirmed | 0/0/0 | | 2.00 |
| VIS-14 | VIS | sound | Outdoor rooms silent; city/wind beds unused; reverb only 2 sizes | S | 2 | confirmed | 0/1/0 | | 2.00 |
| VIS-16 | VIS | look | Feet slide (walk swing is half a stride) — quick fix | S | 2 | confirmed | 0/0/0 | = revamp A4 (quick step) | 2.00 |
| UXS-09 | UXS | friction | "Reset progress" wipes everything in one press, one row above Back | S | 2 | confirmed | 0/0/0 | | 2.00 |
| STB-12 | STB | tech | Wrong spawn id / door index crashes mid-room: data lint test | S | 2 | likely | 2/0/0 | include PR #43 scripts | 1.96 |
| UXS-16 | UXS | friction | Small text at small windows; no text-size option | S | 2 | likely | 2/0/0 | | 1.96 |
| STB-14 | STB | friction | Scripted-trick rooms (cables, disarm, pin) have no hint fallback | S | 2 | likely | 1/1/0 | ENC-21, ENC-16 | 1.68 |
| ENC-22 | ENC | decision | Difficulty scales counts, not the causes of death | S | 2 | likely | 1/1/0 | after ENC-03, CMB-06 | 1.68 |
| VIS-03 | VIS | sound / decision | One-stem track switches off whenever no enemy is active | S | 2 | likely | 1/0/0 | VIS-02 (one music owner) | 1.68 |
| VIS-09 | VIS | sound | SMG voice limit cuts 97 % of shots short | S | 2 | likely | 1/0/0 | | 1.68 |
| VIS-11 | VIS | friction | Set-piece impacts (tank, walls, door smash, toppled props) have no screen response | S | 2 | likely | 1/0/0 | VIS-12 | 1.68 |
| VIS-17 | VIS | look | At equal depth the hero is drawn behind grunts | S | 2 | likely | 1/0/0 | | 1.68 |
| UXS-13 | UXS | friction | R on the end card restarts the stage (R = reload) | S | 2 | likely | 1/0/0 | | 1.68 |
| CMB-15 | CMB | bug S3 | Get-up i-frames silently eat bullets | S | 1 | confirmed | 3/0/0 | absorbed-hit response with ENC-03, VIS-19 | 1.60 |
| CMB-03 | CMB | decision | Gun headshots dominate every fight (S2 lobby: 0 hits vs a brawler's 35) | M | 3 | confirmed | 0/2/0 | ENC-06, ENC-10, STB-15 | 1.50 |
| ENC-04 | ENC | balance | Curve spiky, not rising; corridor hardest room; wave A cliff | M | 3 | likely | 2/0/0 | STB-15 (corridor entry deaths) | 1.47 |
| STB-10 | STB | bug S3 | Pause menu and F3 fight over `clock.paused`; F4 steps through hit-stop | S | 1 | confirmed | 2/0/0 | VIS-10 | 1.40 |
| UXS-14 | UXS | bug S3 | Death → control 2.4–3.3 s, no skip; death timer runs while paused | S | 1 | likely | 5/0/0 | STB-07 | 1.40 |
| VIS-13 | VIS | sound | Loudness outliers (block > hit, quiet alert, hot shotgun, silent desert hits) | S | 2 | likely | 0/0/0 | | 1.40 |
| ENC-10 | ENC | balance | Stage 1 boss melts to the SMG (2.4–5.7 s), ward barely matters | M | 2 | confirmed | 1/1/0 | CMB-03 | 1.20 |
| VIS-12 | VIS | tech | Dead feel numbers (`bossPhaseKill`, `autoFireMax`) | S | 1 | confirmed | 1/0/0 | VIS-11 | 1.20 |
| UXS-12 | UXS | bug S3 | Saves not validated (wrong types load as is) | S | 1 | confirmed | 1/0/0 | UXS-03 | 1.20 |
| UXS-21 | UXS | tech | 1.8 MB main chunk incl. every lab + a 48 MB WAV | S | 1 | confirmed | 1/0/0 | VIS-02 (stem) | 1.20 |
| UXS-22 | UXS | tech | Stage count hard-coded in ~10 places; shell logic untested | M | 2 | confirmed | 1/0/0 | | 1.20 |
| UXS-24 | UXS | decision | Show's name in the tab title and the shipped stem file name | S | 1 | confirmed | 1/0/0 | VIS-02 (stem rename) | 1.20 |
| CMB-20 | CMB | friction | Empty-hand takedown roots 1.75 s (doc says 1.5 s) | S | 1 | confirmed | 0/1/0 | | 1.00 |
| STB-11 | STB | bug S3 | Kill cam, shakes, chromatic keep playing under the pause menu | S | 1 | likely | 2/0/0 | VIS-10 | 0.98 |
| ENC-12 | ENC | look / fairness | Melee tells < 0.3 s; the 0.5 s wind-up exists but isn't drawn | M | 2 | likely | 2/0/0 !1 | revamp G2/A10; before CMB-07 | 0.98 |
| STB-09 | STB | bug S3 | Room entry leaves per-actor action state behind | S | 1 | likely | 1/0/0 | STB-03 | 0.84 |
| STB-13 | STB | bug S3 | Squad heads remembered per world, not per room (latent) | S | 1 | likely | 1/0/0 | → PR #43 | 0.84 |
| CMB-19 | CMB | look | Killing heavies barely move the body (0.19 H) | S | 1 | likely | 1/0/0 | after VIS-06 | 0.84 |
| ENC-19 | ENC | friction | Long rooms with one checkpoint (corridor, desert) | M | 2 | likely | 1/1/0 | after STB-02, STB-08 | 0.84 |
| VIS-23 | VIS | tech | Delayed sounds aren't counted by the voice pool | S | 1 | likely | 1/0/0 | | 0.84 |
| UXS-18 | UXS | perf | HUD texts re-rasterize every frame (`setColor`) | S | 1 | likely | 1/0/0 | | 0.84 |
| UXS-19 | UXS | perf | Per-frame closures in the draw list; elevator repaints its room every frame | S | 1 | likely | 1/0/0 | before VIS-05 | 0.84 |
| CMB-18 | CMB | decision | Melee weapons make fists dead weight (durability?) | S | 2 | opinion | 0/1/0 | CMB-03 | 0.80 |
| VIS-24 | VIS | feature | Thrown-body speed lines (revamp B7) | S | 2 | opinion | 0/0/0 | VIS-06/07 | 0.80 |
| VIS-05 | VIS | look | Particles draw over every character whatever their depth | M | 2 | likely | 0/1/0 | after UXS-19 | 0.70 |
| UXS-06 | UXS | bug S2 (guest) | Co-op dead ends: no way back from lobby / end card; host pause/quit invisible to the guest | M | 2 | likely | 0/0/0 | | 0.70 |
| UXS-11 | UXS | bug S3 | Controls screen's last row overlaps the help line | S | 1 | likely | 0/0/0 | | 0.70 |
| UXS-25 | UXS | tech | Dev tuning overrides persist silently | S | 1 | likely | 0/0/0 | | 0.70 |
| VIS-18 | VIS | decision | Red as decoration (toy-street awnings), green welder visor | S | 1 | opinion | 0/1/0 | | 0.40 |
| VIS-20 | VIS | look / decision | 1-frame wind → hit keys move the head 0.8–0.9 H | S | 1 | opinion | 0/1/0 | | 0.40 |
| UXS-20 | UXS | perf | Co-op snapshots ~8 KB/frame JSON, no jitter buffer | M | 1 | likely | 0/0/0 | | 0.35 |
| UXS-23 | UXS | tech | Conflict magnets (GameScene, combat.ts, actor.ts, tuning.ts) | M | 1 | opinion | 0/0/0 | | 0.20 |
| CMB-21 | CMB | bug S? | Possible stall, S1 wave A seed 1 gun bot | S | ? | opinion | 0/2/0 | not reproduced (STB, ENC) | — |
| VIS-21 | VIS | look | Hit reactions snap 0.28 H into the stun (baseline only) | — | 1 | confirmed | 0/1/0 | | — |
| VIS-22 | VIS | decision | Verdicts on the unbuilt revamp items | — | — | — | — | revamp menu | — |

## Lead adjustments (score ranks, judgment adjusts)
- **Bugs are in by rule** (all S1; S2 with effort ≤ M), whatever their score: CMB-12, ENC-14 (0 votes) and UXS-06 (M, 0.70) included. UXS-06 shrunk to its S parts (Esc in lobby and on the co-op end card, guest sees "host paused / left", Co-op hidden in production).
- **ENC-16 raised to S1**: once the SMG is empty a melee-only player can never finish the duel (brawler: 93–281 s of lull, failed). STB voted it blocking.
- **STB-06 = ENC-05 = UXS-01 kept as S1** (lost progress), conditional on the user's yes to beat checkpoints (decision Q1).
- **ENC-12 shrunk M → S** (score 1.96): draw the existing 0.5 s wind-up only for the knockdown heavy and the new stomp; the full G2 language is deferred. It is the prerequisite CMB and ENC asked for before CMB-07.
- **UXS-25 raised**: the playtest slice (F) depends on knowing whether F6 overrides are active.
- **VIS-06 kept high with 0 votes**: no reviewer table covered it, but two top-10 lists did (VIS, UXS) and it is measured.
- **ENC-06, ENC-07, ENC-08, STB-13 → PR #43**: arrival patterns and order couplings are owned by the spawn-variety PR. ENC-06's table becomes its acceptance metric; ENC-08 is verified there.
- **CMB-03 not built as proposed**: re-measured on PR #43 after ENC-03 lands (ENC: melee-only heal makes the gun rooms deadlier). Becomes an F6 switch for the playtest (decision Q2).
- **Cut**: CMB-21 (not reproduced by STB in 40 runs nor by ENC's harness), VIS-21 (no proposal), UXS-23 (opinion refactor without tests).

## Probes kept
Kept in `tests/audit/` (all `AUDIT`/`SOAK`-gated): `harness.ts`, `soak.test.ts`, and the probes that the findings cite as repros or tests: `stb/{crash,probes,checkpoint}`, `cmb/cmb`, `enc/{harness,probes,curve}`, `uxs/{shell,net,sim}`, `vis/{popDetector,feelLoad,coverage}`. Deleted at planning: `stb/grab.test.ts` (a passing check) and `stb/corridor.test.ts` (STB-15 diagnostics, superseded by ENC-03 / the ENC curve).
