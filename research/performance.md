# Performance (M13)

Measured 2026-10-27 on the dev machine (MacBook, Chrome-based app browser pane, 1920×1080 canvas), full effects, by timing `requestAnimationFrame` over 6–8 s.

| Room | Load | fps | p95 frame | worst frame |
|---|---|---|---|---|
| stage 3 desert (`?stage=3&room=desert`) | squad of 5 + hero | 60.0 | 17.6 ms | 33 ms (one frame) |
| stage 3 desert | + 60 bodies (`world.spawnCorpses`) | 60.2 | 17.5 ms | 18 ms |
| stage 2 office (`?stage=2&room=office`) | + 60 bodies | 60.2 | 17.4 ms | 18 ms |
| stage 2 office | + 210 bodies | 60.2 | 17.6 ms | 18 ms |

- One sim step with 210 bodies in the room: ~0.5 ms. Bodies bake into the corpse layer once they settle, so drawing them costs nothing per frame. No corpse cap is needed.
- Decals stay capped at 500 (`src/render/decals.ts`).
- **Fixed**: restarting a room after a death stalled for ~0.5–1.6 s. Each restart made four new 1920×1080 canvases and the browser tore down the old ones in the same frame. `CanvasLayer` now reuses the canvas behind its texture key. A restart takes 10–30 ms now.
