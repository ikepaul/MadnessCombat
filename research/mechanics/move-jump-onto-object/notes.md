# Jump onto objects / high ground

**Category:** player movement · **Seen in:** ep1 1:33.3–1:37.6 (onto the boss's cannon), ep3 0:40.0–0:44.8 (onto the overturned table) · **Confidence:** high

Clips (local only): `clip-1` hero hops onto the cannon and shoots in two directions from the top · `clip-2` hero throws the empty rifle, jumps onto the table, fights from it, jumps down.

## What happens on screen
- Objects in the room (cannon, table, crate) can be stood on. The hero uses them for **height over the body piles and the crowds**, shooting down at enemies entering from both doors.
- Hops down when the wave is done.

## Measured
| Value | Measured | How |
|---|---|---|
| Object heights stood on | cannon ≈ 0.5 H, table ≈ 0.4 H | ep1 f2859, ep3 f1240 |
| Jump-up uses the normal jump | yes | — |

## Game translation
- Room props have a top surface (collision box with a height). A jump lands on the top if the feet clear it. Standing on a prop gives a height offset to the gun origin, so the free-aim ray clears body piles.
- Enemies can't climb onto props (never shown), so props are a "safe-ish" vantage point. Melee enemies wait at the base. Balance with ranged enemies.

## Invented / not shown
- Enemies climbing props (they don't in the show). Kept out.
