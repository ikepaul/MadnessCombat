# Gunfire basics: hitscan tracers (SMG)

**Category:** guns · **Seen in:** ep1 0:53.3–0:56.7 (M-10 bursts, f1599–f1699) and every gunfight after · **Confidence:** high (frame-exact)

Clips (local only): `clip-1` hero draws the SMG, kills the headless zombie, then fires at the boss (blocked by the cross shield).

## What happens on screen
- Each shot = **1 frame of white star-shaped muzzle flash**, then **1 frame of a thin white line** (tracer) from the muzzle to the impact point. No visible travelling bullet, so it's **hitscan**.
- Impact: small white burst (ep1), red blood mist + red wound "star" decal on the body (ep2+), black bullet-hole decal on walls when the shot misses (ep2+).
- One bullet = one kill on a grunt (ep2/3: chest or head). Zombies and bosses take several.
- Spent casings fly out and stay on the floor (ep3 onward).

## Measured
| Value | Measured | How |
|---|---|---|
| SMG fire interval | **3 frames = 0.1 s (600 rpm)** | flashes at f1612, f1615, f1618, f1621 |
| Muzzle flash | 1 frame (33 ms) | — |
| Tracer visible | 1 frame | — |
| Range | whole screen | — |

## Game translation
- All bullets are **hitscan rays** from the gun muzzle toward the mouse cursor (decided: free aim). Ray is resolved in screen space so you can hit enemies at any depth (decided: aim across the depth axis). See the depth rule in `../../design-decisions.md`.
- Render: 1-frame flash + 1-frame tracer line, exactly as above. Blood mist + wound decal on hit, bullet hole on walls on miss.
- SMG: full auto at 0.1 s per shot, small random spread (±2°, invented).
- Damage: 1 hit kills grunts. Zombies 2–4. Bosses use their own rules.
