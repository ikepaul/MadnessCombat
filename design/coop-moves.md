# Co-op moves (M18)

Status: **planned** (2026-10-27, with the user). Milestone **M18** in `PLAN.md`. The rage meter and the rage fatalities (solo and team) are in `design/rage.md` (M19, M20).

The episodes have one hero, so there is nothing to measure: every number here is **invented** and goes into `TUNING.coop` (`src/data/tuning.ts`) marked `// invented`, tunable in the F6 panel. As always we take mechanics only, never names or designs. The move names below are ours.

## 1. Research: what co-op brawlers do

The genre's team moves come in a few families (a quick scan; mechanics only, no game's names, moves or art are copied):
- **Grab, then the partner finishes.** One player grabs an enemy, a prompt calls the partner over, and the partner's input completes a team finisher ([Gotham Knights team attack](https://www.gamepur.com/guides/how-to-do-a-team-attack-in-gotham-knights)). Older brawlers let you hit a held enemy a few times before throwing him, and an enemy thrown into another enemy takes extra damage ([The Peace Keepers 2-player run notes](https://tasvideos.org/Forum/Posts/21641)).
- **Team attacks from a meter.** Filling one player's meter unlocks a team attack for both ([Spyborgs](https://www.destructoid.com/spyborgs-has-that-old-school-beat-em-up-feelin/)); some games share one meter and one pool of lives so the pair acts as one ([Invincible Tiger](https://co-optimus.com/review/272/page/1/invincible-tiger-co-op-review.html)); fighting games price team moves above solo supers ([Rival Schools](https://www.vgdb.co/games/rival-schools-united-by-fate)). That shaped the rage design (`design/rage.md`).
- **Bodies and partners as projectiles**: throwing enemies at each other, batting a thrown body on, throwing your partner as a missile, swinging your partner round. Common across the genre; our versions build on our own grab/throw/juggle code.

