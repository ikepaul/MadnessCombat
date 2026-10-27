# Mechanics research: episodes 1–4

Reference catalogue for a game where each of the first four episodes (episode 4 added 2026-10-27) of the *Madness Combat* animated series is one stage. It copies **mechanics only**: movement, timings, enemy types, weapons and set-piece rules. No art, names or characters. Everything here is described with neutral labels ("halo boss", "clown", "target", "grunt"), and the game will use its own designs and names.

The build plan that turns this catalogue into the game is [`../PLAN.md`](../PLAN.md).

## How this folder works

| Path | What it is | In git? |
|---|---|---|
| `README.md` | this index | yes |
| `design-decisions.md` | decisions made so far + open questions | yes |
| `measurements.md` | all measured timings/distances in one table (the tuning sheet) | yes |
| `stages.md` | each episode broken down into rooms, waves and events for the stage design | yes |
| `episodes/epN-log.md` | beat-by-beat log of every episode with frame numbers | yes |
| `mechanics/<slug>/notes.md` | one note per mechanic: what's on screen, measurements, game translation, what's invented | yes |
| `mechanics/<slug>/clip-N.mp4`, `frames-N.jpg` | short clip + labelled 10 fps contact sheet for each reference moment | **no** (derived from the episodes, local only) |
| `clips.json` | manifest of every clip (episode + time range) | yes |
| `../reference/` | downloaded episodes, analysis sheets | **no** |
| `../tools/research/` | scripts used to analyse the footage | yes |

### Rebuilding the local footage
```bash
yt-dlp -f "137+140/136+140/best[ext=mp4]" --merge-output-format mp4 -o "reference/video/ep%(playlist_index)s.%(ext)s" --playlist-items 1-4 "https://www.youtube.com/playlist?list=PL4F761764995C5F15"
python3 -m venv .venv && .venv/bin/pip install numpy pillow opencv-python-headless
.venv/bin/python -I tools/research/make_clips.py
```
Other tools: `framediff.py` (duplicate-frame/cut detection), `contact.py` (labelled frame grids), `measure.py` (frames with a pixel grid for measuring).

## Conventions
- **Source**: the official YouTube uploads, 1484×1080 at **30 fps**. The frame-difference check found no repeated-frame pattern (frames change every frame during motion), so 30 fps timings are used directly. `fN` = frame N of that file.
- **H** = one character's body height. ≈ 270 px in the ep1 foreground, ≈ 190–230 px further back (the rooms have perspective). Distances and speeds are given in H so they're engine-independent.
- **Confidence**: high = clear and repeated or measured frame by frame. Medium = seen once or measured from a wide shot. Low = inferred.
- Every value in a note is either **measured** (with frames cited) or marked **invented**.
- Scope rule: **no timestamp, no mechanic**. Nothing from episode 5 onward, nothing from the spin-off games.
- **Episode 4** was researched from contact sheets in the browser (2026-10-27), not from local clips: its times are YouTube seconds read at 0.35–1 s spacing (±0.3 s) and its frame rate/resolution are unchecked. Cut its clips with `make_clips.py` and re-measure before tuning.

## Sources
- The four episodes (YouTube playlist above): Madness Combat 1 (2:07), 2: Redeemer (4:06), 3: Avenger (4:01), 4: Apotheosis (3:18 on YouTube; 4:44 in the original release with its preloader).
- Madness Combat fan wiki (madnesscombat.fandom.com) episode pages: plot, weapon lists, body counts (ep1 32, ep2 86, ep3 91, ep4 80). Wikipedia has no article on the series.

## Mechanics index

### Movement

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Climb (ladder, cable) & vault](mechanics/move-climb-vault/notes.md) | 2 | 2 | medium |
| [Drop from above (vent / ceiling)](mechanics/move-drop-from-above/notes.md) | 2, 3 | 2 | high |
| [Fall into a new area (shadow telegraph landing)](mechanics/move-fall-transition/notes.md) | 3 | 1 | high |
| [Jump](mechanics/move-jump/notes.md) | 1, 3 | 1 | high |
| [Jump onto objects / high ground](mechanics/move-jump-onto-object/notes.md) | 1, 3 | 2 | high |
| [Knockdown & get-up](mechanics/move-knockdown-getup/notes.md) | 1, 3 | 2 | high |
| [Prone dodge & prone fire](mechanics/move-prone-dodge/notes.md) | 1 | 1 | high |
| [Stairs (sloped floor, bodies tumble down)](mechanics/move-stairs/notes.md) | 4 | 1 | high |
| [Walk](mechanics/move-walk/notes.md) | 1 | 2 | high |

### Melee

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Blade deflects bullets (guard, parry)](mechanics/melee-blade-deflect/notes.md) | 4 | 2 | high (deflect) / low (gun block) |
| [Decapitation & heads as projectiles](mechanics/melee-decapitation/notes.md) | 1 | 2 | high |
| [Environment as a weapon (street sign, pinning)](mechanics/melee-environment-weapon/notes.md) | 3 | 2 | high |
| [Grab & throw enemies / bodies](mechanics/melee-grab-throw/notes.md) | 1, 2, 3 | 3 | high |
| [Hit-stun & finisher on a downed enemy](mechanics/melee-hitstun-finisher/notes.md) | 1, 2 | 1 | medium |
| [Low sweep / slide kick](mechanics/melee-low-sweep/notes.md) | 1 | 1 | medium |
| [Punch & knockback](mechanics/melee-punch-knockback/notes.md) | 1, 2, 3 | 2 | high |
| [Stealth kill (takedown from behind / above)](mechanics/melee-stealth-kill/notes.md) | 2, 3 | 2 | high |
| [Melee weapons (baton, knife, axe, sword, bat, pipe, scimitar)](mechanics/melee-weapons/notes.md) | 2, 3 | 2 | high |

