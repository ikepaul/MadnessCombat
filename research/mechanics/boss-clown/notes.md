# Clown (recurring mini-boss)

**Category:** boss · **Seen in:** ep2 1:51–1:57 (rifle squad leader), ep3 1:28–1:33 (jetpack + machine gun), ep3 2:06–2:09 (revived as a zombie), ep3 2:38–2:48 (zombie with the street sign, jetpack) · **Confidence:** high

Clips (local only): `clip-1` ep2 arrives with an M16 and a squad, gets disarmed and shot with his own gun · `clip-2` ep3 jetpack + MG vs. human shield, flanks through the door and knocks the hero into the void · `clip-3` ep3 pinned to the marshmallow, lightning turns him into a zombie · `clip-4` ep3 zombie clown with the sign and the jetpack shrugs off rifle fire, gets his sign taken and is finished with a pistol.

## Phases across the episodes
| Ep | Kit | Behaviour | How he dies |
|---|---|---|---|
| 2 | Assault rifle, small squad | walks in shooting (his fire kills a grunt) | hero **steals his rifle** and shoots him |
| 3a | **Jetpack** + belt-fed MG | hovers over the void and sprays the room. When empty he **throws the gun away, flies off screen, reappears behind the player** through a door and shoves him | not killed. Pushes the hero off the edge |
| 3b | Scimitar | drops in from above, lunges | **impaled with the street sign, pinned to the marshmallow** |
| 3c | **Zombie** + jetpack + the street sign | descends, swings the sign from the air (long reach), **absorbs rifle fire** | hero **grabs the sign out of his hands**, knocks him down, finishes him with a pistol |

## Game translation
- Stage 2: elite grunt-boss. Rifle, squad of 3–4. Weak to the disarm-steal (`combat-disarm`). This teaches the steal mechanic.
- Stage 3, fight 1: **flying gunner** pattern: long MG burst (use a human shield or cover), reload = flies off screen, re-enters from a random door behind the player with a shove (telegraph: door opening sound). Survives (scripted).
- Stage 3, fight 2: melee lunge. Counter = long weapon pin (`melee-environment-weapon`).
- Stage 3, fight 3: zombie phase. Bullets barely hurt, the counter is the **disarm-grab on his sign**, then a finisher.

## Episode 4 additions (2026-10-27)
Seen in: ep4 2:04–2:29 and 3:06–3:14 (the DJ). Confidence: high.
- Third role: **non-combatant DJ** on a stage, wearing an iron mask (own design required: the mask is on the do-not-copy list).
- A long-range headshot knocks him down; he **gets back up unhurt** and sends the crowd at the hero (he commands, never attacks).
- The hero ends the crowd fight with the blade at his mask, but the boss's arrival interrupts it; he survives the episode and dances at the end.
- Game: `variant: 'dj'`, immune (hits only knock him down, 1.5 s, invented), triggers the crowd alarm when first hit, ends the stage alive (scripted outro).
