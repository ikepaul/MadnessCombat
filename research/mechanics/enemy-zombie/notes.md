# Zombie (raised corpse)

**Category:** enemy · **Seen in:** ep1 0:49.5–1:05 (2 zombies), ep2 1:59–2:06 (8 zombies, mass raise), ep3 2:52–3:00 (≈5) and 3:16–3:20 (2) · **Confidence:** high (measured)

Clips (local only): `clip-1` ep1 lightning hits a corpse, it turns green, sits up, walks to the hero · `clip-2` ep2 mass raise, horde shot with the rifle.

## What happens on screen
- **Only the halo boss creates zombies**: a lightning bolt (or a raised hand for a mass raise) turns corpses green and they get up.
- Zombies are **tougher**: 2–4 bullets each, survive having their head knocked off, need a lot of hits.
- They walk slowly toward the hero in a **tight cluster** and fight in melee (also with weapons: ep3 zombie clown with the street sign).
- Zombie kills show in **green** on the ep3 kill counter.
- Not every corpse is raised: ep2 explicitly skips the clown.

## Measured
| Value | Measured | How |
|---|---|---|
| Bolt → standing | **≈ 1.0 s** | ep1 f1485→f1520 |
| Walk | ≈ 0.7–0.9 H/s | f1525→f1555 |
| Bullets to kill | 2–4 (ep2 rifle), several (ep3 Tec-9, pistol) | ep2 f3690–f3780 |
| Axe hits to kill | 1–3 | ep3 f5220–f5390 |

## Game translation
- **Corpses are a resource for the boss**: every grunt you kill can come back. That makes gibbing/blowing up corpses (`throw-grenade`) meaningful.
- Zombie: HP ≈ 3 bullet hits, ignores decapitation (keeps going headless, invented: until 1 more hit), melee only (or the weapon it had), walk 0.8 H/s, no knockdown from light hits.
- Raise rule: the boss targets intact corpses only. Gibbed/decapitated-and-destroyed corpses can't rise.

## Episode 4 additions (2026-10-27)
Seen in: ep4 2:31–3:00. Confidence: high.
- **Armed zombies**: the zombie agent carries and fires a rifle (bursts). Raised grunts stay unarmed.
- New zombie look in the show (exposed jaw): ours keeps its own design.
- Raised horde of ≈ 19 in one room; they go down to pistol shots and sword hits like before (1–3 hits).
- Game: a raised corpse that held a gun keeps it (`SpawnOpts.variant: 'zombie'` + weapon), with the zombie damage rules and the gun-grunt aim telegraph (slower: 0.6 s, invented).