### Guns

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Assault rifles & machine gun](mechanics/gun-auto-rifle/notes.md) | 2, 3 | 2 | high |
| [Dual wield & split aim](mechanics/gun-dual-wield/notes.md) | 1, 2 | 2 | high |
| [Fire-mode selector (semi → auto)](mechanics/gun-fire-mode/notes.md) | 4 | 1 | high |
| [Out of ammo → throw the gun](mechanics/gun-empty-throw/notes.md) | 3 | 2 | high |
| [Gunfire basics: hitscan tracers (SMG)](mechanics/gun-hitscan-smg/notes.md) | 1 | 1 | high |
| [Weapon pickup & dropped weapons](mechanics/gun-pickup-drop/notes.md) | 2, 3 | 2 | high |
| [Pistol & suppressed pistol](mechanics/gun-pistol-suppressed/notes.md) | 2 | 1 | high |
| [Reload](mechanics/gun-reload/notes.md) | 2 | 1 | medium |
| [Shotguns (sawed-off, pump)](mechanics/gun-shotgun/notes.md) | 1, 2, 3 | 2 | high |

### Throwing

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Catch a thrown weapon and throw it back](mechanics/throw-catch-return/notes.md) | 3 | 1 | high |
| [Frag grenade](mechanics/throw-grenade/notes.md) | 1, 2 | 1 | high |
| [Grenade throw-back](mechanics/throw-grenade-return/notes.md) | 2 | 1 | high |
| [Throwing knives (stick, retrieve)](mechanics/throw-knives/notes.md) | 1, 3 | 2 | high |

### Combat systems

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Cover (both sides)](mechanics/combat-cover/notes.md) | 2, 3 | 3 | high |
| [Disarming (steal, knock away, shoot out of hand, knife-disarm, grab weapon)](mechanics/combat-disarm/notes.md) | 2, 3 | 4 | high |
| [Human shield](mechanics/combat-human-shield/notes.md) | 3 | 1 | high |

### Enemies

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Agent (suited elite)](mechanics/enemy-agent/notes.md) | 4 | 1 | medium |
| [Enemy behaviour quirks](mechanics/enemy-behaviours/notes.md) | 2, 3, 4 | 3 | high |
| [Bodyguards (elite)](mechanics/enemy-elite-bodyguard/notes.md) | 2, 3 | 2 | medium |
| [Grunt variants (armed)](mechanics/enemy-grunt-armed/notes.md) | 2, 3 | 2 | high |
| [Grunt (unarmed)](mechanics/enemy-grunt-unarmed/notes.md) | 1, 2 | 1 | high |
| [How enemies enter a room](mechanics/enemy-spawning/notes.md) | 1, 2, 3 | 3 | high |
| [Squad leader (sunglasses)](mechanics/enemy-squad-leader/notes.md) | 3 | 1 | medium |
| [The sun (surreal brute)](mechanics/enemy-sun-brute/notes.md) | 3 | 1 | high |
| [Welder (plasma cutter)](mechanics/enemy-welder/notes.md) | 2 | 1 | high |
| [Zombie (raised corpse, armed in ep4)](mechanics/enemy-zombie/notes.md) | 1, 2, 3, 4 | 2 | high |

### Bosses

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Clown (recurring mini-boss; the DJ in ep4)](mechanics/boss-clown/notes.md) | 2, 3, 4 | 4 | high |
| [Halo boss (the "savior" necromancer)](mechanics/boss-halo/notes.md) | 1, 2, 3, 4 | 7 | high |
| [The target (the hat-wearing objective)](mechanics/boss-target/notes.md) | 2, 3 | 3 | high |

### World, levels & UI

| Mechanic | Episodes | Clips | Confidence |
|---|---|---|---|
| [Collapsing arena (floor falls into a void)](mechanics/world-arena-collapse/notes.md) | 3 | 1 | high |
| [Arena lock (walls drop from the sky)](mechanics/world-arena-lock/notes.md) | 3 | 1 | high |
| [Breaching through the floor/roof](mechanics/world-breach/notes.md) | 2 | 1 | high |
| [Dance-floor crowd (turns hostile)](mechanics/world-crowd-dancefloor/notes.md) | 4 | 2 | high |
| [Destructible environment](mechanics/world-destructible/notes.md) | 2, 3, 4 | 2 | high |
| [Elevator set piece](mechanics/world-elevator-fight/notes.md) | 2 | 2 | high |
| [Falling hazards that become terrain](mechanics/world-falling-hazard/notes.md) | 1, 3 | 1 | high |
| [Improbability mode (physics modifier)](mechanics/world-improbability-mode/notes.md) | 3 | 1 | high |
| [Interrogation & knockout (non-lethal)](mechanics/world-interrogate-knockout/notes.md) | 2 | 2 | high |
| [Kill counter HUD](mechanics/world-kill-counter/notes.md) | 3 | 2 | high |
| [Last stand (scripted ending; detonator in ep4)](mechanics/world-last-stand/notes.md) | 2, 3, 4 | 1 | high |
| [Target tracker (objective radar)](mechanics/world-objective-radar/notes.md) | 2 | 2 | high |
| [Persistence: corpses, weapons, blood, decals](mechanics/world-persistence-decals/notes.md) | 2, 3 | 2 | high |
| [Vehicle ram (car entrance)](mechanics/world-vehicle-ram/notes.md) | 4 | 1 | medium |
