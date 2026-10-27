# Halo boss (the "savior" necromancer)

**Category:** boss · **Seen in:** all three episodes · **Confidence:** high

Clips (local only):
`clip-1` ep1 descends from above, first lightning raise ·
`clip-2` ep1 cross shield blocks the SMG, lightning knocks the hero down and disarms him ·
`clip-3` ep1 hover dash, grab, repeated body slams, throw ·
`clip-4` ep1 sweeps the corpses aside, summons a cannon, cannon volleys, dies to a prone shot ·
`clip-5` ep2 telekinetic fling across the room, mass zombie raise ·
`clip-6` ep3 shots don't stop him, blasts the hero through the wall ·
`clip-7` ep3 sword dive, shot, teleports away.

## Move list (by episode)
| Move | Ep | What it does | Measured |
|---|---|---|---|
| Descend / fly in | 1, 3 | floats down from above with a shadow, or flies in through a hole in the wall | — |
| **Lightning raise** | 1, 3 | bolt from the hand to one corpse → zombie | bolt 2 f, rise ≈ 1.0 s |
| **Mass raise** | 2, 3 | raises every intact corpse in the room at once | all rise within ≈ 1 s |
| **Cross shield** | 1 | summons a cross-shaped barrier in front of himself that stops bullets | up ≈ 1 s |
| **Lightning strike** | 1 | bolt at the player: knockdown + weapon drop | — |
| **Hover dash** | 1 | glides across ≈ 2 H in ≈ 0.27 s to grab | ≈ 7 H/s |
| **Grab & body slam** | 1 | lifts the player overhead and slams him into the ground repeatedly, then throws him | ≈ 5–6 slams, one per ≈ 0.5–0.67 s |
| **Telekinetic push** | 1, 2 | sweeps corpses away (ep1). Flings the player across the room into the wall (ep2) | ≈ 3.6 H in ≈ 0.33 s, pinned ≈ 0.25 s, total ≈ 0.9 s |
| **Summon cannon** | 1 | a cannon falls from the sky (shadow first), he fires it | ball ≈ 26 H/s, one shot per ≈ 1.3 s, ≈ 4 shots |
| **Bullet sponge** | 3 | shots leave wounds but don't stop him | — |
| **Wall blast** | 3 | knocks the hero through a wall into the next room | — |
| **Sword dive** | 3 | draws a sword and dives at the hero | — |
| **Teleport** | 3 | fades out when hurt enough | — |
| **Stalking** | 2, 3 | appears behind the hero between rooms, finally ambushes him from behind (gunshot in ep2, sword in ep3) | — |
| **Death** | 1, 3 | one headshot when his shield is down (ep1 prone shot, ep3 shotgun over the shoulder) | — |

## Game translation
- A **recurring boss with phases per stage**, mirroring the episodes:
  - **Stage 1 fight**: shield (blocks fire from the front for ~1 s, then a window), raise 1–2 zombies at a time, lightning knockdown, hover-dash grab (button mash to shorten the slams, invented), cannon phase (jump/prone to dodge, shoot from below the shield). Dies to headshots when the shield is down.
  - **Stage 2**: not fought. Interrupts the clown fight with a push + mass raise, then leaves. Kills the player in the ending cutscene.
  - **Stage 3**: invulnerable encounters (raise, wall-blast transition), a sword-dive duel where damaging him makes him teleport, then the final scripted ambush (`world-last-stand`).
- Corpse management is the counterplay: fewer intact corpses = fewer zombies.
- Telegraphs: raised hand + crackle before every lightning, shadow before every drop, loading animation before the cannon.

## Invented / not shown
- HP values, phase thresholds, shield uptime pattern, mash-out mechanic.

## Episode 4 additions (2026-10-27)
Seen in: ep4 2:29–3:05. Confidence: high (frames + wiki).
- Enters by **smashing a door in** (the door slab flies and crushes whoever is behind it).
- Arrives with a lieutenant: an **armed zombie agent** (rifle).
- **Mass raise of the whole room**: flame-like flickers run over the carpet of corpses and ≈ 19 stand up within ≈ 1 s (ep2 raised ≈ 8). Stays out of the horde fight.
- Duel: **sword in one hand, big pistol in the other** (blade clash, then point-blank shots). Dies with the hero in the detonator blast.
- Wears dark glasses here (own design: give our boss a different accessory if we want a stage-4 look change).
- Game: raise cap 19 (performance), sword + pistol "dual" act in the boss state machine, door-smash entrance reusing `world-destructible`.
