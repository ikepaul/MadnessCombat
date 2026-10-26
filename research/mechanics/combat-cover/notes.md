# Cover (both sides)

**Category:** combat · **Seen in:** ep2 0:37.7–0:42 (hero behind the rooftop box), ep2 3:27.7–3:31.6 (guards dug in behind a crate facing the lift), ep2 3:51 (target dives behind his desk), ep3 0:39–0:41 (grunt flips the table on its side for cover) · **Confidence:** high

Clips (local only): `clip-1` hero slips behind the box and leans out to headshot the guards · `clip-2` guards behind a crate return fire at the lift, the hero flanks through the vent · `clip-3` grunt kicks the table over and hides behind it.

## What happens on screen
- Waist-high objects block bullets. Characters crouch behind them and **lean out to shoot**.
- Enemies use cover too, and one **creates cover by flipping a table**.
- Cover is beaten by flanking (vent), by height (standing on the table), or by explosives.

## Game translation
- Props can be `cover` (blocks rays below its height). Crouching behind cover hides the body entirely. Leaning out to shoot exposes the head and arm.
- Free aim + depth: cover blocks rays that pass through its screen-space box at a depth in front of the target (cover only protects if it's between the shooter and the target in z, as well as in x/y).
- Enemy AI: ranged grunts look for the nearest cover facing the player on entering a room. One in four can flip a table into cover (invented rate).
- Counters: grenades, jumping onto props, flanking entrances (vents).
