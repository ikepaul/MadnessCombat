# Persistence: corpses, weapons, blood, decals

**Category:** world · **Seen in:** every episode. ep2 1:20.7–1:23.8 (bullet holes on the walls), ep3 2:37–2:39 (blood pool floods the floor) · **Confidence:** high

Clips (local only): `clip-1` ep2 misses leave bullet holes on the walls · `clip-2` ep3 a headshot sprays an arc of blood that pools across the whole floor.

## What happens on screen
Nothing disappears during a room:
- **Corpses** stay where they fall and pile up (they get stood on, thrown, blown up, raised as zombies).
- **Weapons, magazines, grenade pins, shell casings** stay on the floor.
- **Blood**: spray on the wall behind hits, red wound "stars" on bodies, pools under corpses (ep2+; ep1 has no blood).
- **Decals**: bullet holes on walls/floor/ceiling, scorch marks from grenades, holes blown in floors/walls.
- The ep3 kill counter shows exactly how many corpses are in play.

## Game translation
- Corpses are lightweight physics bodies that settle and then freeze (cheap). They have a `raisable` flag and gib state.
- Decal layer per room surface (wall, floor, ceiling) that only grows during the room. Cap total decals per room for performance (invented: 500).
- Our own visual style for blood/impacts. The *system* (everything stays) is what gives the Madness feel.
