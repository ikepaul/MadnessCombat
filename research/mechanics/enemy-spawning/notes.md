# How enemies enter a room

**Category:** enemy / level design · **Seen in:** ep1 (from both screen edges), ep2 (doors on both sides, lifts, the elevator roof, through a cut hole), ep3 (doors, dropping from above into the walled box, flying in) · **Confidence:** high

Clips (local only): `clip-1` ep2 grunts drop one by one through the elevator roof · `clip-2` ep2 lift doors open with reinforcements · `clip-3` ep3 grunts drop into the sealed arena from above.

## Entry types
| Entry | Seen | Note |
|---|---|---|
| Screen edge (walk in) | ep1 | open-air rooms |
| Door (left/right/back) | ep2, ep3 | the standard |
| Lift doors | ep2 | behind the player, surprise |
| Drop from above (roof hole, open top) | ep2, ep3 | shadow telegraph |
| Fly in (jetpack, halo boss) | ep3 | bosses |
| Corpses rising | eps 1–3 | zombies (see `enemy-zombie`) |

## Game translation
- Each room defines **spawn points** with an entry type, plus a **wave script**: list of (delay, spawn point, enemy type, weapon). Waves trickle (1–2 at a time, 0.5–1.5 s apart), the next wave starts when the alive count drops below a threshold.
- Doors open visibly (≈ 0.3 s) before an enemy steps through. That's the telegraph.
- Enemy counts per stage follow the wiki body counts (ep1 32, ep2 86, ep3 91) as an upper bound. See `../../stages.md`.
