# Audio direction

**Decided 2026-10-26:** the **user composes the music** (brief below). Sound effects are built from **CC0 / royalty-free libraries**, layered and processed. Nothing is sampled from the episodes.

## Pillars
1. **Punchy, dry, close.** Cartoon violence with modern weight: every hit has a transient, a body and some low end.
2. **Sound is gameplay information.** Telegraphs (enemy gun raise, doors opening, grenade fuse, boss charge-ups, falling-object whistle) always cut through the mix.
3. **Rooms sound like rooms.** Reverb is sized from each room's dimensions. Outdoor areas are nearly dry.
4. **Silence is allowed.** Stealth openings and endings drop the music. Contrast makes fights louder.

## Sources & licensing
- **CC0**: Kenney audio packs, freesound.org (filter: CC0 only), OpenGameArt CC0. **Royalty-free with a license file**: Sonniss GDC bundles (read that year's license before use).
- Every file used goes into `assets/audio/LICENSES.md` (file → source URL, author, license).
- Downloading sound packs needs the user's OK in the session that does it (name, source and size).

## Technical spec
| Item | Spec |
|---|---|
| Delivery | 48 kHz. OGG Vorbis (q6) + M4A/AAC fallback for Safari |
| Loudness | SFX peaks at −1 dBTP, normalised per category. Music stems at −16 LUFS integrated |
| Variation | 3–6 variants for frequent sounds, random pitch ±4%, volume ±2 dB, never the same variant twice in a row |
| Voice limits | max 4 of the same sound at once (casings 6, footsteps 3). Oldest voice steals |
| Mixer | small Web Audio graph: buses `music`, `weapons`, `impacts`, `foley`, `voices`, `world`, `ui` → master compressor/limiter |
| Ducking | music −4 dB under explosions, boss attacks and kill cams (sidechain-style gain automation, 300 ms release) |
| Room reverb | ConvolverNode per room size class (small / medium / large / outdoor) using generated or CC0 impulse responses. Weapon tails go through it |
| Stereo | pan by screen x (±0.8), −3 dB from front to back wall |
| Kill cam / slow-mo | everything through a low-pass (≈ 1.2 kHz) + playback rate 0.6 + a short "tape-stop" whoosh in |
| Hit-stop | the hit sound plays on the first frozen frame. The world doesn't go silent during hit-stop |

## Sound list & layering recipes
Milestones in brackets (see `PLAN.md`).

**Foley & movement** [M1, M2, M4]
- Footsteps per surface (concrete, wood, metal, dirt), soft shoes, 6 variants each. Landing thud. Dive/prone cloth + body hit.
- Punch = whoosh (quiet) + flesh impact + low thump (≤ 120 Hz). Heavy hit/uppercut adds a bone crack layer.
- Body fall = thud + cloth + small debris. Thrown body hitting a wall = heavy thud + wall rattle.
- Grab = cloth grab. Throw = big whoosh.

**Guns** [M5]: each shot = mechanical click/slide + transient crack + body + tail (reverb).
- Pistol (crisp, mid), Desert Eagle (heavy, low boom), SMG (short tight cracks, rate 0.1 s), rifle (sharper, longer tail), machine gun (rolling), pump shotgun (huge low boom + pump rack 0.3 s later), sawed-off (wider, rougher).
- Suppressed pistol: dull thump + loud mechanical slide.
- Dry fire click, magazine out/in, slide rack. Casings: 3 tinks per surface, max 6 voices.
- Bullet impacts: flesh (wet thud + small spray), concrete (chip + dust), metal (ping/ricochet whine), wood (thock), glass.

**Throwing & explosives** [M6]
- Knife: draw scrape, throw whoosh, flesh thunk / wall thunk (vibrating "twang"), pull-out squelch.
- Grenade: pin ping + spoon flick, 2 bounce sounds, faint fuse hiss (a gameplay cue), explosion = crack + boom + sub tail + debris rain (0.5 s).
- Melee weapons: baton swish/thwack, axe chop + lodge, sword slash + clang on block, street sign heavy metal whoosh + gong-like hit.
- Catch: leather slap. Disarm: metal clatter as the gun hits the floor.

**Enemies** [M3, M7]
- No dialogue. Short non-verbal vocalisations only: grunt efforts, hurt gasps, death exhales (3–5 variants per voice type, generated/CC0, pitched per character so they don't repeat).
- **Aim telegraph**: a distinct gun-raise "clack" + very short rising tone (≈ 0.4 s, the same length as the visual telegraph). Must be audible over gunfire.
- Doors opening (spawn telegraph), lift ding + motor, footsteps of approaching enemies behind doors.
- Zombies: low wet moan on rise, shuffling feet, muffled hits (thicker flesh layer).

**Bosses & set pieces** [M8–M12]
- Halo-boss style necromancer: lightning crackle (charge 0.3 s + strike), raise-dead rumble, shield hum + bullet ricochet "tink" on the shield, telekinetic whoosh, cannon (thump + whistle + boom), sword dive whoosh, teleport implosion.
- Clown-type mini-boss: jetpack burner loop with pitch by altitude, MG roll, empty-gun throw clatter.
- Elevator: motor loop, cab rattle, welder plasma cutter loop, cable snap + falling wind + crash.
- Improbability mode: warped "boing" layer on knockbacks, wall-bounce rubbery thuds, a detuned tape-wobble filter on the world bus.
- Falling-object whistle (rising pitch until impact) for every shadow-telegraphed drop.

**UI** [M4, M13]: kill counter tick (subtle, pitched up for combos), menu move/select, stage card stamp, pause swoosh.

## Music system
- Per room: **ambient bed** (always) + **combat layers** that fade in on alert (intensity 0–3 by number of active enemies) + **stingers** (boss entrance, kill cam, stage end).
- Transitions happen on **bar boundaries** (tempo and bar length are needed per track). Stingers are free-timed.
- Diegetic sources (stage 1 boombox) are positioned in the room and go through the room reverb.
- Until tracks exist, rooms play the ambient beds from the SFX libraries only. No placeholder music is generated.

## Music brief (for you)
**Overall:** aggressive, gritty, electronic/industrial with breakbeat drums and distorted bass. Tense, sparse ambience between fights. Original motifs only: don't reference the songs used in the episodes.

| Stage | Cue | Mood | Tempo | Length / form |
|---|---|---|---|---|
| 1 | **Boombox tune** (diegetic) | cheesy, kitschy dance loop played from a small speaker. Comic contrast with the violence | 110–120 BPM | 30–45 s loop, mono-ish, lo-fi |
| 1 | Riot combat | driving breakbeat + gritty bass, playful-violent | 140–150 BPM | 90–120 s loop, 3 intensity stems |
| 1 | Boss (necromancer) | heavier, adds dark choir/pad textures, ominous | same tempo or half-time feel | 120 s loop + intro stinger |
| 1 | Outro | the boombox tune returns | — | reuse |
| 2 | Infiltration ambience | dark minimal pulse, sparse percussion, room tone | 85–95 BPM | 120 s loop, 2 stems (bed, pulse) |
| 2 | Combat | industrial-metal-electronic, relentless | 150–160 BPM | 120 s loop, 3 intensity stems |
| 2 | Elevator set piece | tense build with risers, mechanical rhythm | 150–160 BPM | 60–90 s, ends on a hit for the cable snap |
| 2 | Clown fight motif | twisted carnival motif over the combat beat (our own melody) | combat tempo | 30–60 s loop |
| 2 | Ending | silence → one low impact | — | stinger |
| 3 | Opening (revenge) | sombre, slow build | 70–85 BPM | 60–90 s |
| 3 | Building combat | the most aggressive track, fast | 160–170 BPM | 120 s loop, 3 stems |
| 3 | Improbability street | the same energy but warped: detuned, tape wobble, absurd | 160–170 BPM | 90 s loop |
| 3 | Sealed arena / boss duel | heaviest, choir/pad from stage 1's boss theme comes back | 160–170 BPM or half-time | 120 s loop |
| 3 | Last stand | slow heartbeat pulse, drone, fades to silence | 60 BPM | 20–30 s |

**Delivery:** WAV 48 kHz / 24-bit stems per cue, named `s{stage}_{cue}_{stem}.wav` (e.g. `s2_combat_drums.wav`), with tempo, key, bar count and loop start/end samples written in `assets/music/cues.json`. Leave about 1 dB of headroom and don't master-limit the stems: the game mixes them.
