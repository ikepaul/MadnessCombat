# Cross-review from controls & combat (CMB)

## 1. Votes on findings that touch controls/combat
| ID | Vote | Why | Cost/risk to my area |
|---|---|---|---|
| STB-01 / ENC-01 | +1 ! | Hitting a brute is core combat; a crash there is unshippable | None; a fix inside `applyHit` |
| STB-16 / ENC-02 | +1 ! | Throwing knives at the boss is a taught verb; it crashes | None |
| STB-03 | +1 | A grenade cooked across an exit breaks the cook rule | Clear `cook` on room exit (with STB-09) |
| STB-04 | +1 | Dying on the exit tick must count as a death | None |
| STB-09 | +1 | Leftover `attack`/`queued`/`grabQueued` causes ghost inputs in the next room | Also clear CMB-08's new buffer |
| STB-10 | +1 | Gating debug keys (CMB-02) removes the player-facing half | None |
| STB-15 | +1 | Matches CMB-03: guns are lethal both ways, with no telegraph on entry | Ties to ENC-03 |
| ENC-03 | +1 | One burst = three lives; a 0.5 s mercy window is the genre norm | Makes gun play safer still; pair with CMB-03 |
| ENC-04 | +1 | Corridor spike confirmed by my style runs (shotgun pair) | None |
| ENC-06 | +1 | Single-file doors feed the headshot farming | PR #43 covers it; my CMB-03 numbers still hold without it |
| ENC-09 | +1 | 9 attackers at once nullifies the token rule and melee | None |
| ENC-10 | +1 | SMG boss melt is the same gun dominance | Consistent with CMB-03 |
| ENC-11 | 0 | Real cheese but minor; cheap to fix | None |
| ENC-12 | +1 ! | Tells under 0.3 s make a melee answer guesswork; needed before CMB-07's stomp | The stomp needs a drawn tell |
| ENC-13 | +1 | Teach prone vs bullets | Caption says "Ctrl": use a key placeholder (CMB-01/17); keep prone as the bullet answer, CMB-07 only targets melee |
| ENC-16 | +1 | A melee player is stuck in the duel; count slash/smash | Supports CMB-18 |
| ENC-17 | +1 | Scripted hits costing lives feels unfair | None |
| ENC-20 | +1 | Same as my verb list: launcher, finisher, catch, shield never taught | LVL captions |
| ENC-22 | +1 | Difficulty should scale mercy and telegraphs, not only counts | Also stun-lock (CMB-06) ignores boss hp scaling |
| VIS-01 | +1 | Kill-cam audio bug | None |
| VIS-04 / UXS-17 | +1 | Accessibility | None |
| VIS-07 | +1 | Grab/throw snaps make grab feel imprecise | None |
| VIS-08 | +1 | A silent jump feels like dropped input (cf. CMB-08) | None |
| VIS-09 | +1 | The SMG sounds weaker than it is | None |
| VIS-10 | +1 | Hit-stop × slow-mo: inputs stay latched (OK), but it feels mushy | None; edges survive by `mergeEdges` |
| VIS-15 | +1 | The instant facing mirror hides which way a punch goes | Facing logic must stay instant in the sim (render only) |
| VIS-19 | +1 | Shield hits unreadable | None |
| VIS-20 / VIS-21 | 0 | Snaps are real, but key timing must not change hit frames | Render only, or my latency table moves |
| UXS-04 | +1 ! | Duplicate of CMB-02 | None |
| UXS-05 | +1 ! | Menu keys reaching the game = phantom jumps; worse with a buffer | Clear edges and the buffer on pause close |
| UXS-10 | +1 | Duplicate of CMB-17 | None |
| UXS-13 | +1 | R = reload and replay on the end card: an accidental restart | None |
| UXS-14 | +1 | Death → control 2.4–3.3 s without a skip | None |
| UXS-15 | +1 | Pause on blur; also the safety net for CMB-01 (a tab switch) | None |

## 2. Duplicates
- Brute crash: STB-01 = ENC-01. Stuck-blade crash: STB-16 = ENC-02.
- No stage 1 checkpoint: STB-06 = ENC-05 = UXS-01.
- Music WAV re-decode/leak: VIS-02 = UXS-02 (+ the UXS-21 bundle).
- Flashes vs reduced motion: VIS-04 = UXS-17.
- Death timer runs while paused: STB-07 ⊂ UXS-14.
- Debug keys in production: CMB-02 = UXS-04 (STB-10 is the dev half).
- Rebinding conflicts / live apply / captions: CMB-17 = UXS-10 (ENC-13 and LVL captions use the same fix).
- Gun dominance: CMB-03 ≈ ENC-06 (spawn side) + ENC-10 (boss side) + STB-15 (enemy side).
- Shield feedback: VIS-19 ≈ VIS-08 (shield bullets).

## 3. Conflicts between proposals
- **PR #43 spawn variety (groups of 2–3, several points, flanks) × CMB-03**: groups reduce farming at doors, but my TTK and lobby/office runs show head aim still wins (0 vs 21–35 hits). Rerun CMB's style probe on #43 before choosing between melee-only heal and an aim-settle. Flanks raise the value of CMB-06 (jab-lock one, get hit by the other): good, it shrinks the exploit naturally.
- **PR #43 × CMB-07**: unarmed groups of 3 against a prone knife camper = more free kills. The prone stomp matters more after #43.
- **ENC-03 mercy window × CMB-03/06**: mercy makes the gun gallery even safer. Ship it together with CMB-03's gun cost, not alone. Mercy must not give the *enemy* an invulnerable window (hero-side only).
- **ENC-13 (teach prone) × CMB-07 (punish prone)**: compatible if the stomp only answers melee next to a prone hero; prone keeps dodging bullets.
- **ENC-13 caption "Ctrl" × CMB-01 (dive → C)**: captions must use binding placeholders (CMB-17/UXS-10) before either lands.
- **CMB-08 generic input buffer × UXS-05 / STB-09**: a buffer must be cleared on pause close and room entry, or it replays menu keys and leftovers.
- **ENC-12 longer drawn tells × CMB-06 stun shrink**: both slow the melee exchange; tune together (a jab-locked target shouldn't telegraph mid-stun).
- **VIS-20 key snaps × CMB latency**: if fixed by re-timing clips, the hit frames in `TUNING.melee` must stay (render-only blend).
- **ENC-22 difficulty × CMB-06**: `bossHp` scaling is meaningless while the riot can be jab-locked; fix CMB-06 first.

## 4. Top 10 overall (smoother, better, more fun)
1. STB-01/ENC-01 + STB-16/ENC-02: the two combat crashes.
2. STB-06/ENC-05/UXS-01: a stage 1 checkpoint.
3. CMB-01 + UXS-15: no Ctrl+W/Ctrl+Tab trap; pause on blur, `beforeunload`.
4. CMB-02/UXS-04: gate the debug keys.
5. ENC-03 + CMB-03: a hero mercy window together with a cost on gun headshots (re-measured on #43).
6. CMB-08 + CMB-09 (+UXS-05 clearing): one input buffer, a jump buffer, coyote time.
7. ENC-12: draw melee tells ≥ 0.3 s.
8. CMB-06 + CMB-07: no endless jab-lock, no prone camping against melee.
9. CMB-12 + CMB-13 + CMB-14: corpse finisher, knife toss and weapon finisher, the overloaded-verb fixes.
10. VIS-02/UXS-02: the music reload/leak (hitches on every room change).
