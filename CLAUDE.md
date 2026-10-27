# Project guide

A browser game where each of the first three episodes of an animated series is one stage. We copy **mechanics only** (movement, timings, enemy types, set pieces), never names, character designs, music or text.

- **Plan**: `PLAN.md`. Milestones M0–M13 with checklists and acceptance tests. Work one milestone at a time on a branch `mN-<slug>`, PR to `main`.
- **Research**: `research/`. One note per mechanic (`research/mechanics/<slug>/notes.md`), measurements, stage outlines, design decisions. Local-only reference clips sit next to the notes (gitignored).
- **Look & sound**: `design/art-direction.md`, `design/audio-direction.md`, and the interactive `design/style-frame/` (the renderer is ported from it). The do-not-copy list is in the art direction.

## Commands
Node 26 via nvm (`nvm use`; the system Node is too old for Vite 8).
- `npm run dev`: dev server on :5173 (or `preview_start` "dev" from `.claude/launch.json`; "dev-npm" on :5174 runs it with the system Node, e.g. on Windows without nvm)
- `npm test`, `npm run typecheck`, `npm run build`
- Style frame: `preview_start` "style-frame" (:5180)

## Architecture (see PLAN.md "Ground rules")
- `src/sim/`: plain TS, no Phaser. Fixed 60 Hz `FixedClock` (time scale, hit-stop, pause/step) drives `World`. The sim emits typed events (`src/sim/events.ts`); rendering/audio/HUD subscribe.
- Units are **H** (one body height) and seconds. `src/render/camera.ts` `project()` is the only world→screen mapping (measured perspective).
- `src/sim/combat.ts`: actor state machine (free/attack/stun/knockback/down/getUp/grabbed/dead), hits and damage, grabs/throws, sweep, finisher, corpses (tumble → settle → freeze). `src/sim/hurtbox.ts`: head ellipse + body capsule through the pose root.
- `src/anim/`: pose skeleton (part transforms + whole-body root), clips sampled from `src/data/poses.json`, procedural layers. Poses are authored in `/?lab=pose-editor`.
- M6: `src/data/melee.ts` (melee weapons, throwing, grenades, disarm, shield numbers), `src/sim/melee.ts` (swing / thrust + pin / toss / lob / pull / steal actions, grenade cooking, shot-out-of-hand geometry), `src/sim/explosives.ts` (blast, gibs), `src/sim/items.ts` (thrown blades stick in bodies and walls, grenade fuses, catching). Human shield and the light-punch disarm live in `combat.ts`.
- Guns (M5): `src/data/weapons.ts`, `src/anim/aim.ts` (aim rig shared by painter and sim), `src/sim/hitscan.ts` (screen-space rays), `src/sim/guns.ts` (hands, fire, reload, pick-up, thrown guns), `src/render/gunFx.ts` (flash, tracer, casings).
- `src/feel/feel.ts` turns events into hit-stop/shake/chromatic/kill-cam requests (numbers in `src/data/feel.ts`); `src/render/feelFx.ts` carries them out. `src/audio/`: Web Audio mixer (buses, voice limits, reverb, ducking, kill-cam filter), synthesized placeholder sounds (`synth.ts`, ids in `src/data/audio.ts`), music system (`assets/music/cues.json`), event hooks (`hooks.ts`). `src/settings.ts`: volumes + effect intensity.
- `src/render/canvas/`: Canvas 2D vector painters (room, characters, items) drawing into `CanvasLayer`s shown by Phaser. Layers: room (baked) → decals (blood, baked) → corpses (frozen bodies, baked) → actors/props/items (per frame, sorted far→near). `src/render/post.ts`: vignette + grain. HUD/debug in `UIScene` (no post FX).
- `src/data/`: `tuning.ts` (gameplay constants, each citing its research note or "invented"), `feel.ts` (effect numbers), `palettes.ts` (one per stage), rooms.
- Routes: `/` = stage 1 from its intro (`src/data/stages/stage1Script.ts`, the whole stage as one sequencer script); `/?wave=A` = straight into the arena's wave A; `/?beat=riot|grenade|boss|waveB|ending` = the stage script from that beat (playtesting; later beats get corpses, the cannon and an SMG); `/?coop=host` / `/?coop=join` = co-op; `/?room=test` = the M0 style-frame room.
- `src/sim/ai.ts` grunt AI (attack tokens for melee; gun grunts keep 3-5 H, 0.4 s aim telegraph, friendly fire, scavenging, one grenade per wave, table flips; squads, bodyguards, VIP), `src/sim/waves.ts` spawn points + wave scripts (entries take `SpawnOpts`: variant, squad, unaware placement), `src/data/stages/` room and wave data.
- M7: `src/sim/stealth.ts` (unaware/alert rules, E takedowns from behind, drop kills from above), `src/sim/cover.ts` (kicked-over tables), `src/sim/zombies.ts` (raise rule, rise, zombie damage, headless). Co-op guests set `world.puppet` so replayed events don't re-run sim rules.
- M8: `src/sim/sequencer.ts` (`world.seq`): generator scripts for intros/cutscenes/set pieces, stepped first in `World.step`. They yield seconds or a condition and use `wait/until/join/moveTo/act/steer/lockInput/spawn/place/giveItem/drop/card/cameraShake/music/waves/clear`. Scripted commands (`world.scripted`) override brains and player input; `card`/`music`/`cameraShake` are events (HUD, `MusicSystem.setTrack`, feel). Stage 1 NPCs: `variant` 'boombox' / 'dancer' (placed without AI, `src/render/canvas/npcPainter.ts`, dance layer in `src/anim/layers.ts`); the boombox is `actor.carry` and a floor item, `locked` until the ending; then E (or walking over it) carries it in the front hand and nothing else is picked up meanwhile. The ending's dance emote is `pose.dancing` (same loop as the dancer). Boss: `src/sim/boss.ts` (kind 'boss', `actor.boss` state machine stepped instead of stepActor; entrance, lightning raise, ward checked in `hitscan.castRay`, `bossHit` from applyHit; one `act` at a time: cast raise/strike, dash → grab → slams, phase 2 sweep → summon → volley), `src/render/canvas/bossPainter.ts`, lab `/?lab=boss-halo`. His cannon is a `world.cannons` entry with `live` (balls hurt, `src/sim/cannon.ts`) plus a `cannon` prop (solid, standable, never cover). Wave B's cannoneer: `SpawnOpts.role: 'cannon'` → `cannonStep` in `src/sim/ai.ts`; a manned cannon fires only while its gunner is able.
- Labs: `/?lab` lists them, `/?lab=<slug>` opens one (`src/labs/registry.ts`). Every mechanic gets a replica lab compared against its reference frames.

