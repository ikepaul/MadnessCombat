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
| Combo reward | **2026-10-27:** feel only (hit-stop, pitch-up, kill-cam). No score, no style meter. **Later the same day (the user):** a separate **rage meter** fed by kill variety (below, M19); combos and contextual fatalities still reward with feel only. | Kill-counter marks for combo kills stay an option for later. |
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

## Decided for M10b (2026-10-27, with the user)
- **Juggles**: grunts only. Zombies shrug off the launcher.
- **Co-op combos** (shared chains, hand-off juggles, double-teams, weapon passes): later, with M13. In M10b chains stay per attacker; both players can use every move. **Now M18** (decided 2026-10-27, below).

## Decided for M17–M20 (2026-10-27, with the user)
Specs: `../design/qol-pass.md` (M17), `../design/coop-moves.md` (M18), `../design/rage.md` (M19–M20).
- **Quality of life (M17)**: walking over a *loaded* gun fills your empty hand (loaded guns only; empty guns are never auto-picked); tap E = smart swap of the worse hand, hold E + LMB/RMB = that hand, and the E prompt shows the weapon, the hand and what it replaces; hero melee gets a depth snap (≤ 0.3 H toward the target), a 0.3 H band and a floor-shadow ring for enemies on your depth line (enemies unchanged); friendly flying weapons are caught automatically into a free hand, enemy throws still need F (window 0.25 s); cover is a 3D segment test (you can shoot from behind your own cover); bullets go exactly to the cursor; a grenade landing marker; thrown weapons fly to the depth of the enemy under the cursor; F grabs with any free hand (a one-handed item moves to the back hand).
- **Co-op moves (M18)**: all nine: hold & hit, shared chains, ping-pong, wishbone, weapon pass, body bat, double-team, hero toss, and the user's **carry-spin** (the carried partner presses F, the carrier swings them round himself by the ankles; an armed partner shoots only out to the side they're on, an unarmed one floors enemies in the circle; carrier F throws them out, Space hops off). Aim at your partner to lift or pass to them. Co-op moves never hurt the partner; their kills are team kills.
- **Rage meter (M19)**: one bar per player, filled only by kills whose type isn't one of your last 2 (10% a new kind, +5% per varied kill in a row up to 25%); it never drains, is saved with the checkpoint and resets per stage. Full: white/ink look, **only the eye slit turns red** (the one exception to red = blood and telegraphs). **Tab** fires a solo rage fatality picked by what you hold (fists, gun, blade, club): a super of 1.5–3.5 s in which the world stops for everyone else and the heroes are invulnerable. This is a deliberate exception to "fatalities ≤ 0.8 s, never take control away" (M10b), which still holds for contextual fatalities.
- **Team rage (M20)**: stronger than solo: **every eligible enemy on screen dies** (no cap; solo hits at most 6; decided 2026-10-28). Both bars full; Tab within ~3 H of your partner sends a request instead of your solo move, their Tab accepts (4 s window), your second Tab withdraws it and fires your solo move. Kill pacing mixed per move: fist, blade, club and ping-pong moves strike everyone and they all die together at the end; the gun moves kill as the barrel passes.

## Decided for stage 4 (2026-10-27, with the user)
- **Ending**: you have to **win** the duel. When the boss's health runs out he grabs the hero as he falls ("takes you with him"); the hero sets off his grenade and the blast kills both, then the end card. Losing the duel is an ordinary death (the room restarts), so there's no reason to lose on purpose. Replaces the detonator-while-downed proposal.
- **The DJ (our clown) is a mini-boss fight**: after the crowd he fights and can be killed (not the episode's untouchable non-combatant). His fight is designed in M16; his look in the M14 design pass.
- **Fire-mode key**: **B**, its own rebindable key; R stays reload only.
- **Sword guard**: **hold RMB** with a sword-class weapon (sword, katana, scimitar); long weapons keep RMB = thrust.
- The show's on-screen gag text is not copied; by default there is none (no answer yet on an own gag).

## Audit decisions (2026-10-28, with the user)
Source: `../design/audit-pass.md` §4 (the M14b audit). The bundle goes in as suggested (M14b in `PLAN.md`).
- **Stage 1 checkpoints**: each beat (riot, grenade, boss, wave B, ending) is a checkpoint, and Continue resumes it. This refines "dying restarts the room": in stage 1 the beat is the room.
- **Mercy window**: after a hit the hero ignores further hits for **0.3 s** (Pro), scaled proportionally by difficulty (Noob 0.5 s, Notch 0.15 s). Hero only; scripted lethal hits are exempt. "Every hit costs exactly 1 life" stays.
- **Gun headshots**: no nerf yet. Measure again on the spawn-variety PR (#43); then melee-only healing is tried as an F6 switch in the playtest. No aim-settle.
- **Prone** stays the bullet dodge; adjacent unarmed grunts stomp a prone hero after a ≥ 0.3 s drawn tell.
- **Dive key**: C by default (Ctrl stays bindable, with a warning); a leave-page confirm while a stage runs.
- **Debug keys** only in dev builds or with `?debug`; M (mute) stays a player key.
- **Scripted hits** (the tutorial cross, the boss flings) knock down without damage.
- **Music**: the one-stem track plays straight through rooms; shipped as OGG under a neutral file name.
- **Text**: minimum 26 px, captions 34 px.
- **`axeThrows`** is on from the camera room to the end of stage 3, owned by the rooms (the same after a restart). Rooms waiting on one trick re-show their hint after 20 s of nothing.
- Smaller defaults: Continue = the furthest point reached; Co-op hidden in production builds; the toy street keeps its red (the welder's visor goes grey); the head moving with the fist on 1-frame hits stays.
- **Playtest (2026-10-30)**: "seems good". Every new value from slices B–D stays; their A/B switches stay as tunables.
- **Healing**: every kill heals (`TUNING.health.healMeleeOnly` 0). Melee-only healing was not kept.
- **Mid-room checkpoint (ENC-19)**: the stage 2 corridor gets one after the boss's fling and mass raise; a death after it restarts at the raised dead with the loadout and kills of that moment. Continue still only moves forward (the checkpoint sorts after the corridor's entry, before the elevator). The desert keeps its single checkpoint.
- **Jetpack burst**: stage 3 camera room, one MG burst lasts 1.0 s (was 1.4 s).
- **The "!" alert** is louder (recipe level 0.5, was 0.4), to meet its −22 dB loudness target.

## Still open (to ask later)
- Pistol-whip (gun-butt hit at contact range): its own key (F with a gun in hand) or automatic? Not in the M10b slice.
