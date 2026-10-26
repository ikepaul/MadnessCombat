# Out of ammo → throw the gun

**Category:** guns / throwing · **Seen in:** ep3 0:40–0:41.6 (rifle runs dry, thrown at the last grunt), ep3 1:46.4–1:47.9 (empty SMG thrown away, new one picked up), ep3 3:13–3:15 (Desert Eagle thrown at a grunt), ep3 1:30.5 (clown tosses his empty MG) · **Confidence:** high

Clips (local only): `clip-1` rifle runs dry mid-wave, thrown at a grunt, hero jumps onto the table · `clip-2` empty SMG spun away and swapped.

## What happens on screen
- When a gun runs out the hero **throws it** (spinning) at the nearest enemy. The throw knocks the target down or kills him.
- Then picks up the next weapon from the floor/corpses.
- Enemies do it too (clown).
- An enemy that picks up the hero's discarded gun finds it **empty** (dry click) (ep3 f5800).

## Game translation
- Every gun has a `thrown` attack: spins toward the aim point, knocks down the first enemy hit (kills a grunt if it hits the head, invented).
- Empty guns stay empty: if an enemy grabs a dropped empty gun, it clicks. This is a direct copy of the ep3 gag and a nice AI behaviour.
- Pressing fire with an empty gun → 1 dry click, then the next press auto-throws (proposal) so the loop stays fast.