## Co-op (2 laptops, same Wi-Fi)
Host: `npm run dev:lan` (or `preview_start` "dev-lan"), open `/?coop=host`, read the join link it shows. Player 2 opens that link (`http://<host-ip>:5173/?coop=join`) in Chrome or Safari. The host's laptop runs the game (`src/net/`); player 2's laptop sends inputs and draws snapshots. Single player stays at `/`.

## Controls
WASD move (W/S depth) · Space jump · Ctrl or C dive/prone, again or Space to get up (dive into an adjacent enemy = low sweep) · mouse aims (facing follows it) · LMB light punch · RMB heavy punch (cursor steeply above the shoulder = uppercut; a punch at a downed body = finisher) · F grab (both hands empty), F (or a punch) again throws toward the cursor · with a gun: LMB fires the front hand, RMB the back hand (hold for full auto), empty → click → press again to throw it · E pick up (or pull a stuck blade / the planted sign out, 0.5 s) · R reload · Q throw the held weapon · Shift (hold) split aim · G hold to cook a grenade, release to lob it at the floor point under the cursor · melee weapon in hand: LMB swings (knife: stabs up close, thrown at range), long weapon: LMB sweep, RMB thrust (pins against walls/poles) · F on an armed grunt steals his weapon · F just before a thrown weapon arrives catches it, and F with a free hand snatches any weapon flying within reach of your hands, your own included (e.g. a gun bouncing back off a wall) · F on a live grenade picks it up, F/LMB throws it back · F on a grunt with a one-handed gun in the back hand = human shield, RMB fires past it · E behind an unaware enemy = silent takedown (wire 1.5 s with empty hands, knife 0.6 s otherwise); landing next to one from above = knife kill.

Every action also works mid-jump (punch, shoot, swing, throw, cook/lob a grenade); the jump carries on underneath, and punches/swings from the air come down on whoever is below. Not in the air: grabbing, picking up, pulling out, stealing (and you can't jump while carrying a body).

## Debug keys
F1 overlay (H grid, rulers, hurtboxes, tick/fps) · F2 slow-mo 0.25× · F3 pause · F4 or `.` step one tick · 1/2/3 stage palettes (also blood: stage 1 has none) · P post FX on/off · K drop 20 corpses · V effect intensity (full/reduced/off) · M mute · L drop a random gun at each player's feet · Z raise every intact corpse as a zombie.

Dev only: `window.__game` is the Phaser game. The browser pane pauses animation frames while it is hidden; drive the loop with `__game.step(t, 16.7)` from the console when checking things there.

## Rules
- Measured values follow the show; invented values are marked `// invented` and stay tunable.
- Every mechanic ships with its sound and VFX (milestone "Look & sound" lists).
- New character types get a character-sheet entry in the style frame first, in our own design.
- Never commit reference footage. Sound files need an entry in `assets/audio/LICENSES.md`. Ask the user before downloading asset packs.
