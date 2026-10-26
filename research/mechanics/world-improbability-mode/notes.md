# Improbability mode (physics modifier)

**Category:** world / stage modifier · **Seen in:** ep3 1:18.3–1:24 (and the surreal street until ≈ 2:00) · **Confidence:** high (measured)

Clips (local only): `clip-1` after the button is pressed, a punched grunt flies across the room, bounces off the wall and the ceiling, more grunts fly in uncontrollably, one gets stuck head-first in the ceiling.

## What happens on screen
- A switch (pressed by the target in a cutscene) changes the rules: hits send bodies flying absurdly far with **elastic bounces off walls and the ceiling**.
- Enemies enter flying, out of control. One ends up **embedded in the ceiling**.
- Afterwards the room splits in half and falls away. The next area has surreal stuff falling from the sky (marshmallow, whales) and the sun comes alive.

## Measured
| Value | Measured | How |
|---|---|---|
| Punch knockback speed | ≈ 2500 px/s ≈ 9 H/s (vs. ≈ 4 H/s normal) | f2385→f2404 |
| Bounces | floor → right wall → ceiling → back down within ≈ 0.67 s | f2386–f2404 |
| Path length | ≈ 1500 px (≈ 5.5 H) | — |

## Game translation
- A global `physicsMode` with knockback ×2.5, wall/ceiling restitution 0.8 (normal mode: bodies stop dead on walls), and a chance (10%, invented) for a body hitting the ceiling at speed to stick.
- Flying bodies are projectiles that knock down whatever they hit (so the mode is chaotic but fun).
- Active from the button cutscene until the end of the street section of stage 3.
