# Punch & knockback

**Category:** melee · **Seen in:** ep1 0:21–0:43 (whole unarmed brawl), ep2 1:48–1:51 (uppercut launch), ep3 1:20 (improbability version) · **Confidence:** high

Clips (local only): `clip-1` ep1 unarmed grunts walk in from both sides, the hero punches them away · `clip-2` ep2 punch launches a grunt into the air.

## What happens on screen
- Unarmed combat is **punches traded at arm's length**. The hero punches, the enemy reels back or drops. Enemies punch back at the same range.
- A clean punch on a grunt usually **kills or drops** him outright. The body flies back and lands flat.
- Some punches **launch upward** (an uppercut): the victim goes ~1 H into the air before dropping (ep2 f3310, ep3 f1890).
- Impact is shown with a small white star on the hit spot. In ep2+ there's also red blood.

## Measured
| Value | Measured | How |
|---|---|---|
| Punch range | ≈ 0.5–0.6 H (arm's length, fists touching faces) | ep1 f520 |
| Knockback (punch) | ≈ 1.5 H back, ≈ 0.4 s airtime | ep1 f519→f536 |
| Uppercut launch | ≈ 1 H up | ep2 f3310 |
| Punch exchange cadence | ≈ 2–3 punches per second in a brawl | ep1 f770–f870 |

## Game translation
- `Light punch` (fast, ~0.15 s startup + 0.1 s active + 0.15 s recovery, invented split of the ≈ 0.35–0.5 s cycle seen) and `heavy punch / uppercut` (slower, launches).
- Damage model (decided): grunts die from 1 heavy hit or 2 light hits (invented split). The player survives ~3 hits.
- Knockback launches bodies as physics objects that **stay in the room as corpses** (see `world-persistence-decals`).
- Depth: punches only connect within a depth band of ±0.2 H (invented) so you have to line up, as in any beat-'em-up.

## Invented / not shown
- Exact startup/active/recovery split (only the overall cycle is measurable), light vs. heavy split, combo strings.
