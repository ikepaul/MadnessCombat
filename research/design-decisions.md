# Design decisions

Decisions taken with the user while researching (2026-10-26). The mechanic notes' "Game translation" sections already follow these.

## Decided

| Topic | Decision | Notes |
|---|---|---|
| Scope | Episodes 1–3, one stage per episode. **Extended 2026-10-27 (the user): episode 4 becomes stage 4** (research in `episodes/ep4-log.md`, rooms in `stages.md`, milestones M14–M16). Mechanics, movement, enemy types and set pieces are copied. Art, names and characters are not. | No timestamp, no mechanic. |
| Tech | TypeScript + Phaser, runs in the browser. | Lets us check builds side by side with the reference frames. Versions and architecture: `../PLAN.md`. |
| Damage | **Revised 2026-10-26:** the player has 3 lives and every hit taken (punch, bullet, anything) costs exactly 1. Every kill heals 1 life (up to 3). Grunts have 4 hp: light punch 1 (stuns), heavy 2 (knocks down), so 4 lights or 2 heavies. Guns: 1 shot to the head or 2 to the body kills a grunt (M5). A kill with a heavy attack decapitates. Hard or slow-to-do moves (fast wall slams) still kill outright. Combos that kill faster come later (M4). | Replaces "grunts die from 1 bullet / 1 good hit". Zombies, brutes and bosses have their own rules. |
| Co-op | **2026-10-26:** the final game is **2-player co-op** on two laptops on the same Wi-Fi (single player stays available). Every hit costs a life as before; a hero out of lives goes **down** and is revived by a teammate standing in their circle for **5 s** (the bar drains quickly when they step out). The room restarts when nobody is left standing. | Online play later would need a real server and lag handling. |
| Guns (M5) | **2026-10-26:** bullets do 4 damage to the head and 2 to the body (grunts have 4 hp: 1 head / 2 body shots, as decided earlier); the player loses 1 life per bullet. **No friendly fire** in co-op (invented). | Values in `src/data/weapons.ts`. |
| Combos | **2026-10-26 (design in M4):** hits by one attacker on one target within 0.8 s chain. The 3rd+ hit of a chain and a heavy straight after a light (quick cross) deal +1. Light→heavy kills a grunt in 2 hits, three chained lights in 3. **2026-10-27 (M10b):** chains reward mixing *different* verbs, as the hero does in the show: a thrown gun, a caught weapon or a shot can be a chain hit too, not only punches. First slice of six moves: uppercut launch → juggle, sub-lethal wall bounce, pop-and-catch disarm, thrown empty gun → punch, head punt, over-the-shoulder shot. | Values in `TUNING.combo`, invented. Brainstorm and later candidates: `../design/combos-and-fatalities.md`. |
| Fatalities | **2026-10-27:** contextual, no extra input: how and where the kill happens picks the special death. ≤ 0.8 s of animation, the world keeps running, never a cutscene. Stage 1 stays bloodless (decaps and launches only). | |
| Combo reward | **2026-10-27:** feel only (hit-stop, pitch-up, kill-cam). No score, no style meter. | Kill-counter marks for combo kills stay an option for later. |
| Backward shot | **2026-10-27:** the over-the-shoulder shot (fire the back hand at an enemy in contact behind you, without turning) is a normal move from M10b on, not only in the stage 3 last stand. | Replaces "allowed only in the last stand". |
| Movement feel | **2026-10-26:** walk faster than measured (calm 1.1, combat 1.8 H/s instead of 0.8 / 1.3) and keep walking (at 70%) while punching or throwing. | Values invented and tunable in `src/data/tuning.ts`. |
| Reference footage | Downloaded episodes and clips stay local (gitignored), never shipped. | Rebuild with `tools/research/make_clips.py`. |
| Level layout | **Fixed-screen rooms** joined by doors, lifts, vents, ladders, holes and falls. | Ep1 = one room. Ep2/ep3 = chains of about 10 rooms (`stages.md`). |
| Movement plane | **Beat-'em-up depth**: characters move on a floor plane (x, z) + jump (y). Melee and grabs need a matching depth band. | User: "beat em up depth but you should also be able to aim weapon freely so you can shoot on more than the current depth axis". |
| Aiming | **Free mouse aim.** The gun arm follows the cursor at any angle. Dual wield: both arms aim at the cursor, and a split-aim key locks the off-hand onto the nearest enemy on the other side. | |
| Bullets across depth | **Screen-space ray**: a bullet is a hitscan line from the muzzle to the cursor and hits the first character it visually crosses, whatever their depth. Cover blocks only if it's in front of the target in depth. | If it looks like a hit, it's a hit. |
| Stealth | **Contextual takedowns**: unaware/alert states. Attacking an unaware enemy from behind or from above = instant silent kill. Unsuppressed shots and explosions alert the room. No vision cones or body hiding. | |
| Ammo | **Throw & scavenge**: guns hold one magazine plus at most one spare. Empty guns are thrown (they're a weapon), and you pick new ones off corpses. | Reload exists but is rare. |
| Stage endings | Stage 2: non-interactive ending where the player dies. Stage 3: **playable last stand**: impaled, can't move, aim/fire for about 5 s to kill the boss behind you and the target, then die. | |
| Fidelity | **Same rooms & beats** as the episodes (`stages.md`), with waves and placement tuned for gameplay and optional alternate routes (vents, breaches) added. | |
| Art style | Same proportions, camera and greyscale-and-red feel as the show, own designs. Face **A: slit**. Hands/feet float (no arms or legs). | `../design/art-direction.md`, `../design/style-frame/` |
| Palette | **One per stage**: stage 1 neutral, stage 2 cool, stage 3 warm. Red only for blood/telegraphs, green only for zombies. | |
| Effects | **Heavy stylised**: hit-stop, impact frames, chromatic split, screen shake, kill-cam slow-mo, grain/vignette/bloom, with caps for automatic fire and an intensity setting. | |
| Music | **The user composes it** from the brief in `../design/audio-direction.md`. SFX from CC0/royalty-free libraries, layered and processed. | |

## Defaults assumed (say if you want them changed)
- Kill counter HUD on **all** stages (only ep3 has one), plus an end-of-stage body-count card against the episode's count (32 / 86 / 91 / 80).
- Stage 4 (proposed with the research, 2026-10-27): its own palette (night/club: the darkest, red and green stay reserved), kill counter on, starts with the car's SMG + pistol, gore level like stage 3.
- No sprint, no double jump, no wall jump (none appear in the show).
- Corpses, weapons and decals never despawn within a room. Only intact corpses can be raised as zombies, so grenades/gibbing counter the halo boss.
- Enemy ranged attacks have a visible aim telegraph (≈ 0.4 s) before the hitscan shot, because hitscan can't be dodged.
- Shadow telegraph for everything that falls from above.
- Bosses, the target and special enemies get a design pass (character sheet in the style frame) before their milestone, in our own designs.
- Neutral names until we name things: hero, grunt, halo boss, clown, target, welder, sun brute.

## Decided for M13 (2026-10-27, with the user)
- **Controls**: keyboard + mouse only (no gamepad).
- **Difficulty**: one difficulty, the current tuning (3 lives, a life back per kill).
- **Stage select**: unlock as you go. Stage 1 from the start; finishing a stage unlocks the next (saved in the browser). "Continue" resumes at the last room checkpoint.
- **Checkpoints**: dying restarts the room you died in, with the weapons and body count you entered it with; unlimited tries.

## Playtest feedback (2026-10-27, with the user)
- **Movement**: "snappy". The hero walks ~35% faster (calm 1.5, combat 2.4 H/s), steers fully in the air and jumps a little farther, and gets up from prone quicker. Enemies keep their speeds.
- **Friendly fire** (a setting): thrown weapons hitting a co-op ally do full damage (default), only knock down, or fly through.
- **Idles**: smoking, chatting/gestures between unaware grunts, fidgets (wrist check, stretch, head scratch, look around), and hero fidgets after standing still.
- **Gore in stage 3**: extreme. Bigger sprays, wall splatter, blood trails, more decapitations, shotgun/axe/explosion kills gib, arms come off, every heavy kill bursts, blood sticks to weapons and the hero.

## Still open (to ask later)
- Stage 4 (before M14): the **ending**: the show's mutual kill with a detonator (proposal: hold E while downed in the final duel; not detonating restarts the room), or a different finish? Does the DJ (our clown) stay a non-combatant who survives? Fire-mode key: R with a full magazine, or its own key? Sword guard on RMB (thrust stays on long weapons only)? The show's on-screen gag HUD text is not copied: our own gag, or none?
- Combos (after M10b): a gun-butt hit at contact range: its own key (F with a gun in hand) or automatic? Do juggles work on zombies or only on grunts? Co-op combos (hand-off, double-team, weapon pass) now or in M13?
