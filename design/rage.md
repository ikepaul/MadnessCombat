# Rage meter & rage fatalities (M19, M20)

Status: **planned** (2026-10-27, with the user). **M19** = the meter, its HUD and look, and the four solo rage fatalities. **M20** = the team request and the two team rage fatalities. The co-op moves they build on are M18 (`design/coop-moves.md`).

This **reverses two earlier decisions**, at the user's request (recorded in `research/design-decisions.md`):
- "Combo reward: feel only, no score, no style meter" (2026-10-27): the rage meter is a meter, on the HUD. Combos and M10b fatalities keep their feel-only reward; rage is a separate system that rewards *variety of kills*.
- "Fatalities ≤ 0.8 s, never take control away" (M10b pillar 2): rage fatalities are **supers**. The player chooses to fire them, the heroes are invulnerable while they run, and they last 1.5–3.5 s. The M10b contextual fatalities keep the old pillar.

Decided with the user (questionnaire, 2026-10-27):

| Topic | Decision |
|---|---|
| Fill rule | Kills fill it only when their type isn't one of your **last 2** kill types (so you need 3+ kinds of kill in rotation). Example from the user: two shot kills, only the first counts (10%); a thrown-weapon kill then counts again. |
| Full-rage look | **White and ink, with only the eye slit turning red.** The one exception to "red = blood and aim telegraphs only". |
| Key | **Tab** (free in the game; only the pose editor scene uses it). Rebindable. |
| Team cost | **Both bars full.** Both empty after the team move. |
| Joining | **Proximity request**: if you're close to your partner (and their bar is full too), Tab doesn't fire your solo move; it sends a request your partner answers with their own Tab. |
| Kill pacing | **Mixed per move**: the fist, blade and club moves strike everyone first and they all die together at the end; the gun spin kills each victim as the barrel passes. |

All numbers below are invented unless they cite a source, go into `TUNING.rage` / `FEEL.rage` marked `// invented`, and are tunable in F6.

---

## 1. The meter

`Actor.rage?: { value: number; recent: KillType[]; streak: number }` on heroes (0..1).

### 1.1 Kill types
Every kill a hero is credited with (`kill.byId` is a player) gets one type, computed in the sim where the kill happens and carried on the `kill` event as `type: KillType` (so the co-op guest and the HUD know it too). Priority top to bottom; the first that applies wins:

| Type | When | Pictogram |
|---|---|---|
| `team` | any co-op move kill (`kill.team`, M18), a team chain kill | two heads side by side |
| `style` | an M10b fatality: the head punt, the over-the-shoulder shot | a four-point star |
| `air` | the victim was airborne and juggled (`flight.juggle`): a juggle jab/heavy kill, a shot at a juggled grunt | a body on an upward arc |
| `stealth` | `takedown` (wire, knife from behind, drop kill) | a closed eye slit |
| `stomp` | `finisher` | a foot over a floor line |
| `kick` | `sweep`, the flying kick (`kickContact` passes `via: 'kick'`) | a foot with motion lines |
| `fists` | `light`, `heavy`, `uppercut` | a mitten fist |
| `toss` | a thrown body: `body` (hit by one), `wall` (slammed), the vending-machine smash, `damageThrown` | a body with a curved arrow |
| `blade` | `stab`, `slash` (knife, sword, scimitar, axe in the hand) | a knife |
| `blunt` | `smash` (bat, pipe, baton, the sign) | a bat |
| `thrown` | `knife` (a thrown blade), `gun` (a thrown gun) | a knife with motion lines |
| `gun` | `bullet` | a pistol |
| `boom` | `blast` (a grenade the hero threw or threw back), `cannon` credited to a hero | a starburst |
| `env` | `pin`, anything else a hero caused (crushes credited to a hero) | a wall with an impact crack |

Code: `killType(kind, ctx)` in `src/sim/rage.ts`, `ctx = { juggled, via?, team?, punt?, backshot? }`. `applyHit` gains an optional last parameter `via?: KillVia` (`'kick' | 'style' | 'team'`) that `kickContact`, `sweepContact`, `fire()` (over-the-shoulder), and the M18 moves pass; `die()` and `damageThrown()` and `shieldHit()` put the type on the `kill` event.

