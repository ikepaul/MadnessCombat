# Art direction

**Decided 2026-10-26:** face **A (slit)**, **one palette per stage** (1 neutral, 2 cool, 3 warm), **heavy stylised** effects.
**Living reference:** [`style-frame/index.html`](style-frame/index.html). Open it with the `style-frame` preview (`.claude/launch.json`) or `python3 -m http.server 5180 --directory design/style-frame`. Every value below is implemented there, and the game renderer starts as a port of it (M0).

## Pillars
1. **Same proportions and staging as the show, our own designs.** Character size vs. room, camera, floating hands/feet and greyscale-and-red are kept. Faces, character designs, names, logos, music and backgrounds are ours.
2. **Flat vector + ink outline**, Flash-like clarity. "Finished, not cheap" comes from lighting, depth and effects, **not** from adding detail to characters.
3. **Colour is information.** The world is greyscale. **Red** = blood and enemy aim telegraphs only. **Green** = zombies only. **White** = flashes, tracers and UI.
4. **Readability first.** Silhouettes, contact shadows, telegraphs (shadows for falling things, door opening, aim lines) win over decoration.

## Measured proportions (from the episodes)
Sources: ep1 f470 (close foreground), ep2 f1965 (office) and f3000 (corridor), ep3 f1000 (table room). H = one character's height.

