# Walk

**Category:** player movement · **Seen in:** ep1 0:15.7–0:19.6 (f470–f588) · **Confidence:** high (static camera, measured)

Clips (local only): `clip-1` hero walks up to the boombox guy · `clip-2` hero walks back after being punched.

## What happens on screen
- Slow, deliberate walk. No run cycle anywhere in eps 1–3; even in fights the hero closes distance at walking pace.
- The ep1 intro walk also moves in depth (the hero comes from behind the tree toward the camera while walking right).
- "Angry" walk back after being knocked down is noticeably faster than the calm walk.

## Measured
| Value | Measured | How |
|---|---|---|
| Body height (H) | ≈ 270 px foreground, ≈ 190–230 px further back (perspective) | grid on f470–f536 |
| Calm walk | ≈ 0.8 H/s (≈ 210 px/s) | f494→f518, 170 px in 24 f |
| Purposeful walk | ≈ 1.3 H/s (≈ 350 px/s) | f554→f584, 350 px in 30 f |
| Zombie walk | ≈ 0.7–0.9 H/s | ep1 f1525–f1555 |

## Game translation
- Two speeds: `walk` 0.8 H/s (default when not in combat) and `combat walk` 1.3 H/s. Enemies use the same speeds, which keeps the slow, staged look.
- Depth (beat-'em-up lane): move on the floor plane (x, z). Suggest depth speed = 0.6 × horizontal speed (the show's depth moves look slower because of the perspective).
- Characters scale by depth: draw scale goes from 1.0 (front) to ≈ 0.75 (back of the room), as in the ep1 foreground/background.

## Invented / not shown
- A sprint does not exist in the show. Decide later whether one is needed for game feel. Default: no sprint.
- Acceleration: snap to speed within ~2 frames (the animation has no visible ramp-up).
