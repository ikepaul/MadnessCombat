# Milestone plan

How we get from the research catalogue (`research/`) and the art/audio direction (`design/`) to three playable stages. Each milestone is sized for one implementation session (medium effort), sometimes split into several PRs. It is **self-contained**: it lists what to read, what to build (mechanics **and** their look and sound), what to leave out, and acceptance checks with the measured numbers.

Decisions live in `research/design-decisions.md` (gameplay), `design/art-direction.md` (visuals) and `design/audio-direction.md` (sound and the music brief). Don't re-open them inside a milestone; ask the user if one turns out not to work.

**Order is linear.** It starts in the final art style from day one (the style frame is ported in M0). Unarmed fighting is playable at M3, a dedicated feel & audio milestone follows at M4, guns come at M5–M7, the first complete stage at M8, then stages 2 and 3. Stage 4 (episode 4, added 2026-10-27) comes after the shell: its new mechanics first (M14), then its rooms (M15–M16). M17–M20 (co-op feel and the rage meter, added 2026-10-27) don't depend on stage 4 and can be built alongside it, in this order: M17 first (M18 uses its depth snap, auto-catch and grab-with-any-hand), then M18, M19, M20. Merge `main` (stage 4 included) before starting each of them: they touch `combat.ts`, `guns.ts` and `hud.ts`, which M14 changes too.

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
| M10b | Combos & fatalities, first slice (added 2026-10-27) | Juggles, wall bounces, pop-and-catch disarms, thrown-gun links, the head punt and the over-the-shoulder shot, on every stage built so far | M |
| M11 | Stage 3 (first half) | Stage 3 rooms 1–6 incl. improbability mode | XL (split in two if needed) |
| M12 | **Stage 3 complete** | Desert, vending room, final room, last stand | L |
| M13 | Game shell & final polish | Title, stage select, settings (incl. effect intensity), checkpoints, final art/audio pass | M |
| M14 | Stage 4 mechanics (added 2026-10-27) | The agent, fire-mode switch, stairs, sword guard/parry, armed zombies, crowds, acting from the ground, in labs and a test room | L |
| M14b | Audit & polish pass (added 2026-10-28) | The audit bundle: every crash/softlock/wrong-rule bug, a hero mercy window, input buffers, combat holes, AI caps and teaching, pose pops, music that plays through rooms, shell fixes, then a playtest pass. After M14, before M15; needs PR #43 | L |
| M15 | Stage 4 (first half) | Car-ram arrival, poster/door/office/vending rooms, the stairwell | L |
| M16 | **Stage 4 complete** | The club: crowd fight, DJ, boss arrival + mass raise, duel, detonator ending; shell knows four stages | L |
| M17 | Quality-of-life pass (added 2026-10-27) | Second-hand auto pickup, a clear E prompt and hand choice, depth snap for punches, easier catches, cover and aim fixes, grenade marker, throws that find depth, grab with any hand | M |
| M18 | **Co-op moves** (added 2026-10-27) | Hold & hit, shared chains, ping-pong, wishbone, weapon pass, body bat, double-team, hero toss, carry-spin | L |
| M19 | Rage meter & solo rage fatalities (added 2026-10-27) | A variety-fed rage bar per player, the full-rage look, Tab fires one of four supers (fists, gun, blade, club) | L |
| M20 | Team rage fatalities (added 2026-10-27) | The proximity request and the two team supers (back to back, ping-pong rampage) | M |

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
- [x] Boombox as a positioned diegetic music source (`src/audio/boombox.ts`: follows the boombox in a hand or on the floor, pan + depth + room reverb; the user's `s1_boombox_mix.wav` once delivered, radio static until then; swells for the outro). Stage 1 music cues in `assets/music/cues.json` (`riot` → `s1_riot`, `boss` → `s1_boss`, `diegetic` → `s1_boombox`); undelivered tracks are skipped.

Acceptance: the stage completes headless with a scripted bot (sequencer + waves don't deadlock) · boss phases trigger in order · all Stage 1 labs still pass.
Labs: `boss-halo` (clips 1–4), `world-falling-hazard` (cannon drop).

Done notes: the whole stage is one sequencer script (`src/data/stages/stage1Script.ts`; `?beat=` starts it at any beat). Decisions taken here (invented, tunable in `TUNING.boss` and the script's constants): boss 3 head hits, phase 2 at his first wound or after 30 s and he can't be hurt until his cannon lands; ward 1 s up then a 1.5 s window, never during a move; strike lands where you stood when his hand went up; 6 slams, mashing cuts them to 2, the grab costs one life; volleys of 4 every 9 s; wave B's cannoneer; pickups by kill count; the boombox is locked until the ending; the ending's 60 s fallback. The cannon is a new prop design (no sign-off needed for props). No placeholder music: until the user's tracks arrive the cues are silent and the boombox plays radio static.

## M9: Room chaining & Stage 2, first half (L)
**Goal:** multi-room stages, stealth opening, breach, door waves, the clown, the boss interruption.
**Read first:** `research/stages.md` (Stage 2 rooms 1–6), `move-climb-vault`, `world-breach`, `world-objective-radar`, `boss-clown` (clip 1), `boss-halo` (clip 5), `boss-target` (clip 1).

Build:
- [x] **Design pass first**: our own designs for the clown-type mini-boss and the target (character sheet, user sign-off).
- [x] **Stage = room graph**: one-way exits of type door, ladder/vault, vent, breach, lift, fall, climb. Each plays a short transition and loads the next room. Room-entry options (entering from a vent/breach = enemies surprised ≈ 1 s, invented). Checkpoint per room.
- [x] Tracker HUD (direction of the target's room; centred = breach point).
- [x] Loadout per stage (wire + suppressed pistol). Blood on from stage 2.
- [x] Rooms 1–6 per `stages.md`: outside wall, corner + ladder, rooftop A (cover), rooftop B (breach), target's office (the target flees with a friendly-fire shot, door waves ≈ 15–20, pump shotgun, the boss peeks in), corridor (shotgun grunts, **clown** + squad: rifle, weak to steal, **boss interruption**: telekinetic fling ≈ 3.6 H in 0.33 s, pin ≈ 0.25 s, mass raise of 8 zombies, then he leaves).
- [x] Target NPC: always running to the next door, can't be killed before the final room.

Look & sound:
- [x] Cool stage palette. Rooftop/outdoor night variant, building exteriors (own designs), tracker device UI (radar rings + blip).
- [x] Room transitions (short wipe/cut in our style, ladder/vault animations), breach explosion through the ceiling with debris and a persistent hole.
- [x] Infiltration ambience + combat layers switching on alert. Stealth = music drops to the bed only.

Acceptance: rooms chain in order with each transition type · a breach opens only with an explosion on the marked tile · the clown can be disarmed and killed with his own rifle · the mass raise only raises intact corpses.
Labs: `move-climb-vault`, `world-breach`, `world-objective-radar`, `boss-clown` (clip 1), `boss-halo` (clip 5), `boss-target` (clip 1).

## M10: Stage 2 complete (L)
**Goal:** the elevator set piece and the rest of episode 2.
**Read first:** `research/stages.md` (Stage 2 rooms 7–11), `world-elevator-fight`, `enemy-welder`, `world-destructible`, `world-interrogate-knockout`, `boss-target` (clip 2), `world-last-stand` (ep2 ending).

Build:
- [x] **Elevator room**: moving cab (scrolling shaft), two player positions (inside / on the roof via the hatch), roof attackers, **welder** cutting a slot in ≈ 2.7 s (kill him to stop it), a gunner firing down through it, grenade drop → throw-back, drops through the hole, door ambush, destructible cables → the cab falls, cable-climb transition.
- [x] Sword room (blade disarms, **dazed** state ≈ 5 s, invented), lobby (dual shotguns, **hold-up → interrogate → knockout**), crate room (cover AI facing the lift, vent flank, lift ambush from behind).
- [x] Final office: the target behind the desk (peek and shoot every ≈ 1.5 s, invented), two bodyguards, **shoot-to-disarm → surrender** → non-interactive ending cutscene (the boss shoots the player from behind) → our own end card + body count vs. 86.

Look & sound:
- [x] Shaft parallax scroll, welder sparks (bright, additive) + cut-line glow, cable snap + fall shake, interrogation speech bubbles (pictogram style, no text from the show), dazed stars.
- [x] Elevator motor/rattle, plasma cutter loop, cable snap + fall wind + crash, lift ding, stage 2 ending stinger (silence → impact).

Acceptance: elevator scripted events fire in order, and the cables only break after the door ambush · the hold-up only triggers on the last unarmed enemy · the stage completes with a scripted bot.
Labs: `world-elevator-fight`, `enemy-welder`, `world-destructible` (clip 1), `world-interrogate-knockout`, `boss-target` (clip 2).

## M10b: Combos & fatalities, first slice (M)
**Goal:** reward chaining *different* verbs (launch → shoot, disarm → catch → use, throw → punch) and add context kills, using systems that already exist. Six moves; the rest of the brainstorm waits.
**Read first:** `design/combos-and-fatalities.md` (the brainstorm, sections 2 and 6), `research/design-decisions.md` ("Combos", "Fatalities"), `melee-punch-knockback`, `melee-hitstun-finisher`, `melee-decapitation`, `combat-disarm`, `gun-empty-throw`, `throw-catch-return`, `world-last-stand`, `src/sim/combat.ts`, `TUNING.combo`.

Rules for every move (decided):
- **Chains**: the existing 0.8 s window and +1 damage stay. New: a chain hit can come from any of the hero's verbs (punch, thrown gun, caught weapon, shot), not only punches. Chains are per attacker and target, as now.
- **Fatalities are contextual**: no extra input, triggered by how and where the kill happens. ≤ 0.8 s of special animation, the world keeps running, the kill-cam stays within the feel budget. Never a cutscene.
- **Reward is feel only** (hit-stop, pitch-up, kill-cam). No score, no meter.
- Stage 1 stays bloodless: fatalities there are decaps and launches.

Build:
- [x] **Launcher → juggle.** A heavy uppercut on a stunned grunt launches him (≈ 1 H, ≈ 0.5 s airtime, invented). While airborne: LMB jabs add ≈ 0.15 s airtime each (max 3), RMB spikes him into the floor (knockdown + floor bounce), F grabs him out of the air (allowed while he's airborne, the hero stays grounded). Shots at an airborne grunt count as head hits. Reference: ep2 f3310, ep1 f1929.
- [x] **Wall bounce.** A heavy/thrown-body slam into a wall or a solid prop (cannon, crates, tables) below the 4 H/s kill speed bounces the grunt back airborne toward the attacker instead of stopping him: a juggle starter. Outdoor bounds don't bounce. M11's improbability mode multiplies this (keep one code path). Reference: ep3 f2350–f2510.
- [x] **Pop & catch.** A light-punch disarm (and a steal that misses) sends the weapon spinning *up* (≈ 1 H, invented) instead of to the floor. The existing F snatch catches it; the first attack with a caught weapon within the window is a chain hit. Enemies don't catch. Reference: ep2 f3060–f3140, f5310–f5360.
- [x] **Click → throw → punch.** A thrown empty gun that hits a head stuns (as a light punch) and counts as a chain hit, so the next punch inside the window is chain hit 2 (a heavy kills). Reference: ep3 f1210–f1230, f3220.
- [x] **Head punt (fatality).** A heavy at a stunned **airborne** grunt that kills him decapitates and shoots the head along the hit direction at ≈ 6 H/s (invented). The head knocks down the first grunt it hits (instead of the usual stagger for thrown heads). Short kill-cam on the head. Reference: ep1 f1929.
- [x] **Over-the-shoulder shot (fatality + counter).** Holding a gun, with an enemy in melee contact behind you (≤ 0.6 H, invented): RMB fires the back hand backward without turning. A kill this way is a head burst (stage 2+) / decap (stage 1) with a kill-cam. It replaces the "allowed only in the last stand" rule in M12; the last stand uses this same move. Reference: ep3 f6660–f6710.

Look & sound:
- [x] Juggle: launch whoosh + dust puff, airtime motion smear, spike floor-crack ring + thud. Wall bounce: squash on contact (small, rubbery only in improbability mode), wall dust, low bump.
- [x] Pop & catch: spinning weapon with a short glint at the top of the arc, a crisp catch slap. Thrown gun: metal-on-skull clonk.
- [x] Head punt: head trail, kill-cam follows the head. Over-the-shoulder: backward muzzle flash from the back hand, dry close-mic shot, kill-cam.
- [x] Combo feel: chain hit 3+ and every fatality pitch the kill tick up further (existing behaviour, extend to the new chain sources).

Acceptance: a launched grunt can be kept airborne for at most 3 jabs · walls bounce, outdoor bounds don't · a popped weapon can be caught by either player in co-op · a thrown empty gun + one heavy kills a grunt · the head punt knocks down the grunt it hits · the backward shot only fires at an enemy in contact behind the hero · the balance bot (`tests/balance.test.ts`) with 0.35 s reactions still loses wave A (the new moves mustn't make it trivial) · co-op guests see all six via replayed events (no sim rules run on puppets).
Labs: `combo-juggle`, `combo-wall-bounce`, `combo-pop-catch`, `combo-gun-throw`, `fatality-head-punt`, `fatality-over-shoulder`.

## M11: Stage 3, first half (XL: split into 11a rooms 1–5 and 11b street if needed)
**Goal:** the knife-run opening, improbability mode, the collapsing room and the surreal street.
**Read first:** `research/stages.md` (Stage 3 rooms 1–6), `world-improbability-mode`, `world-arena-collapse`, `world-falling-hazard`, `move-fall-transition`, `boss-clown` (clips 2–3), `enemy-sun-brute`, `melee-environment-weapon`, `world-kill-counter`.

Build:
- [x] **Design pass first**: our own surreal street (no storefront from the show), our own "background object comes alive" brute instead of the sun, our own giant falling object instead of the marshmallow, the jetpack mini-boss look.
- [x] Loadout: two knives. Rooms 1–4: vent drop takedown, knife throws + retrieval, table room (an enemy grabs the floor axe, table flip, throw the empty rifle, fight from the table), camera room (security camera → cutscene: the target activates the improbability device).
- [x] **Improbability mode**: knockback ×2.3–2.5, wall/ceiling restitution 0.8, 10% chance to embed in the ceiling (invented), enemies enter flying. Active until the end of the street.
- [x] **Arena collapse**: crack telegraph ≈ 1 s, then half the floor falls away (things on it fall).
- [x] **Jetpack mini-boss (fight 1)**: hovers over the void, long MG burst (human shield/cover), flies off when empty, re-enters behind you through a door (door-open telegraph) and shoves. Scripted outcome: you fall → **fall transition** into the street (shadow, face-down landing).
- [x] Street: two-sided ambush, weapon churn, surreal sky, **giant falling object** (shadow 0.5–1 s, crush, becomes a solid block), uproot the street sign, **brute** (≈ 6 melee hits, invented), the mini-boss with a scimitar → **pin** to the block → cutscene revive as a zombie.

Look & sound:
- [x] Warm stage palette. Improbability visuals: rubbery squash on wall bounces, motion trails on flying bodies, surreal sky layer (own designs), the collapse with a void edge.
- [x] Improbability audio: warped "boing" layer on knockbacks, tape-wobble filter on the world bus, falling-object whistle, jetpack burner loop, MG roll.
- [x] Stage 3 music cues wired (opening, building combat, improbability street).

Acceptance: improbability bodies bounce off walls and the ceiling, and stop doing so after the mode ends · the collapse kills everything on the falling side · the mini-boss fight can't end in his death (scripted) · pin works only next to a solid prop.
Labs: `world-improbability-mode`, `world-arena-collapse`, `world-falling-hazard`, `move-fall-transition`, `boss-clown` (clips 2–3), `enemy-sun-brute`, `combat-human-shield`.

## M12: Stage 3 complete (L)
**Goal:** the desert, the sealed arena, the zombie mini-boss, the boss duel and the last stand.
**Read first:** `research/stages.md` (Stage 3 rooms 7–11), `world-arena-lock`, `boss-clown` (clip 4), `boss-halo` (clips 6–7), `throw-catch-return`, `world-destructible` (clip 2), `world-last-stand`.

Build:
- [x] Desert: squad leader + knife squad (knife-disarm), **arena lock** (walls drop with shadows and crush), drop-in waves, blood flood (cosmetic), **zombie mini-boss** on the jetpack with the street sign (bullets barely hurt, invented 10% damage) → grab the sign → finisher.
- [x] Boss: mass raise ≈ 5, bullet-sponge (no damage here), **wall blast** = transition through a destructible wall into the next room.
- [x] Vending room: knife-throwing grunt (catch-and-return), the empty-pistol gag, throw into the vending machine, the boss flies in, raises 2 zombies, **sword dive**, damage → **teleport away**.
- [x] Console room (the target flees, door waves).
- [x] Final lift room: the target + 2 elite bodyguards → **last stand** (decided): red bars, can't move, aim/fire for ≈ 5 s (the backward over-the-shoulder shot from M10b is how the boss behind you is hit), kill the boss and the target → death → credits card with body count vs. 91.

Look & sound:
- [x] Wall drops with dust and impact shake, the blood flood spreading, the wall-blast hole, teleport implosion VFX, last-stand red bars + heartbeat + desaturation fade.
- [x] Sealed-arena / boss-duel music cue, last-stand cue (heartbeat + drone), credits.

Acceptance: the last stand ends the stage whether or not both are killed (proposal: the stage still counts as finished) · the stage completes with a scripted bot · all three stages are playable in sequence.
Labs: `world-arena-lock`, `boss-clown` (clip 4), `boss-halo` (clips 6–7), `throw-catch-return`, `world-destructible` (clip 2), `world-last-stand`, `world-kill-counter`.

## M13: Game shell & final polish (M)
**Goal:** a complete game wrapper and a final art/audio pass.
**Read first:** `research/design-decisions.md` ("Still open"). Ask the user those questions before starting (gamepad, difficulty, checkpoints, stage select).

Build:
- [x] Title screen, stage select, pause menu, settings (volumes, key rebinding, blood toggle, **effect intensity** for shake/flashes/chromatic, reduced-motion preset), end-of-stage body-count comparison.
- [x] Checkpoints per room (or whatever the user picks). Restart flow.
- [x] Credits screen from `assets/CREDITS.md` (CC-BY credits are required: the gunshot recordings).
- [ ] Final music integration (all delivered stems, mix pass at −16 LUFS), final SFX mix pass per stage. **Waiting on the user's stems** (only `MadnessCombat.V1.wav` so far).
- [x] Final art pass: consistency of line weights and palettes across all rooms, title/stage cards in our own design. (Checked, no changes needed: `design/art-pass.md`. Working title "BODY COUNT" until the user names the game.)
- [x] Performance pass: decal/corpse caps, profiling the heaviest rooms (stage 2 office, stage 3 desert) at 60 fps with full effects. (Numbers in `research/performance.md`: both rooms hold 60 fps with 60+ bodies; the room restart stall after a death went from ~1.6 s to ~15 ms by reusing the layer canvases. Decals stay capped at 500; corpses need no cap.)
- [ ] Bugfix and playtest pass on all invented numbers in `tuning.ts` and `feel.ts`. Tool: F6 in a dev build opens the tuning panel (every number, live, kept between reloads, "Copy changes" to commit them). Playtest changes so far: movement, grenades, grab assist, gore, idles. Needs the user's hands-on pass.

Acceptance: a full playthrough of all three stages from the title screen · 60 fps in the heaviest rooms on the dev machine with full effects.

## M14: Stage 4 mechanics (L)
**Goal:** every new mechanic of episode 4 working in labs and a test room, before any stage 4 room is built.
**Read first:** `research/episodes/ep4-log.md`, `research/stages.md` (Stage 4), `enemy-agent`, `gun-fire-mode`, `move-stairs`, `melee-blade-deflect`, `world-crowd-dancefloor`, `world-vehicle-ram`, the "Episode 4 additions" in `enemy-zombie`, `boss-halo`, `boss-clown`, `move-knockdown-getup`, `world-destructible`, `world-last-stand`, `enemy-behaviours`, `melee-weapons`. Ask the user the stage 4 questions in `research/design-decisions.md` ("Still open") first.

Build:
- [x] **Research follow-up**: episode 4 downloaded (user OK, `--playlist-items 4`), clips cut, `measurements.md` ("Episode 4") re-measured from 30 fps frames. Changed by it: sword guard leak 1 in 3 (was 1 in 4), stair slide 4 H/s (was 2), car 1.7 H (was 2.5), the agent opens fire from behind the desk, the hero holds the stairwell landing.
- [x] **Design pass first** (style frame "Stage 4 cast" + palette "Stage 4 · night", signed off by the user 2026-10-27: agent A, DJ A, dancer A, the car, the club, palette 4): the agent, the armed zombie, the DJ (our clown's stage-4 look, not an iron mask), the halo boss's stage-4 variant (if any), dancers (grunt variant), the car, the club stage and speakers, palette 4.
- [x] **Agent** (`variant: 'agent'` on a grunt, `TUNING.ai.agent`; the heavy pistol is the existing `deagle`, carried in the back hand so the front hand jabs): 12 hp, no stun from light punches, blocks the first light of a chain, melee at close range / heavy pistol beyond 3 H with the 0.4 s telegraph, blunt weapons ×2, drops the **heavy pistol** (new weapon: slow fire, every hit staggers). All invented.
- [x] **Fire-mode switch** on rifles (key B, decided; `Hand.semi`, `GUNS.semiSpread`, event `fireMode`) (`modes` in `weapons.ts`): picked-up rifles start in semi (tighter spread), the key the user picks cycles semi/auto, first switch per stage shows the selector close-up (own drawing).
- [x] **Stairs** (`RoomDef.stairs`, `stairHeight` in `collision.ts`): floor height ramps inside its band, corpses slide to the bottom before freezing. Moved to M15: the room taller than the screen with a vertical camera pan (`project()` offset), built with the real stairwell.
- [x] **Sword guard & parry** (RMB, decided; `GUARD` in `src/data/melee.ts`, `Actor.guard`, event `block`; the front check is by side, not a 70° cone). Gun block: F ≤ 0.2 s before a blade/club lands with a gun in hand (`GUN_BLOCK`). RMB with a sword-class weapon guards (70° front cone, 1 in 4 bullets leak, 40% walk), a press within 0.15 s before a hit parries (bullet goes back along its ray, blade attacker staggered = combo chain hit). Gun block (F within 0.2 s of a blade hit while holding a gun) only if it tests well.
- [x] **Armed zombies**: where a room sets the flag `armedZombies`, a raised corpse takes up a gun at hand (0.6 s telegraph, `TUNING.zombie.gunTelegraph`); a pre-made one is `spawnEnemy(world, 'zombie', 'rifle', x, z, { variant: 'agent' })`.
- [x] **Acting from the ground**: while knocked down or prone, LMB with a blade is a low slash at foot height (`LOW_SLASH`, one per 0.5 s); guns fire as from prone (since the crawl/prone-fire playtest PR).
- [x] **Crowd**: `idle: 'dance'` grunts with a shared alarm (`SpawnOpts.crowd`; being hit now alerts anyone), tokens as usual (≤ 3) plus pressing in and harmless shoves (`TUNING.ai.crowd`); `idle: 'cower'` (never fights). No animation level of detail: 35 dancers + 19 zombies run at ~3.5 ms a frame.
- [x] **Props & doors**: `VendingDef.toppleable` (a thrown body ≥ 4 H/s knocks it flat, low cover, `TOPPLE`); `smashDoor(world, i, by)` in `src/sim/doorSmash.ts` (the slab flies in, crushes on its path, lies flat). Lab `world-destructible-ep4`.
- [x] Mass raise cap 19 for the club (`TUNING.boss.massRaise.club`), profiled in `/?lab=world-crowd-dancefloor`.

Look & sound:
- [x] Agent look (signed off), heavy pistol (existing deagle sound), block thud (`block`), selector click (`selector`), guard ricochet per deflected round + parry ring and flash (`parry`), stairs steps and slide (`stairStep`, `stairSlide`), crowd shove (cloth), toppled crash, door smash + slab. Not done: the dance-floor murmur / bass ambience bed (a room cue in `assets/music/cues.json` once the club room exists, M16).
- [x] Every new mechanic gets its replica lab (below). Comparing them against the ep4 clips waits for the research follow-up.

Acceptance: an agent survives two headshots and dies to the third · a picked-up rifle starts in semi and the switch changes its fire rate · a corpse on the stairs ends at the bottom · guarding a 10-round burst leaks 2–3 rounds and a timed parry hits the shooter · a crowd of 35 alerts at once and never has more than 3 attackers swinging · 35 dancers + 19 zombies hold 60 fps in the test room.
Labs: `enemy-agent`, `gun-fire-mode`, `move-stairs`, `melee-blade-deflect`, `world-crowd-dancefloor`, `world-destructible-ep4` (built). Not built: `world-vehicle-ram` (moves to M15 with the alley), an armed-zombie lab (the crowd lab has the flag on: K drops corpses, Z raises them).

## M14b: Audit & polish pass (L)
**Goal:** a less buggy game that feels smoother, looks better and plays fairer: every crash, softlock and wrong rule the audit found, plus the best ~35 improvements, before any stage 4 room is built. Runs **after M14, before M15**, and **depends on PR #43** (spawn variety: arrival patterns and the ENC-07 order couplings live there, not here).
**Read first:** `design/audit-pass.md` (the menu, the decisions in §4, the ordering constraints in §6), `design/audit/proposals.md` (scores), the finding's report in `design/audit/{stb,cmb,enc,vis,uxs}.md` (each has Where / Proposal / Test), `design/audit/README.md` §7–§9 (slices, gates, playtest), "Audit decisions (2026-10-28)" in `research/design-decisions.md`. Repro probes: `AUDIT=1 npx vitest run tests/audit/<lens>`; a failing probe = the bug is still there.

Every line starts with its audit id. One PR per slice: A first and alone, then B here with C, D, E as parallel sessions (never two writers on the same files), F last. New numbers are marked invented in `TUNING`/`FEEL`; each slice edits only its own blocks; new event types go at the end of the union in `events.ts`.

Build, **A Stability** (all bugs; may go as A1 sim + A2 shell/audio):
- [x] **baseline** Write `design/audit/baseline.md` before any fix: typecheck/test/build timings, bundle sizes, the soak table (`SOAK=1`), sim ms/tick and frame times (visible pane, real GPU) in s1 wave B, s2 office, s3 street and desert with 60 bodies and full effects, co-op bytes/s.
- [x] STB-08 Reseed `world.rng` on room entry from (stage, room, entry, attempt); a per-world id counter; the seed saved with the checkpoint. Re-baseline every seeded probe once, right after.
- [x] STB-16 / ENC-02 Guard `pullable` against a missing host **and** add one `removeActor(world, a)` used by every script splice: it unsticks the actor's items, clears holders and emits `actorRemoved`.
- [x] STB-01 / ENC-01 Never leave `state 'attack'` without an attack (brute/hover no-flinch branch → 0.12 s stun); `stepAttack` falls back to free.
- [x] STB-05 Stage 3 ending: set `ending` only after the `!p` check; a death there restarts normally.
- [x] ENC-16 The sword duel counts melee hits (slash/smash/stab); a loaded gun is re-dropped if the player has none for 10 s (invented).
- [x] CMB-01 (+ the caption key helper of CMB-17 / UXS-10) Captions take key placeholders from `SETTINGS.keys`; then dive defaults to C (Ctrl bindable with a warning), plus a `beforeunload` confirm while a stage runs.
- [x] STB-06 / ENC-05 / UXS-01 Stage 1 beat checkpoints (riot, grenade, boss, waveB, ending); `restart` and Continue resume the beat through `stage1From`, kills restored.
- [x] UXS-03 + UXS-12 Saves get a `version` and a sanitizer; the checkpoint only moves forward by one order key (stage, room index, beat index).
- [x] STB-02 Room rules owned by the room (`StageRoom.rules`: physics, flags), applied on entry: improbability in the street, `axeThrows` from the camera room to the end of stage 3.
- [x] STB-03 + STB-09 One `resetForRoom(actor)` on entry (cook → grenade given back; attack/queued/grabQueued/guard, pose fields, timers; the new input buffer too). Rage is kept (saved with the checkpoint).
- [x] STB-04 `placeAtEntry` revives only `downed` players; a co-op partner killed while the other is parked goes `downed`.
- [x] STB-12 Data lint test: every wave entry's spawn id and door index exist (stages 1–3 and PR #43's scripts).
- [x] CMB-02 / UXS-04 Debug keys only in dev or with `?debug`; M stays (restores the volume), V only in Settings.
- [x] CMB-05 The bodyguard's head rule only for bullet/gun/knife hits.
- [x] CMB-12 Only living downed bodies (or a corpse held as a shield) trigger the finisher.
- [x] ENC-14 The crate room's guards hold their spots (`ai.hold`) until flanked or the player is within 1.5 H.
- [x] ENC-15 Ending: a boombox under a solid prop moves to the nearest free floor spot, with a marker.
- [x] ENC-08 Verify on PR #43 that the lobby hold-up happens on Noob (tagged entries); fix here if not.
- [x] VIS-01 The kill cam restores each live voice to its stored base rate (no stacking).
- [x] VIS-04 / UXS-17 Reduced motion / effects off: room flashes scaled by intensity (muzzle star and tracers stay), no kill-cam wash, static grain, a steady last-life vignette, half-alpha hurt edges, wipes as a 0.2 s fade. Gameplay telegraphs stay at full.
- [x] VIS-10 / STB-10 / STB-11 / STB-07 / UXS-14 / UXS-05 **One clock change**: the menu pauses everything (sim, feel FX, kill-cam filter, death timer, input: nothing read while open, edges and buffer cleared on close); `pausedByMenu` apart from the F3 pause; the hit-stop budget in real time and hit-stop skipped (or divided) inside slow-mo, M19's rage beat included; F4 consumes hit-stop ticks; after 0.8 s dead any action key restarts. One test in `tests/clock.test.ts`.
- [x] UXS-06 (S parts) Esc in the co-op lobby and on the co-op end card → title; the guest sees "Host paused" / "Host left (Esc: title)"; the host sees "Player 2 left"; Co-op hidden in production builds.
- [x] UXS-07 P2's command goes idle on `onPeer(false)` or after 250 ms without input (invented); the guest sends idle on blur.
- [x] UXS-08 The guest prunes actors missing from full snapshots and on `actorRemoved`.
- [x] UXS-11 Controls screen: no overlap with the help line at 1280×720.
- [x] **soak** Promote `tests/audit/harness.ts` + `soak.test.ts` to `tests/soak.test.ts` (fast subset always on: every room 20 s, masher seed 1; full run `SOAK=1`); invariant checks reusable in dev builds.

Build, **B Controls & combat** (`src/input/`, `movement.ts`, `combat.ts`, `melee.ts`, `guns.ts`, `items.ts`, `hitscan.ts`, `aim.ts`):
- [x] ENC-03 (+ CMB-15) Hero mercy window `TUNING.health.mercy` **0.3 s** (decided), scaled by difficulty in proportion (Noob 0.5 s, Notch 0.15 s); hero only; scripted lethal hits exempt (stage 2 ending, stage 3 stab, last stand). One "absorbed" response (event; flash + soft thud, no hit-stop) shared with get-up i-frames (CMB-15) and shield hits (VIS-19).
- [x] CMB-06 Stun shrinks within a chain (0.7 → 0.45 → 0.25 s, invented); riot/tough targets shrug off the 4th consecutive jab. With a shorter or blended `stun` clip.
- [x] CMB-08 One generic edge buffer per actor (0.15 s, invented) for jump/dive/attack/grab/E, replayed on the first free ground tick; weapon swings queue. Cleared on pause close and room entry; the host buffers the guest's edges through `mergeEdges`.
- [x] CMB-09 `TUNING.jump.buffer` 0.1 s, `coyote` 0.08 s (invented).
- [x] CMB-16 Inside one move, the first press of a different kind wins.
- [x] CMB-10 A shot pressed in the last 0.1 s of cooldown fires on the first ready tick (invented).
- [x] CMB-11 Air kick only ≥ 0.3 H above the ground; lower, the dive is buffered for the landing.
- [x] CMB-13 + CMB-14 Weapon finisher: a swing/stab at a downed body hits it (planted, swing damage); the knife isn't tossed with a downed body in reach; an uppercut at a downed body = a heavy finisher.
- [x] CMB-04 Shotgun pellet damage 1 (or one shot capped at 4 on agent/riot).

Build, **C Encounters & pacing** (`ai.ts`, `waves.ts`, `boss.ts`, `stealth.ts`, `zombies.ts`, `stage.ts`, `src/data/stages/*`):
- [x] ENC-09 Zombies get their own cap (`TUNING.zombie.maxAttackers` 4, invented) and keep the swing gap; a squad charge is uncapped only while ≤ 3 are alive.
- [x] ENC-17 Scripted teaching/cutscene hits (`hitActor(..., { scripted: true })`) knock down without damage; the sparring jabs may still cost a life.
- [x] ENC-13 The jetpack caption teaches prone (and the shield); prone taught once in wave B.
- [x] ENC-20 Captions for grab/throw and the launcher in wave A, prone in wave B, keys from the bindings; a teaching-map test.
- [x] ENC-21 + STB-14 `exitOpen` → an edge arrow + sting; a stage 3 tracker; a room with no activity and no enemy for 20 s re-shows its last caption.
- [x] ENC-12 (shrunk) Draw the existing wind-up (`pose.telegraph`) for the knockdown heavy, ≥ 0.3 s before the active frame.
- [x] CMB-07 Adjacent unarmed grunts stomp a prone hero after a ≥ 0.3 s drawn tell (finisher geometry, invented numbers); prone stays the bullet dodge; the low slash stays.
- [x] ENC-11 Boss volleys aim across the whole depth (no safe strip); wave B's cannoneer keeps the narrow band.
- [x] ENC-18 (shrunk) Grenade beat timeout 10 s, its caption repeated at 5 s (invented). The trickle lull is PR #43's.
- [x] ENC-22 Difficulty scales the mercy window (with ENC-03); the gun telegraph becomes a per-difficulty number, default 0.4 s on every level.

Build, **D Look & sound** (`src/render/`, `src/anim/` except aim, `poses.json`, `src/feel/`, `src/data/feel.ts`, `src/audio/`, `src/data/audio.ts`):
- [x] VIS-02 / UXS-02 + VIS-03 + UXS-21 (stem) + UXS-24 Music, one owner of `music.ts`: decoded buffers cached per track, sources stopped, a track already playing carries on into the next room that uses it, a one-stem track plays through the room (`music(null)` still silences); the stem shipped as OGG under a neutral name (WAV master outside `assets/`; cues and `tests/hazard.test.ts` updated); `<title>` = the game title.
- [x] VIS-06 Blend the drawn root into the slump (shortest angle, over the blend time); ease the landing angle over 3 ticks. Render only.
- [x] VIS-07 The thrown body's flight starts where it was drawn; a grabbed body lerps to its hold offset over 3 ticks. Render only.
- [x] VIS-08 + VIS-19 Sounds for `jump`, `playerDown`, `revive`, edge `spawn` (footsteps at the edge), `dismember`; shield hits get mist + full `impact`, a shield break `bodyFall` + gibs; `holdUp`/`surrender` wired or deleted. Draws B's absorbed response.
- [x] VIS-15 Facing turn over 2 frames, head first (revamp A3); render only, the sim's facing stays instant.
- [x] VIS-16 Walk swing amplitude = stride / 2π (the quick step of revamp A4).
- [x] VIS-17 Players drawn last at equal depth.
- [x] VIS-11 + VIS-12 Shake + hit-stop for `blockDrop`/`wallDrop` landings, `doorSmash`, `propToppled`, `vendingSmash`, the sword dive and the stab (under the explosion's 14); `bossPhaseKill` used for boss kills; `autoFireMax` applied or deleted.

Build, **E Shell & tech** (`src/ui/`, `src/scenes/`, `settings.ts`, `progress.ts`, `src/net/`, `src/dev/`):
- [x] CMB-17 / UXS-10 Binding a used key swaps the two actions (and says so); F1–F6, Esc, Enter and debug keys refused; `PlayerInput` rebuilt when the pause menu closes; the C alias dropped once dive is rebound.
- [x] UXS-15 Single player pauses on window blur (not while dead; the click that returns focus doesn't skip the restart).
- [x] UXS-09 "Reset progress" needs a second press; not in the pause menu.
- [x] UXS-13 The end card ignores keys for 0.6 s (invented); replay is hold R.
- [x] UXS-16 (shrunk) Minimum 26 px for text the player must read, captions 34 px.
- [x] UXS-21 (labs) Labs lazy-loaded behind `?lab`; `chunkSizeWarningLimit` back to 1000.
- [x] UXS-25 A "TUNED · n" tag in dev builds while F6 overrides are active.

Build, **F Tuning & playtest** (`src/data/tuning.ts` values):
- [ ] CMB-03 Re-run the CMB style probe (`tests/audit/cmb`) on PR #43 + B + C; add melee-only healing as an F6 switch (e.g. `TUNING.health.healOn: 'all' | 'melee'`, default `'all'`), decided in the playtest. No aim-settle.
- [ ] ENC-04 Re-run `tests/audit/enc/curve.test.ts`: no room above 2× its stage's median deaths at r = 0.2, stage averages rising. If the corridor still spikes, decide on ENC-19 (a mid-room checkpoint).
- [ ] VIS-13 Loudness: `block` 0.45, `alert` 1.0, `shotShotgun` 0.7, a `hitDirt` for outdoor floor hits (invented); re-run the loudness script.
- [ ] The user's playtest (below); apply "Copy changes"; remove the A/B switches that were kept, revert the others; tick M14b; update `CLAUDE.md`.

Look & sound:
- [ ] The absorbed hit (flash + soft thud), the stomp (pose, wind-up, sound), the weapon finisher (down-stab pose, `knifeFlesh`/`crack`), the exit arrow + sting (a generated recipe, no LICENSES entry), set-piece shakes, the new event sounds (VIS-08), the grunt wind-up pose. Everything respects effect intensity and reduced motion (revamp G3).

Acceptance (each item's "Test" line in its report, plus):
- Every bug probe in `tests/audit/{stb,enc,cmb,uxs}` that names a bundled id passes; the soak has **0 exceptions and 0 violations**.
- The latency/buffer table (`tests/audit/cmb`) meets its targets (every buffer cell "ok" within −6 ticks; a jump 6 ticks early jumps; the uppercut at 0.25/0.1 s gaps launches ≥ 80 %). The pop detector (`tests/audit/vis/popDetector.test.ts`) shows no unintended snap above 0.1 H in `→ slumped`, `→ grabbed`, `grabbed → knockback`, and flips ≤ 0.2 H.
- One SMG burst takes ≤ 1 life (`enc/probes` ENC-13b); token holders ≤ 4 + 2 in the corridor; frozen real ticks per real second ≤ 12 in every fight (`vis/feelLoad`).
- Global gates against `design/audit/baseline.md`: p99 frame time in the heaviest rooms ≤ 16.7 ms on the dev machine; sim ms/tick no worse than baseline +10 %; the 0.35 s balance bot still loses wave A and the difficulty curve stays inside the bands set in F; every stage bot finishes; co-op bytes/s no worse than baseline.
- **A/B rule for feel**: every change to how the game feels (windows, speeds, stuns, hit-stop, camera, effect strength, healing) is a `TUNING`/`FEEL` number whose old value gives the old behaviour (0 = off for something new), flippable in F6 during the playtest; a switch goes away only after the user keeps the change.
- Slice gate before each PR: `npm run typecheck`, `npm test`, `npm run build`, the `SOAK=1` soak, `BALANCE=1` vs baseline, the stage bots; perf re-measured for D and E; browser-pane screenshots for anything visible.

Labs: existing labs updated where a mechanic changes (`combo-*`, `combat-human-shield`, `boss-halo`, `qol-*`); new: a prone/stomp lab, a weapon-finisher lab, a mercy-window lab (SMG burst on the hero), a throw/slump lab for the pops (VIS-06/07).

**Playtest script** (~15 min, the user; rate each 1–5; where there is an F6 switch, flip old vs new: "which feels better?"):
- A: die at the stage 1 boss → the restart is at the boss · knife the stage 3 boss before he teleports, then stand still · punch the vending brute mid-swing · Esc right after a death, wait 3 s, Resume with Space.
- B: stand in an SMG burst (`mercy` 0 vs 0.3) · jab-lock the riot (stun steps on/off) · jump just before landing, dive right after a punch (buffer 0 vs 0.15) · knife a downed grunt · shotgun the riot.
- C: lie prone next to three unarmed grunts (stomp on/off) · the corridor after the boss's fling · the jetpack room with its new caption · wait in a cleared room for the exit cue.
- D: throw bodies into walls (slump blend on/off) · turn back and forth (turn 0 vs 2 frames) · walk at full speed (stride fix) · a kill cam into a multi-kill (hit-stop in slow-mo on/off) · walk through stage 2's rooms: does the music carry on?
- E: rebind grab to Space (the swap message) · alt-tab mid-fight · R right after the last kill.
- F: a gun-only run of the stage 2 lobby with melee-only healing on vs off.

## M15: Stage 4, first half (L)
**Goal:** from the car to the bottom of the stairwell.
**Read first:** `research/stages.md` (Stage 4 rooms 1–6), `research/episodes/ep4-log.md` (0:30–2:01), the M14 notes.

Build:
- [ ] Stage 4 as a room graph (`src/data/stages/stage4.ts`, `stage4Script.ts`), route `/?stage=4&room=alley|posters|doors|office|vending|stairs`, palette 4, kill counter on, gore like stage 3.
- [ ] **Alley**: scripted car ram (sequencer drives the car prop in, crush against the wall, 2 kills), get out, E at the car door = SMG + pistol (once), the building door is the exit.
- [ ] **Poster room**: 2 unaware guards at the right door.
- [ ] **Door room**: door waves from the right doorway (≈ 8 SMG/pistol grunts), the SMG runs dry, an AK on the pile → first fire-mode switch.
- [ ] **Office**: door waves (≈ 6), then the **agent** from the back door behind the player; a baton on the floor.
- [ ] **Vending room**: blade waves from both doors (≈ 12), a sword carrier (the stage's sword), the vending machine to knock flat, the grunt who grabs a dropped SMG.
- [ ] **Stairwell**: the staircase room (M14 `RoomDef.stairs`), grunts coming up (≈ 5), exit at the bottom door; the room is taller than the screen, so the camera pans down with the player (`project()` gets a vertical offset; moved here from M14).

Look & sound:
- [ ] Night alley scenery (own design: wall, door, moon glow, headlights), car painter, room props (posters with our own art, desk, computer, vending machine, copier), stairwell with the vertical pan.
- [ ] Engine + crash for the ram, car door, stage 4 music cues wired (arrival, building combat).

Acceptance: rooms chain in order from the alley · the car ram kills exactly the two smokers · the agent only appears after the office's door waves · the stairwell's bodies end at the bottom · the half completes with a scripted bot.
Labs: `world-vehicle-ram`, `move-stairs` (the real stairwell).

## M16: Stage 4 complete (L)
**Goal:** the club, the boss's arrival, the duel and the ending; the game shell knows four stages.
**Read first:** `research/stages.md` (Stage 4 rooms 7–9), `research/episodes/ep4-log.md` (2:01–3:18), `world-crowd-dancefloor`, `boss-clown` and `boss-halo` (episode 4 additions), `melee-blade-deflect`, `world-last-stand`.

Build:
- [ ] **Club, crowd**: ≈ 35 dancers facing the stage, the **DJ** (our clown: the first hit knocks him down, he gets up and triggers the alarm), the crowd fight (sword + SMG), the cowering grunt by the right door, then the **DJ mini-boss fight** (decided: he fights and dies; design his moves here, in our own style).
- [ ] **Club, boss**: the right door is smashed in (crushes the cowering grunt), the halo boss + an armed zombie agent, **mass raise** (cap 19), pistol + sword vs. the horde.
- [ ] **Finale**: ammo runs out (scripted: no guns left on the floor), the zombie agent's burst vs. the sword guard → the hero is downed → kill him from the ground → the duel with the boss (sword + heavy pistol acts in `boss.ts`) → **ending (decided)**: when his hp runs out he grabs the hero as he falls, the hero's grenade goes off and the blast kills both, end card + body count vs. 80. Losing the duel is a normal death (room restart).
- [ ] Shell: stage select and "Continue" know stage 4, the stage 3 end card chains to stage 4, credits after stage 4, co-op `&stage=4`.

Look & sound:
- [ ] Club lighting (dark room, coloured stage light within the palette rules), speakers, the dancers' loop, the door-smash burst, the raise flicker across the floor, the death-grab and grenade blast (big, white, then red wash).
- [ ] Club ambience bed and the stage 4 combat/boss/ending cues (hooks only; music by the user).

Acceptance: the crowd alerts together when the DJ is first hit · never more than 3 grunts swinging at once · the raise only raises intact corpses, at most 19 · the ending fires only when the boss's hp runs out, and a lost duel restarts the room · the DJ can be killed · the stage completes with a scripted bot · all four stages play in sequence from the title screen at 60 fps.
Labs: `boss-clown` (DJ), `boss-halo` (ep4 duel), `world-last-stand` (detonator), `world-crowd-dancefloor` (the real club).

## M17: Quality-of-life pass (M)
**Goal:** the small frictions found in playtesting and in the code: picking up, choosing a hand, punching at other depths, catching, shooting past cover, where bullets go, where a grenade lands, throws across depth, grabbing with a gun in hand.
**Read first:** `design/qol-pass.md` (the whole spec, with the decisions and the numbers), `src/sim/guns.ts` (`pickUp`, `fire`), `src/ui/hud.ts` (`promptTarget`), `src/sim/hitscan.ts` (`castRay`), `src/anim/aim.ts`, `src/sim/items.ts` (`snatch`, `canCatch`), `src/sim/combat.ts` (`hittable`, `canGrab`, `startAttack`).

Build (numbers in a new `TUNING.qol` block, all invented):
- [x] **Auto pickup into the empty hand**: walking over a *loaded* gun with one hand full fills the empty hand (decided: loaded guns only). With both hands empty, empty guns are no longer auto-picked (E still takes them). Your own thrown gun is ignored for 1 s. Nothing while holding the sign.
- [x] **One pickup plan** (`pickupPlan()` in `guns.ts`) used by both the sim and the E prompt, so they never disagree. The prompt shows the weapon's icon and name, the hand it goes into (mouse icon), its ammo, the swap's outgoing weapon, pulls of stuck blades, and appears with both hands full. The targeted floor item gets a white outline and a glint.
- [x] **Smart swap + hold E and click** (decided): tap E swaps the worse hand (empty gun first, then the emptier gun, then a melee weapon at 0.6, ties to the front); hold E and click LMB / RMB swaps that hand (the click doesn't fire). With a free hand E still acts on press. `PlayerCommand.useHeld`.
- [x] **Depth help for hero melee** (decided: snap + wider band + cue): the hero's punch/swing/finisher/sweep band 0.2 → 0.3 H; a depth snap during the startup toward the targeted enemy (under the cursor, else the nearest ahead, |Δz| ≤ 0.5 H; ≤ 0.3 H per attack at 3 H/s); a light ring on the shadows of enemies on your depth line, brighter on the snap target. Enemies keep 0.2 H.
- [x] **Catching** (decided): the F window 0.15 → 0.25 s; friendly flying weapons (popped disarms, your own rebounds, partner passes from M18) are caught automatically into a free hand; enemy throws still need F.
- [x] **Cover**: your own cover (just in front of you, under your muzzle) never blocks your shots; a prop that hides the hit point on screen blocks it; otherwise the bullet's 3D path decides. You can shoot from behind your own cover and over it; enemies behind cover stay covered from the front.
- [ ] F1 cover debug (shot segments, prop boxes, blocked points): not built yet.
- [x] **Bullets hit the cursor**: `aimRig` corrects the barrel so the muzzle line passes through the cursor (measured today: 16–20 px off). Painter and sim share it.
- [x] **Grenade landing marker** while cooking / winding up / holding a live grenade: target ring, the 2 H blast radius, a fuse arc that blinks in the last 0.5 s (`lobTarget()` shared with the lob).
- [x] **Throws find depth**: a knife, axe or gun thrown at an enemy under (or within 0.35 H of) the cursor flies in a straight 3D line to his depth.
- [x] **F grabs with any free hand**: a one-handed item in front with the back hand empty moves to the back hand, then the grab happens.

Look & sound:
- [x] Prompt icons, names, mouse-hand icons, swap arrow, chooser rows (on an ink plate); item outline + glint; depth rings; grenade marker; the hand-swap cloth + clack; the soft auto-pickup sound.
- [ ] The 3-frame hand-swap pose layer (only the sound so far).

Acceptance: walk over a loaded SMG with a pistol in hand → dual wield; an empty one → nothing · the prompt equals the sim's choice in 6 setups · hold E + RMB swaps hand 1 without firing · a grunt 0.45 H deeper is hit by a punch (missed before); enemies still need 0.2 H · a popped weapon is auto-caught; an enemy knife needs F (0.22 s early works) · from behind a table you hit a grunt at your depth across it; a grunt behind a table is still covered from the front · a ray passes within 1 px of the cursor (spread 0) · `lobTarget` = the landing point ±0.05 H · a knife at a grunt 0.6 H deeper kills him · pistol in front + F on a grunt = grabbed, pistol in the back hand fires past him · the balance bot with 0.35 s reactions still loses wave A; the stage bots still finish.
Labs: `qol-pickup`, `qol-depth`, `qol-cover`, `qol-throw-depth`, `qol-grenade-marker`.

Done (2026-10-28, branch `m17-qol`): tests in `tests/qol.test.ts`. Deviations from the spec, decided while building: the cover rule has three parts instead of a pure 3D test (a pure 3D test let shots reach targets the table hides on screen); the depth snap prefers an enemy already on your line and stops 0.1 H short of the target's depth (`qol.snapNear`; snapping all the way made the co-op balance bots fight the wrong grunts); the aim correction iterates 4 times (2 left up to 3 px); with a gun in the front hand, F on an *armed* enemy does nothing (M14's gun block stays intact: no steal); `Item.ownedBy/ownedAt` record the thrower after landing. Balance bots: 0.35 s reactions still lose wave A alone; in co-op the 0.35 s pair now loses all three seeds (2 of 3 before); 0.1/0.2 s pairs clear. Updated existing tests: `guns.test.ts` (a loaded gun is now walked into the second hand), `melee.test.ts` (the hero's depth miss case moved to 0.65 H).

## M18: Co-op moves (L)
**Goal:** two players fighting *together*, not side by side: nine team moves that build on grabs, throws, juggles and catches.
**Read first:** `design/coop-moves.md` (research, rules, every move's numbers, looks, sounds and tests), `design/combos-and-fatalities.md` (3f, the original co-op ideas), M4b and M10b above, `src/sim/combat.ts` (`applyHit`, `shieldHit`, `chainBonus`, `stepFlight`, `tryGrab`, `startThrow`, `kickContact`), `src/sim/items.ts`, `src/net/snapshot.ts`.

Rules (decided): co-op only; aim at your partner to target them (lift with F, pass with Q), otherwise F and Q act as always; co-op moves never hurt the partner; their kills are **team kills** (`kill.team`, the fatality feel, the `team` rage type for both players in M19); stage 1 stays bloodless.

Build (numbers in `TUNING.coop`, all invented):
- [x] **Hold & hit**: the partner's hits on a grunt you hold replace the human-shield rule: the 3rd hit or any heavier blow kills (team kill, `fatality` kind `held`); a held grunt hit twice dies on any impact when thrown. Live grabs use a new **restrain** hold (victim faces away from the holder).
- [x] **Shared chains**: either player's hits on one enemy keep one chain (juggle hand-offs).
- [x] **Ping-pong**: a body knocked or thrown into your partner bounces off them airborne; the partner's heavy bats it, and it dies on the next wall or partner.
- [x] **Wishbone**: F on a grunt your partner holds (or both grab within 0.5 s) tears him apart in 0.75 s (stage 2+ split in two, stage 1 the head pops). New split render (`Pose.cut`), reused by M19.
- [x] **Weapon pass**: Q with the cursor on your partner lobs the item to their hands (over enemies, lead + homing); auto-caught into a free hand (M17), else at their feet.
- [x] **Body bat**: a heavy or a swing at a body your partner threw sends it on at 1.5× (≥ 8 H/s) toward your cursor, piercing; wall = kill.
- [x] **Double-team**: both players' damaging hits on one enemy within 0.25 s = instant kill (decap / head burst); tough ones +2 instead.
- [x] **Hero toss**: F with the cursor on your partner lifts them overhead (the carrier needs empty hands, walks at 0.6×, the carried one is invulnerable and can Space off); F or LMB throws them as a multi-hit flying-kick missile with i-frames; they land on their feet.
- [x] **Carry-spin** (the user's idea): while carried, F → the carrier swings them round himself by the ankles on the floor plane (0.75 H, 1.2 s a turn). An armed partner aims and fires normally but only out to the side they're on; unarmed, their body floors enemies in the circle (kills on walls). Carrier F throws them out along the swing, their Space hops off, 4 s max.
- [x] Glyph hints for each move (setting `coopHints`), `kill.team` / `alsoId`, the `coopMove` event, new `fatality` kinds.
- [ ] The Controls page's co-op moves list.
- [x] **Partner bot** (`src/dev/partnerBot.ts`): `?coop=bot` puts an AI partner in any stage, and the co-op labs use it (N = its half of the move), so one person can test.
- [x] Co-op net: `ActorSnap.grabbedBy`, `carried`; swing angle in the pose; everything else from replayed events.

Look & sound:
- [ ] Poses (A2 rules, not authored yet; the moves use existing clips and root transforms): `restrainHold`, `restrained`, `wishboneBrace/Pull/Recover`, `passToss`, `brace`, `liftUp`, `carryOverhead`, `carriedFlat`, `hopOff`, `tossWind`, `giantSwing`, `swungFly`.
- [x] Split render + cut edge; SFX (synth placeholders mixed from existing ids): team ping, double ting, bat crack, bump, strain + tear, soft pass whoosh, lift/toss effort, swing whoosh; screen shake for bats, spin hits and bounces.
- [ ] VFX still to do: double impact star, cloth-tear smear, white flash frames, speed lines and ink ghosts, the spin's floor arc, landing dust rings; a pitched swing loop panned by angle. Original SFX list: team ping, bump, bat crack, strain + tear / pop, soft pass whoosh, double ting, lift effort, toss whoosh, swing loop panned by angle.

Acceptance: every test listed per move in `design/coop-moves.md` · co-op moves never damage the partner (a full stage-1 wave with two bots spamming them: no partner damage from a co-op move) · the guest sees all nine via replayed events · two competent bots still clear co-op wave A and the balance bot alone is unchanged · 60 fps in the stage 2 office with two players spinning and tossing.
Labs: `coop-hold-hit`, `coop-chain`, `coop-ping-pong`, `coop-wishbone`, `coop-pass`, `coop-bat`, `coop-double`, `coop-toss`, `coop-spin`.

Done (2026-10-28, branch `m18-coop-moves`): all nine moves and the partner bot, tests in `tests/coopMoves.test.ts` (20), the code in `src/sim/coop.ts` (pass, lift, toss, spin), `src/sim/combat.ts` (chains, double-team, ping-pong, bat, hold & hit, wishbone) and `src/dev/partnerBot.ts`. Deviations, decided while building: the toss flies flat at hip height with a quarter of gravity (`coop.toss.launchY / vy / gravity`; the planned 3 H/s lob sailed over every head); the swung partner reuses the prone aim rig (`PRONE_ARC`) instead of a new `SPIN_ARC`; a ping-pong bounce yields to the partner's heavy or swing already under way (so the bat wins); hitting the *holder* during a wishbone drops the grunt (planned: he stays with the other); the sim learns whether the stage shows blood from `world.blood` (the scene sets it); in labs the bot waits for N. Not checked yet: the 60 fps check with two players spinning and tossing, and a two-laptop playtest. Balance bots unchanged from M17 (they don't use co-op moves).

## M19: Rage meter & solo rage fatalities (L)
**Goal:** varied kills fill a rage bar; a full bar shows on the hero; Tab fires a super that kills up to six enemies in a choreographed, top-quality animation picked by what you hold.
**Read first:** `design/rage.md` (sections 1–3, 5–8), `research/design-decisions.md` ("Rage"), `src/sim/sequencer.ts`, `src/feel/feel.ts`, `src/render/feelFx.ts`, `src/scenes/PoseEditorScene.ts`, `src/ui/hud.ts`, `src/scenes/UIScene.ts`.

Decided: last 2 kill types block a gain; 10% a new kind, +5% per varied kill in a row up to 25%; the bar never drains, saved with the checkpoint, reset per stage; white and ink look with only the eye slit red; Tab; strike-all-then-drop for fists, blade and club, kill-as-the-barrel-passes for guns. These supers are the one exception to "fatalities ≤ 0.8 s, never take control" and to "no meter".

Build (numbers in `TUNING.rage` and `FEEL.rage`, invented):
- [ ] **Pose editor upgrades first** (revamp A11), **not done yet**: onion skin, a scrubbable 30 fps timeline with 0.25×/1× playback, per-key easing, copy/paste/mirror, a **pair view** for two-actor poses with a saved offset, preview with smears/stars/ghosts.
- [x] **Kill types** (14, `killType()` in `src/sim/rage.ts`) on every `kill` event (`type`), `applyHit(..., via)` for kicks, style and team kills.
- [x] **The meter**: `Actor.rage` (value, recent, streak), gains with streak, style/team bonuses, multi-kills, boss bonus; no gain from enemies' kills, kills during a rage move or corpses; cap 1; checkpoint save/restore; reset on a new stage.
- [x] **HUD** (`src/ui/rageBar.ts`, `src/ui/killIcons.ts`): bar per player beside the life heads with 10% ticks, rising gain numbers, the last-2 variety strip (repeats shake and grey), the full pulse + red eye-slit icon + the key.
- [x] **Full-rage look**: hotter pulsing rim, red eye slit, ink wisps off the shoulders, the ready stinger and the low loop; effect-intensity aware.
- [x] **Firing**: `rage` action (Tab, `addCapture`), `PlayerCommand.rage`; the eligibility rules; the victim rules and cap 6; fizzle with no victims.
- [x] **The run** (`world.rage`, `src/sim/rageMoves.ts`): time stops for everyone but the participants (actors, items, fuses, director, scripts, exits), heroes invulnerable, release = the world resumes, bystanders stunned 0.4 s; own hit-stops outside the budget, kill-cam off, `FeelSink.slowMo`.
- [x] **Cinematic layer**: letterbox, the dimmed/desaturated stopped world with participants on a new rage layer, camera punch-ins, music duck / silence / un-duck, the release flash.
- [x] **Rampage** (empty hands), **Spin shot** (a gun; refills held guns), **Cut line** (a blade; the split render), **Home run** (a club or the sign): every beat as in `design/rage.md` section 3.
- [x] Co-op net: `ActorSnap.rage`, `Snapshot.rage`, the `rage*` events replayed.

Look & sound:
- [ ] Every pose in `design/rage.md` 5.2 (M19 list), each through the 12-point checklist in 5.3 with a key-screenshot strip in the PR. **Not done**: the moves use existing clips (uppercut, punchHeavy, kick, swing...) plus root transforms for the frozen reactions.
- [x] VFX built: ignite ring, ink dash streaks, white slash lines, the release flash, the letterbox and the dimmed world, punch smears and stars on strikes, tracers and casings from the spin. SFX from the synth placeholders (existing ids): gain ticks, repeat tick, ready stinger, ignite, dashes, pitched strikes, release crash, landing; the music ducks.
- [ ] VFX still to do: the floor shockwave, victim marks, ink ghosts on dashes, ink-negative impact frames, impact stars that stay on the frozen victims, barrel smoke, camera punch-ins; the low ready loop.

Acceptance: the rage tests in `design/rage.md` 7 (M19 part) · each move's lab played at 0.25× and 1× against its beat sheet, deviations noted · 60 fps during a Rampage with 6 victims and 20 bodies in the room (full effects) · the balance bot unchanged when it never presses Tab.
Labs: `rage-meter`, `rage-rampage`, `rage-spin-shot`, `rage-cut-line`, `rage-home-run`.

Done (2026-10-28, branch `m19-rage`), the gameplay and the presentation layer; the animation craft is still to do. Code: `src/sim/rage.ts` (kill types, the meter), `src/sim/rageMoves.ts` (Tab, victims, the time stop, the four moves), `src/ui/rageBar.ts` (bar and pictograms), the cinematic layer in `GameScene` / `UIScene` / `vfx.ts` / `feel.ts`. Tests in `tests/rage.test.ts` (16). Deviations: the sign uses Home run's dashes (no 360° sweep); Home run launches every victim on the same tick (planned: 2 frames apart); the strikes reuse existing clips; the meter is saved with the checkpoint (`Checkpoint.players[i].rage`) and a new stage starts at 0 because it builds a new world. Still to do, in this order: the pose editor upgrades (A11), the authored poses with the 5.3 checklist, the missing VFX above; the 60 fps check with 6 victims and 20 bodies.

## M20: Team rage fatalities (M)
**Goal:** two full bars and a press each = a team super, without precise timing.
**Read first:** `design/rage.md` (sections 4–8), M18 and M19 above.

Decided: **team supers kill every eligible enemy on screen (no cap; solo stays at 6), so they're clearly stronger** (2026-10-28); both bars full; Tab near your partner (≤ 3 H, their bar full) sends a request instead of firing your solo move; their Tab within 4 s accepts; your second Tab withdraws and fires your solo move; nothing spent on a timeout.

Build:
- [ ] **The request** (`world.rageRequest`): open / accept / withdraw / expire rules, the near-simultaneous accept, cancels (down, boss grab, traversal, cutscene); HUD glyph with the countdown ring, waiting ring, the call sound; the `TEAM` tag and floor tether when both are full.
- [ ] **Back to back** (both hold a gun): gather, back-to-back 180° spin killing as barrels pass (no cap: every eligible enemy on screen), the crossing-shot finale, guns refilled.
- [ ] **Ping-pong rampage** (otherwise): positions, the scripted volley striking one victim per pass (no cap; passes speed up with the count so it stays under ~2.7 s), the sandwich punch, all drop at the fist bump.
- [ ] Partner bot answers requests (labs: N).

Look & sound:
- [ ] Poses `b2bReady`, `b2bFinish`, `sandwichHit`, `fistBump` through the 5.3 checklist; the tether snap, crossing tracers, fist-bump star. SFX: `rageRequest`, `rageAccept`, `b2bClink`, `fistBump`.

Acceptance: the request and team-move tests in `design/rage.md` 7 · a two-laptop playtest note (or the bot route) showing a team move reached with no timing practice · 60 fps during Back to back with 30 victims (stage 4's crowd sizes).
Labs: `rage-request`, `rage-back-to-back`, `rage-ping-pong`.

---

## Risks to watch
- **Readability of depth + free aim**: screen-space hits with characters at different depths can confuse. Mitigation: depth-scaled hurtboxes, contact shadows, a debug overlay to tune, clear tracers.
- **Hitscan fairness**: enemies with instant bullets are unfair without the aim telegraph (M7). Keep it obvious, visually and audibly.
- **Heavy effects vs. clarity**: hit-stop and chromatic on every hit would make auto fire mushy and busy. Respect the caps in `feel.ts` and do a feel review each milestone.
- **"Cheap" look creeping in**: placeholder art that never gets replaced. Mitigation: start in the final style (M0) and do a look check against the style frame in every milestone.
- **Set-piece creep**: stages 2–3 are mostly one-off scripted events. Build them on the M8 sequencer and room-event hooks. Don't generalise beyond what the episodes need.
- **Performance**: persistent corpses/decals plus full-screen filters. Bake static layers, cap decals, profile in M13.
- **Copyright**: no names, character designs, music, sounds or text from the episodes (see the do-not-copy list in `design/art-direction.md`). Reference footage never enters git.
