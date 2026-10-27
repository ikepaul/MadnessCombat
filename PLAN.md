# Milestone plan

How we get from the research catalogue (`research/`) and the art/audio direction (`design/`) to three playable stages. Each milestone is sized for one implementation session (medium effort), sometimes split into several PRs. It is **self-contained**: it lists what to read, what to build (mechanics **and** their look and sound), what to leave out, and acceptance checks with the measured numbers.

Decisions live in `research/design-decisions.md` (gameplay), `design/art-direction.md` (visuals) and `design/audio-direction.md` (sound and the music brief). Don't re-open them inside a milestone; ask the user if one turns out not to work.

**Order is linear.** It starts in the final art style from day one (the style frame is ported in M0). Unarmed fighting is playable at M3, a dedicated feel & audio milestone follows at M4, guns come at M5–M7, the first complete stage at M8, then stages 2 and 3.

| # | Milestone | Playable result | Size |
|---|---|---|---|
| M0 | Foundation & render style | Empty room in the final style (perspective, palette, post FX), lab selector, tests | M |
| M1 | Room & movement | Walk/jump/dive in a 2.5D room, dodge a debug cannonball | M |
| M2 | Body, melee & corpses | Punch dummies, knockdown, grab & throw, bodies pile up, pose animation | L |
| M3 | Grunts & waves: **first playable** | Stage 1's unarmed riot (wave A) against real AI | M |
| M4 | **Feel & audio foundation** | The riot with hit-stop, shake, kill cam, impact frames, real SFX, mixer, music system | M |
| M4b | **Local co-op** (added 2026-10-26) | Two players on two laptops on the same Wi-Fi play the riot together; downed players are revived by standing in their circle | M |
| M5 | Free aim & guns | Shoot with free aim across depth, dual wield, scavenge guns. Every gun sounds and flashes right | L |
| M6 | Throwing, explosives & advanced combat | Knives, grenades, disarms, human shield, melee weapons, props | L |
| M7 | Armed enemies, stealth & zombies | Gunfights against armed grunts, takedowns, zombies | L |
| M8 | **Stage 1 complete** | Episode 1 start to finish incl. the boss (own design) and stage music hooks | L |
| M9 | Room chaining & Stage 2 (first half) | Stage 2 rooms 1–6, cool palette, infiltration ambience | L |
| M10 | **Stage 2 complete** | Elevator, remaining rooms, ending | L |
| M11 | Stage 3 (first half) | Stage 3 rooms 1–6 incl. improbability mode | XL (split in two if needed) |
| M12 | **Stage 3 complete** | Desert, vending room, final room, last stand | L |
| M13 | Game shell & final polish | Title, stage select, settings (incl. effect intensity), checkpoints, final art/audio pass | M |

Not covered by a milestone: **the music itself** (the user composes it from the brief in `design/audio-direction.md`; milestones only build the hooks and integrate tracks when delivered) and gamepad support (decide in M13).

---

## Ground rules (apply to every milestone)

### Stack (checked 2026-10-26)
| Piece | Version | Note |
|---|---|---|
| Node | 26 (`nvm use 26`, add `.nvmrc`) | The default Node here is 20.15.1, too old for Vite 8 (needs ≥ 20.19 / 22.12). Node 26 is already installed via nvm. |
| TypeScript | 7.0.x | type-check only (`tsc --noEmit`). Vite transpiles. |
| Vite | 8.3.x | dev server + build |
| Phaser | 4.2.x | rendering, input, scenes, filters/shaders. Pin exact versions in `package.json`. |
| Vitest | 5.0.x | unit tests for the simulation |
| Audio | Web Audio API directly (small mixer module) | Phaser's sound manager is too basic for buses, reverb, ducking and the slow-mo filter |
| Fonts | Anton + Inter (SIL OFL), bundled files | no CDN |

### Architecture
- **Simulation is plain TypeScript, separate from Phaser.** `src/sim/` has no Phaser imports and steps at a **fixed 60 Hz**. Phaser (`src/render/`, `src/scenes/`) reads sim state each frame and draws it. Input is turned into a per-tick command object that the sim consumes. This makes every timing in `research/measurements.md` testable headless in Vitest, and makes slow-motion, hit-stop and frame-stepping trivial (they are sim time-scale controls).
- **No physics engine.** Custom 2.5D kinematics: every entity has world position `(x, y, z)` with **x** = horizontal, **z** = depth on the floor, **y** = height above the floor. Gravity only on `y`. Collisions: room floor bounds, props as boxes `(x, z, height)`, soft push-apart between actors.
- **Units are H** (1.0 = one body height) for distance, **seconds** for time. Never pixels in sim code.
- **Camera = the measured one-point perspective** (`design/art-direction.md`): horizon at 0.53 of screen height, eye 1.79 H above the floor, focal length 2136 px at 1080p, walkable floor from z = 8 H (character 0.247 of screen height) to the back wall at z = 10.67 H (0.185). Room width fills 16:9 (≈ 7.2 H). `project(x, y, z)` lives in `src/render/camera.ts` and is the **only** world→screen mapping. Hit tests use it too.
- **Bullets and fast straight throws resolve in screen space** (decided): project every hurtbox (head ellipse + body capsule, scaled by depth) to the screen and intersect the 2D line from the muzzle toward the cursor. The first hurtbox crossed is hit, whatever its depth. A cover prop blocks a hit only if its screen box is crossed before the target **and** it is in front of the target in depth. Arcing throws (grenades) land on the floor point under the cursor (inverse projection onto the floor plane). Melee, grabs and takedowns need a **depth band** |Δz| ≤ 0.2 H.
- **Entities**: `Actor` (player, grunts, bosses share one base: state machine + two hands + hurtboxes + pose animator), `Item`, `Projectile`, `Corpse`, `Prop`, `Decal`. Corpses settle with a simple tumble (ballistic arc + rotate to lying flat), then freeze and get baked into the room's corpse layer. No ragdolls.
- **Events bus**: the sim emits typed events (`shot`, `hit`, `kill`, `explosion`, `doorOpen`, `aimTelegraph`, ...). Rendering, VFX, audio and the kill counter all subscribe; the sim never calls them directly. This keeps "feel" code out of gameplay code and makes it testable (assert the events).
- **Data-driven**: `src/data/tuning.ts` (every gameplay constant, each with a comment citing its source, e.g. `// move-jump: airtime 0.63 s, measured ep1 f2386–f2405`, or `// invented`), `src/data/feel.ts` (every effect number from `design/art-direction.md`), `src/data/palettes.ts`, `src/data/weapons.ts`, `src/data/enemies.ts`, `src/data/audio.ts` (sound ids → files, variants, bus, voice limit), `src/data/stages/stageN.ts` (rooms, spawn points, wave scripts, events, palette, reverb class, music cues).
- **Folder layout**: `src/sim/` (world, actors, combat, ai, items, physics, rooms, scripting, events), `src/render/` (camera, room, character, items, decals, vfx, post), `src/audio/` (mixer, sfx, music), `src/scenes/` (Boot, Game, Lab, UI), `src/data/`, `src/input/`, `assets/` (fonts, audio + LICENSES.md, music), `tests/`.

