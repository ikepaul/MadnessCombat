# Grunt variants (armed)

**Category:** enemy · **Seen in:** ep2 (baton, pistol, SMG, shotgun, rifle, knife/sword), ep3 (axe, bat, pipe, scimitar, knife, all guns) · **Confidence:** high

Clips (local only): `clip-1` ep2 office: waves of baton and pistol grunts from both doors · `clip-2` ep3 street: two groups ambush from both sides with axes, bats, swords.

## Variants seen in eps 1–3
| Variant | First seen | Behaviour |
|---|---|---|
| Unarmed | ep1 | punches |
| Baton | ep2 | fast short melee (police-like guards) |
| Knife / sword / scimitar | ep2 | melee with reach, can throw knives (ep3) |
| Axe / bat / pipe | ep3 | slow heavy melee |
| Pistol | ep2 | stands and shoots, uses cover |
| SMG | ep2 | bursts. Rooftop guards, ceiling gunner in the elevator |
| Shotgun | ep2 | close range |
| Rifle | ep2/3 | doorway shooters |

## Game translation
- One `Grunt` class with a weapon slot. Behaviour comes from the weapon: melee → close in; ranged → keep 3–5 H distance, find cover, shoot at 0.6–1.2 s intervals with an aim delay of ~0.4 s (invented: gives the player a reaction window, since bullets are hitscan).
- **Telegraph before firing**: enemy raises the gun, then fires after the aim delay. This replaces dodging bullets (impossible with hitscan) with "break line of sight / kill first".
- Every grunt drops its weapon on death (`gun-pickup-drop`).
