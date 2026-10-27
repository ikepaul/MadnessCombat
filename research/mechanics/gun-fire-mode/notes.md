# Fire-mode selector (semi → full auto)

**Category:** guns · **Seen in:** ep4 0:59.1–1:02 · **Confidence:** high (clear close-up)

Clips (local only): `clip-1` close-up of a thumb flipping a rifle's selector through three marked positions, then a full-auto burst.

## What happens on screen
- After picking a rifle off the pile, the hero flips the selector from safe through semi to full auto before firing. The close-up lasts ≈ 2 s; the next wide shot is a long burst.

## Measured
| Value | Measured | How |
|---|---|---|
| Close-up length | ≈ 2.2 s (59.4 → 61.6 s) | contact sheet |

## Game translation
- Rifles that support it (AK-class first) get `modes: ['semi', 'auto']` in `src/data/weapons.ts`. Picked-up rifles start in **semi**.
- Input (decide in M14): **R with a full magazine** cycles the mode, R with a partial one reloads as now; or a dedicated key (B).
- Semi: one shot per click, tighter spread (invented −30%). Auto: the existing full-auto behaviour.
- The first switch in a stage shows a 0.6 s picture-in-picture close-up of the selector (HUD layer, own drawing, own markings); later switches only click.

## Invented / not shown
- Semi being more accurate. The key. Enemies switching modes (they don't).