| What | Measured | Used in the game |
|---|---|---|
| Character height on screen | 0.21–0.23 of frame height mid-room, 0.25–0.28 at the front, 0.185 at the back wall | front **0.247**, back wall **0.185** (depth scale 0.75) |
| Head | 0.43–0.46 H tall, 0.38–0.40 H wide (the top half of the character) | ellipse **0.45 × 0.40 H**, centre at 0.79 H |
| Body | short tube, 0.30 H wide under the head → 0.38–0.40 H at the hem, no neck, no arms, no legs | rounded tube **0.30 → 0.40 H**, hem at 0.045 H |
| Hands | 0.12–0.13 H, floating | mitten **0.12 H**, no arms |
| Feet | 0.19 × 0.05 H, peeking under the hem | dark ellipses **0.19 × 0.07 H**, no legs |
| Pistol / shotgun length | ≈ 0.2 H / ≈ 0.56 H | 0.25 H / 0.55 H |
| Outline | ≈ 1–1.5% of H | **0.016 H** (body/head), 0.012 H (hands/feet) |
| Room: horizon | 53% of frame height (vanishing point of the floor/ceiling edges) | 0.53 |
| Room: camera eye height | 1.79 H above the floor | 1.79 H |
| Room: ceiling | 3.3–3.8 H | **3.8 H** |
| Room: back wall width | ≈ 5.7 H | 7.2 H (16:9 is wider than the show's 11:8) |
| Room: floor depth | front edge → back wall, scale 1.0 → 0.75 | z 8 → 10.67 H from the camera (≈ 2.7 H walkable depth) |
| Door | 1.8–1.9 H tall | 1.9 H |
| Table top | ≈ 0.5 H | 0.52 H |

**Aspect ratio:** 16:9 at 1920×1080 logical. Character height is kept as a share of **screen height**, so rooms are about 30% wider than in the show. That's more space for fights, with the same character scale.

## Characters
| Part | Spec |
|---|---|
| Face | **Slit**: one ink dash 0.12 H long, 0.02 H thick, at eye level toward the facing side. Dead: two small x's. **Never a cross.** |
| Head | light grey fill, soft horizontal form shading (darker on the back side), small specular highlight top-front, ink outline |
| Body | suit colour + one flat shade band on the back side, ink outline |
| Hands | mitten silhouette (palm + thumb nub), **no inner lines** (lines inside read as faces at small size) |
| Feet | dark ellipses under the hem, they step and lift in the walk cycle |
| Shadow | soft dark ellipse on the floor under every character and item (depth readability) |
| Hero | charcoal suit + light collar triangle |
| Grunts | mid-grey suit. Variants differ by **one accessory/held item** (welder mask, shades for the squad leader, bodyguard armour), not by body shape |
| Zombies | green skin and hands (`ZOMBIE`), same suit |
| Bosses / the target | **design pass required** before their milestone. Generic archetypes with our own twist, **not** the show's designs (no goatee + long hair + halo combo, no clown face paint, no hat + moustache sheriff, no bandaged hero). Add each to the style frame's character sheet first. |
| Boss (necromancer, signed off 2026-10-27) | Style frame "Stage 1 cast". 1.1 H, **hovers** 0.11–0.17 H with a floor shadow, no feet. Tall flared collar rising behind the head (`#3c3c44`) + short lapel under the chin, long dark coat `#2c2c32` (shade `#1d1d22`) with a torn hem, dark gloves. Bald pale head (`#c6c6cb`), no beard, no halo. Eye slit, coat seam and hands glow **lightning cyan** (`BOLT #eafcff`, glow `rgba(110,215,255)`); the glow brightens while he acts. Lightning telegraph = front hand raised overhead with crackling sparks |
| Boss ward (our shield shape) | screen-facing **diamond** ≈ 1.36 H tall × 0.5 H wide in front of him, translucent cyan fill, bright cyan edge, rings rippling inward, white ricochet sparks where rays are blocked. Never a cross |
| Mini-boss (clown archetype, signed off 2026-10-27) | Style frame "Stage 2 cast", option B. Elite soldier: **riot helmet** `#4a4c53` with a smoked visor over the face slit and a **red stripe** over the crown, dark suit `#3f4148` (shade `#30323a`) under a tactical vest `#2b2c31` with three pouches and a red band. Rifle in stage 2; jetpack, scimitar and zombie forms in stage 3 keep the helmet |
| Target (signed off 2026-10-27) | Style frame "Stage 2 cast", option B. **Bureaucrat**: grey suit `#7a7c83` (shade `#63656b`), white shirt V and a dark tie, thick square black glasses over the slit, grey side-parted hair. Never fights fair: flees, hides, sweats, surrenders |
| Room transitions (decided 2026-10-27) | **Ink wipe**: a quick diagonal wipe in the ink colour, ≈ 0.35 s out of one room and into the next |
| Boombox NPC | white tee `#e3e3e5` (shade `#bfc0c4`) + over-ear headphones; carries the boombox by the handle at his side. Boombox: dark case, two speakers that pump on the beat, tape window, red beat LED; keeps playing on the floor when dropped |
| Dancer NPC | dark tracksuit `#4a4b51` (shade `#3a3b40`) with one light side stripe + light knit beanie with a pom; dance loop = bounce, sway ±0.12 rad, hands pumping overhead in turn |

## Palettes (one per stage)
Shared: `INK #141416` · `BLOOD #c70f1b` · `BLOOD_DARK #860812` · `ZOMBIE #63d06b` / `ZOMBIE_HI #a6f0aa` · flashes `#ffffff` with warm glow `rgba(255,236,200)`.

| Token | Stage 1 · neutral | Stage 2 · cool | Stage 3 · warm |
|---|---|---|---|
| ceiling | `#86878b` | `#7c838e` | `#8b8780` |
| back wall | `#a9aaae` | `#a1a8b3` | `#afa9a0` |
| side wall L / R | `#9d9ea2` / `#98999d` | `#949ba6` / `#8f96a1` | `#a39d94` / `#9e988f` |
| floor | `#8f9094` | `#858c97` | `#948e85` |
| grunt suit / shade | `#8e8f94` / `#707176` | `#878e99` / `#68707b` | `#938d84` / `#756f67` |
| hero suit / shade | `#36373c` / `#25262a` | `#2f343c` / `#1f232a` | `#3d3934` / `#2b2824` |
| skin / highlight | `#d2d2d5` / `#f1f1f2` | `#ced3da` / `#eff2f6` | `#d6d1ca` / `#f4f0ea` |
| hands / shoes | `#e6e6e8` / `#4a4b50` | `#e2e6eb` / `#454b54` | `#e8e4dd` / `#4f4a44` |
| props / prop shade / doors | `#c3c4c8` / `#8b8c91` / `#d8d9dc` | `#bcc2cb` / `#838a95` / `#d3d8df` | `#c9c3b9` / `#908a81` / `#dcd7cf` |

Stage 3's surreal outdoor section (improbability mode) can break the palette for the sky and falling objects only. Characters stay on-palette.

## Rooms
- **One-point perspective box** per room (horizon 0.53, eye 1.79 H). Back wall, side walls, ceiling and floor are flat fills with ink edges (3 px at 1080p).
- **Depth cues**: walls and ceiling darken toward the camera (linear gradients, 16–22%), contact shadow along the back wall's base, baseboards (0.12 H, darker strip + thin line).
- **One key light per room** (hanging lamp, window, open door): soft blurred cone + light pool on the floor (additive, blur 14 px), small bloom on the source.
- **Doors**: open doorway = solid near-black. Closed door = light panel with a knob. Doors are spawn telegraphs, so their state must read at a glance.
- **Affordances** are visible but quiet: vents (slatted dark quad), breachable floor/ceiling (subtle crack pattern), destructible walls, climbable ladders.
- Persistent decals: bullet holes (dark hole + light rim + cracks), wall splatter (blob + droplets in the shot direction + drips), floor pools (irregular, dark red, one glossy highlight), scorch marks, casings, dropped mags and weapons.

## Animation
- **Pose-based keyframes with tweening**, Flash-style: a pose = transforms for head, body, both hands, both feet and the held item. Tween between poses with easing. Author poses in an in-game pose editor (lab) and store them as data.
- **Procedural layers on top**: aim (gun hand on a circle around the shoulder toward the cursor, reach 0.36 H for pistols), head tilt toward the aim (≤ 0.25 rad), idle breathing (±0.004 H), walk cycle (feet alternate, body bob 0.014 H), recoil kick, hit lean.
- **Smears & impact frames**: 1-frame smear arc on punches and swings, 1-frame impact star on contact, white impact flash on the hit character (see effects).
- **Timings** come from `research/measurements.md`. The episodes animate at 30 fps (every frame changes), so key poses sit on a 30 fps grid while the sim runs at 60 Hz.

## Effects: heavy stylised
| Effect | Spec | Notes |
|---|---|---|
| Muzzle flash | 1 frame (33 ms): white star + warm radial glow (0.3 H) | measured 1 frame in ep1 |
| Room light flash | same frame: additive radial light at the muzzle, 520 px, 22% | sells the shot, lights the walls |
| Tracer | 1 frame: 2.5 px white core + 9 px soft glow | measured 1 frame |
| Blood | mist (≈ 14 particles, 0.25–0.45 s, gravity) + wall splatter decal + wound bursts on the body + growing pool | stage 1 has **no blood** (as in the episode) |
| Impact frame | hit character drawn bright (`brightness 1.8, contrast 1.2`) for the hit-stop duration | |
| Hit-stop | kills, heavy melee, thrown-weapon hits: **3 frames** (100 ms). The killing blow on a boss phase: 5 frames. Automatic weapons: max 1 frame, never more than 6 frames of hit-stop per second | keeps auto fire from feeling sluggish |
| Chromatic split | kills / explosions / boss hits: 4–8 px RGB split for 2–3 frames | not on every bullet |
| Screen shake | pistol 2 px · SMG 1 px per shot · shotgun 6 px · explosion 14 px · boss slam 10 px · kill 6 px, decays over 0.15–0.4 s | rooms are fixed-camera, so shake is the only camera motion |
| Kill cam | last kill of a wave, 3+ kills within 1 s, boss phase end: time ×0.3 for 0.6 s + red tint (5–15%) + chromatic on the first frame + audio slowdown | |
| Kill counter pop | scale 1.3 → 1.0 over 8 frames on each kill, green for zombie kills | |
| Post | film grain (overlay, ~7%), vignette (42% at the edges), light bloom | always on |

Every effect gets an intensity setting (off / reduced / full) in M13 for accessibility (flashes, shake, chromatic).

## UI
- **Anton** (SIL OFL 1.1) for numbers and titles. Bundle the font files, no CDN. **Inter** (OFL) for menus and small text.
- HUD is minimal: kill counter bottom-right (white, ink stroke, pop), hit pips for the player's ~3 hits, an ammo pip strip next to the gun hand, and the tracker in stage 2. No health bars on enemies.
- Stage cards (title, body count) are plain text on black, like episode title cards, in our own wording.

## Do not copy
The cross face; the show's character designs, names and logo/title lettering; its title-card texts; its music and sound effects; recognisable backgrounds (the tree arena, the storefront sign, specific posters). We keep: proportions, staging, camera, the greyscale + red look, floating hands/feet, the flat vector style and the gore level.
