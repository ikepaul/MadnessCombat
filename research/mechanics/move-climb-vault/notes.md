# Climb (ladder, cable) & vault

**Category:** player movement / traversal · **Seen in:** ep2 0:33.0–0:37.8 (ladder + vault onto the roof), ep2 2:50–2:53.5 (climb the cut elevator cable) · **Confidence:** medium (timings from 3 fps sheets)

Clips (local only): `clip-1` ladder climb one-handed with the pistol raised, dive over the parapet · `clip-2` hand-over-hand climb up the elevator cable.

## What happens on screen
- Ladder: climbs one-handed, gun still in hand.
- At the top: a horizontal dive/vault over the ledge, landing on the roof.
- Cable: after the cab drops, he hangs on the cut cable and climbs up to the next floor.

## Measured
| Value | Measured | How |
|---|---|---|
| Ladder climb speed | ≈ 1.1 H/s (1.5 H in ≈ 1.3 s) | ep2 f990–f1040 |
| Vault | ≈ 1 s | f1090–f1130 |

## Game translation
- Fixed-screen rooms mean climbing is a **room transition**: an interactable ladder/cable/vent plays a short traversal animation and loads the next room. No free-form climbing system needed.
- Optional: the ladder is usable mid-room (move up/down at 1.1 H/s, can't shoot while climbing). Default: transition only.

## Invented / not shown
- Getting attacked while climbing.