### 1.2 Gain
```ts
rage: {
  base: 0.10,        // the user's number: a new kind of kill = 10%
  streakStep: 0.05,  // each varied kill in a row adds 5% more: 10, 15, 20, 25
  streakMax: 3,      // ...up to 25% a kill
  recent: 2,         // a kill counts only if its type isn't one of the last 2
  styleBonus: 0.05, teamBonus: 0.05,
  multi: 0.03,       // each extra victim of the same action (same tick, same hero, same type)
  bossBonus: 0.2,    // a boss or mini-boss phase kill
  ...
}
```
- On a credited kill of type `T`:
  - `T` in `recent` (the last 2 kills' types, repeats included) → **no gain**, `streak = 0`. The HUD shows the repeat (1.3).
  - else → gain `base + streakStep * min(streak, streakMax)` (+ `styleBonus` for `style`, `teamBonus` for `team`), then `streak++`.
  - either way `recent` = the last 2 types (push `T`, keep 2).
- **Multi-kills**: extra victims of one action (a grenade, a thrown body bowling three, the street sign's sweep) get `multi` each, never blocked by the repeat rule, and don't touch `streak`.
- Example: gun 10 → gun 0 (streak reset) → thrown 10 → fists 15 → gun 20 (gun left `recent` two kills ago) → stomp 25 → full after about 6 varied kills.
- The user's sentence "throw their weapon to kill, it adds more" reads two ways (adds again, or adds more than 10%). The streak gives both: it adds again, and more the longer you keep varying. Check with the user in the M19 playtest.
- **Never counts**: kills by enemies (friendly fire), kills during a rage fatality (the meter is being spent), heroes, corpses (already dead), scenery deaths no hero caused. Zombies count like grunts.
- **Never drains**: not over time, not when hit. Capped at 1 (gains when full play a small spark, no overflow).
- **Persistence**: kept across rooms in a stage; saved with the room checkpoint (`Checkpoint.players[i].rage`, `src/progress.ts`): dying restarts the room with the value you entered it with. A new stage starts at 0.
- **Co-op**: each hero has their own bar. Team kills give `team` to both (M18).

### 1.3 HUD (`src/ui/rageBar.ts`, drawn by `UIScene` next to each life row)
- **Bar**: right of the three life heads (x = row start + 3 × 52 + 26), 210 × 16 px, ink outline 3 px, inner `#2a2b30`, fill `#f2f2f3`, thin ink ticks every 10% so gains read as chunks. A gained chunk flashes brighter for 0.3 s.
- **Gain number**: `+15` (Anton 22 px, white with an ink stroke) rising 20 px over 0.5 s from the bar's fill edge. No "%" sign.
- **Variety strip**: the last 2 kill-type pictograms (24 px, white fill, ink outline; drawn by `src/ui/killIcons.ts`, our own procedural icons) to the right of the bar, newest on the right. A new type pops in (1.3 → 1 over 8 frames). A **repeat** shakes the matching icon (±4 px, 0.25 s), greys it for 0.4 s, and plays a dull tick: that's how the player learns the rule without text.
- **Full**: the fill pulses between `#f2f2f3` and `#ffffff` with a soft glow at 1.1 Hz; at the bar's end a small eye-slit icon turns **red** (`BLOOD #c70f1b`, the rage exception) and `TAB` is printed under it in Inter 14 px (the bound key).
- **Team ready** (M20): when both bars are full, a `TEAM` tag on both bars; white when the heroes are within `rage.requestRange` (Tab will send a request), grey when they're farther ("get closer"). In range, a faint dashed white line on the floor between their contact shadows (25% alpha, pulsing).
- The co-op guest draws both bars from the snapshot (`ActorSnap.rage`).

### 1.4 The hero at full rage (`src/render/canvas/characterPainter.ts`, `src/render/vfx.ts`)
- **Rim**: the G1 light rim gets hotter: blur 0.06 H (from 0.035), alpha pulsing 0.6–0.95 at 1.1 Hz.
- **Eye slit**: red `#c70f1b` with a 0.02 H red glow. The only red on a living character outside blood.
- **Ink wisps**: 3–4 small dark smoke puffs a second rising off the shoulders (life 0.6 s, drift up 0.25 H, ink `#141416` at 35%), reusing the smoke particles in `vfx.ts`.
- Effect intensity: `reduced` = half the wisps and no rim pulse; `off` / reduced motion = a static rim, no wisps; the red slit stays (it's information).
- **Sound**: reaching full plays `rageReady` (a low hit + a reversed swell, 0.8 s); while full, a quiet low growl loop (−26 dB on the world bus, ducked under music) that stops when spent.

---

## 2. Firing it

### 2.1 Input
- Settings action `rage` (label "Rage fatality"), default key `TAB`; `PlayerInput` adds `kb.addCapture('TAB')` so the browser never moves focus. `PlayerCommand.rage?: boolean` is an edge: update `clearEdges`, `mergeEdges`, `hasEdges` (`src/sim/command.ts`). The co-op guest's command carries it unchanged.
- The Controls page and `CLAUDE.md` controls line list it.

### 2.2 When it works
A hero can fire when: `rage.value >= 1`; alive, `state` `free` or `attack` (an attack is cancelled); not downed, carried or carrying (M18), not held by the boss, not traversing, not on a ladder/hatch; not `world.inputLocked`, no `world.lastStand`, no rage run already going.
- Holding a body or item: it drops where it is. Cooking a grenade: it's lobbed at once toward the cursor with the fuse left (it freezes in the air with the world, 2.4).
- **No victim on screen** (2.3): `rageFizzle`: the rim flickers, a dull sound, nothing spent.

### 2.3 Victims
- Eligible: living enemies (`ai` set) of kind `grunt` or `zombie`, on screen (projected x within the frame with a 0.3 H margin), not `entering`, not `invulnerable` / `protected`, not `koed`, not `surrendered` (the stage 2 hold-up story stays intact), not in a stealth takedown (`takenBy`). Variants excluded: `riot`, `target`, `vending`, `vip`, and anything hovering (the jetpack). Bosses never. A grunt held by a hero (hold & hit) is released and included. Stage 4's agent (M14): decide when that branch is merged (proposal: included).
- Cap: solo **6**, team back to back **10**, team ping-pong **8**. Order per move (below). Beyond the cap, enemies are bystanders.

### 2.4 While it runs (`world.rage`)
```ts
interface RageRun {
  kind: 'rampage' | 'spinShot' | 'cutLine' | 'homeRun' | 'backToBack' | 'pingPong';
  heroes: number[];                                // 1 or 2
  victims: number[];
  pending: { id: number; death: RageDeath }[];     // struck, waiting for the release
  phase: 'ignite' | 'gather' | 'run' | 'finale' | 'release';
  t: number;
}
```
- `src/sim/rage.ts` (meter, kill types, activation, the request), `src/sim/rageMoves.ts` (one sequencer script per move), numbers in `TUNING.rage` and `FEEL.rage`.
- **Time stops for everyone else.** While `world.rage` is set, `World.step` steps only the rage heroes, the victims (driven by the move script: state `stun` with `stunFor = Infinity` and `rageMarked`, brains ignored) and items flagged `rage` (heads, knives the move spawns). Not stepped: every other actor (frozen mid-pose, clips paused), other items (grenade fuses stop), cannons and balls, falling blocks, lock walls, the collapse, the elevator, doors, the wave director, `assignTokens`, `checkExits`. `Seq` steps only tasks started with `{ rage: true }`; stage scripts wait.
- **The heroes are invulnerable** during the move (`invulnerable`, restored after) and ignore their input (the script drives them).
- **The release is the moment the world resumes.** For the strike-all moves, the victims die on the release tick and everyone else starts moving on that same tick: flung bodies can bowl bystanders, heads fly into them. Bystanders get a short `rage.aftershock` stun (0.4 s) so the player has a breath after the super.
- Kills in the move are normal `kill` events (counter, healing, gore, decals) with `rage: true`; they give no rage.
- Feel: the move's own hit-stops (≤ 3 frames each) are outside the 6-frames-per-second budget (`FeelDirector` handles `rageBeat` separately); the normal kill-cam triggers are off during the move (they'd stack); slow-mo comes from the move's plan (`FeelSink.slowMo(scale, seconds, rampIn, rampOut)`, new; it drives `clock.feelScale` like the kill-cam).
- Events: `rageStart { kind, heroes, victims }`, `rageBeat { kind, beat, actorId?, targetId?, i? }` (every dash, strike, shot, cut, release), `rageEnd`, `rageFizzle`, `rageGain { actorId, amount, type, repeat }`, `rageRequest { phase: 'open' | 'accept' | 'withdraw' | 'expire', from, to }`.
- Co-op net: `Snapshot.rage` = the run's kind, heroes, victims, pending ids and phase (the guest's cinematic layer and dimming need them); `ActorSnap.rage` = value, recent, ready. Everything else from replayed events.

### 2.5 The cinematic layer (render, from the events; works on the guest)
- **Letterbox**: ink bars top and bottom, 7% of the height each, in over 8 frames, out over 10 (real time), in `UIScene` (crisp, no post FX).
- **The stopped world is dimmed**: room, decals, corpses and bystanders at 55% brightness and 40% saturation; the heroes, victims, rage items and their VFX full. Done with layers, not per-actor filters (Canvas 2D filters are slow): bystanders draw in the actor layer as usual, a ColorMatrix filter dims/desaturates the room, decal, corpse and actor layers, and the participants draw into a new **rage layer** above it. Participants are always on top during the move (a spotlight look; depth sorting holds within each layer).
- **Camera**: punch-in 3% toward each strike (the C1 code), 8% on the release, eased back.
- **Music and sound**: the music ducks −10 dB with a 900 Hz low-pass for the run; the finale's silence beat takes everything but the move to −30 dB; the release un-ducks over 0.6 s.
- **Flashes**: the white release flash is a 1-frame full-screen white at 30%, off when flashes are off; shake and chromatic follow the effect-intensity setting as everywhere.

---

## 3. Solo rage fatalities (M19)

Which one fires depends on what you hold, checked front hand first: **a gun** in either hand → Spin shot; **a one-handed blade** (knife, sword, scimitar, axe) → Cut line; **a blunt weapon** (bat, pipe, baton) or the **sign** → Home run; **empty hands** → Rampage.

Frames are 30 fps world-time frames (1 f = 1/30 s of sim time; the sim runs at 60 Hz). "Slow" is the feel slow-mo (real time stretches, the sim doesn't change). Pose names are new poses in `src/data/poses.json` unless marked (exists).

### 3.1 Rampage (empty hands): strike all, then all drop
Victim order: a nearest-neighbour tour from the hero.

| Beat | Frames | Hero | Victims | VFX / feel | Sound |
|---|---|---|---|---|---|
| Ignite | 0–9 | `rageCrouch` (f0–3, ease in), `rageRoar` (f4–9, `back` ease: chin up, hands flung out wide) | marked at f6: a white tick over the head + a 1 px white rim | f4: the eye slit flares (red glow ×2), a white ring bursts out (0.6 → 2.2 H in 8 f), an ink shockwave ellipse on the floor, dust. Slow 0.35 (ramp in 3 f), letterbox in, dim in over 6 f | `rageIgnite`: a reversed swell into a boom on f4 |
| Strike *i* | 9 f each | f0–2 **dash**: an ink smear from the old spot to 0.42 H in front of victim *i* at his depth, facing him, 3 ink ghosts along the path (fade 6 f). f3–5 wind-up → contact, one of 5 variants (below). f6–8 follow-through: overshoot, settle toward guard (`settle` ease) | on contact, the victim locks in that variant's **pending pose** and hangs exactly there (no gravity), a black impact star stuck on him, a 1 px tremble at 20 Hz | contact f5: hit-stop 2 f, an ink-negative impact frame on the victim (white silhouette, 0.03 H ink outline, 2 f), shake 5, chromatic 4 px 2 f, camera punch-in 3%. Slow 0.6 between strikes | `rageDash` whoosh, the punch layers + a bass thump, pitched +1 semitone per strike |
| Finale | 0–5 | `rageFinish`: lands, turns half toward the camera, fists lower, shoulders drop | still pending | slow deepens to 0.2 | silence by f3 (−30 dB) |
| Release | 6 | holds `rageFinish` | **all die at once**, each by his variant's death (below). The world resumes this tick | white flash 1 f, shake 14, chromatic 8 px 3 f, punch-in 8%; kill-counter pops staggered 2 f apart | `rageRelease`: one composite crash (all the kills + a reversed cymbal into a sub boom) + 2 individual kill voices |
| Out | 7–20 | blends to idle (A1) | — | slow 0.2 → 1 over 0.4 s real, letterbox and dim out | music back over 0.6 s |

The five strikes, cycled in a seeded shuffle so neighbouring victims always differ:

| Variant | Hero wind-up → contact | Victim pending pose | Death on release |
|---|---|---|---|
| Uppercut | `upWind` → `upHit` (exist) | `pendLift`: head up 0.12 H, body arched back 0.25 rad, heels up 0.05 H | decap: the head flies straight up (2.5 H/s, spinning); stage 2+ a neck spray up |
| Haymaker | `hayWind` (shoulder turned away, fist far back) → `hayHit` (full twist, fist past the head) | `pendBend`: bent back 0.45 rad, head turned away | flung spin (a heavy flight) into the nearest wall, slumps; stage 3 gibs |
| Hammer | `hammerWind` (both fists overhead) → `hammerHit` (both down at head height) | `pendFold`: body squashed (sy 0.82), head down 0.1 H | drops straight down folded (`crumple`) |
| Knee | `kneeWind` (hop 0.15 H) → `kneeHit` (front foot up to chest height, body leaning in) | `pendDouble`: doubled forward 0.4 rad, hands at the gut | doubled drop (`drop`) |
| Spin backfist | `spinWind` (half turn in 2 f, body narrowing) → `backfistHit` (back hand out at head height) | `pendTwist`: head turned 1.0 rad, body twisted | the head spins 360° and he drops; stage 2+ head burst instead |

Length: 0.30 + n × 0.30 + 0.70 s = **2.8 s** at n = 6.

### 3.2 Spin shot (a gun in hand): each dies as the barrel passes
Victim order: by screen angle around the hero, starting on the facing side.

| Beat | Frames | Hero | Victims | VFX / feel | Sound |
|---|---|---|---|---|---|
| Ignite | 0–9 | `gunRaise` (f0–5: gun(s) up beside the face, barrels up), then a hop (f6–9) to 0.35 H | marked | eye flare, ring, marks, slow 0.4, letterbox, dim | `rageIgnite` + a slide rack |
| Spin | 0–26 (0.9 s) | turns a full 360° in the air (one gun) or 180° (two guns: the back hand covers the opposite side). Facing flips as the spin passes side-on, the body narrows there (`root.sx = max(0.4, |cos φ|)`), a ±0.12 rad twist. The gun arm(s) point along φ | when a barrel passes a victim's angle (±4°), that hand fires a tracer at his head: a guaranteed hit (no cover), **he dies at once**: head burst (stage 2+) / decap (stage 1), deaths alternate `drop` / `fling` | hit-stop 1 f per kill (the spin freezes), shake = the weapon's ×1.5, muzzle flash + room light, casings spinning slowly in the slow-mo | the gun's shots with a slap-back echo, casings |
| Land | 0–10 | `gunLand`: crouched, guns pointing down and out to both sides | — | 3 smoke wisps from each barrel over 0.6 s, slow out, letterbox out | the casing rain (staggered), a final slide rack / pump, a low swell out |

- Long guns (rifle, shotgun, MG): no hop: a planted pivot with the gun at the hip, 360° over 1.1 s. The shotgun's pellets are real (two aligned victims can both die).
- Ammo: the shots don't use the magazine, and **every held gun is refilled to a full magazine** at the end (the reward).
- Length: about **1.55 s** (1.75 s with a long gun).

### 3.3 Cut line (a one-handed blade): strike all, then all drop
Victim order: a nearest-neighbour tour, so the dash zig-zags.

| Beat | Frames | Hero | Victims | VFX / feel | Sound |
|---|---|---|---|---|---|
| Ignite | 0–9 | `iaiReady`: crouched, blade held low behind the body, edge out, the free hand forward | marked | a white glint runs along the blade, eye flare, slow 0.35, letterbox, dim | `rageIgnite` + a metallic ring |
| Pass *i* | 4 f each | vanishes and reappears 0.45 H **past** victim *i* (far side), `iaiFollow`: blade extended forward and out, body low, free hand back | doesn't react ("he doesn't know yet"); a small white glint at his cut point | a straight white slash line from the previous hero position to the new one through the victim's cut point (the first through the neck, then diagonals alternating up and down), 2 px core + 6 px glow, **staying until the release**. Hit-stop 1 f, no shake | a muted `rageTick` shing per pass |
| Finale | 0–9 | rises into `bladeFlick`: one flick of the blade down and out to the side (a smear arc) | still | silence from f4 | — |
| Release | 10 | holds the flick | every line flashes once and vanishes; **each victim splits along his cut** (the M18 split render): the upper part slides 0.12 H along the cut over 6 f and falls, the lower part crumples. Stage 2+: blood both ways along each cut; stage 3 extreme (hands, more); **stage 1: every cut goes through the neck → decaps only, bloodless**. World resumes | shake 10, punch-in 6% | one long `rageShing`, then flesh hits and body falls stacked over 12 f |
| Out | 11–24 | to idle | — | ramp out | — |

Length: 0.30 + n × 0.13 + 0.80 s = **1.9 s** at n = 6.

### 3.4 Home run (a blunt weapon or the sign): strike all, then all drop
Victim order: by distance from the hero.

| Beat | Frames | Hero | Victims | VFX / feel | Sound |
|---|---|---|---|---|---|
| Ignite | 0–9 | `batReady`: club on the shoulder, chin up | marked | eye flare, slow 0.35, letterbox, dim | `rageIgnite` + a wood/metal knock |
| Strike *i* | 8 f each | dash (f0–2) to his side, `batWind` (f3–4: full wind-up over the shoulder) → `batHit` (f5) → `batFollow` (f6–7: the club wraps round) | locks bent round the club (`pendBend`, toward the swing), a big impact star stuck on him | hit-stop 2 f, shake 6, punch-in 3% | club impact + thump, pitch ladder |
| Finale | 0–9 | `batFinish`: club back on the shoulder | still | silence | — |
| Release | 10 | holds | one after another, **2 f apart**, the victims launch as thrown bodies (12 H/s away from the hero toward the nearest wall, spin 18 rad/s, `thrownBy` = hero): wall slams kill (≥ 4 H/s), and since the world resumes on this tick they **bowl over the bystanders** they cross | shake 12, speed lines on every body | a rapid string of cracks, then wall slams |

- **The sign** instead: no dashes. If the victims aren't all within 2.2 H, one dash to their centroid first. Wind (f0–6, the sign held back low), then one full 360° spin (f7–18, `root.r` 2π, the sign's smear arc all round): every victim within 2.2 H is struck as the sign passes (pending). Same release.
- Length: about **2.3 s** at n = 6 (the sign: about 1.6 s).

---

## 4. Team rage fatalities (M20)

### 4.1 The request (decided with the user)
- Hero A presses Tab with a full bar. If co-op, partner B is up (not downed), **B's bar is full too**, and A–B distance ≤ `rage.requestRange` = **3.0 H**: A's solo move does **not** fire. Instead a **request** opens (`world.rageRequest = { from: A, to: B, until: now + rage.requestTime }`, `requestTime` = **4 s**). Nothing is spent, there's no slow-mo, the fight goes on.
- B presses Tab within the window → **accept**: the team move starts, both bars go to 0.
- A presses Tab again while the request is open → it's **withdrawn** and A's solo move fires at once (nobody gets stuck waiting).
- Both press Tab within 0.1 s of each other (both full, in range) → accept at once.
- The window runs out → `expire`, nothing spent; press again any time.
- The request is withdrawn if A or B goes down, is grabbed by the boss, starts a traversal, or a cutscene locks input. Range is checked only when Tab is pressed.
- Partner's bar not full, or farther than 3 H: Tab fires the solo move straight away.
- **HUD**: over B, a big pulsing `TAB  TEAM RAGE` glyph (the E2 prompt style) with a ring that empties over the 4 s; over A a small waiting ring; both bars flash; a two-tone `rageRequest` call that repeats once a second while open. B's screen (the guest, if B is player 2) shows the same, from the replayed event and the snapshot.

### 4.2 Which team move
Both heroes hold at least one gun → **Back to back**. Otherwise → **Ping-pong rampage**.

### 4.3 Back to back: each dies as a barrel passes
Victim order: by angle around the meeting point M; cap 10, the farthest saved for the finale.

| Beat | Frames | Heroes | Victims | VFX / feel | Sound |
|---|---|---|---|---|---|
| Ignite | 0–9 | both `gunRaise` | marked | both eye slits flare on the same frame; f2: a white tether line snaps between them (fades over 10 f); slow 0.4, letterbox, dim | `rageAccept` (two stingers a fifth apart) + two slide racks |
| Gather | 0–11 | both dash (ink smear) to M = their midpoint, kept ≥ 0.8 H from walls and props, landing **back to back** (0.05 H apart, facing opposite, same depth), `b2bReady` (guns up by the head, outer elbow out; mirrored) | — | dust on landing | two dash whooshes, a shoulder-bump thud on f11 |
| Spin | 0–35 (1.2 s) | the pair turns 180° about M (each orbits M at 0.2 H, so they swap places; depth sorting swaps at 90°; bodies narrow side-on); each hero's guns sweep their own half | as a barrel passes a victim: shot, **dies at once** (head burst / decap, deaths alternate `drop` / `fling`) | hit-stop 1 f per kill, casings raining from both, muzzle light | the shots alternating, slap-back echo |
| Finale | 0–17 | they stop side by side, half toward the camera; if a victim is left, both aim at him and **fire on the same frame**: two crossing tracers | the last one's head bursts (stage 1: decap) | punch-in 8%, shake 10, white flash 1 f | both shots as one big report |
| Pose | — | `b2bFinish`: mirrored, guns raised by the shoulder, barrels up, smoke wisps; a small shoulder bump (both lean in 0.03 H) | — | slow out, letterbox out | `b2bClink` |

Every held gun refilled at the end. Length: about **2.5 s**.

### 4.4 Ping-pong rampage: strike all, then all drop
Built on M18's ping-pong and body bat, scripted so it always reads. Victims sorted by x; cap 8. Victim 0 (nearest the left hero) is **the ball**.

| Beat | Frames | Heroes | Victims | VFX / feel | Sound |
|---|---|---|---|---|---|
| Ignite | 0–9 | both `rageRoar`, mirrored | marked | eye flares, tether snap, slow 0.35, letterbox, dim | `rageAccept` |
| Positions | 0–8 | both dash to opposite ends of the group: left hero at (min x − 0.9 H), right hero at (max x + 0.9 H), clamped inside the walls, at the group's median depth, facing in | — | ink smears | two whooshes |
| Volley *k* | ~10 f each | the hero with the ball bats it (`upWind` → `upHit` for the first launch, then `hayWind` → `hayHit`) | the ball flies to the other hero on a scripted arc (0.22 s, y 0.6 → 1.1 → 0.6 H) **through the next victim**, who is struck on contact (pending `pendBend`, impact star stuck); the other hero bats it back through the next one, alternating from the outside in | hit-stop 1 f per contact, speed lines on the ball, shake 5 per bat | bat cracks, body thumps, pitch ladder |
| Finale | 0–12 | the last bat sends the ball straight up (apex 1.6 H); both leap at it from both sides and punch it **on the same frame** at the top (`sandwichHit`, mirrored, fists meeting through him) | — | white flash, hit-stop 3 f, punch-in 8% | a double impact |
| Release | 13 | both land in `fistBump`: facing each other, fists touching, a small white star at the fists | **all pending victims die at once** (decap / burst / fold by stage), the ball bursts (stage 2+) or loses his head and drops (stage 1). World resumes | shake 14, chromatic 8 px | `rageRelease` + a fist-bump tock |

Length: 0.30 + 0.27 + n × 0.32 + 0.45 s ≈ **3.6 s** at n = 8.

---

## 5. Animation production (the quality bar)

The user asked for clear, top-notch animation, so M19 starts with tooling and every clip goes through a checklist.

### 5.1 Pose editor upgrades first (revamp A11, `src/scenes/PoseEditorScene.ts`)
- **Onion skin**: the previous and next keys of the clip ghosted at 30%.
- **Timeline**: the clip's keys on a 30 fps strip, scrubbable, play at 0.25× and 1×, loop toggle.
- **Per-key easing** picker (the six `Ease` values).
- **Copy / paste / mirror** a pose (mirror swaps the front and back hands and feet).
- **Pair view**: author two actors together, hero + victim or hero + hero, with an adjustable x/z offset, so contact frames line up (a fist on a face, two backs touching, two fists meeting). The offset is saved with the clip as `pair: { clip, dx, dz }` (data only; the move scripts place actors with the same offset).
- **Preview with effects**: smears, impact stars and ink ghosts drawn in the editor's preview so timing is judged with the effects on.

### 5.2 New poses and clips
- M19: `rageCrouch`, `rageRoar`, `hayWind`, `hayHit`, `hammerWind`, `hammerHit`, `kneeWind`, `kneeHit`, `spinWind`, `backfistHit`, `rageFinish`, `pendLift`, `pendBend`, `pendFold`, `pendDouble`, `pendTwist`, `gunRaise`, `gunLand`, `iaiReady`, `iaiFollow`, `bladeFlick`, `batReady`, `batWind`, `batHit`, `batFollow`, `batFinish` (reusing `upWind` / `upHit`, `longWind` / `longSweep` for the sign).
- M20: `b2bReady`, `b2bFinish`, `sandwichHit`, `fistBump`.
- Clips assemble them with the frame counts above; dashes and ghosts are code (positions), not keys.

### 5.3 Checklist for every clip (in its lab at 0.25× and 1×, F1 on; a strip of key screenshots in the PR)
1. Every key reads as a silhouette: the hands alone tell the action (we have no arms).
2. **Anticipation**: 2–3 frames moving opposite to the strike before every hit.
3. **Contact**: the fist or blade touches the target on the contact frame (pair view), and that frame is held through the hit-stop.
4. **Follow-through**: 1 frame of overshoot (`back` ease), then a 2–3 frame settle.
5. **Overlap**: hands lead, the body follows a frame later, the head last (the A2 per-part delay).
6. **Arcs**: fists and blades travel on arcs (key the midpoint), never straight tweens across the body.
7. **Smears** on every fast motion (B1) and ink ghosts on every dash.
8. **Variety**: no two neighbouring victims take the same strike.
9. **Holds**: pending victims are perfectly still apart from the 1 px tremble.
10. **The face**: the hero's red eye slit stays visible on contact frames (not hidden behind a hand).
11. Keys on the 30 fps grid; the sim samples at 60 Hz.
12. It reads at the back of the room (scale 0.75) as well as at the front.

---

## 6. Sound list
Synthesized placeholders in `src/audio/synth.ts`, ids in `src/data/audio.ts`; recorded replacements logged in `assets/audio/LICENSES.md` (ask before downloading packs).
- M19: `rageGain` (pitched up by streak), `rageRepeat` (dull tick), `rageReady` (stinger), `rageReadyLoop` (low growl), `rageIgnite`, `rageDash`, `rageStrike` (pitch ladder), `rageTick` (blade pass), `rageShing` (cut release), `rageRelease` (composite crash), `rageFizzle`; mixer: duck + low-pass for the run, the silence beat, the un-duck.
- M20: `rageRequest` (two-tone call), `rageAccept`, `b2bClink`, `fistBump`.

## 7. Tests (headless, `tests/rage.test.ts`, `tests/rageTeam.test.ts`)
- One test per kill-type rule (the table in 1.1).
- Gain: gun, gun → +0.10, +0 · gun, fists, gun → +0.10, +0.15, +0 · gun, fists, thrown, gun → 0.10, 0.15, 0.20, 0.25 · a repeat resets the streak · `style` / `team` bonuses · a grenade killing 3 → the type gain + 2 × `multi` · kills by enemies, during a run, or of corpses give nothing · capped at 1 · a checkpoint restart restores the room-entry value · a new stage starts at 0.
- Activation: Tab with a full bar and 3 grunts → all 3 dead by the end, bar 0, the hero unharmed though an enemy was mid-telegraph (frozen) · no victims → fizzle, bar kept · `inputLocked` → nothing · bosses, the riot mini-boss, the target, the brute, the jetpack are never victims · 9 grunts → 6 victims, 3 bystanders stunned 0.4 s after · bystanders don't move during the run (positions equal before and after, up to the release tick) · a live grenade's fuse doesn't burn during the run · cooking when Tab is pressed lobs the grenade.
- Each move: victims struck in the documented order, pending until the release tick for Rampage / Cut line / Home run (all `kill` events on one tick, or 2 ticks apart for Home run), one kill per barrel pass for Spin shot; guns refilled after Spin shot; stage 1 Cut line kills are decaps with no blood events.
- Request (M20): near + both full → `rageRequest open`, nothing spent, no slow-mo · B's Tab within 4 s → the team move, both bars 0 · A's second Tab → withdraw + A's solo move · timeout → expire, nothing spent · 3.5 H apart → A's solo move · B not full → A's solo move · B downed during the request → withdrawn · both guns → Back to back; else Ping-pong rampage · 12 grunts → 10 victims (Back to back) / 8 (Ping-pong).
- Net: the puppet world replays `rage*` events; `ActorSnap.rage` and `Snapshot.rage` round-trip; the guest's Tab reaches the host.

## 8. Labs
M19: `rage-meter` (dummy grunts and a weapon rack to try every kill type; the lab bar lists the last types, gain and streak; `]` fills the bar), `rage-rampage`, `rage-spin-shot`, `rage-cut-line`, `rage-home-run` (6 grunts at mixed depths, `]` refills, slow-mo F2 works on top). M20: `rage-request`, `rage-back-to-back`, `rage-ping-pong` (the partner bot from M18 as player 2; `N` makes it answer the request). In `src/labs/rageLabs.ts`.

## 9. Later candidates (not planned)
- **Rage revive**: a solo rage move while your partner is downed ends with you pulling them up (1 life).
- More solo moves (a grenade one: juggling three cooked grenades into the crowd; a shotgun-specific one).
- Bosses: a rage move against a boss as a big chunk of damage instead of excluding them.
