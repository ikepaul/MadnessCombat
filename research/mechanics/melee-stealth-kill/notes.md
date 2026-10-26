# Stealth kill (takedown from behind / above)

**Category:** melee / stealth · **Seen in:** ep2 0:14.5–0:18 (fiber-wire strangle), ep2 0:52–0:53.7 (quiet kill at the roof door), ep3 0:20.5–0:24 (dual-knife drop from the vent) · **Confidence:** high

Clips (local only): `clip-1` ep2 wire strangle from behind, the gun drops · `clip-2` ep3 drop from the vent, dual knife stab.

## What happens on screen
- Unaware guards (smoking, patrolling, facing away) are killed silently from behind or from above. Nobody nearby reacts.
- The victim drops whatever they're holding.
- ep2 adds dragging the body to a manhole and hiding it (not needed for the decided design).

## Measured
| Value | Measured | How |
|---|---|---|
| Wire strangle | ≈ 3 s from grab to drop | ep2 f440–f530 |
| Knife drop kill | ≈ 0.6 s from landing | ep3 f620–f640 |

## Game translation (decided: contextual takedowns)
- Enemies have `unaware` / `alert` states. Unaware enemies idle, smoke or patrol and face a fixed direction.
- They become alert on: seeing the player in front of them (simple facing check + range), an **unsuppressed** gunshot or explosion in the room, or a nearby enemy dying loudly.
- Takedown prompt when behind (or landing on top of) an unaware enemy: instant silent kill (≈ 0.6 s animation). Wire variant (slower, 1.5 s, invented shortening of 3 s) if unarmed.
- Suppressed pistol kills don't alert (see `gun-pistol-suppressed`).

## Invented / not shown
- Alert radius numbers, body hiding (skipped by decision).
