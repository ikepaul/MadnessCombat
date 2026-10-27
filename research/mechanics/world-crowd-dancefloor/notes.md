# Dance-floor crowd (passive crowd that turns hostile)

**Category:** world · **Seen in:** ep4 2:01–2:29 · **Confidence:** high

Clips (local only): `clip-1` the club: ≈ 35 grunts dancing in front of a stage, the DJ is shot, gets up, the crowd turns on the hero. `clip-2` the packed melee on the dance floor.

## What happens on screen
- A dark room packed with ≈ 35 grunts dancing in place, all facing the stage at the back. They ignore the hero coming in.
- After the hero shoots the DJ, the crowd attacks from every side. The fight happens inside the crowd: 5–8 grunts within 1–2 H of the hero at once (ep1–3 had 3–4).
- The floor ends up carpeted with bodies (later raised all at once).
- One grunt in the corner never fights: sweats, then lights a cigarette (crushed when the door is smashed in).

## Measured
| Value | Measured | How |
|---|---|---|
| Crowd size | ≈ 35 visible at 123 s | contact sheet |
| Fight length | ≈ 18 s (129 → 147 s) | contact sheet |

## Game translation
- Crowd members are grunts with `idle: 'dance'` (the stage 1 dancer loop with a per-actor phase) and unaware. **Shared alarm**: the trigger (shooting the DJ, or any kill on the floor) makes the whole crowd aware at once.
- **Attack tokens stay at 2–3**, but the rest of the crowd **presses in** (body-blocking) so the player is surrounded without taking 8 hits at once. Grunts without a token make short shoves (no damage, 0.3 H push, invented) to keep pressure.
- Performance: 35 actors + their corpses in one room is the biggest budget in the game. Far dancers can update their animation at 30 Hz (invented).
- The cowering grunt: `idle: 'cower'` (sweat + smoke), never takes a token, can be killed.

## Invented / not shown
- Shoving, the alarm rule, animation level of detail.
