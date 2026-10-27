# Knockdown & get-up

**Category:** player movement / hit reaction · **Seen in:** ep1 0:17.2–0:19.4 (punch), ep1 0:57.4–1:01.5 (lightning), ep1 1:10.3 (thrown by boss), ep3 3:04.3 (blasted through wall) · **Confidence:** high

Clips (local only): `clip-1` punched by the boombox guy and gets up · `clip-2` boss lightning knocks the hero flat, weapon flies out of his hand.

## What happens on screen
- Heavy hits launch the victim **backwards, horizontally, roughly head height**, then they land flat on their back.
- Getting knocked down **drops the held weapon**: it flies off and lands on the floor (ep1 f1739).
- The hero gets up on his own after a short pause. A kip-up/roll is used after going prone voluntarily (ep1 f2505–f2515).
- While down, enemies walk up to him. The boss can grab him off the floor.

## Measured
| Value | Measured | How |
|---|---|---|
| Knockback distance (punch) | ≈ 1.5 H (≈ 420 px) | f519→f536 |
| Knockback duration (airborne) | ≈ 0.35–0.4 s (11–12 f) | f519→f530 |
| Lying still | ≈ 0.2 s | f536→f542 |
| Get up (flat → standing) | ≈ 0.4 s (12 f) | f542→f554 |
| Total punch → controllable | ≈ 1.1 s | f519→f554 |

## Game translation
- `Knockdown` state on heavy hits: launch velocity ≈ 4 H/s back + small upward arc, land, lie 0.2 s, get up 0.4 s. The player can't act until fully standing, but keeps i-frames during the get-up (invented, so a crowd can't juggle them).
- Any knockdown makes the current weapon drop as a physical pickup ~0.5–1 H away.
- Mashing input during the lie phase could shorten it (invented, optional).

## Invented / not shown
- I-frames during get-up, mash-to-recover.
- Which hits cause knockdown versus flinch: proposal = punches from bosses/brutes, explosions, thrown bodies, lightning and telekinesis knock down; grunt punches only flinch.

## Episode 4 additions (2026-10-27)
Seen in: ep4 2:56.9–2:59.6. Confidence: medium.
- **Acting from the ground**: downed by a bullet, the hero swings his sword from the floor and kills the enemy standing over him, then gets up.
- Game (invented): while the hero lies down (knockdown or prone), LMB with a melee weapon is a low sweep-slash at feet height, and guns fire as from prone. Generalises the ep1 prone shot.
