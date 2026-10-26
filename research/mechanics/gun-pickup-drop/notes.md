# Weapon pickup & dropped weapons

**Category:** guns / items · **Seen in:** everywhere. ep3 0:26.6–0:28.2 (picks up the guard's rifle and looks at it), ep2 1:06.5–1:09 (grabs batons and guns off the floor) · **Confidence:** high

Clips (local only): `clip-1` ep3 hero picks up the dead guard's rifle · `clip-2` ep2 knocks a baton away and grabs weapons from the floor.

## What happens on screen
- **Every weapon an enemy dies with drops to the floor and stays there** for the rest of the room.
- The hero (and enemies, ep3 f1040 axe) pick weapons up from the floor in one motion.
- The hero swaps weapons constantly. He rarely keeps one for more than a few kills.
- Weapons can come from nowhere (ep1 M-10 and grenade are just drawn). The intro stealth loadouts (wire, suppressed pistol, two knives) are carried.

## Game translation
- Weapons are world objects. Walk over + press `pick up` (or auto-pickup when your hands are empty, proposal). Max 2 hands.
- Corpses drop their weapon with a little physics bounce.
- Enemies without a weapon walk to the nearest floor weapon if one is closer than ~2 H (invented, based on the ep3 axe grab).
- Starting loadout per stage, mirroring the episode: ep1 nothing (grenade + SMG appear mid-stage as scripted pickups), ep2 wire + suppressed pistol, ep3 two knives.
