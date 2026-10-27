# Frag grenade

**Category:** throwing / explosives · **Seen in:** ep1 0:44.5–0:48 (lobbed onto the body pile), ep2 1:03 (dropped at his feet to blow through the roof), ep2 2:31–2:36 (thrown back up through the elevator roof) · **Confidence:** high (measured)

Clips (local only): `clip-1` pin pulled (pin falls on the ground), lob onto the pile, explosion, bodies fly, scorch mark.

## What happens on screen
- Pull pin (the pin drops and stays on the floor) → lob in a low arc → lands and rolls a bit → explodes.
- Explosion: big starburst, **bodies and limbs fly 1.5 H up and around**, dark **scorch decal** stays on the floor/ceiling.
- Used to clear corpses (so they can't be raised), to blow a hole through a floor (breach), and against groups.

## Measured
| Value | Measured | How |
|---|---|---|
| Pin pull → throw | ≈ 0.35 s | f1360→f1370 |
| Throw distance | ≈ 1.4 H, low arc | f1370→f1380 |
| Fuse after release | **≈ 0.75 s (22 f)** | f1370→f1392 (ep2's enemy grenade burns ≈ 1.3 s, see `throw-grenade-return`) |
| Blast radius | ≈ 2 H (all bodies within ~540 px thrown) | f1392–f1404 |
| Debris airtime | ≈ 0.5 s | f1396–f1408 |

## Game translation
- Hold to cook (pin pulled), release to throw toward the cursor. Fuse **1.1 s** from pin pull (between the measured 0.75 s and 1.3 s; holding = cooking, invented). Throw strength scales with cursor distance, max ≈ 4 H (invented, the show only shows short lobs).
- Blast radius 2 H: kills everything inside, gibs corpses (they can't be zombified any more), leaves a scorch decal.
- Can destroy marked floor/ceiling tiles (see `world-breach`).

## Playtest change (2026-10-27)
The user asked for longer throws and a longer fuse, so grenades can be cooked with room to spare and an enemy's grenade can be picked up (F) and thrown back. Fuse 1.1 s -> 2.5 s from the pin (enemies cook 0.35 s and the lob flies ~0.7 s, leaving ~1.5 s after it lands). The hero's lob reaches 7 H (about a room's width); enemies keep 4 H. Both invented, in `src/data/melee.ts`.
