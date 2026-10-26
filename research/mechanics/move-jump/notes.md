# Jump

**Category:** player movement · **Seen in:** ep1 1:19.6–1:20.2 (jump over the cannonball), ep1 1:33.3 (jump onto the cannon), ep3 0:40.6 (onto the table) · **Confidence:** high (measured)

Clips (local only): `clip-1` hero jumps over a cannonball.

## What happens on screen
- Standing jump with a forward drift and a tucked, slightly diving body. The cannonball passes right under the hero's feet.
- The jump is reactive: the hero jumps as the cannon fires, not long before.

## Measured
| Value | Measured | How |
|---|---|---|
| Airtime | ≈ 0.63 s (19 f) | takeoff f2386, land f2405 |
| Apex (feet off ground) | ≈ 1.1–1.2 H (≈ 220 px at this depth) | f2390–f2398 |
| Forward drift | ≈ 1.1 H over the jump | x 168 → 396 |
| Cannonball speed | ≈ 26 H/s (≈ 170 px/frame) | f2396→f2398 |

## Game translation
- Fixed-arc jump: gravity tuned so the apex is 1.15 H and airtime is 0.63 s (gives g ≈ 23 H/s², v0 ≈ 7.3 H/s). No variable jump height.
- Horizontal air control: keep the takeoff velocity, allow a small steer (≤ 30%).
- In depth mode a jump is purely vertical (y). x/z keep momentum.
- The cannonball is too fast to react to once fired (26 H/s), so the dodge needs a **telegraph** (the boss stepping behind the cannon and loading it ≈ 1 s).

## Invented / not shown
- Double jump: none. Wall jump: none.
- Shooting while airborne: never shown jumping and firing at the same time in eps 1–3. Proposal: allowed (free aim) since it's natural with mouse aim.
