# Stairs (sloped floor between levels)

**Category:** movement · **Seen in:** ep4 1:52.8–2:01 · **Confidence:** high

Clips (local only): `clip-1` the stairwell: a diagonal staircase from a landing on the right down to the lower floor on the left; grunts come up, a shot grunt tumbles down; the camera pans down.

## What happens on screen
- The room is split: a raised landing (top right, the entry door) and a staircase going down-left at ≈ 40°. The hero walks down it while shooting grunts coming up.
- A grunt shot on the stairs **tumbles down several steps** and ends at the bottom.
- The camera pans down to follow: the first vertical camera move in ep1–4 apart from the elevator shaft.

## Measured
| Value | Measured | How |
|---|---|---|
| Staircase drop | ≈ 2 H over ≈ 3 H horizontal | 113.6 s frame |
| Descent time | ≈ 6 s, fighting | 113 → 119 s |

## Game translation
- A room feature `stairs: { x0, x1, y0, y1, z band }`: inside its x/z band the floor height is a ramp. Actors' height follows it (no jump needed); jump and prone work as on flat floor.
- Aim across heights already works (hitscan is screen-space).
- Bodies that die on the stairs **slide/tumble to the bottom** (≈ 2 H/s, invented) before freezing into the corpse layer.
- Camera: the room is taller than the screen, so the camera pans vertically with the player (`project()` gets a vertical offset; rooms so far are one screen).

## Invented / not shown
- Grenades rolling down the stairs (cheap to add).
