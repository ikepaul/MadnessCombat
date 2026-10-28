# UXS + TEC cross-review

## 1. Votes on findings that touch UX, perf, net or code health

| ID | Vote | Why (≤15 words) | Cost/risk to my area |
|---|---|---|---|
| STB-16 | +1 ! | A crash. One `removeActor` also fixes the co-op ghosts (UXS-08). | Code health: one removal path, so the guest can prune too. |
| STB-01 / ENC-01 | +1 ! | A crash; one fix. | None. |
| STB-02 | +1 ! | A restart must give back the same rules; checkpoints are the shell's promise. | Store room flags with the checkpoint (progress.ts). |
| STB-03 | +1 | A cooked grenade carrying into the next room breaks the room boundary. | None. |
| STB-04 | +1 | A death on the exit must restart the room, not revive him. | Co-op: touches revive (M18). |
| STB-05 | +1 ! | A softlock at the game's ending. | None. |
| STB-06 / ENC-05 | +1 ! | Same as UXS-01. | S; Continue in stage 1 starts working too. |
| STB-07 | +1 | Same as part of UXS-14. | None. |
| STB-08 | +1 | Reproducible checkpoints; needed for checkpoints per beat and mid-room. | Every seeded test changes once; determinism still holds. |
| STB-10 | +1 | `pausedByMenu` separate from the debug pause; needed once debug keys are gated. | None. |
| STB-11 | +1 | Run feelFx on clock time when the menu pauses. | Pairs with UXS-05 (input while paused). |
| STB-12 | +1 | Validate wave data at load, not mid-room. | A test, no runtime cost. |
| STB-14 | 0 | Real, but fallbacks are LVL design; each needs a hint. | UX: needs prompt/caption copy. |
| CMB-01 | +1 ! | Ctrl+W closing the tab mid-room is the worst shell bug. | Changes the default keys, captions (UXS-10) and the C alias. |
| CMB-02 | +1 ! | Same as UXS-04. | S. |
| CMB-08 | +1 | Buffered inputs feel smoother. | Net: the guest's edges also need buffering on the host. Clear the buffer on pause (UXS-05). |
| CMB-09 | +1 | A cheap feel win. | None. |
| CMB-10 | +1 | Dropped clicks read as lag. | None. |
| CMB-16 | +1 | Same verb family as CMB-08; do them together. | None. |
| CMB-17 | +1 | Same as UXS-10. | S. |
| ENC-03 | +1 | Fixes most "unfair" deaths; it also cuts restarts. | Last-stand/kill-cam scripts that set hp to 1: check the HUD pips. |
| ENC-13 / ENC-20 | +1 | Captions must use the bound keys (UXS-10 helper). | Copy only. |
| ENC-18 | +1 | Dead time hurts pacing as much as restarts do. | None. |
| ENC-19 | +1 | A mid-room checkpoint API generalises UXS-01. | Progress schema: entry = script mark; do UXS-12's versioning first. |
| ENC-21 | +1 | "Where to go" is a HUD gap; reuse the stageHud tracker. | UI: one more prompt layer, a small render cost. |
| ENC-22 | 0 | A difficulty rethink is a decision, not polish. | Settings UI. |
| VIS-01 | +1 ! | Slowed audio forever is broken; the fix is small. | None. |
| VIS-02 | +1 ! | Same as UXS-02. Merge, and add stopping the old sources. | S; a memory win. |
| VIS-03 | +1 | Music dropping out on a one-stem track; fix it with VIS-02. | None. |
| VIS-04 | +1 | Same goal as UXS-17; do both under reduced motion. | None. |
| VIS-05 | 0 | Right, but an M-sized re-sort of particles into the draw list. | Perf: more items in the per-frame sort (UXS-19). |
| VIS-08 | +1 | The co-op down/revive sound helps the shell's co-op clarity. | None. |
| VIS-10 | +1 | Freezes ×3.3 read as hitches. | None. |
| VIS-14 | 0 | Nice to have; more looping voices. | Audio memory: decode once (UXS-02 pattern). |
| VIS-23 | +1 | The voice pool must count delayed sounds. | None. |

## 2. Duplicates
- **The stage 1 checkpoint** (do once): UXS-01, STB-06, ENC-05; ENC-19 generalises it into the mid-room API. Build the API once and use it for the stage 1 beats and the corridor and desert.
- **Debug keys in production:** UXS-04 and CMB-02.
- **Music re-decode:** UXS-02 and VIS-02 (plus VIS-03, same file). UXS-02 adds the source leak and the 48 MB ship size.
- **The death timer running while paused:** UXS-14 (part) and STB-07.
- **Rebinding and captions:** UXS-10, CMB-17, ENC-13, ENC-20 (key names in captions).
- **Reduced motion / flashes:** UXS-17 and VIS-04.
- **The pause menu's leaks:** UXS-05 (input), STB-10 (clock flag), STB-11 (feel FX). One "menu pauses everything" slice.
- **Script removals:** STB-16 and ENC-02 (the crash), UXS-08 (the guest ghost). One `removeActor()` fixes all three.
- **Crashes:** STB-01 and ENC-01 are the same crash.

## 3. Conflicts
- **CMB-01 (C as the default dive) vs UXS-10 (drop the C alias) and the "Ctrl into him" caption:** fine together if C becomes the default and Ctrl is an opt-in binding. The captions then must come from the key helper, or they go stale at once.
- **CMB-08 / CMB-09 input buffers vs UXS-05:** a longer buffer makes the pause-menu leak worse (a Space pressed in the menu would also be buffered). The pause must clear both the latches and the buffer. In co-op the host buffers the guest's edges; check that this works with `mergeEdges`.
- **STB-08 reseeding per room vs probes and tests:** every seeded outcome (balance tests, the soak, my snapshot sizes) shifts once. Land STB-08 first in M14b, then re-baseline.
- **ENC-19 / UXS-01 checkpoints vs UXS-03 (Continue only moves forward):** with more checkpoint kinds, "forward" needs an order key (stage, room index, beat index). Define it once in progress.ts together with UXS-12's version field.
- **ENC-03 mercy window vs scripts that need one hit** (the stage 2 ending, the last stand): exempt scripted lethal hits, or the ending softlocks (an STB-05-type risk).
- **VIS-05 (particles into the depth sort) vs UXS-19 (lighter draw list):** do UXS-19's reusable list first, then particles join it without closures.

## 4. Top 10 overall (smoother, better, more fun)
1. **STB-16 + STB-01 (ENC-01/02):** the crashes, through one `removeActor` path (this also fixes UXS-08).
2. **CMB-01:** Ctrl+W closes the tab; C as the default dive, plus a `beforeunload` confirm.
3. **UXS-01 / STB-06 / ENC-05 (+ ENC-19 API, STB-08 reseed):** reproducible checkpoints, per stage 1 beat and mid-room.
4. **ENC-03:** a mercy window; the biggest single fairness win.
5. **UXS-02 / VIS-02 / VIS-03:** music decoded once, keeps playing across rooms, no leak, OGG.
6. **UXS-04 / CMB-02:** debug keys gated behind `?debug`.
7. **CMB-08 + CMB-09 + CMB-16:** input buffer, coyote time, buffer slots. The controls feel tighter.
8. **UXS-05 + STB-10 + STB-11:** the pause menu pauses everything and leaks nothing.
9. **ENC-04 / STB-15 / CMB-06:** flatten the difficulty spikes (the corridor) and close the jab stun-lock.
10. **VIS-06 + VIS-07 (+ VIS-24 speed lines):** remove the corpse and throw pops, the most visible polish.
