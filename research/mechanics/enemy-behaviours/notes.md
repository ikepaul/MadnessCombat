# Enemy behaviour quirks

**Category:** enemy AI · **Seen in:** ep2 1:05.7 (the target's panicked shot kills his own guard), ep2 1:51 (the clown's fire kills a grunt), ep2 3:27–3:31 (guards in cover), ep3 3:13 (grunt grabs the hero's empty gun), ep2 2:16 / ep3 2:40 (sweating = fear) · **Confidence:** high

Clips (local only): `clip-1` friendly fire · `clip-2` cover + return fire · `clip-3` an enemy uses the hero's discarded gun and finds it empty.

## Observed behaviours
- **Friendly fire**: enemy bullets kill other enemies in the line of fire (twice in ep2, wiki counts grunts killed by the target and by the clown).
- **Use cover / make cover** (see `combat-cover`).
- **Pick up weapons** off the floor, including ones the hero threw away (which may be empty).
- **Throw knives** at range.
- **Fear**: a grunt sweats before being killed. The target sweats and surrenders when cornered.
- **Ambush from behind**: lifts and back doors open behind the hero.

## Game translation
- Hitscan rays from enemies hit whatever is first along the ray, including other enemies. Free friendly fire = emergent kills and a reason to position enemies in a line.
- Floor-weapon scavenging (≤ 2 H radius) when unarmed.
- Morale (invented, light): when the last 1–2 enemies of a wave are alone, they may sweat and back off. Purely cosmetic in the first milestone.
