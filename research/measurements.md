# Measurements (tuning sheet)

Every number measured from the episodes, in one place. **H** = body height (≈ 270 px in the ep1 foreground). Times in seconds at 30 fps. "Note" links to the mechanic with the frame references. Values marked *invented* in the notes are **not** in this table. They live in the notes until we pick them during implementation.

## Player movement
| Quantity | Value | Note |
|---|---|---|
| Body height H | ≈ 270 px front, ≈ 190–230 px back of room | [walk](mechanics/move-walk/notes.md) |
| Calm walk | 0.8 H/s | [walk](mechanics/move-walk/notes.md) |
| Purposeful (combat) walk | 1.3 H/s | [walk](mechanics/move-walk/notes.md) |
| Jump airtime | 0.63 s | [jump](mechanics/move-jump/notes.md) |
| Jump apex (feet) | 1.1–1.2 H → gravity ≈ 23 H/s², launch ≈ 7.3 H/s | [jump](mechanics/move-jump/notes.md) |
| Jump forward drift | ≈ 1.1 H | [jump](mechanics/move-jump/notes.md) |
| Stand → prone | ≤ 0.15 s | [prone](mechanics/move-prone-dodge/notes.md) |
| Prone → stand | ≈ 0.4 s | [prone](mechanics/move-prone-dodge/notes.md) |
| Ladder climb | ≈ 1.1 H/s | [climb](mechanics/move-climb-vault/notes.md) |
| Fall shadow before landing | ≈ 0.3 s | [fall](mechanics/move-fall-transition/notes.md) |

## Getting hit
| Quantity | Value | Note |
|---|---|---|
| Punch knockback distance | ≈ 1.5 H | [knockdown](mechanics/move-knockdown-getup/notes.md) |
| Knockback airtime | 0.35–0.4 s | [knockdown](mechanics/move-knockdown-getup/notes.md) |
| Lie still | ≈ 0.2 s | [knockdown](mechanics/move-knockdown-getup/notes.md) |
| Get up | ≈ 0.4 s | [knockdown](mechanics/move-knockdown-getup/notes.md) |
| Hit → controllable again | ≈ 1.1 s | [knockdown](mechanics/move-knockdown-getup/notes.md) |
| Face-punch stun | ≈ 0.7 s | [hitstun](mechanics/melee-hitstun-finisher/notes.md) |

## Melee
| Quantity | Value | Note |
|---|---|---|
| Punch range | 0.5–0.6 H | [punch](mechanics/melee-punch-knockback/notes.md) |
| Punch exchange rate | 2–3 punches/s | [punch](mechanics/melee-punch-knockback/notes.md) |
| Uppercut launch height | ≈ 1 H | [punch](mechanics/melee-punch-knockback/notes.md) |
| Sweep to contact | ≈ 0.2 s, victim flies ≈ 1 H | [sweep](mechanics/melee-low-sweep/notes.md) |
| Street-sign reach | 1.5–1.6 H | [environment weapon](mechanics/melee-environment-weapon/notes.md) |
| Wire strangle | ≈ 3 s | [stealth kill](mechanics/melee-stealth-kill/notes.md) |
| Knife drop-kill | ≈ 0.6 s | [stealth kill](mechanics/melee-stealth-kill/notes.md) |

## Guns
| Quantity | Value | Note |
|---|---|---|
| Bullet model | hitscan: 1 frame muzzle flash, then 1 frame tracer line | [hitscan](mechanics/gun-hitscan-smg/notes.md) |
| SMG/auto fire interval | 0.1 s (600 rpm) | [hitscan](mechanics/gun-hitscan-smg/notes.md) |
| Pistol double tap | ≈ 0.3 s apart | [pistol](mechanics/gun-pistol-suppressed/notes.md) |
| Pistol reload | ≈ 0.6 s | [reload](mechanics/gun-reload/notes.md) |
| Grunt kill | 1 bullet | [hitscan](mechanics/gun-hitscan-smg/notes.md) |
| Zombie kill | 2–4 bullets, 1–3 axe hits | [zombie](mechanics/enemy-zombie/notes.md) |

