# Animation, VFX & UX revamp: options

Status (2026-10-27): the first bundle is **implemented**: A1, A2, A6, A7, B1, B5, C1, C4, E1, E2, F2, G1 (marked ✅ below; E4, the crosshair, was built and then taken out at the user's request). Everything else is still a menu to pick from.

Where the bundle lives: `src/anim/clips.ts` (render-only `back`/`settle` easings, blend-in times) and `src/anim/layers.ts` (crossfade, head/hand lag, hit reactions, death poses); `src/sim/combat.ts` sets `pose.prevClip`, `pose.react`, `pose.death` (cosmetic only, hit timing unchanged); `src/render/vfx.ts` (smears), `src/render/canvas/itemPainter.ts` (spin blur), `src/render/gunFx.ts` (chips, sparks, ricochets); `src/render/feelFx.ts` + `FEEL.killCam.zoom` (punch-in); `src/ui/hud.ts` (weapons, prompts, hurt edges, last life, stage card), `src/ui/transition.ts` (ink wipes); life heads in `src/scenes/UIScene.ts`; the hero rim in `characterPainter.ts`. All numbers are marked invented.

Everything stays inside the art direction (`design/art-direction.md`): greyscale + red, green only for zombies, flat ink vector look, floating hands/feet, heavy stylised effects with an intensity setting, our own designs.

Effort: **S** ≈ an afternoon, **M** ≈ a day or two, **L** ≈ a milestone of its own. Impact: how much the player feels it, ★ to ★★★.

## 1. What we have now

Looked at the code and played stage 1 wave A, the stage 2 office, the stage 3 street and the title screen.

**Character animation** (`src/anim/`, `src/data/poses.json`)
- 7 parts (body, head, two hands, two feet, held item) + a whole-body root transform. About 50 poses and 33 clips on a 30 fps key grid with 4 easings, authored in the pose editor lab.
- Procedural layers on top: a sine walk (feet swing, 0.014 H bob), breathing, airborne tuck, hit lean, stun wobble, the dance loop, a flying kick override, idles/fidgets (`idles.ts`), aim + recoil in the painter, a landing squash used in improbability mode.
- **Gaps**:
  - **Clips snap.** `setClip()` jumps straight to the next clip's first pose: no blending between punch → idle, stun → knockback, walk → attack.
  - The walk is a sine, not a stride: no foot planting (feet slide at the hero's faster speed), no start/stop, no difference between walking sideways and in depth.
  - Facing flips instantly (mirror in one frame).
  - One reaction per hit kind: every light hit looks the same, every death is the same tumble → settle.
  - No anticipation/follow-through beyond the wind/hit keys; all parts move together (no drag or overlap).
  - No reload or weapon-draw animation in the poses list.

**VFX** (`src/render/vfx.ts`, `gunFx.ts`, `decals.ts`)
- 1-frame smears (streak for jabs, arc for swings/uppercuts), impact stars, dust puffs, blood drops + baked decals (pools, splatter, trails in stage 3), gibs, explosions (flash, starburst, smoke), lightning bolts, ward sparks, telekinesis ripples, "!" alert marks, speech bubbles, improbability ghost trails, muzzle flash + tracer + casings.
- **Gaps**: smears are a single frame and identical per weapon; bullets hitting walls leave holes but no chips/puffs; no light from muzzle flashes or explosions on the room; landing/footstep dust only in places; no sparks on metal.

**Feel** (`src/feel/feel.ts`, `src/render/feelFx.ts`, `src/render/post.ts`)
- Hit-stop (1–2 frames, budget 6/s), screen shake (random direction), chromatic split, kill cam (×0.3 for 0.6 s + red wash + audio filter), impact frame (bright victim), vignette, grain.
- **Gaps**: the camera never moves except shake (no punch-in); shake has no direction; nothing on screen tells you where a hit came from; nothing changes when you're on your last life.

**HUD & menus** (`src/scenes/UIScene.ts`, `TitleScene.ts`, `src/ui/`, `src/render/stageHud.ts`)
- Bottom-left: three small life pips and plain text lines ("LMB  Knife"). Bottom-right: the kill counter (pops 1.3×, green for zombies). Top: a plain caption box for hints, the tracker radar, script title cards, the E prompt text, pause menu, end card with the body count.
- Title screen: static (title, a red slash, a text list). Menus are text lists with a red arrow.
- **Gaps**: the HUD reads like debug text (small Inter type, no icons); hints are a grey box; no transitions between title → stage → end card; losing or regaining a life has no animation; the default cursor is the system cursor; dying cuts straight to a restart.

## 2. Options

### A. Character animation
| # | Idea | Effort | Impact |
|---|---|---|---|
| **A1** ✅ | **Clip blending**: every `setClip` crossfades from the current skeleton over 2–4 frames (per clip, 0 for snappy hits like the jab's contact frame). Removes the pops between punch, idle, stun, walk. | S | ★★★ |
| **A2** ✅ | **Anticipation & follow-through**: bigger wind-ups on heavies, an overshoot frame after each hit, a 2-frame settle back to guard. Plus **overlap**: hands lead, body follows a frame later, head last (per-part delay in the sampler). | M | ★★★ |
| A3 | **Turning**: a 2-frame turn (body narrows, head turns first, then the mirror) instead of an instant flip; the head looks toward the cursor before the body turns. | S | ★★ |
| A4 | **Stride walk**: authored walk keys (contact, passing, push) driven by distance travelled so feet plant without sliding; start step and stop step; a forward lean at the hero's combat speed; depth walking (W/S) as a shuffling side-step. | M | ★★ |
| A5 | **Secondary motion**: held weapons swing with inertia when turning/stopping, the head bobs and overshoots on hits and landings, player 2's strap and the boss's coat sway. | S | ★★ |
| **A6** ✅ | **Directional hit reactions**: head hits snap the head back, body hits fold, hits from behind pitch forward; 2–3 variants per kind, picked at random so crowds don't move in sync. | M | ★★★ |
| **A7** ✅ | **Death variety**: by kill type: headshot = instant drop (knees first), heavy = flung spin, blade = clutch and crumple, explosion = ragdoll arc; corpses bounce once before settling. | M | ★★★ |
| A8 | **Jump & land**: 1-frame crouch before take-off (cosmetic, input stays instant), landing squash + dust ring on every landing (not only improbability). | S | ★★ |
| A9 | **Gun handling**: reload (mag out, mag in, slide), weapon draw on pick-up, a support hand on long guns, recoil travelling into the shoulders/head, aim lean. | M | ★★ |
| A10 | **Enemy body language**: a bouncing guard stance when they hold an attack token, a bigger, readable wind-up before heavy swings (helps you dodge), recoil from friendly fire, cower/flinch near explosions. | S | ★★ |
| A11 | **Pose editor upgrades**: onion skin (previous/next key ghosted), a scrubbable timeline, per-key easing, copy/mirror poses. Makes A2/A6/A7 much faster to author. | M | ★ (tooling) |

### B. Combat VFX
| # | Idea | Effort | Impact |
|---|---|---|---|
| **B1** ✅ | **Multi-frame smears**: 2–3 frame tapering arcs for blades, bats and poles, fist streaks that match the punch's path, spin blur on thrown weapons. Per-weapon shapes. | S | ★★★ |
| B2 | **Impact frame upgrade**: on kills, 1 frame where the victim is a flat white silhouette with a thick ink outline and the impact star is black (ink-negative "hit flash"); heavy hits get it at half strength. | S | ★★ |
| B3 | **Directional blood**: sprays follow the bullet/blade direction, exit sprays on the far side, wall splatter shaped by angle and distance, wounds dripping for a few seconds (stage 2+). | M | ★★ |
| B4 | **Muzzle light**: each shot briefly lights the floor and back wall around the shooter (additive radial), explosions light the whole room; long bursts leave barrel smoke wisps. | M | ★★★ |
| **B5** ✅ | **Bullet impacts on the world**: puffs and chips where shots hit walls/floor/props, sparks on metal, a short ricochet streak sometimes. | S | ★★ |
| B6 | **Dust everywhere**: footstep dust when sprinting/turning hard, body-landing dust rings, knockback skid streaks on the floor (decal). | S | ★★ |
| B7 | **Speed lines** on knockbacks and thrown bodies (a lighter version of the improbability ghost trail, always on). | S | ★★ |
| B8 | **Explosion upgrade**: shockwave ring, debris, scorch decal, lingering embers and smoke column, a 1-frame room flash. | M | ★★ |

### C. Camera & feel
| # | Idea | Effort | Impact |
|---|---|---|---|
| **C1** ✅ | **Kill-cam punch-in**: the camera zooms 4–6% toward the kill during the slow-mo and eases back. Fixed-screen rooms stay fixed otherwise. | M | ★★★ |
| C2 | **Directional shake**: shake along the hit/shot direction (a kick, not jitter), a small rotational shake for explosions and boss slams. | S | ★★ |
| C3 | **Victim-only hit-stop** in crowds: the hit enemy freezes for the hit-stop, the rest keep moving (less "whole world stutters" with many enemies). | M | ★★ |
| **C4** ✅ | **Damage direction + last life**: a red ink flash on the screen edge the hit came from; on the last life, a slow red vignette pulse and slightly desaturated room, heartbeat on the audio side. | S | ★★★ |
| C5 | **Near-miss slow-mo**: a dive under a shot or a jump over a cannonball within a few frames of the hit gets a 0.2 s slow-mo + whoosh. | S | ★★ |

### D. Rooms & lighting
| # | Idea | Effort | Impact |
|---|---|---|---|
| D1 | **Lamps react**: hanging lamps swing when explosions or thrown bodies hit near them, the light cone swings with it; lamps flicker after a shot hits them. | M | ★★ |
| D2 | **Light-cast shadows**: characters under a lamp cast a soft elongated shadow away from it (in addition to the contact ellipse). | M | ★★ |
| D3 | **Ambient life**: dust motes in light cones, smoke haze layer, a flickering sign or monitor per room, slow parallax in outdoor backgrounds. | S | ★ |
| D4 | **Room transitions per exit type**: the ink wipe follows the direction you leave in; ladders/vents/lifts get their own wipe shape. | S | ★ |

### E. HUD
| # | Idea | Effort | Impact |
|---|---|---|---|
| **E1** ✅ | **Ink-style HUD**: lives as three bold ink marks (or tiny heads in our style) that crack when lost and fill back in on a kill; weapons as drawn silhouettes (reuse `weaponPainter`) with ammo as bullet ticks; LMB/RMB as small mouse icons. Anton for numbers. | M | ★★★ |
| **E2** ✅ | **In-world prompts**: key glyphs (E, F) drawn above the object or enemy you can act on, instead of a text prompt; pulses once when it appears. | S | ★★ |
| E3 | **Hint cards**: tutorial captions as ink panels with key glyphs, sliding in and out, a short typewriter reveal. | S | ★★ |
| **E4** | **Custom crosshair**: our own reticle that widens with spread and recoil, shows a reload ring and an "empty → throw" state, and becomes a hand icon over grabbable things. | S | ★★★ |
| E5 | **Edge arrows** for enemies entering from off-screen or doors behind you. | S | ★★ |
| E6 | **Kill counter flair**: shake and bigger pop on multi-kills, tick marks for combo/fatality kills (from the combos brainstorm). | S | ★ |

### F. Menus & flow
| # | Idea | Effort | Impact |
|---|---|---|---|
| **F1** | **Live title screen**: the real renderer runs a small loop behind the menu (silhouettes fighting under a lamp in our style), menu items animate on hover/select (ink underline sweep, click sound). | M | ★★★ |
| **F2** ✅ | **Transitions & stage cards**: ink wipe between title → stage → end card; an animated stage card ("STAGE 2" + our stage name) at the start of each stage. | S | ★★ |
| F3 | **End card**: the body count rolls up against the episode's number, plus stats (time, accuracy, longest chain, favourite weapon). | M | ★★ |
| F4 | **Death & restart**: on death, a 0.5 s slow replay of the killing blow + ink splat, then a fast restart (one key). | M | ★★ |
| F5 | **Pause screen**: the room behind it desaturated and dimmed, the controls drawn as a key map. | S | ★ |
| F6 | **Settings additions**: separate sliders for shake, hit-stop and flashes; previews in the menu. | S | ★ |

### G. Readability
| # | Idea | Effort | Impact |
|---|---|---|---|
| **G1** ✅ | **Hero stands out**: a thin light rim on the hero (and P2) and a slightly darker ink outline, so he's readable in crowds (stage 4's club). | S | ★★ |
| G2 | **Telegraph consistency**: every enemy attack gets the same visual language (red dashed aim line exists; add a red glint on melee wind-ups). | S | ★★ |
| G3 | Everything new respects the effect-intensity and reduced-motion settings. | S | — (rule) |

## 3. My suggested first bundle

If you want one pass that changes the feel the most for the effort:

1. **A1** clip blending (removes the snapping, unblocks everything else)
2. **A2** anticipation, follow-through, overlap
3. **A6 + A7** directional hit reactions and death variety
4. **B1** multi-frame smears and **B5** bullet impacts on walls
5. **C1** kill-cam punch-in and **C4** damage direction + last-life state
6. **E1** ink-style HUD, **E2** in-world prompts and **E4** the custom crosshair
7. **F2** transitions and stage cards
8. **G1** hero rim

That's roughly one L milestone (A1–A2–A6–A7 are the core; HUD and flow could be a second, M-sized one).