### Look & sound rules (from `design/`)
- Port the style frame's drawing code (`design/style-frame/index.html`), don't re-invent it. Characters, rooms, decals and effects are **procedural vector drawing**. Static layers (room, baked corpses, decals) are rendered to textures once and updated incrementally.
- Red only for blood and aim telegraphs, green only for zombies. One palette per stage (`src/data/palettes.ts`).
- **New character types and bosses get a character-sheet entry in the style frame before they're implemented**, in our own design (see the do-not-copy list in `design/art-direction.md`).
- Every new mechanic ships with its sound and VFX, listed in the milestone's **Look & sound** checklist. A mechanic without feedback isn't done.
- Sounds come from CC0/royalty-free sources and are logged in `assets/audio/LICENSES.md`. A session that needs to download sound packs **asks the user first** (name, source, size).

### Controls (keyboard + mouse, rebinding in M13)
WASD move (W/S = depth) · Space jump · Ctrl or C dive/prone (again, or Space, to get up) · mouse aim · LMB / RMB use left / right hand (fire, swing, or punch when empty) · F grab / throw grabbed / catch · Q throw the held weapon · E pick up / interact / takedown · G grenade (hold to cook) · R reload · Shift (hold) split-aim · F1 debug overlay · F2 slow-motion 0.25× · F3 pause · F4 / `.` frame-step · 1/2/3 stage palettes · P post FX.

### How to verify a mechanic
1. **Unit tests** (Vitest, headless sim) assert the numbers in each milestone's acceptance list. Tolerance: ±1 source frame (≈ 0.033 s) for timings, ±5% for distances/speeds unless stated. Events are asserted too (a kill emits `kill` with the right hit-stop and shake values).
2. **Replica lab** for each mechanic slug listed in the milestone: `/?lab=<slug>` loads a small scene that recreates the setup of that clip. Play it in slow motion with the debug overlay (H grid, hurtboxes, rays, frame counter) and compare against `research/mechanics/<slug>/frames-N.jpg` side by side. Note deviations in the PR. A Claude session can do this itself: `preview_start` from `.claude/launch.json`, frame-step, screenshots (or headless Chrome stills like `tools/design/shoot.sh`).
3. **Look check**: compare the lab against the style frame (same proportions, palette, line weights, effects) at 1× and 0.25×.
4. **Invented values** stay invented until playtesting. Don't "fix" them to look like the show. Measured values do follow the show.

### Definition of done (every milestone)
`npm run typecheck`, `npm test` and `npm run build` pass. Acceptance tests are written and passing. Replica labs and the look check are done, with deviations noted. `tuning.ts` / `feel.ts` have citations for new constants. New sounds are logged in `LICENSES.md`. The milestone checklist in this file is ticked. Work is on a branch `mN-<slug>`, merged to `main` via PR (remote: `github.com/ikepaul/MadnessCombat`).

---

## M0: Foundation & render style (M)
**Goal:** a project that builds and tests, and shows an empty room that already looks like the style frame.
**Read first:** `research/README.md`, `research/design-decisions.md`, `design/art-direction.md`, `design/style-frame/index.html`, this file's ground rules.

