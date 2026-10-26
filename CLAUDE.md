# Project guide

A browser game where each of the first three episodes of an animated series is one stage. We copy **mechanics only** (movement, timings, enemy types, set pieces), never names, character designs, music or text.

- **Plan**: `PLAN.md`. Milestones M0–M13 with checklists and acceptance tests. Work one milestone at a time on a branch `mN-<slug>`, PR to `main`.
- **Research**: `research/`. One note per mechanic (`research/mechanics/<slug>/notes.md`), measurements, stage outlines, design decisions. Local-only reference clips sit next to the notes (gitignored).
- **Look & sound**: `design/art-direction.md`, `design/audio-direction.md`, and the interactive `design/style-frame/` (the renderer is ported from it). The do-not-copy list is in the art direction.

## Commands
Node 26 via nvm (`nvm use`; the system Node is too old for Vite 8).
- `npm run dev`: dev server on :5173 (or `preview_start` "dev" from `.claude/launch.json`)
- `npm test`, `npm run typecheck`, `npm run build`
- Style frame: `preview_start` "style-frame" (:5180)

## Architecture (see PLAN.md "Ground rules")
- `src/sim/`: plain TS, no Phaser. Fixed 60 Hz `FixedClock` (time scale, hit-stop, pause/step) drives `World`. The sim emits typed events (`src/sim/events.ts`); rendering/audio/HUD subscribe.
- Units are **H** (one body height) and seconds. `src/render/camera.ts` `project()` is the only world→screen mapping (measured perspective).
- `src/render/canvas/`: Canvas 2D vector painters (room, characters) drawing into `CanvasLayer`s shown by Phaser. Room = baked layer, actors/props = per-frame layer sorted far→near. `src/render/post.ts`: vignette + grain. HUD/debug in `UIScene` (no post FX).
- `src/data/`: `tuning.ts` (gameplay constants, each citing its research note or "invented"), `feel.ts` (effect numbers), `palettes.ts` (one per stage), rooms.
- Labs: `/?lab` lists them, `/?lab=<slug>` opens one (`src/labs/registry.ts`). Every mechanic gets a replica lab compared against its reference frames.

## Controls
WASD move (W/S depth) · Space jump · Ctrl or C dive/prone, again or Space to get up · mouse aims (facing follows it).

## Debug keys
F1 overlay (H grid, rulers, tick/fps) · F2 slow-mo 0.25× · F3 pause · F4 or `.` step one tick · 1/2/3 stage palettes · P post FX on/off.

## Rules
- Measured values follow the show; invented values are marked `// invented` and stay tunable.
- Every mechanic ships with its sound and VFX (milestone "Look & sound" lists).
- New character types get a character-sheet entry in the style frame first, in our own design.
- Never commit reference footage. Sound files need an entry in `assets/audio/LICENSES.md`. Ask the user before downloading asset packs.