What we already have that co-op moves build on: grab assist and the throw (`tryGrab`, `startThrow`), the human shield (`shieldHit`), chains (`chainBonus`, `TUNING.combo`), juggles and wall bounces (`Flight.juggle`, `popOffWall`), catching (`snatch`, M17's auto-catch), the flying kick (`kickContact`), the split render (new in this milestone, reused by M19).

## 2. Rules for every co-op move

- **Co-op only.** They need two heroes in `world.players`; single player is unchanged.
- **Aim at your partner to target your partner.** Lifting (F) and passing (Q) only happen when the cursor is over your partner (their projected hurtbox + `TUNING.coop.aimSlack` = 0.3 H) and they're in reach. Otherwise F and Q do what they always do (grab assist never picks your partner). No accidental lifts mid-fight.
- **Never hurts the partner.** Bodies bounced, batted or swung into your partner don't damage or floor them. The thrown-weapon friendly-fire setting (`world.friendlyThrow`) is untouched and still only covers thrown weapons.
- **Team kills.** A kill made by a co-op move is a *team kill*: the `kill` event carries `team: true`, it heals the killer as usual, counts for the rage meter as the `team` type for **both** players (`design/rage.md`), and gets the fatality feel (kill-cam, pitched tick).
- **The world keeps running** (pillar 2 of `design/combos-and-fatalities.md`): no move takes longer than 0.8 s of locked animation, except the carry and the spin, which the players control and can leave at any time.
- **Stage 1 stays bloodless**: decaps and pops instead of tearing and bursts.
- **Teaching**: contextual key glyphs (the E2 prompt style in `src/ui/hud.ts`) appear when a move is available, see each move. A setting `coopHints` (default on) hides them.

## 3. The moves

Common tuning block (all invented):
```ts
coop: {
  // existing: reviveTime, reviveDrain, reviveRadius, reviveHp
  aimSlack: 0.3,
  held: { killHits: 3, reactTime: 0.25, tenderHits: 2 },
  pingPong: { reachX: 0.35, band: 0.3, restitution: 0.65, maxPings: 4, batSpeed: 6 },
  wishbone: { window: 0.5, brace: 0.2, pull: 0.25, recover: 0.3, halfSpeed: 2.2 },
  pass: { speed: 7, apex: 0.35, lead: 1, homing: 1.0 },
  bat: { speedScale: 1.5, minSpeed: 8, slack: 0.15, spinScale: 2 },
  double: { window: 0.25, toughBonus: 2 },
  toss: { lift: 0.25, carrySpeed: 0.6, speed: 9, vy: 3.0, maxFlight: 0.9, recover: 0.2, hitRadius: 0.4 },
  spin: { radius: 0.75, period: 1.2, walk: 0.6, maxTime: 4, fireCos: 0.38, sweepIn: 0.45, sweepOut: 1.1, sweepArc: 0.3, sweepSpeed: 5, release: 9 },
},
```

### 3.1 Hold & hit
**What**: P1 grabs a living grunt (F, as today). P2's punches, swings, shots and thrown weapons hit him **instead of** the human-shield rule. Every hit chains (3.2), the 3rd hit or any heavier blow kills him with a team kill. P1 can throw him whenever.

**Rules**
- Applies when the attacker is a player and the victim's holder (`o.grabbedBy`) is the *other* player. Enemies hitting a held grunt still go to `shieldHit`, unchanged.
- `hittable()` (`src/sim/combat.ts`) lets a player's fist reach a grunt held by their partner; `swingTargets()` (`src/sim/melee.ts`) and the hero's ray skip (`fire()` in `src/sim/guns.ts`: today only your *own* shield is skipped) follow.
- New `heldHit(world, by, o, kind, at, part)` in `combat.ts`, called from `applyHit` before `shieldHit`:
  - **light punch**: damage 1 + chain bonus; `o.heldHits++`; at `held.killHits` (3) he dies. He stays held: no stun state, no release, a hit reaction (`pose.react`, `held.reactTime`) and the impact frame.
  - **heavy, uppercut, any melee weapon (a knife stab included), a bullet, a thrown weapon**: he dies at once.
  - Death: a team kill. Decap (stage 1, and every heavy) / head burst (stage 2+ bullets). The holder keeps holding the corpse (it's a body to throw or a shield, as now).
  - `fatality` event, kind `held` (kill-cam).
- **Tenderised throw**: a held grunt who took `held.tenderHits` (2) hits and is then thrown dies on any impact (floor, wall, body), not only fast walls (`o.tender = true` read by `damageThrown` and `wallImpact`). A kill this way is a team kill too.
- Bosses never get grabbed (unchanged), so this never reaches them.

**Look**
- New **restrain** hold for every *live* grab (look change, check it in the lab): the victim faces **away** from the holder, toward the partner / the threat, arms pinned up (pose `restrained`: both hands up level with the head, body leaned back 0.12 rad, feet 0.04 H off the floor). The holder stands behind with both hands on his shoulders (pose `restrainHold`). Corpses are still carried by the collar (`carry`). This also improves the human shield: the shield now faces the guns, as in ep3 0:88.
- Each partner hit: the victim's hit reaction (A6 layer), impact star, and the holder's hands jolt 0.03 H (they feel it).

**Sound**: the punch layers as usual, plus a grunt-of-effort on the holder (voices bus) on the kill.

**Glyph**: P2 within 1.6 H of a grunt P1 holds, facing him: over the victim, `LMB/RMB HIT · F TEAR` (F = the wishbone, 3.4).

**Tests**: P2's two jabs and a third kill a held grunt, P1 still holds the corpse · P2's heavy kills at once · P2's pistol shot kills him (it used to be absorbed) · an enemy's shot still hits the shield rule · a held grunt hit twice and thrown dies on landing · `kill.team` is set.

### 3.2 Shared chains
**What**: hits by either player on the same enemy keep **one** chain (M10b left this for later). P1 launches, P2 juggles or spikes; P1 jabs, P2 crosses.

**Rules**
- `chainBonus()` (`combat.ts`): the chain continues if `c.by === by.id` **or** both `c.by` and `by` are players. `o.chain.by` becomes the latest hitter; `o.chain.team` = true once two different players are in it.
- Same 0.8 s window, same +1 from the 3rd hit and on a quick cross (`TUNING.combo`).
- Juggles: jabs, spikes and the head punt work for the partner on a grunt the other launched (they already check `flight.juggle`, not who launched; `juggle.by` is informative only). The punch "cancel" (`J.cancel`) applies to whoever hit.
- A kill that ends a team chain is a team kill.

**Look & sound**: a team chain hit draws a **double impact star** (two stars, 0.1 H apart, one white, one ink) and adds a high two-tone ping on top of the punch (ui bus, pitched up by chain count).

**Tests**: P1 light (1) + P2 heavy within 0.8 s (2 + 1 quick-cross bonus) kills a 4 hp grunt · P1 uppercut-launch + P2 jab keeps him up (`jabs` = 1) · chains from two players set `team`.

### 3.3 Ping-pong
**What**: a grunt knocked back (or thrown) into your partner bounces off them like off a wall and comes back airborne (a juggle starter). The partner can **bat** him back with a heavy, and then he dies on the next wall or partner.

**Rules**
- `Flight.by?: number` = who sent the body flying (set in `knockDown`, `startFlight`, `releaseThrow`). `Flight.pings?: number`, `Flight.lethal?: boolean`.
- In `stepFlight` (air phase), after the move: a living grunt in `knockback` (or a thrown body, living or dead) whose flight was sent by player A, meeting player B (`|Δx| <= pingPong.reachX`, `|Δz| <= pingPong.band`, height overlap like `thrownBodyHits`), B standing (`free`/`attack`/`stun`, on the ground or in the air), and moving toward B:
  - if `flight.lethal`: he dies (team kill, decap / burst), `fatality` kind `pingpong`;
  - else: bounce: `vx = -vx * pingPong.restitution`, `vz *= 0.3`, `vy = max(vy, TUNING.juggle.bounceUp)`, `juggle ??= { jabs: 0 }`, `pings++`, `by = B` (the same `popOffWall` path the wall bounce uses), B gets a `brace` reaction. At `maxPings` (4) he just drops.
- `thrownBodyHits`: a thrown body never hits a teammate of its thrower; it bounces (above) or flies past (dead bodies that can't bounce).
- **The bat**: a player's heavy or uppercut (or a melee swing) on a juggled grunt with `pings >= 1` doesn't spike him: it sends him flat along the hit at `pingPong.batSpeed` (6 H/s), `vy` 1.5, `lethal = true`, `thrownBy = batter` (so he knocks down whoever he crosses). Next wall: the wall kill (6 ≥ the 4 H/s kill speed); next partner: the lethal rule above.

**Look**: B's `brace` reaction (lean back 0.1 rad, hands up in front, 0.25 s), dust puff at the contact, the squash on the bounced body (as the wall bounce), speed lines on a lethal flight.
**Sound**: the low bump of the wall bounce plus a cloth thump; the bat: a crack (bat-on-body) + the whoosh.
**Glyph**: none (it happens in the flow of a fight).
**Tests**: P1's heavy sends a grunt into P2: P2 takes no damage and the grunt is juggled · P2's heavy then sends him to the wall and he dies there · a thrown corpse flies past P2 · four bounces max.

### 3.4 Wishbone
**What**: both players grab the same grunt from opposite sides and tear him apart.

**Rules**
- Triggers when a player presses F (grab assist) and the best target is a **living grunt held by their partner**, within the grab assist radius. (So: P1 grabs, P2 presses F on him any time while he's held, or both press F within `wishbone.window` = 0.5 s and the second resolves onto the first's grab.) Grab assist gives a partner-held grunt priority 0 for the partner.
- Both heroes enter a planted action `wishbone` (new `AttackKind`), the victim state `grabbed` by both (`grabbedBy` = P1, `Actor.grabbedBy2` = P2):
  - 0.00–0.20 s **brace**: both lean back, feet planted (poses `wishboneBrace`, mirrored by facing), the victim between them, hands on his sides.
  - 0.20–0.45 s **pull**: the heroes slide 0.15 H apart, the victim stretches (`root.sx` 1.0 → 1.25), shakes (±0.01 H, 30 Hz).
  - 0.45 s **snap**: he dies (team kill, `fatality` kind `wishbone`, credited to both: `kill.byId` = the one who pressed second, `kill.alsoId` = the other).
    - Stage 2+: **split render**: the corpse becomes two halves, left and right (`pose.cut`, below). Each half flies toward its hero at `wishbone.halfSpeed` (2.2 H/s) with a spin, settles and freezes (baked like any corpse, not raisable). Blood: two mists outward + a burst at the centre + a pool.
    - Stage 3 (extreme gore): the hands come off too; both heroes get blood stains (`pose.stain`).
    - Stage 1: the head pops straight up (decap, head item 2 H/s up, spinning), the body drops; no blood.
  - 0.45–0.75 s **recover**: both stumble back a step (poses `wishboneRecover`), then free.
- Either hero being hit during brace/pull cancels it: the victim stays held by the other.

**The split render** (new, reused by M19's blade rage): `Pose.cut?: { nx: number; ny: number; d: number; keep: 1 | -1 }` = a cut line in actor-local H (normal and offset); the character painter clips the whole drawing to one side (`ctx.clip()` with a big half-plane polygon) and draws a thin ink line + a red edge (stage 2+) along the cut. A second corpse actor gets the other side (`keep: -1`). Hurtboxes of halves are off (they're corpses).

**Look**: the brace/pull/recover poses, cloth-tear smear at the snap, a white flash frame, the kill-cam centred between the two.
**Sound**: rising strain (cloth stretch + effort voices on both), the snap (a wet tear on stage 2+, a pop + spring on stage 1), the halves' body falls.
**Glyph**: covered by 3.1's `F TEAR`.
**Tests**: P1 holds, P2's F → a kill 0.45 s later credited to both, two corpses on stage 2, one headless body + a head on stage 1 · hitting P2 during the pull cancels it, P1 still holds.

### 3.5 Weapon pass
**What**: Q with the cursor on your partner throws a soft pass; it's caught automatically into a free hand, guns keep their ammo.

**Rules**
- `cmd.throwGun` (Q) while the cursor is over the partner (rule 2) and they're within 6 H: instead of `throwGun` / `tossHeld`, `passItem(world, a, i, partner)`:
  - the front-most item (same pick as Q today: front hand, else the back hand's gun);
  - a lob to the partner's hand point (`pos + (facing*0.25, 0.6, 0)`) at their depth, leading their velocity by the flight time (`pass.lead`), apex `pass.apex` (0.35 H) above the straight line, horizontal speed `pass.speed` (7 H/s), homing up to `pass.homing` (1 H/s²) over the last half;
  - `Item.passTo = partner.id`: `thrownHits` skips it (it flies over enemies, no damage), and M17's auto-catch takes it into a free hand. No free hand: it lands at their feet (E-swap from there).
- Melee weapons, guns (any ammo), the two-handed sign (both hands needed to catch it: else feet). Not grenades, heads or bodies.

**Look**: an underhand toss pose (`passToss`, 0.2 s), a soft white arc trail behind the item (2 frames of ghost), the catch slap.
**Sound**: a soft whoosh (quieter than a throw) + the catch slap.
**Glyph**: cursor on the partner within range with an item: `Q PASS` over the partner.
**Tests**: a pistol with 5 rounds passed to a partner with a free hand arrives in their hand with 5 rounds · an enemy on the path isn't hit · a partner with both hands full gets it at their feet.

### 3.6 Body bat
**What**: a heavy punch or a melee swing at a body your partner threw sends it on toward your cursor at 1.5× speed. A fast wall hit kills, and it floors everyone on its path.

**Rules**
- In `connect()` (punches) and the swing step (melee), before the normal target search: `batTarget(world, a, fist)` = an actor with `flight.thrownBy` = the partner, in the air, within the fist circle (+ `bat.slack` 0.15 H) and the hero's depth band. Heavy, uppercut or any swing; a light jab doesn't bat (it would ping-pong instead).
- New flight: speed `max(bat.minSpeed, |v| * bat.speedScale)` toward the batter's cursor floor point (`unprojectFloor`), `vy` 1.5, `thrownBy = batter`, `hit = []`, `spin *= bat.spinScale`, `Flight.pierce = true` (it doesn't slow down after hitting someone: `thrownBodyHits` skips its `vx *= -0.25`). A living body takes 1 damage on the bat.
- Wall: ≥ 4 H/s, so it kills (a team kill). Everyone it crosses is knocked down (`body` hit, as thrown bodies already do).
- Batting priority over ping-pong: if the batter's active frames overlap the body before contact, it's a bat; otherwise the contact bounces it (3.3).

**Look**: big impact star + an ink-negative frame on the body (2 frames), speed lines (B7) on its flight, the batter's follow-through.
**Sound**: a crack (bat-on-body) + a long whoosh; the wall slam as usual.
**Tests**: P1 throws a grunt at P2, P2's heavy sends him to the wall at ≥ 8 H/s and he dies · a light jab doesn't bat · a batted body floors two grunts on its path.

### 3.7 Double-team
**What**: both players hit the same enemy within 0.25 s (any mix of punches, swings, shots, thrown weapons): instant kill with a decap / head burst and a kill-cam.

**Rules**
- `Actor.lastHeroHit?: { by: number; t: number }` on the target, set in `applyHit` for every hit by a player that does damage (or would: a juggle jab counts).
- In `applyHit`, before damage: if `by` is a player, `lastHeroHit.by` is the other player and `world.time - lastHeroHit.t <= double.window` → `damage = o.hp` (a kill), forced decap (stage 1) / head burst (2+), `fatality` kind `double`, team kill.
- Tough ones (bodyguards, the riot mini-boss, the vending brute, zombies): bodyguards and zombies die (zombies lose the head *and* die); the riot mini-boss and the brute take `double.toughBonus` (+2) instead. Bosses (`bossHit`) aren't affected.
- Not on held grunts (3.1 has its own rule) or bodies in a wishbone.

**Look**: two impact stars at once, a white flash on the victim, the kill-cam centred on him.
**Sound**: both hits + a bright "ting" stinger.
**Tests**: P1's shot and P2's punch 0.2 s apart kill a 4 hp grunt · 0.3 s apart they don't (1 + 2 = 3 damage) · the riot mini-boss takes +2.

### 3.8 Hero toss
**What**: F with the cursor on your partner lifts them overhead; F or LMB throws them toward the cursor as a flying-kick missile that floors everyone on its path. They land on their feet with i-frames.

**Rules**
- **Lift**: F, cursor on the partner (rule 2), partner within the grab assist radius, both of you on the ground and not knocked about (`free` or `attack`). The carrier needs both hands empty (`!a.hands[0] && !a.hands[1]`, the sign counts as full); the partner can hold anything. The partner's current action is cancelled.
  - The partner enters `grabbed` with `grabbedBy` = carrier (heroes were never grabbable before; the exception is only for a player lifting their partner). New `Actor.carried = 'overhead' | 'spin'`.
  - 0.25 s lift (`toss.lift`): carrier pose `liftUp` (squat, then press up), partner rises to lie flat on the carrier's raised hands (pose `carriedFlat`, root r ±π/2, at `y + 1.05 H`).
  - Carrying: the carrier walks at `toss.carrySpeed` (0.6×), can't jump, punch or shoot (both hands busy). The carried partner is **invulnerable** (`invulnerable` while carried: bullets pass, nothing grabs them) and can: **Space** = hop off (lands on their feet beside the carrier, 0.2 s recovery), **F** = start the spin (3.9). Their movement keys do nothing; aim shows.
- **Throw**: the carrier's F or LMB: `startThrow`-like wind-up (0.17 s, pose `tossWind`: the partner tips back over the head), then the partner flies toward the cursor floor point: horizontal `toss.speed` (9 H/s), `vy` `toss.vy` (3.0), in the flying-kick pose (`b.kick = true`), with `b.tossKick = true`:
  - multi-hit: every enemy the foot (or the body, `toss.hitRadius` 0.4 H) touches takes a `heavy` hit from the **tossed** hero (knockdown, kills at 0 hp; a team kill if it kills), no bounce-back (unlike the normal flying kick, which stops at the first);
  - i-frames for the whole flight;
  - walls: kicks off it (vx reversed × 0.3) and drops;
  - lands on the feet after at most `toss.maxFlight` (0.9 s): landing squash + dust ring, `toss.recover` (0.2 s), then free.
- Ends early: the carrier is hit (`releaseHeld` → the partner drops on their feet, not knocked down), a room exit / traversal / cutscene lock (dropped on feet first), the carrier goes down.
- Grunt AI (`src/sim/ai.ts`) skips a carried or swung partner when picking a target, aiming or handing out attack tokens (they're invulnerable), so enemies turn on the carrier.

**Look**: `liftUp`, `carryOverhead` (carrier walk with hands up, a heavier bob 0.03 H), `carriedFlat` (the partner lying on the hands, one knee up, arms folded: relaxed), `tossWind`, the kick pose in flight with speed lines and ink ghosts (3 afterimages), a dust ring on landing.
**Sound**: effort voice on the lift, cloth; the throw whoosh (bigger), kick impacts as the flying kick; landing thud.
**Glyph**: cursor on the partner within reach, carrier hands empty: `F LIFT` over the partner. Carried: `F SPIN · SPACE HOP OFF` over yourself. Carrying: `F THROW` near the carrier's cursor.
**Tests**: F with the cursor on the partner lifts them; F with the cursor elsewhere grabs the nearest grunt instead · the tossed partner floors three grunts in a row and takes no damage in flight · Space hops off · hitting the carrier drops the partner on their feet · a carrier holding a gun can't lift.

### 3.9 Carry-spin (the user's idea)
**What** (decided with the user): the carried partner presses F; the carrier switches grip to their **ankles, one hand on each**, and swings them **round himself on the floor plane** like a hammer throw. The spinning partner aims and shoots normally, but **only out to the side they're on**. Without a gun, the swung partner's body floors whoever it passes. The carrier's F throws them out along the swing; the partner's Space hops off; it ends by itself after 4 s.

**Rules**
- Start: carried partner (`carried = 'overhead'`) presses F → `carried = 'spin'`, `Actor.spin = { angle, t }` on the carrier. Start angle = the side the partner was over (left/right of the carrier on screen).
- **Orbit**: the partner's position = carrier + `R (cos θ, 0.15, sin θ)` (x, y, z), `R` = `spin.radius` (0.75 H), `θ` advancing at `2π / spin.period` (1.2 s per turn), counter-clockwise from above: left side → front (toward the camera) → right side → back. Near walls / the floor edges the radius shrinks on that axis (clamped so the partner stays inside the room bounds, never through props: `moveWithCollision` on the orbit point, shortening `R` for that tick).
- **The carrier**: walks at `spin.walk` (0.6×) with WASD; can't do anything else; faces the partner (facing follows `sign(cos θ)`); pose `giantSwing` (leaning back away from the partner, both hands together out low toward the ankles, feet shuffling: walk phase driven by θ).
- **The partner's body**: horizontal, feet at the carrier's hands, head out (`swungFly` pose: body straight, hands forward past the head, Superman-style). On screen the root rotation points the body along the projected radius; at the front/back of the orbit it's foreshortened (`root.sx = max(0.35, |cos θ|)`), and drawn depth-sorted by its own z (in front of the carrier on the front half, behind on the back half).
- **Shooting (armed partner)**: the partner's `side` = `sign(cos θ)` (screen left/right of the carrier). They may fire only while `|cos θ| > spin.fireCos` (0.38: the outer ~2/3 of each side; the front/back passes are transit) **and** the cursor is on that side of the partner (`(cursorX - partnerScreenX) * side > 0`). Aim inside that half works exactly like normal aim (free aim, both hands, auto fire, split aim off). Cursor on the wrong side: the guns point straight out along the side (horizontal) and the triggers do nothing (dry, no click sound). Aim rig: the prone rig path with the swung root and an arc of `[-1.4, 1.4]` rad around "outward" (new `SPIN_ARC` in `src/anim/aim.ts`). No reloads while spinning.
- **Unarmed partner** (no gun in either hand): the outer end of the body (head and fists, since the carrier holds the ankles) floors enemies: any living enemy whose (x, z) distance from the carrier is within `[spin.sweepIn, spin.sweepOut]` (0.45–1.1 H) and whose angle is within `spin.sweepArc` (0.3 rad) of θ takes a `heavy` hit from the partner and a flight along the tangent at `spin.sweepSpeed` (5 H/s) with `thrownBy` = partner (so it kills on a wall, ≥ 4 H/s). Once per enemy per turn (`spin.hits`, reset every 2π).
- **Ending**:
  - the carrier's F: release along the tangent: the partner becomes a hero toss missile (3.8) with speed `spin.release` (9 H/s) along the swing direction at θ (not the cursor);
  - the partner's Space: dropped at the orbit point on their feet (0.2 s recovery);
  - `spin.maxTime` (4 s): set down gently (as Space);
  - the carrier hit / an exit / a cutscene: as 3.8 (dropped on their feet).
- The swung partner stays **invulnerable** (as carried). The carrier isn't.

**Look**: the carrier's `giantSwing` loop (the body counter-leans, the feet step round, a dust ring that grows each turn), the partner's `swungFly` with ink ghosts (2 afterimages along the arc), muzzle flashes outward, a motion-blur arc on the floor (a faint white ellipse at radius R).
**Sound**: a rising whoosh loop tied to θ (pitch up with speed, doppler-ish pan following the partner's screen x), effort voice on the carrier, the guns as usual, sweep impacts.
**Glyph**: carried: `F SPIN`; spinning: over the carrier, `F THROW`; over the partner, `SPACE OFF`.
**Tests**: a carried partner's F starts the orbit; after 0.3 s they're on the front half · with a pistol and the cursor on their side a shot fires; with the cursor on the other side nothing fires · unarmed, a grunt in the circle is knocked down once per turn and dies against a wall · the carrier's F sends the partner along the tangent of the swing at that moment (asserted at θ = 0 and θ = π/2) · 4 s → set down · invulnerable while swung (an enemy shot passes).

## 4. Shared tech this milestone adds
- `isPartner(world, a, o)`: both players, different.
- `partnerUnderCursor(world, a, aim)`: rule 2.
- `Flight.by`, `pings`, `lethal`, `pierce`; `Actor.heldHits`, `tender`, `lastHeroHit`, `grabbedBy2`, `carried`, `spin`; `Item.passTo`; `Pose.cut`.
- `kill` event: `team?: boolean`, `alsoId?: number`. `fatality` kinds: `held`, `wishbone`, `double`, `pingpong`. New event `coopMove: At & { kind: 'held' | 'chain' | 'pingpong' | 'wishbone' | 'pass' | 'bat' | 'double' | 'lift' | 'toss' | 'spin'; phase: 'start' | 'hit' | 'end'; byId: number; partnerId: number; targetId?: number }` (feel, audio, HUD hints listen to it).
- **Partner bot** (`src/dev/partnerBot.ts`): a brain for player 2 used by `?coop=bot` (a dev route: P2 is an AI partner in any stage, so one person can playtest co-op) and the `coop-*` labs. It follows P1 at 1.2–1.8 H, fights the nearest grunt with punches, hits grunts P1 holds, catches passes, and in labs does the lab's move on the `N` key (shown in the lab bar).
- **Co-op net**: everything runs on the host as usual. `ActorSnap` gains `grabbedBy` (the guest's glyphs need it) and `carried`; the swing angle rides in the pose (`pose.root`, plus `pose.spinAngle` for the floor arc). Replayed events drive VFX/audio. The guest's new input fields go through `link.sendInput` unchanged.
- **Settings**: `coopHints` (on/off) in Settings → Gameplay; the Controls page gets a "Co-op moves" list (one line each).

## 5. Look & sound checklist
- Poses (pose editor, A2 rules: anticipation, overshoot, overlap; 30 fps keys): `restrainHold`, `restrained`, `wishboneBrace`, `wishbonePull`, `wishboneRecover`, `passToss`, `brace`, `liftUp` (3 keys), `carryOverhead` (walk loop, 2 keys), `carriedFlat`, `hopOff`, `tossWind`, `giantSwing` (loop, 4 keys), `swungFly`. Clips for each.
- VFX: double impact star, brace dust, split render + cut edge, cloth-tear smear, white flash frames, speed lines and ink ghosts for flying bodies/partners, the spin's floor arc, the toss landing dust ring.
- SFX (synth placeholders in `src/audio/synth.ts`, ids in `src/data/audio.ts`): team ping, bump + cloth thump, bat crack, strain loop, tear (stage 2+) / pop + spring (stage 1), soft pass whoosh, double ting, lift effort, big toss whoosh, swing whoosh loop (pitch + pan by θ).
- HUD: the co-op glyphs above; nothing else (no extra bars).

## 6. Labs
`coop-hold-hit`, `coop-chain`, `coop-ping-pong`, `coop-wishbone`, `coop-pass`, `coop-bat`, `coop-double`, `coop-toss`, `coop-spin` (`src/labs/coopLabs.ts`), each with the partner bot as P2 (N = the bot's half of the move) and the lab bar showing the move's state (held hits, pings, θ, ...).
