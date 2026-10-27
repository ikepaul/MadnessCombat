# Stairs (sloped floor between levels)

**Category:** movement · **Seen in:** ep4 1:52.8–2:01 · **Confidence:** high

Clips (local only): `clip-1` the stairwell: a diagonal staircase from a landing on the right down to the lower floor on the left; grunts come up, a shot grunt tumbles down; the camera pans down.

## What happens on screen
- The room is split: a raised landing (top right, the entry door) and a staircase going down-left at ≈ 40°. (Re-measured from the clip:) the hero holds the landing and shoots down at grunts climbing up; he only goes down once they are dead.
- A grunt shot on the stairs **tumbles down several steps** and ends at the bottom.
- The camera pans down to follow: the first vertical camera move in ep1–4 apart from the elevator shaft.

## Measured
| Value | Measured | How |
|---|---|---|
| Staircase drop | ≈ 2 H over ≈ 3 H horizontal | 113.6 s frame |
| A shot body tumbling down | ≈ 1 H in ≈ 0.25 s (f3426 → f3432) ≈ 4 H/s | frames-1 (re-measured from the clip) |

## Game translation
- A room feature `stairs: { x0, x1, y0, y1, z band }`: inside its x/z band the floor height is a ramp. Actors' height follows it (no jump needed); jump and prone work as on flat floor.
- Aim across heights already works (hitscan is screen-space).
- Bodies that die on the stairs **slide/tumble to the bottom** (≈ 4 H/s, measured) before freezing into the corpse layer.
- Camera: the room is taller than the screen, so the camera pans vertically with the player (`project()` gets a vertical offset; rooms so far are one screen).

## Invented / not shown
- Grenades rolling down the stairs (cheap to add).
