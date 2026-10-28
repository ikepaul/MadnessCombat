# ENC cross-review (round 2)

Lens: enemies, difficulty, pacing. Votes: +1 do it, 0 neutral, −1 against, ! = blocking (must land before balance is tuned again).

## 1. Votes on findings that touch my area

| ID | Vote | Why (≤15 words) | Cost/risk to ENC (balance) |
|---|---|---|---|
| STB-16 | +1 ! | Same crash as ENC-02; my bots hit it every few stage 3 runs. | None; unblocks curve runs. |
| STB-01 | +1 ! | Same as ENC-01; the street fight freezes. | Keep the brute's no-flinch; choose `stun` 0.12 s, not a knockdown. |
| STB-02 | +1 | Restarted street without improbability changes the street's difficulty. | Curve numbers for the street were taken on a fresh entry; fine. |
| STB-03 | +1 | Grenade into the next room spawns on the entry. | None. |
| STB-04 | +1 | A death on the exit tick shouldn't skip a room. | None. |
| STB-05 | +1 ! | Softlock at the stage 3 finale. | None. |
| STB-06 | +1 ! | Same as ENC-05 / UXS-01. | Cheapens stage 1 deaths; correct. |
| STB-08 | +1 | Reproducible rooms make balance probes trustworthy across restarts. | Seeds change → my baseline numbers shift slightly; rerun once. |
| STB-12 | +1 | Data lint protects spawn variety's new spawn ids (PR #43). | None. |
| STB-13 | +1 | Squad heads across rooms can mis-link groups in PR #43. | None. |
| STB-14 | +1 | Matches ENC-16/ENC-21: one scripted action, no fallback. | None. |
| STB-15 | +1 | Corridor entry death; root cause is ENC-03 (3 pellets = 3 lives in one tick). | Fix via the mercy window, not a corridor-only patch. |
| CMB-01 | +1 ! | Ctrl+W closing the tab is the worst "death" in the game. | None. |
| CMB-02 | +1 | Release debug keys (L, Z, F2) break any difficulty. | None. |
| CMB-03 | 0 | Real, but melee-only heal makes gun rooms deadlier, worsening ENC-03/04 spikes. | High: do only after the mercy window; rerun the curve. |
| CMB-04 | +1 | Shotgun one-shotting the riot/agent flattens mini-bosses. | Corridor gets longer for the player; pair with ENC-19 checkpoint. |
| CMB-05 | +1 | Elites must survive a jab, or the finale guards are trivial. | Final/lift rooms get slightly harder (they're the flattest). |
| CMB-06 | +1 | Jab-lock trivialises the riot mini-boss. | Fine; brawler bots will die more, expected. |
| CMB-07 | +1 | Prone immunity to fists is a hole; keep prone vs bullets (ENC-13). | Stomp telegraph ≥ 0.3 s (ENC-12 bar). Don't remove prone as a bullet dodge. |
| CMB-08 / 09 / 16 | +1 | Dropped inputs read as unfair deaths. | Makes the hero stronger; rooms stay within curve. |
| CMB-11 | +1 | Kick-instead-of-dive near landing kills dodges. | None. |
| CMB-14 | +1 | Weapon finisher gives blades a use on downed foes. | Slightly faster kills; fine. |
| CMB-15 | +1 | Silent i-frames look like misses. | None. |
| CMB-17 / UXS-10 | +1 | Captions must follow bindings (also ENC-20). | None. |
| CMB-18 | 0 | Durability is a big change; decide after CMB-03. | Medium: melee rooms (riot, swords) harder. |
| CMB-21 | 0 | Bot artifact likely; my harness saw no stall there. | None. |
| VIS-08 | +1 | Edge-spawn footsteps = a telegraph for arrivals (pairs well with PR #43 flanks). | Helps fairness of flanks. |
| VIS-10 | +1 | Long freezes during kill cam disrupt dodging the next burst. | None. |
| VIS-11 | +1 | Set-piece impacts need a hit on screen to read as hazards. | None. |
| VIS-12 | +1 | Boss kill deserves the phase-kill feel (ENC-10 makes it rarer). | None. |
| VIS-17 | +1 | Hero drawn behind grunts hides your own telegraphs/hurt. | None. |
| VIS-18 | 0 | Red must stay reserved for enemy telegraphs; the EMPTY tag is fine. | None. |
| VIS-19 | +1 | Human shield needs feedback (it's the camera-room answer). | None. |
| UXS-01 | +1 ! | = ENC-05. | See STB-06. |
| UXS-05 | +1 | Space on Resume jumping into a burst = unfair death. | None. |
| UXS-14 | +1 | Faster death→retry makes the spiky rooms tolerable. | None. |
| UXS-15 | +1 | Focus loss mid-burst = death with no input. | None. |
| UXS-16 | +1 | Captions are the whole teaching map (ENC-20); must be readable. | None. |
| UXS-17 | +1 | Reduced motion shouldn't hide telegraphs; keep the red aim line. | Keep gameplay tells at full. |

## 2. Duplicates
- **Stage 1 has no checkpoint:** ENC-05 = STB-06 = UXS-01 (one fix: beat checkpoints).
- **Brute mid-swing crash:** ENC-01 = STB-01. **Stuck blade, owner removed:** ENC-02 = STB-16.
- **Corridor entry deaths:** STB-15 ⊂ ENC-03/ENC-04 (pellets/bursts with no mercy window).
- **Captions hard-code keys:** ENC-20 (note) = CMB-17 = UXS-10(3).
- **Debug keys in release:** CMB-02 = UXS-04.
- **Music re-decode per room:** VIS-02 = UXS-02.
- **Restart timer while paused:** STB-07 = UXS-14 (part).
- **One scripted action, no fallback:** STB-14 ≈ ENC-16 (sword duel) + ENC-15 (boombox) + ENC-21 (exit cues).
- **Rebinding conflicts / apply on close:** CMB-17 = UXS-10.

## 3. Conflicts
- **CMB-03 (heal on melee kills only) vs ENC-03/04:** gun rooms are already where deaths cluster; removing gun-kill heals raises them further. Order: mercy window first, rerun the curve, then CMB-03 if guns still dominate.
- **CMB-07 (stomp prone heroes) vs ENC-13 (teach prone as the bullet dodge):** compatible if the stomp only comes from adjacent melee grunts with a ≥ 0.3 s tell; prone must stay the MG/SMG answer.
- **CMB-04 (pellet damage 1) vs the corridor:** weaker player shotguns make the corridor (already the hardest room) longer; pair with ENC-19's mid-room checkpoint.
- **ENC-03 mercy window vs scripted one-hit kills:** the stage 2 ending (boss shot), the stage 3 stab/last-stand set `hp = 1` and expect one hit; scripted hits must bypass the window.
- **PR #43 spawn variety vs ENC-07 couplings:** the sword room's 5th-spawn daze, the lobby's last unarmed entry, wave B's first-entry cannoneer, and difficulty `scaled()` copies. Tag those entries; never group or reorder them (also fixes ENC-08 on Noob).
- **VIS-10 (skip hit-stop in kill cam) vs CMB feel:** none for balance; just note kill cams freeze the player too.

## 4. Top 10 overall (smoother, better, more fun)
1. ENC-03: a short hero mercy window (one burst ≠ three lives); fixes STB-15 too.
2. CMB-01: Ctrl+W/Tab can close the game; move dive off Ctrl.
3. STB-01/STB-16 (= ENC-01/02): the two stage 3 crashes.
4. STB-06 = UXS-01 = ENC-05: beat checkpoints in stage 1.
5. STB-05: the stage 3 finale softlock.
6. ENC-09: cap zombie/charge attackers (the corridor pile-on).
7. PR #43 + ENC-06/07: groups and flanks, with the coupling tags and the arrival metrics as its acceptance.
8. CMB-08/09: input buffer, jump buffer and coyote time.
9. ENC-12: draw the grunts' wind-up (melee tells ≥ 0.3 s).
10. ENC-20/21 + CMB-17: teach the missing verbs (prone, grab-throw, combos) with binding-aware captions, and cue every exit opening.
