# STB cross-review (round 2)

Lens: stability, soft-locks, state that breaks its own rules. Read-only; the findings of cmb, enc, vis and uxs were skimmed.

## 1. Votes (findings that touch stability)

| ID | Vote | Why (≤15 words) | Cost/risk to STB area |
|---|---|---|---|
| ENC-01 | +1 ! | Same crash as STB-01; reproduced independently. | None; add the STB-01 probe as its test. |
| ENC-02 | +1 ! | Same crash as STB-16; fix both `pullable` and the removal path. | Fixing only `stepItems` leaves the same-tick window (see §3). |
| ENC-05 | +1 | = STB-06; the `?beat=` restore already exists. | Needs a stage 1 checkpoint event; Continue must read it. |
| ENC-08 | +1 | A one-shot teaching beat silently never runs on Noob. | Tagged spawns must survive the spawn rework. |
| ENC-15 | +1 | Soft stall at stage 1's ending, 35 % of runs. | A tiny "move item off solid prop" helper; no risk. |
| ENC-16 | +1 ! | Can soft-lock the duel when the player is out of ammo. | Re-dropping a gun is the safer fix than new hit rules. |
| ENC-17 | +1 | Scripted damage is a rule the player can't play around. | A `scripted` hit flag; check the stage 2/3 endings still kill. |
| ENC-19 | 0 | Good, but a mid-room checkpoint needs the script position restored. | Depends on STB-08 (reseed) and STB-02 (room rules) first. |
| ENC-03 | 0 | Balance, not mine; it lowers the chance of STB-04/05 windows. | The i-frame must not stop scripted ending kills. |
| CMB-01 | +1 ! | Ctrl+W closing the tab loses the run. | `beforeunload` is cheap; no sim risk. |
| CMB-02 / UXS-04 | +1 | Z/K/L in a release build corrupt a room's state on purpose. | None. |
| CMB-15 | +1 | Silently eaten bullets read as a bug. | Event only. |
| CMB-21 | 0 | Not reproduced: no stall, stuck state or softlock in 40 stage 1 riot runs. | Re-check with the soak's `mortal-gun` bot once the death→restart flow is in the harness. |
| VIS-01 | +1 ! | Permanent pitched-down loops = state that never recovers. | Audio only. |
| VIS-10 | +1 | Time effects stack wrongly; pairs with STB-10/11. | One rule in `FixedClock`/`FeelFx`; test it in `tests/clock.test.ts`. |
| VIS-02 / UXS-02 | +1 ! | Memory climbs per room/death; a long stage 3 run risks a tab kill. | Cache + stop sources; no sim risk. |
| UXS-01 | +1 | = STB-06 / ENC-05. | – |
| UXS-03 | +1 | Lost progress; checkpoint should only move forward. | Combine with the stage 1 beat checkpoints (§3). |
| UXS-05 | +1 | Input leaks out of the pause menu: a jump on "Resume". | Clear edges on close; pairs with STB-07/10. |
| UXS-07 | +1 ! | A stale guest input runs forever: co-op state goes wrong. | Host-side timeout; no sim change. |
| UXS-08 | +1 | Ghost actors on the guest; same root as STB-16. | One `removeActor` that emits `actorRemoved` fixes both. |
| UXS-12 | +1 | Unvalidated saves can resume into a missing room or weapon. | Sanitizer; drop invalid checkpoints. |
| UXS-14 | +1 | = STB-07 (timer runs while paused). Skip-on-key is fine. | Extract `shouldRestart(deadFor, paused)` and test it. |
| UXS-15 | +1 | Blur → pause stops "came back dead". | Must not fire while dead (STB-07). |
| UXS-22 | +1 | A stage registry stops stage 4 missing a case (`LAST_STAGE`, `nextStage`, room lookup). | A prerequisite for M15 stability. |

## 2. Duplicates
- **STB-01 = ENC-01**: vending brute / jetpack hit mid-attack, `stepAttack` throws.
- **STB-16 = ENC-02**: blade stuck in a removed actor, `pullable` throws.
- **STB-06 = ENC-05 = UXS-01**: stage 1 has no checkpoint.
- **STB-07 ⊂ UXS-14**: the death timer runs while paused.
- **STB-15 ⊂ ENC-04 / ENC-03**: the corridor kills on arrival.
- **STB-12/13 ⊂ ENC-07**: spawn couplings and data safety for the spawn rework.
- **CMB-02 = UXS-04**: debug keys in production.
- **VIS-02 = UXS-02**: music re-decode per room.
- **CMB-17 = UXS-10**: rebinding conflicts and late apply.
- **STB-16 / UXS-08**: same root (script splices actors with no removal hook).

## 3. Conflicts
- **ENC-02 vs STB-16:** unsticking in `stepItems` alone still crashes. Scripts remove actors in `seq.step`, before `stepActor` calls `pullable` that same tick. Do the guard in `pullable` **and** a `removeActor()` hook (which also serves UXS-08's `actorRemoved`).
- **ENC-19 (mid-room checkpoints) vs STB-08 / STB-02:** a checkpoint that saves only an entry replays a different room unless the RNG is reseeded per checkpoint and room rules (improbability, flags) are owned by the room. Do STB-02/08 first.
- **ENC-05 / STB-06 vs UXS-03:** stage 1 beat checkpoints add more saves. The forward-only rule must compare (stage, beat/room order), not just the stage.
- **ENC-03 (mercy i-frames) vs scripted kills:** the stage 2/3 endings and the shove kill on purpose. The window must ignore those hits, or STB-05-style stalls come back.
- **UXS-14 "any key restarts" vs UXS-15 blur-pause:** a death followed by blur must hold the timer, not restart on the focus-return click.
- **VIS-10 vs STB-10:** pick one time model: hit-stop in real time, F4 consuming hit-stop ticks, pause freezing `FeelFx`. Land them as one clock change with one test.

## 4. Top 10 overall (smoother, better, more fun)
1. STB-16 + ENC-02: the stuck-blade crash (and a `removeActor` hook).
2. STB-01 + ENC-01: the vending brute crash.
3. CMB-01: Ctrl+W closes the game mid-dive.
4. STB-06 / ENC-05 / UXS-01: stage 1 beat checkpoints.
5. ENC-03: a mercy window so one burst isn't three lives (fixes the corridor spike, STB-15).
6. VIS-02 / UXS-02: music cache, no restart per room, no memory leak.
7. STB-05 + ENC-16 + ENC-15: the ending and duel soft-locks/stalls.
8. STB-02 + STB-03/04/09: room-owned rules and a `resetForRoom` on entry.
9. UXS-05 + UXS-14 + UXS-15 + STB-07: the pause and death flow (no input leak, timer held, blur pauses).
10. UXS-07 + UXS-08: co-op guest input timeout and ghost actors.