Build:
- [x] Vite + TS + Phaser 4 project, `.nvmrc` (26), scripts `dev`, `build`, `typecheck`, `test`. Add a `dev` entry to `.claude/launch.json` (port 5173) next to the existing `style-frame` one.
- [x] Fixed-step loop (60 Hz) with accumulator. Sim/render split. Time controls: time scale (slow-mo), hit-stop counter (frames to freeze), pause/frame-step.
- [x] Event bus (typed events, sim → subscribers).
- [x] `camera.ts` with the measured projection. `palettes.ts` (3 stage palettes + shared tokens). `feel.ts` skeleton.
- [x] **Room renderer** ported from the style frame: walls/ceiling/floor fills, depth gradients, baseboards, ink edges, doors (open/closed), key light (blurred cone + pool + bloom), props (table box), affordance markers (vent). Baked into a texture per room.
- [x] **Character renderer** ported from the style frame (head with form shading + specular + slit face, body tube + shade band, mitten hands, feet, contact shadow, hero/grunt/zombie variants), driven by a pose object. A static test pose in the room is enough here.
- [x] **Post FX pipeline**: film grain (tiling overlay), vignette (baked radial gradient; Phaser's Vignette filter has a hard edge), lamp bloom baked into the room layer; stubs for chromatic split and kill-cam tint (ColorMatrix filter) for M4.
- [x] Debug overlay: H grid on the floor, depth lines, frame counter, FPS.
- [x] Lab scene: `/?lab=<slug>` registry and an index page listing slugs from `research/clips.json` with "not built yet" markers.
- [x] Bundle Anton + Inter. `CLAUDE.md` with the ground rules summary and pointers to `PLAN.md`, `research/`, `design/`.

Done: see `CLAUDE.md` for the resulting architecture.

Acceptance: all four npm scripts work · a unit test steps the sim 60 ticks = 1.0 s · `project()` matches the style frame (front-edge character 0.247 screen height, back wall 0.185, horizon 0.53) · a side-by-side screenshot of the empty room and the style frame shows the same room look in all three palettes.

## M1: Room & movement (M)
**Goal:** the player character moves like the hero.
**Read first:** `move-walk`, `move-jump`, `move-prone-dodge`, `move-jump-onto-object` (only the jump-up part), `research/measurements.md` (movement), `design/art-direction.md` (animation).

Build:
- [x] Player controller on the floor plane: calm walk 0.8 H/s, combat walk 1.3 H/s (combat walk whenever an enemy is in the room or the player is armed, invented rule), depth speed 0.6× horizontal (invented), facing follows the aim side.
- [x] Jump: gravity ≈ 23 H/s², launch ≈ 7.3 H/s → apex 1.15 H, airtime 0.63 s. Keep takeoff momentum, ≤ 30% air steer. No double jump.
- [x] Dive/prone: stand → prone ≤ 0.15 s, hurtbox shrinks to 0.3 H tall, prone → stand 0.4 s. Dive while moving = forward dive ≈ 1 H.
- [x] Props with top surfaces: land on them if the feet clear the height. Floor bounds clamp.
- [x] Depth sorting of all drawables by z.
- [x] Debug "cannon" in labs: fires a ball at 26 H/s every 1.3 s at chest height.

Look & sound:
- [x] Walk cycle (feet alternate and lift, body bob 0.014 H, hands swing), idle breathing, jump/land poses with a 2-frame squash on landing, dive and prone poses, get-up.
- [x] Dust puff on landing and dives (small grey particles).
- [x] Hooks only: `footstep`, `land`, `dive` events (sounds arrive in M4).

Done: prone is a toggle (Ctrl or C to drop, Ctrl/C/Space to get up; no crawl). Dodge labs show live state, speed, feet height, hurtbox height and cannon hits.

Acceptance tests: walk 0.8 and 1.3 H/s · jump airtime 0.63 s ±1 frame, apex 1.15 H ±0.05 · prone transition ≤ 0.15 s, stand-up 0.4 s · the ball passes over a prone player and under a jumping one (timed jump) · landing on a 0.5 H prop.
Labs: `move-walk`, `move-jump`, `move-prone-dodge`.

## M2: Body, melee & corpses (L)
**Goal:** unarmed fighting feels like episode 1: punches, knockback, bodies everywhere.
**Read first:** `melee-punch-knockback`, `move-knockdown-getup`, `melee-hitstun-finisher`, `melee-grab-throw`, `melee-low-sweep`, `melee-decapitation`, `world-persistence-decals`, `design/art-direction.md` (animation, effects).

Build:
- [x] **Pose animation system**: pose = transforms for head, body, both hands, both feet, held item. Keyframed clips with easing on a 30 fps key grid, plus procedural layers (aim, breathing, walk, recoil, hit lean). **Pose editor lab** (`/?lab=pose-editor`) to author and save poses as data.
- [x] Hurtboxes: head ellipse + body capsule.
- [x] Actor state machine: idle, walk, jump, prone, attack, stun, knockback, down, get-up, grabbed, dead.
- [x] Light punch, heavy punch, uppercut (launch ≈ 1 H up). Punch range 0.5–0.6 H, depth band 0.2 H. Exchange rate 2–3 punches/s.
- [x] Hit-stun 0.7 s. Knockback ≈ 1.5 H over 0.35–0.4 s. Lie 0.2 s. Get-up 0.4 s with i-frames (invented). Knockdown drops the held item.
- [x] Damage (revised 2026-10-26, see `research/design-decisions.md`): grunts 4 hp, light 1 / heavy 2. Player 3 lives, every hit costs 1, every kill heals 1.
- [x] Grab (F) at contact range, throw toward the cursor (a thrown body is a projectile that knocks down what it hits and kills on a fast wall impact). Works on corpses too.
- [x] Low sweep = dive into an adjacent enemy: knockdown + drops their item.
- [x] Downward hit on downed enemies (finisher).
- [x] Corpses: tumble → settle → freeze → bake into the corpse layer. Flags `raisable`, `gibbed`. Head knock-off as a separate item (decapitation kill on grunts).

Look & sound:
- [x] Punch smear arc (1 frame) + impact star (1–2 frames) + hit lean. Uppercut launch pose. Thrown-body spin.
- [x] Dead face (x eyes), corpse poses (lying, slumped against a wall).
- [x] Blood toggle per stage: **off for stage 1** (as in episode 1), on from stage 2 (mist, wound bursts, wall splatter, pools: style frame code).
- [x] Player hurt flash + hit pips in the HUD.
- [x] Event hooks: `punch`, `hit`, `kill`, `bodyFall`, `throw`, `grab` (sounds in M4).

Done: LMB light jab, RMB heavy cross, RMB with the cursor steeply above the shoulder (> 45°) = uppercut; a punch at a downed body with nobody standing in reach becomes the finisher; punches pressed mid-swing are buffered 0.2 s; you keep walking at 70% while punching or throwing (walk speeds raised to 1.1 / 1.8 H/s, decided with the user). Decapitation = a grunt killed by a heavy attack (heavy, uppercut or RMB finisher); a LMB finisher does 1, RMB 2; loose heads can be grabbed and thrown (stagger, no kill). Knocked-down enemies lie 0.8 s (invented, gives the finisher a window), the hero 0.2 s (measured). Thrown bodies: 8 H/s toward the floor point under the cursor, knock down what they hit, kill on a wall impact ≥ 4 H/s, take 1 damage themselves. Poses and clips live in `src/data/poses.json` (`src/anim/`), authored in `/?lab=pose-editor` (Ctrl+S writes the file via the dev server). Layers: room → decals (blood) → baked corpses → actors; static layers upload at most once per frame, and layer canvases no longer use `willReadFrequently` (uploading the actor layer cost ~30 ms per frame before; now 0.04 ms). 200 baked corpses: 0.4 ms per frame; re-baking them after a pick-up ≈ 13 ms. The recoil layer comes with guns (M5). Reference frames were not on the machine this was built on, so the replica labs are checked against the notes' numbers only.

Acceptance tests: punch range/depth band hit and miss cases · knockback distance and airtime · knockdown → controllable ≈ 1.1 s · stun window 0.7 s · grunt kill rules · a thrown body knocks down a second dummy · 200 corpses in a room keep 60 fps (manual check, baked layer).
Labs: `melee-punch-knockback`, `move-knockdown-getup`, `melee-hitstun-finisher`, `melee-grab-throw`, `melee-low-sweep`, `melee-decapitation`, `pose-editor`.

## M3: Grunts & waves: first playable (M)
**Goal:** play Stage 1's unarmed riot (wave A) against real enemies.
**Read first:** `enemy-grunt-unarmed`, `enemy-spawning`, `world-kill-counter`, `research/stages.md` (Stage 1).

Build:
- [x] Grunt AI (unarmed): approach at combat walk → hold at punch range → attack every 0.6–1.0 s (invented) → react/die. **Attack tokens**: max 2–3 grunts actively attacking. Others circle/wait at 1.5–2.5 H.
- [x] Spawn points (screen edge, door with a 0.3 s open telegraph) + wave script format: `(delay, spawnPoint, enemyType, weapon)` entries. The next wave starts when the alive count drops below a threshold.
- [x] Stage 1 arena room data (our own outdoor arena design: open ground, one landmark prop, neutral palette) + wave A (≈ 18 unarmed grunts from both edges, 1–2 at a time).
- [x] Kill counter HUD (Anton, white + ink stroke, bottom-right). End-of-room body-count card.
- [x] Player death → restart the room (checkpoint per room, to confirm with the user in M13).

Look & sound:
- [x] Outdoor room variant of the room renderer (sky gradient, ground plane, horizon line, one landmark prop), own design.
- [x] Door open animation (0.3 s) as the spawn telegraph. Screen-edge entries walk in from off-screen.

Done: `src/sim/ai.ts` (attack tokens, max 2 attackers; grunts walk at 80% of the walk speed, punch from 0.45 H, 25% heavy punches, all invented), `src/sim/waves.ts` (wave scripts with a per-wave `maxAlive` cap, 4 for wave A, so arrivals stay a trickle), `src/data/stages/stage1.ts` (arena + wave A: 18 grunts from 6 edge spawns). The landmark is a leaning utility pole (own design, not the episode's tree). Outdoor rooms have no walls, so bodies stop at the bounds instead of slamming. Doors are now drawn per frame (they animate). The stage route is the default (`/`); the M0 style-frame room moved to `/?room=test`. End card: Enter fights the room again. Labs: `enemy-grunt-unarmed`, `enemy-spawning` (door entries), `world-kill-counter`. Difficulty is untuned: standing still, the player dies in about 6 s to two attackers; tune in the M4 feel pass.

Acceptance tests: the wave script runs to completion headless with a scripted "kill all" · never more than 3 attackers at once · the counter matches deaths.
Playable: `/?stage=1&room=arena&wave=A`.

## M4: Feel & audio foundation (M)
**Goal:** the first playable gets the heavy stylised feel and real sound. From here on every milestone ships its sounds and effects with the mechanics.
**Read first:** `design/art-direction.md` (effects table), `design/audio-direction.md` (technical spec, sound list for foley/melee/UI, music system), the style frame at FX = Heavy.

Build:
- [x] **Feel layer** driven by events + `feel.ts`: hit-stop (3 frames on kills/heavy hits, 1 frame max for automatic fire, ≤ 6 frames per second), impact frame (brighten the hit character), screen shake table, chromatic split (filter, 4–8 px, 2–3 frames), kill cam (time ×0.3 for 0.6 s + red tint + audio slowdown on: last kill of a wave, 3+ kills within 1 s, boss phase end), kill counter pop (green for zombies, used later).
- [x] **Audio engine** (`src/audio/`): Web Audio mixer with buses (`music`, `weapons`, `impacts`, `foley`, `voices`, `world`, `ui`), master compressor/limiter, voice limiting and variant/pitch randomisation, stereo pan by screen x, depth attenuation, room reverb (ConvolverNode, small/medium/large/outdoor), ducking, kill-cam low-pass + rate drop.
- [x] **Music system**: ambient bed + intensity layers (0–3) switched on bar boundaries, stingers, diegetic positioned sources (the stage 1 boombox). Reads `assets/music/cues.json`. Runs with ambience only until the user's tracks arrive.
- [x] **Sound sourcing** (ask the user before downloading packs): CC0/royalty-free sets for foley, punches, body falls, grabs/throws, footsteps (dirt, concrete), UI ticks, outdoor and indoor ambiences, door open. Process and normalise per the spec. Log everything in `assets/audio/LICENSES.md`.
- [x] Hook all M1–M3 events to sounds: footsteps, land, dive, punch layers (whoosh + impact + thump), heavy hit crack, body fall, grab, throw whoosh, door open, kill counter tick, grunt efforts/hurt/death vocalisations (non-verbal).
- [x] **Combos** (decided 2026-10-26, design here): strings of light/heavy hits that kill faster than the base 4 light / 2 heavy, on top of the punch buffer.
- [x] Settings stub: master/music/sfx volume and effect intensity (off/reduced/full) for shake, flashes and chromatic (full menu in M13).

Done: sounds without a recording are generated in code (`src/audio/synth.ts`) and also stand in while files decode. Feel: `src/feel/feel.ts` decides (plain TS, tested), `src/render/feelFx.ts` carries out shake, chromatic (red/cyan copies of the actor layer), kill cam (time ×0.3 via `clock.feelScale`, 10% red wash, audio low-pass + rate 0.6 + tape-stop whoosh). Hit-stop budget 6 frames per second. Combos: hits by one attacker on one target within 0.8 s chain; the 3rd+ hit and a heavy straight after a light (quick cross) deal +1, so light→heavy kills a grunt in 2 hits and three chained lights in 3; combo hits shake harder and the kill tick pitches up. Settings stub in `src/settings.ts` (localStorage): V cycles effect intensity (full/reduced/off: shake, flashes, chromatic), M mutes. Music: `assets/music/cues.json` maps rooms to an ambience (wind outdoors, room tone indoors) and a combat track (none yet); layers 1–3 follow the active enemy count on bar lines. Difficulty pass with a headless bot (`tests/balance.test.ts`, `BALANCE=1` for the report): grunts now wait 0.5 s in range before the first swing, swing every 0.8–1.3 s (20% heavy), no two grunt swings within 0.45 s, and a freed attack token waits 1 s before the next grunt steps in. A bot with 0.1–0.2 s reactions clears wave A taking 0–1 hits; one with 0.35 s reactions loses.

Hit-stop revised with the user (2026-10-26): kills 2 frames, every punch 1 frame. Recorded sounds: 48 CC0 files from three Kenney packs (punch impacts, body falls, wall thuds, landings, footsteps on grass and concrete, cloth, doors, UI ticks and confirmations) in `assets/audio/kenney/`, logged in `assets/audio/LICENSES.md`; whooshes, enemy voices, ambiences and the tape-stop stay generated. No M4A fallback for Safari yet.

Acceptance tests: a kill emits hit-stop 2 (revised from 3) / shake 6 / chromatic events · auto-fire hit-stop never exceeds 6 frames per second (synthetic test) · the mixer respects voice limits (synthetic burst of 20 casings → 6 voices) · music layer changes land on bar boundaries (unit test on the scheduler).
Feel review: play wave A at 1× and 0.25× next to the style frame. Note what feels cheap and fix it in this milestone.

## M4b: Local co-op (M)
**Goal (decided with the user 2026-10-26):** the final game is 2-player co-op. Two laptops (Windows and Mac) on the same Wi-Fi play the same room; single player stays available.
**Read first:** `research/design-decisions.md` (Co-op), this section.

Build:
- [x] Sim with several players: `World.players` / `commands` (one per player), per-player kill healing, combat walk, restart when nobody is left standing.
- [x] Down & revive: a co-op hero out of lives is knocked into `downed` (enemies ignore them); a teammate standing in the circle (0.75 H) charges the revive over 5 s, stepping out drains it in 1 s; revived with 1 life and the get-up i-frames. Alone, running out of lives still kills.
- [x] Grunt AI: each grunt fights the nearest standing player; attack tokens, the swing gap and token cooldowns are per player.
- [x] Co-op waves: `WaveDef.coop` overrides; stage 1 wave A is 27 grunts, 6 alive at once (invented).
- [x] Player 2's look: the hero plus a light strap across the body (style-frame character sheet first).
- [x] Network: the host simulates; player 2 sends inputs and draws the host's world. Relay on the Vite dev server's websocket (`src/net/relay.ts`, plugin in `vite.config.ts`), snapshots of everything drawn plus every sim event, replayed on the guest so its VFX, decals, corpse baking, sound and feel run unchanged (`src/net/snapshot.ts`). No prediction (same Wi-Fi).
- [x] Lobby: `/?coop=host` shows the join link for the other laptop and starts when player 2 connects (Enter plays alone); `/?coop=join` joins. A host restart restarts the guest too; a reconnecting guest gets the whole room.
- [x] HUD: a row of life pips per player ("P1 · you"), revive circle on the floor and a bar over the downed hero.

Done: host with `npm run dev:lan` (Vite on all network interfaces; Windows asks once to let Node through the firewall). Snapshots are ~0.5 KB per actor at 60 per second. Dev server only: a production build has no relay (internet play would need a server, later). The two-laptop playtest itself is up to the users.

Acceptance tests: two heroes follow their own commands · grunts target the nearest standing player, ≤ 2 tokens per player · downed instead of dead in co-op, dead when alone · revive after 5 s in the circle, drain when stepping out · relay routes inputs guest→host and snapshots host→guest only · the puppet world matches the host world and replays events without double counting · two competent bots clear co-op wave A.

## M5: Free aim & guns (L)
**Goal:** shooting works like the show: instant tracers, one-shot kills, constant weapon swapping.
**Read first:** `gun-hitscan-smg`, `gun-pistol-suppressed`, `gun-shotgun`, `gun-auto-rifle`, `gun-dual-wield`, `gun-reload`, `gun-empty-throw`, `gun-pickup-drop`, `research/design-decisions.md` (aim, bullets across depth, ammo).

Build:
- [x] Aim rig: the gun hand follows the cursor on a circle around the shoulder (reach 0.36 H pistols, 0.3 H long guns), head tilts toward the aim, the body faces the aim side.
- [x] Screen-space hitscan (ground rules).
- [x] Weapons data: pistol (semi, ≥ 0.15 s between shots, 8 rounds), suppressed pistol, Desert Eagle (7), SMG (0.1 s auto), rifle (0.1 s, 30), machine gun (0.07 s, 100, slower walk), pump shotgun (5–6 pellet rays ±4°, 0.6 s, 6), sawed-off (2). Rates/mags not measured are invented.
- [x] Items: weapons drop from hands/corpses with a bounce and stay. E = pick up. Auto-pickup with empty hands (proposal).
- [x] Two hands: LMB/RMB per hand. Dual wield any one-handed pair. Long guns can be dual-wielded with more spread. **Split aim** (Shift): the off-hand locks onto the nearest enemy on the opposite side.
- [x] Ammo (decided: throw & scavenge): magazine + max 1 spare, reload 0.6 s pistol / 1.0 s others (invented). Empty trigger → dry click → next press throws the gun. Dropped empty guns stay empty.
- [x] Gun damage (decided 2026-10-26): a grunt dies from 1 hit to the head or 2 to the body; the player loses 1 life per bullet like any hit.
- [x] Thrown gun: straight screen-space projectile, knockdown on hit, kills grunts on a head hit (invented).
- [x] Decal layer per surface rendered to textures, capped at 500 per room.

Look & sound:
- [x] Weapon drawings for every gun (style frame pistol as the template: slide/receiver + grip under the mitten), correct lengths (pistol 0.25 H, long guns 0.55 H).
- [x] 1-frame muzzle flash + room light flash, 1-frame tracer with glow, shotgun pellet streaks, ejected casings that stay (max 6 casing voices), dropped magazines.
- [x] Hits: blood mist + wound burst + wall splatter behind the target. Misses: bullet holes (concrete/wood/metal looks).
- [x] Recoil kick per weapon (hand + body), shake per weapon (`feel.ts`).
- [x] Gun sounds per weapon (mechanical + crack + body + tail through the room reverb), suppressed variant, dry fire, mag out/in, slide rack, pump rack, casings per surface, bullet impacts (flesh, concrete, metal, wood).

Done: `src/data/weapons.ts` (8 guns), `src/anim/aim.ts` (one aim rig shared by the painter and the hitscan, so tracers leave the drawn muzzle), `src/sim/hitscan.ts` (screen-space rays vs projected head circles and body capsules, cover only in front of the target, misses travel at the shooter's depth to a wall/floor/ceiling/prop), `src/sim/guns.ts` (fire, dry click → throw, reload, pick-up, split aim), `src/render/weaponPainter.ts` and `gunFx.ts`. Decisions taken here (invented, tunable): bullets do 4 to the head and 2 to the body (grunts have 4 hp), the Desert Eagle 4 on the body; a non-lethal bullet makes the target flinch 0.3 s; bullet kills knock the body back 0.7 H, point-blank shotgun (≤ 1.2 H) like a heavy hit and bursts the head; no friendly fire in co-op; only players pick weapons up (grunts in M7); grabbing needs both hands empty; a long gun held alone takes both hands (support hand on the barrel); the back hand may aim behind the body (split aim), the front hand always aims to the facing side; casings and magazines are render-side debris baked into the decal layer. One screen-space decal layer serves every surface (rooms are fixed screens) instead of one texture per surface. The HUD ammo readout is a text line per gun hand rather than a pip strip. Gunshots are range recordings by Vincent Sevedge (CC-BY 3.0, credited in `assets/CREDITS.md`) cut into single shots by `tools/audio/slice-gunshots.mjs` and kept as WAV (no converter on this machine); the suppressed shot and the slide rack are generated; casings, dry fire, magazine and impact sounds are Kenney recordings. Debug key L drops a random loaded gun at each player's feet (works in co-op and the arena). Labs are checked against the notes' numbers only (no reference frames here).

Acceptance tests: the ray hits the first visually crossed hurtbox at different depths (3 cases) · cover in front blocks, cover behind doesn't · SMG interval 0.1 s · a grunt dies from 1 bullet · empty → click → throw sequence · dual wield fires each hand independently · split-aim picks the correct target.
Labs: `gun-hitscan-smg`, `gun-pistol-suppressed`, `gun-shotgun`, `gun-auto-rifle`, `gun-dual-wield`, `gun-reload`, `gun-empty-throw`, `gun-pickup-drop`.

## M6: Throwing, explosives & advanced combat (L)
**Goal:** the signature Madness moves: knives, grenades, disarms, shields, improvised weapons.
**Read first:** `throw-knives`, `throw-grenade`, `throw-grenade-return`, `throw-catch-return`, `combat-disarm`, `combat-human-shield`, `combat-cover`, `melee-weapons`, `melee-environment-weapon`, `move-jump-onto-object`.

Build:
- [x] Knives: stab at ≤ 0.6 H, throw = projectile 13 H/s with slight drop, wind-up 0.1–0.15 s, one-hit kill, sticks in bodies/walls, retrieve by walking over (≈ 0.5 s pull).
- [x] Grenades: hold G = cook (the pin drops as debris), release = arc to the floor point under the cursor (max ≈ 4 H, invented). Fuse **1.1 s** from the pin. Blast 2 H: kills, gibs corpses (`raisable = false`), knocks bodies ≈ 1.5 H up, scorch decal. Live grenades are pickups (the fuse keeps running) → throw-back. Hook for breakable floor tiles (used in M9).
- [x] Catch: F with an empty hand within 0.15 s (invented) of a thrown object reaching you = catch it.
- [x] Disarm: grab on an armed enemy = steal (0.4 s, invented). Kicks/sweeps always knock weapons away, punches 30% (invented). A ray crossing the weapon sprite before the body = shot out of the hand.
- [x] Human shield: grab a live/dead enemy and hold them in front. They absorb hits from that side (~30, invented). You move at 0.6× and can fire a one-handed gun with the free hand.
- [x] Melee weapons (baton, knife, sword, scimitar, axe, bat, pipe): reach 0.6–1.0 H, one-hit kills on grunts, throwable (the axe can lodge). Long weapons (street sign: reach 1.5 H, multi-hit sweep, 0.5 s swing, 0.5 s pull out of the ground). **Pin**: a thrust into an enemy next to a wall/solid prop sticks them there.
- [x] Props: stand on (raises the gun origin), cover (blocks rays per the depth rule), solid (blocks movement).

Look & sound:
- [x] Knife spin and stick (stays in bodies/walls, visible), axe lodge, street sign drawing, swing smears per weapon.
- [x] Grenade: pin and spoon debris, blinking/fuse spark cue, explosion (white starburst → grey smoke puffs, gib debris, scorch decal), shake 14 px, chromatic, ducking.
- [x] Disarm: weapon spin-away arc. Human shield hold pose and gore on the shield.
- [x] Sounds: knife draw/whoosh/thunk/twang/pull-out, grenade pin/spoon/bounce/fuse hiss/explosion layers, melee weapon swings and hits, catch slap, weapon clatter, shield impacts.
- [x] (Added on request) Stage 1 melee-armed grunts: after the first few, about every third wave-A grunt carries a baton, knife, bat, pipe, axe, sword or scimitar. The grunt AI swings from the weapon's reach, and knife grunts sometimes throw from 1.8–4.5 H. Gun-armed grunts wait for M7.

Done notes: input is LMB/RMB per hand (a knife stabs within 0.6 H and is thrown beyond it), Q throws the front-most weapon, G is held to cook (release lobs), E also pulls stuck blades / the planted sign (or stand on one with empty hands). Grab needs only the front hand, so a one-handed gun in the back hand fires past a human shield. Shots can knock a weapon out of an enemy's hand only (not the players'). Gibbed bodies disappear into flying pieces + blood; the `explosion` event is the hook for breakable floors (M9). Enemies don't use the new weapons yet (M7); lab dummies throw knives and fire the machine gun.

Acceptance tests: knife speed/stick/retrieve · grenade fuse, radius, gib flags; a picked-up grenade keeps its fuse · catch window · steal transfers the weapon · the shield absorbs fire from the front only · the street sign hits two targets in one swing · pin attaches the corpse to the prop.
Labs: `throw-knives`, `throw-grenade`, `throw-grenade-return`, `throw-catch-return`, `combat-disarm`, `combat-human-shield`, `combat-cover`, `melee-weapons`, `melee-environment-weapon`, `move-jump-onto-object`.

## M7: Armed enemies, stealth & zombies (L)
**Goal:** every grunt variant, stealth takedowns and zombies behave as in the episodes.
**Read first:** `enemy-grunt-armed`, `enemy-behaviours`, `enemy-squad-leader`, `enemy-elite-bodyguard`, `enemy-zombie`, `melee-stealth-kill`, `move-drop-from-above`, `combat-cover`.

Build:
- [x] Weapon-driven grunt behaviour: melee → close in. Ranged → keep 3–5 H, seek cover facing the player, **aim telegraph ≈ 0.4 s**, then fire at 0.6–1.2 s intervals with aim error (invented numbers).
- [x] Friendly fire (enemy rays hit enemies). Floor-weapon scavenging within 2 H (they can pick up your empty guns, which click). Table flip into cover (25%, invented). Knife throws at > 2 H. One grenade per encounter.
- [x] Unaware/alert: unaware enemies idle/patrol facing a fixed direction. They become alert on seeing the player in front, unsuppressed gunshots or explosions in the room, and nearby loud deaths. The suppressed pistol doesn't alert.
- [x] Takedowns: E behind or landing on an unaware enemy = silent kill (knife ≈ 0.6 s, wire 1.5 s).
- [x] Squad leader (gun + melee squad within 2 H, the squad charges when he dies). Bodyguard (stays near a VIP, 2 hits, headshot 1).
- [x] Zombie: rises from an intact corpse in 1.0 s, walks 0.7–0.9 H/s, 3 bullet hits, 1–3 axe hits, keeps going headless (1 more hit), melee only or its corpse's weapon. Debug "raise all" command.

Look & sound:
- [x] Character-sheet entries first (style frame): squad leader accessory, bodyguard look, welder mask (used in M10).
- [x] Aim telegraph: dashed red line from the muzzle (style frame) + gun-raise pose + telegraph sound (clack + rising tone, 0.4 s).
- [x] Unaware idle loops (smoking with an ember, patrol). Alert reaction (head snap + small "!" mark in our style). Fear sweat on the last enemy of a wave.
- [x] Takedown animations (knife from behind, drop from above, wire). Zombie rise animation (green spreads over 1 s, jerky get-up), shuffle walk, moan. Zombie kills show green on the counter.
- [x] Table flip animation + sound. Squad leader shades.

Acceptance tests: an aim telegraph precedes every enemy shot · a friendly-fire kill · alert rules (suppressed vs. unsuppressed) · a takedown only works on unaware targets from behind/above · zombie rise time, HP and the raisable rule.
Labs: `enemy-grunt-armed`, `enemy-behaviours`, `enemy-squad-leader`, `enemy-elite-bodyguard`, `enemy-zombie`, `melee-stealth-kill`, `move-drop-from-above`.

## M8: Stage 1 complete (L)
**Goal:** episode 1 as a full stage, start to finish.
**Read first:** `research/stages.md` (Stage 1), `boss-halo` (clips 1–4), `research/episodes/ep1-log.md`, `design/audio-direction.md` (music brief, stage 1).

Build:
- [x] **Boss design pass first**: our own design for the necromancer boss (character sheet in the style frame, user sign-off), plus the boombox NPC and the dancer NPC.
- [x] **Sequencer** for scripted beats: coroutine scripts in the sim (`wait`, `moveTo`, `card`, `spawn`, `giveItem`, `lockInput`, `cameraShake`, `music`) for intros, cutscenes and set-piece events. Reused by every later stage.
- [x] Intro: the boombox NPC punches you (scripted knockdown), then you kill him (melee tutorial). The dancer NPC is in the background.
- [x] Wave A (from M3) → scripted grenade pickup → blow up the pile.
- [x] **Boss, stage-1 fight**: descend with a shadow. Lightning raise of 1–2 zombies from intact corpses (telegraph: raised hand + crackle). Cross-shaped shield → **our own shield shape** (blocks frontal rays ~1 s, then a window). Lightning strike = knockdown + disarm. Scripted SMG pickup. Hover dash (≈ 2–2.5 H in 0.27 s) → grab → 5–6 body slams every 0.5–0.67 s (mashing shortens, invented) → throw. Telekinetic corpse sweep. Summon cannon (falls with a shadow) → volleys every 1.3 s, ball 26 H/s (dodge by jump/prone), ≈ 4 shots. Dies to headshots while unshielded (boss HP invented).
  - [x] Part 1: descent with a shadow, lightning raise (telegraph, max 2 zombies), the ward (diamond, ~1 s + 1.5 s window, front side only), scripted SMG pickup, 3 head hits kill.
  - [x] Part 2: lightning strike (lands where you stood when his hand went up: knockdown + disarm; answers a blocked burst), hover dash (wind-up 0.25 s, ~2 H in 0.27 s) → grab → 6 body slams every 0.58 s (mashing cuts it to 2) → throw (one life). A teammate's head shot makes him let go.
  - [x] Part 3, phase 2 (from his first head wound, or after 30 s; untouchable until the cannon lands so a burst can't skip it): telekinetic sweep sends every intact corpse off the screen, the cannon drops beside him (shadow 0.8 s, crushes what's under it, stays as solid terrain you can stand on but not cover), 4-ball volleys from behind it every 9 s (barrel swings to your depth; jump or go prone), no ward while he works it. Cannonballs knock heroes down and kill grunts/zombies.
- [x] Wave B (≈ 9 grunts) with pickups (sawed-off, knives, 2 pistols). A grunt can man the cannon (an enemy uses a prop weapon). Jump onto the cannon, split-aim.
- [x] Ending: pick up the boombox, dance emote, body-count card vs. 32.

Look & sound:
- [x] Lightning bolt VFX (jagged, cyan-white, 2 frames + afterglow), raise-dead green spread, shield shimmer + ricochet sparks, telekinesis distortion ripple, cannon drop shadow + dust, cannonball + muzzle blast, falling-object whistle.
- [x] Boss sounds (crackle, thunder, rumble, ward hum, ricochet, dash whoosh, slams, telekinesis, cannon boom, heavy landing).
- [ ] Boombox as a positioned diegetic music source (user's track or ambience until delivered); stage 1 music cues: the script already sends `riot` / `boss` / `outro` (`MusicSystem.setTrack`), the tracks need entries in `assets/music/cues.json`.

Acceptance: the stage completes headless with a scripted bot (sequencer + waves don't deadlock) · boss phases trigger in order · all Stage 1 labs still pass.
Labs: `boss-halo` (clips 1–4), `world-falling-hazard` (cannon drop).

## M9: Room chaining & Stage 2, first half (L)
**Goal:** multi-room stages, stealth opening, breach, door waves, the clown, the boss interruption.
**Read first:** `research/stages.md` (Stage 2 rooms 1–6), `move-climb-vault`, `world-breach`, `world-objective-radar`, `boss-clown` (clip 1), `boss-halo` (clip 5), `boss-target` (clip 1).

Build:
- [ ] **Design pass first**: our own designs for the clown-type mini-boss and the target (character sheet, user sign-off).
- [ ] **Stage = room graph**: one-way exits of type door, ladder/vault, vent, breach, lift, fall, climb. Each plays a short transition and loads the next room. Room-entry options (entering from a vent/breach = enemies surprised ≈ 1 s, invented). Checkpoint per room.
- [ ] Tracker HUD (direction of the target's room; centred = breach point).
- [ ] Loadout per stage (wire + suppressed pistol). Blood on from stage 2.
- [ ] Rooms 1–6 per `stages.md`: outside wall, corner + ladder, rooftop A (cover), rooftop B (breach), target's office (the target flees with a friendly-fire shot, door waves ≈ 15–20, pump shotgun, the boss peeks in), corridor (shotgun grunts, **clown** + squad: rifle, weak to steal, **boss interruption**: telekinetic fling ≈ 3.6 H in 0.33 s, pin ≈ 0.25 s, mass raise of 8 zombies, then he leaves).
- [ ] Target NPC: always running to the next door, can't be killed before the final room.

Look & sound:
- [ ] Cool stage palette. Rooftop/outdoor night variant, building exteriors (own designs), tracker device UI (radar rings + blip).
- [ ] Room transitions (short wipe/cut in our style, ladder/vault animations), breach explosion through the ceiling with debris and a persistent hole.
- [ ] Infiltration ambience + combat layers switching on alert. Stealth = music drops to the bed only.

Acceptance: rooms chain in order with each transition type · a breach opens only with an explosion on the marked tile · the clown can be disarmed and killed with his own rifle · the mass raise only raises intact corpses.
Labs: `move-climb-vault`, `world-breach`, `world-objective-radar`, `boss-clown` (clip 1), `boss-halo` (clip 5), `boss-target` (clip 1).

## M10: Stage 2 complete (L)
**Goal:** the elevator set piece and the rest of episode 2.
**Read first:** `research/stages.md` (Stage 2 rooms 7–11), `world-elevator-fight`, `enemy-welder`, `world-destructible`, `world-interrogate-knockout`, `boss-target` (clip 2), `world-last-stand` (ep2 ending).

Build:
- [ ] **Elevator room**: moving cab (scrolling shaft), two player positions (inside / on the roof via the hatch), roof attackers, **welder** cutting a slot in ≈ 2.7 s (kill him to stop it), a gunner firing down through it, grenade drop → throw-back, drops through the hole, door ambush, destructible cables → the cab falls, cable-climb transition.
- [ ] Sword room (blade disarms, **dazed** state ≈ 5 s, invented), lobby (dual shotguns, **hold-up → interrogate → knockout**), crate room (cover AI facing the lift, vent flank, lift ambush from behind).
- [ ] Final office: the target behind the desk (peek and shoot every ≈ 1.5 s, invented), two bodyguards, **shoot-to-disarm → surrender** → non-interactive ending cutscene (the boss shoots the player from behind) → our own end card + body count vs. 86.

Look & sound:
- [ ] Shaft parallax scroll, welder sparks (bright, additive) + cut-line glow, cable snap + fall shake, interrogation speech bubbles (pictogram style, no text from the show), dazed stars.
- [ ] Elevator motor/rattle, plasma cutter loop, cable snap + fall wind + crash, lift ding, stage 2 ending stinger (silence → impact).

Acceptance: elevator scripted events fire in order, and the cables only break after the door ambush · the hold-up only triggers on the last unarmed enemy · the stage completes with a scripted bot.
Labs: `world-elevator-fight`, `enemy-welder`, `world-destructible` (clip 1), `world-interrogate-knockout`, `boss-target` (clip 2).

## M11: Stage 3, first half (XL: split into 11a rooms 1–5 and 11b street if needed)
**Goal:** the knife-run opening, improbability mode, the collapsing room and the surreal street.
**Read first:** `research/stages.md` (Stage 3 rooms 1–6), `world-improbability-mode`, `world-arena-collapse`, `world-falling-hazard`, `move-fall-transition`, `boss-clown` (clips 2–3), `enemy-sun-brute`, `melee-environment-weapon`, `world-kill-counter`.

Build:
- [ ] **Design pass first**: our own surreal street (no storefront from the show), our own "background object comes alive" brute instead of the sun, our own giant falling object instead of the marshmallow, the jetpack mini-boss look.
- [ ] Loadout: two knives. Rooms 1–4: vent drop takedown, knife throws + retrieval, table room (an enemy grabs the floor axe, table flip, throw the empty rifle, fight from the table), camera room (security camera → cutscene: the target activates the improbability device).
- [ ] **Improbability mode**: knockback ×2.3–2.5, wall/ceiling restitution 0.8, 10% chance to embed in the ceiling (invented), enemies enter flying. Active until the end of the street.
- [ ] **Arena collapse**: crack telegraph ≈ 1 s, then half the floor falls away (things on it fall).
- [ ] **Jetpack mini-boss (fight 1)**: hovers over the void, long MG burst (human shield/cover), flies off when empty, re-enters behind you through a door (door-open telegraph) and shoves. Scripted outcome: you fall → **fall transition** into the street (shadow, face-down landing).
- [ ] Street: two-sided ambush, weapon churn, surreal sky, **giant falling object** (shadow 0.5–1 s, crush, becomes a solid block), uproot the street sign, **brute** (≈ 6 melee hits, invented), the mini-boss with a scimitar → **pin** to the block → cutscene revive as a zombie.

Look & sound:
- [ ] Warm stage palette. Improbability visuals: rubbery squash on wall bounces, motion trails on flying bodies, surreal sky layer (own designs), the collapse with a void edge.
- [ ] Improbability audio: warped "boing" layer on knockbacks, tape-wobble filter on the world bus, falling-object whistle, jetpack burner loop, MG roll.
- [ ] Stage 3 music cues wired (opening, building combat, improbability street).

Acceptance: improbability bodies bounce off walls and the ceiling, and stop doing so after the mode ends · the collapse kills everything on the falling side · the mini-boss fight can't end in his death (scripted) · pin works only next to a solid prop.
Labs: `world-improbability-mode`, `world-arena-collapse`, `world-falling-hazard`, `move-fall-transition`, `boss-clown` (clips 2–3), `enemy-sun-brute`, `combat-human-shield`.

## M12: Stage 3 complete (L)
**Goal:** the desert, the sealed arena, the zombie mini-boss, the boss duel and the last stand.
**Read first:** `research/stages.md` (Stage 3 rooms 7–11), `world-arena-lock`, `boss-clown` (clip 4), `boss-halo` (clips 6–7), `throw-catch-return`, `world-destructible` (clip 2), `world-last-stand`.

Build:
- [ ] Desert: squad leader + knife squad (knife-disarm), **arena lock** (walls drop with shadows and crush), drop-in waves, blood flood (cosmetic), **zombie mini-boss** on the jetpack with the street sign (bullets barely hurt, invented 10% damage) → grab the sign → finisher.
- [ ] Boss: mass raise ≈ 5, bullet-sponge (no damage here), **wall blast** = transition through a destructible wall into the next room.
- [ ] Vending room: knife-throwing grunt (catch-and-return), the empty-pistol gag, throw into the vending machine, the boss flies in, raises 2 zombies, **sword dive**, damage → **teleport away**.
- [ ] Console room (the target flees, door waves).
- [ ] Final lift room: the target + 2 elite bodyguards → **last stand** (decided): red bars, can't move, aim/fire for ≈ 5 s (the backward over-the-shoulder shot is allowed only here), kill the boss and the target → death → credits card with body count vs. 91.

Look & sound:
- [ ] Wall drops with dust and impact shake, the blood flood spreading, the wall-blast hole, teleport implosion VFX, last-stand red bars + heartbeat + desaturation fade.
- [ ] Sealed-arena / boss-duel music cue, last-stand cue (heartbeat + drone), credits.

Acceptance: the last stand ends the stage whether or not both are killed (proposal: the stage still counts as finished) · the stage completes with a scripted bot · all three stages are playable in sequence.
Labs: `world-arena-lock`, `boss-clown` (clip 4), `boss-halo` (clips 6–7), `throw-catch-return`, `world-destructible` (clip 2), `world-last-stand`, `world-kill-counter`.

## M13: Game shell & final polish (M)
**Goal:** a complete game wrapper and a final art/audio pass.
**Read first:** `research/design-decisions.md` ("Still open"). Ask the user those questions before starting (gamepad, difficulty, checkpoints, stage select).

Build:
- [ ] Title screen, stage select, pause menu, settings (volumes, key rebinding, blood toggle, **effect intensity** for shake/flashes/chromatic, reduced-motion preset), end-of-stage body-count comparison.
- [ ] Checkpoints per room (or whatever the user picks). Restart flow.
- [ ] Credits screen from `assets/CREDITS.md` (CC-BY credits are required: the gunshot recordings).
- [ ] Final music integration (all delivered stems, mix pass at −16 LUFS), final SFX mix pass per stage.
- [ ] Final art pass: consistency of line weights and palettes across all rooms, title/stage cards in our own design.
- [ ] Performance pass: decal/corpse caps, profiling the heaviest rooms (stage 2 office, stage 3 desert) at 60 fps with full effects.
- [ ] Bugfix and playtest pass on all invented numbers in `tuning.ts` and `feel.ts`.

Acceptance: a full playthrough of all three stages from the title screen · 60 fps in the heaviest rooms on the dev machine with full effects.

---

## Risks to watch
- **Readability of depth + free aim**: screen-space hits with characters at different depths can confuse. Mitigation: depth-scaled hurtboxes, contact shadows, a debug overlay to tune, clear tracers.
- **Hitscan fairness**: enemies with instant bullets are unfair without the aim telegraph (M7). Keep it obvious, visually and audibly.
- **Heavy effects vs. clarity**: hit-stop and chromatic on every hit would make auto fire mushy and busy. Respect the caps in `feel.ts` and do a feel review each milestone.
- **"Cheap" look creeping in**: placeholder art that never gets replaced. Mitigation: start in the final style (M0) and do a look check against the style frame in every milestone.
- **Set-piece creep**: stages 2–3 are mostly one-off scripted events. Build them on the M8 sequencer and room-event hooks. Don't generalise beyond what the episodes need.
- **Performance**: persistent corpses/decals plus full-screen filters. Bake static layers, cap decals, profile in M13.
- **Copyright**: no names, character designs, music, sounds or text from the episodes (see the do-not-copy list in `design/art-direction.md`). Reference footage never enters git.
