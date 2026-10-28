# Cross-review by VIS (feel, audio, look)

## 1. Votes on findings that touch feel / look / sound

| ID | Vote | Why (≤15 words) | Cost/risk to feel/look/sound |
|---|---|---|---|
| STB-11 | +1 | Shake and chromatic under the pause menu look broken; trivial fix. | None; also freeze the kill-cam audio low-pass while paused. |
| STB-01 / ENC-01 | +1 ! | Crash. | None. |
| STB-16 / ENC-02 | +1 ! | Crash. | Dropped blade needs `knifeWall`/clatter sound + fall, else it vanishes silently. |
| STB-03 | +1 | Grenade going off in the next room also drops a blast into the ink wipe. | None. |
| CMB-03 | 0 | User's decision; melee-only heal needs a distinct heal cue. | `heal` sound/HUD only on melee kills: fine. |
| CMB-06 | +1 | Stun-lock is unfun. | Shorter stuns cut the 21-frame `stun` clip: add a shorter clip or it pops (VIS-21). |
| CMB-07 | +1 | Exploit. | A stomp needs a pose, a wind-up and a sound (rule: ships with sound + VFX). M. |
| CMB-13 / CMB-14 | +1 | Weapon finisher is satisfying and closes a hole. | New down-stab pose + `knifeFlesh`/`crack` layer, hit-stop heavy. S each. |
| CMB-15 | +1 | Invisible i-frames read as missed shots. | Prefer the spark + `block` thud (event `block`, how 'iframe'): reuses VFX/sound. |
| CMB-19 | +1 | Heavy kills should fly. | Sends more bodies into walls: fix VIS-06 (slump pop) first or the pop gets more visible. |
| CMB-20 | 0 | Fine either way. | Shorter recovery needs a blended exit from `takedown`; check for a pop. |
| ENC-03 | +1 ! | Biggest cause of cheap deaths. | Ignored hits must read: body flash + muted `impact` + no hit-stop/shake; else bullets look like they miss. |
| ENC-10 | 0 | Boss tuning, ENC's area. | Warding during the volley adds ricochets: the `ricochet` voice limit (3) already steals 85 % there. |
| ENC-12 | +1 | Readable tells = fair fights; matches revamp G2/A10. | Red glint is allowed (telegraph); pose + red glint is S. |
| ENC-13 / ENC-20 | +1 | Teaching. | None. |
| ENC-17 | +1 | Scripted hits shouldn't cost lives. | Keep the hit feel (flash, thud), only drop the damage. |
| ENC-21 | +1 | Where-to-go clarity. | Needs a new sting sound id + arrow VFX; generated recipe avoids a LICENSES entry. |
| UXS-02 | +1 ! | Same as VIS-02, plus the leak. | Merge with VIS-02/VIS-03 into one music slice. |
| UXS-14 | +1 | Faster death → retry keeps the flow. | Keep ≥ 0.8 s so the death reads (kill-cam/ink); fine. |
| UXS-16 | +1 | Readability. | None. |
| UXS-17 | +1 | Complements VIS-04 (tint, grain, vignette pulse vs my room flashes). | Ship VIS-04 + UXS-17 together as revamp G3. |
| UXS-18 / UXS-19 | +1 | Free frame time for VFX. | VIS-05 (particles into the depth sort) should reuse UXS-19's draw list. |
| UXS-21 / UXS-24 | +1 | Same file as VIS-02. | Re-encode + rename the stem in one go; the user re-delivers or OKs the conversion. |

## 2. Duplicates
- **VIS-02 = UXS-02** (music re-decode/restart) + **UXS-21** (48 MB WAV) + **UXS-24** (its file name). One music slice with VIS-03 and VIS-14.
- **VIS-04 ≈ UXS-17**: two halves of "reduced motion means it" (G3).
- STB-01 = ENC-01; STB-16 = ENC-02; STB-06 = ENC-05 = UXS-01; CMB-02 = UXS-04; CMB-17 = UXS-10; STB-07 ⊂ UXS-14; ENC-19 ⊂ ENC-04.
- ENC-12 = revamp G2/A10 (endorsed in VIS-22). CMB-15 and VIS-08 both want a sound for silently absorbed hits (i-frames, shields).

## 3. Conflicts
- **ENC-03 mercy window vs feel**: ignored hits still emit `hit` with damage 0, and today damage 0 plays the "punching a corpse" thud with no blood. Define one "absorbed" response (flash + soft thud, no hit-stop) shared with CMB-15 and VIS-19.
- **CMB-06 shorter stuns vs animation**: the `stun` clip is 21 frames; cutting the state at 0.25 s jumps out of it mid-clip. Shorten the clip per chain step or blend out.
- **CMB-19 more corpse flight vs VIS-06/07**: do the root blend first.
- **UXS-02 (stop + crossfade) and VIS-03 (single stem plays through)** both rewrite `MusicSystem.setTrack/setIntensity`: one owner.
- **CMB-08/CMB-10 (input buffers, latched shots)** slightly raise shot rate → more `shotSmg` steals (VIS-09). Not blocking; tune VIS-09 after.
- **M19 rage strikes** call `hitStop` directly inside their own slow-mo: same multiplication as VIS-10; whoever fixes VIS-10 should cover `rageBeat` too.

## 4. Top 10 overall (smoother, better, more fun)
1. STB-16 / STB-01 (= ENC-02 / ENC-01): the crashes.
2. STB-05: stage 3 ending softlock.
3. UXS-01 (= STB-06 = ENC-05): stage 1 checkpoints per beat.
4. ENC-03: mercy window (with the absorbed-hit feel above).
5. CMB-01: Ctrl+W closes the tab while diving.
6. VIS-02 + UXS-02 + VIS-03: the music plays through rooms, cached, no leak.
7. VIS-06 + VIS-07: thrown bodies stop popping (root blend).
8. ENC-12: drawn melee wind-ups (fair, readable fights).
9. VIS-01: the kill-cam pitch bug.
10. CMB-08: one generic input buffer (moves stop eating presses).