## Throwing & explosives
| Quantity | Value | Note |
|---|---|---|
| Knife wind-up | 0.1–0.15 s | [knives](mechanics/throw-knives/notes.md) |
| Knife speed | 12–15 H/s | [knives](mechanics/throw-knives/notes.md) |
| Pull knife out of a corpse | ≈ 0.5 s | [knives](mechanics/throw-knives/notes.md) |
| Grenade pin → release | ≈ 0.35 s | [grenade](mechanics/throw-grenade/notes.md) |
| Grenade lob distance | ≈ 1.4 H | [grenade](mechanics/throw-grenade/notes.md) |
| Grenade fuse | 0.75 s after release (ep1), 1.3 s after drop (ep2) | [grenade](mechanics/throw-grenade/notes.md), [return](mechanics/throw-grenade-return/notes.md) |
| Grenade blast radius | ≈ 2 H | [grenade](mechanics/throw-grenade/notes.md) |
| Grenade debris airtime | ≈ 0.5 s, bodies thrown ≈ 1.5 H up | [grenade](mechanics/throw-grenade/notes.md) |
| Grenade pick-up-and-return | landed → picked up ≈ 0.6 s | [return](mechanics/throw-grenade-return/notes.md) |

## Enemies & bosses
| Quantity | Value | Note |
|---|---|---|
| Zombie: bolt → standing | ≈ 1.0 s | [zombie](mechanics/enemy-zombie/notes.md) |
| Zombie walk | 0.7–0.9 H/s | [zombie](mechanics/enemy-zombie/notes.md) |
| Welder cut-through | ≈ 2.7 s | [welder](mechanics/enemy-welder/notes.md) |
| Halo boss hover dash | ≈ 2–2.5 H in ≈ 0.27 s | [halo boss](mechanics/boss-halo/notes.md) |
| Halo boss body slam | 5–6 slams, one per 0.5–0.67 s | [halo boss](mechanics/boss-halo/notes.md) |
| Halo boss telekinetic fling | ≈ 3.6 H in ≈ 0.33 s, ≈ 0.9 s until the player lands | [halo boss](mechanics/boss-halo/notes.md) |
| Halo boss cross shield | up ≈ 1 s | [halo boss](mechanics/boss-halo/notes.md) |
| Cannonball speed | ≈ 26 H/s (too fast to react to after firing) | [jump](mechanics/move-jump/notes.md) |
| Cannon re-fire | ≈ 1.3 s, ≈ 4 shots | [prone](mechanics/move-prone-dodge/notes.md) |

## World
| Quantity | Value | Note |
|---|---|---|
| Improbability knockback | ≈ 9 H/s (≈ 2.3× normal), bounces off walls and ceiling, ≈ 5.5 H path in 0.67 s | [improbability](mechanics/world-improbability-mode/notes.md) |
| Body counts (wiki) | ep1 32, ep2 86, ep3 91 (on-screen counter ends at 90), ep4 80 | [kill counter](mechanics/world-kill-counter/notes.md) |

## Episode 4 (from browser contact sheets, ±0.3 s: re-measure from clips)
| Quantity | Value | Note |
|---|---|---|
| Car length | ≈ 2.5 H | [vehicle ram](mechanics/world-vehicle-ram/notes.md) |
| Agent: head wounds before dropping | ≥ 2, fight ≈ 6 s | [agent](mechanics/enemy-agent/notes.md) |
| Staircase | ≈ 2 H drop over ≈ 3 H, ≈ 40° | [stairs](mechanics/move-stairs/notes.md) |
| Club crowd | ≈ 35 dancers, fight ≈ 18 s, 5–8 within 2 H of the hero | [crowd](mechanics/world-crowd-dancefloor/notes.md) |
| Mass raise | ≈ 19 corpses standing ≈ 1 s after the flash | [halo boss](mechanics/boss-halo/notes.md) |
| Sword deflecting a burst | ≈ 2.4 s before a round gets through | [blade deflect](mechanics/melee-blade-deflect/notes.md) |
