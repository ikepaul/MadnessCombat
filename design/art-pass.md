# Art pass (M13)

Checked 2026-10-27 against `design/art-direction.md`.

## Line weights
- **Characters**: body and head outlines are 0.016 H everywhere (hero, grunts, NPCs, the stage 2 cast, the boss). Feet are 0.012 H. Hands are stroked at 0.024 H and filled over, so 0.012 H shows outside the mitten and no line splits the palm from the thumb (the direction's "no inner lines"). Inner details (collars, ties, gear, the boss's halo) use 0.006–0.012 H, under the outline, as intended.
- **Rooms**: ink room edges are 3 px at 1080p (direction: 3 px). The heavier ink strokes (4–5 px) are objects drawn on purpose: table legs, the street clocks, the floor crack, the void's broken edge, the blasted hole. Coloured strokes (pipes, cables, glows) aren't outlines.
- No changes needed.

## Palettes
A contact sheet of all 21 stage rooms' baked backgrounds (`?stage=N&room=…`) shows one palette per stage: the light outdoor arena (stage 1), the cool night street, rooftops and grey interiors (stage 2), and the warm street, desert and interiors (stage 3). Interiors share one box construction (back wall, side walls, ceiling, baseboard, one key light). No room breaks its stage's palette.

## Cards
The title screen is our own (the red slash on near-black). Stage and body-count cards are plain text on black, as the direction asks. The game's name is still the placeholder "BODY COUNT" (`GAME_TITLE` in `src/scenes/TitleScene.ts`) until the user names it.
