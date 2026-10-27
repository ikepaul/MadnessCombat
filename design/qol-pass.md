# Quality-of-life pass (M17)

Status: **built** (2026-10-28, branch `m17-qol`; see the M17 "Done" note in `PLAN.md` for the deviations below). Planned 2026-10-27 with the user. Milestone **M17** in `PLAN.md`. Every number here is invented unless it names a source, and goes into `src/data/` marked `// invented` so the F6 tuning panel can change it.

Decided with the user (questionnaire, 2026-10-27):

| Topic | Decision |
|---|---|
| Auto pickup with one hand full | **Loaded guns only** fill the empty hand when you walk over them. |
| Choosing the hand E swaps | **Smart swap + hold E and click**: tap E swaps the worse hand; hold E and click LMB / RMB picks the hand. |
| Punching at other depths | **Snap + wider band + cue**: a punch slides you toward its target in depth, the hero's band grows, enemies on your depth line get a ring. |
| Catching | **Auto-catch friendly throws, F for enemy throws**, the F window widened to 0.25 s. |
| Extra fixes (from reading the code) | All four: bullets hit the cursor, a grenade landing marker, throws find depth, F grabs with any free hand. |

Plus the cover bug the user reported, found and measured headless (section 5).

What was checked before planning (headless probes, deleted afterwards):
- **Catching with one hand full already works** (pistol, rifle and knife in the front hand: an enemy knife was caught into the back hand). The hard part is the 0.15 s F timing, so item 4 widens it and makes friendly throws automatic.
- **Walking over a weapon with one hand full does nothing** (`pickUp` only auto-picks with both hands empty, `src/sim/guns.ts`).
- **The E prompt hides when both hands are full**, although E would swap the front hand (`promptTarget` in `src/ui/hud.ts` returns early). It also never shows the stuck-blade pull that `pickUp` does first. Two code paths disagree.
- **Shooting from behind your own cover is blocked.** A hero standing behind a table (z 10.3) firing at a grunt at the same depth past the table: the shot stops on the table (`castRay`: the prop is "in front of the target in depth", z0 9.25 < 10.3, and crossed first on screen). The bullet never comes near the table in the world.
- **Bullets land 16–20 px off the cursor.** The ray leaves the muzzle parallel to the shoulder→cursor line (`fire()` uses `rig.angle`), and the muzzle sits 0.078 H off that line. Measured: 20.1 px at the front of the room at 386 px and at 845 px distance, 16.2 px at the back.

---

## 1. Auto pickup into the empty hand (loaded guns only)

**Rule.** A player in `free` state, not holding a body or item (`a.holding`), not carrying the boombox, not cooking, with **exactly one empty hand**, walking over a floor gun within the walk-over reach (`GUNS.pickupRange * 0.6`, unchanged) picks it up into the empty hand if:
- it's a gun (`isWeapon`) with `ammo > 0 || spare > 0`;
- the other hand doesn't hold a two-handed melee weapon (the street sign);
- it isn't a gun this player threw in the last `QOL.ownThrowIgnore` = 1.0 s (`it.thrownAt`, `thrownBy` is kept on the item after it lands, see below).

With **both hands empty** the old rule stays (anything walked over is picked up), with one change: **empty guns are skipped** (ammo 0 and spare 0). E still takes them. This ends the "throw the empty gun, walk on, holding it again" loop. (Same filter, same reasoning as the user's "loaded guns only".)

Consequences, accepted:
- Holding a long gun alone in the front hand, a loaded pistol walked over fills the back hand: you now dual-wield long + pistol (the existing `GUNS.dualLongSpread` applies).
- Filling the last free hand means F can't grab until a hand is free again (Q or an empty-gun throw frees it). With item 9 (F grabs with any hand) this only bites when both hands hold guns.

**Code.** `src/sim/guns.ts`:
- `pickUp(world, a, pressed, cmd)`: the walk-over branch now runs when `!a.hands[0] || !a.hands[1]` for players; the candidate filter takes a `walkOver: boolean` and applies the rules above. Pressed E keeps today's behaviour, routed through the new `pickupPlan()` (item 2).
- `stepItems` clears `thrownBy` when a thrown item lands; keep that (the thrown-weapon hit code relies on it) and record `Item.ownedBy?: number` + `ownedAt?: number` (the thrower and the throw time) on landing instead, for the 1 s ignore rule.
- Event: `pickup` gets `auto: boolean` (audio: the walk-over pickup plays the softer cloth+clack variant).

Tests (`tests/qol.test.ts`): one hand full + walk over a loaded SMG → both hands full · walk over an empty pistol with one hand full → nothing · both hands empty + walk over an empty pistol → nothing; E takes it · your own just-thrown gun isn't re-taken within 1 s · holding the sign, nothing is auto-picked.

## 2. The E prompt and the swap

### 2a. One source of truth
New `pickupPlan(world, a): PickupPlan | undefined` in `src/sim/guns.ts`, used by **both** `pickUp` (sim) and `InkHud.promptTarget` (HUD), so the prompt always shows what E would do.

```ts
interface PickupPlan {
  verb: 'take' | 'swap' | 'pull' | 'pocket';   // pocket = a grenade into the pocket
  item: Item;
  /** Hand the item goes into; 'both' = two-handed (drops both). For 'swap', the smart choice. */
  hand: 0 | 1 | 'both';
  /** What leaves the hand (swap), for the prompt's "replaces" icon. */
  replaces?: Hand[];
}
```
Order (same as `pickUp` today): exits and takedowns stay in the HUD before it (unchanged) → a pullable stuck blade / the planted sign (`pullable`) → the nearest floor item within `GUNS.pickupRange` (distance with z × 1.5, unchanged).

### 2b. Smart swap (tap E, both hands full)
Score each hand, swap the **lowest**; ties go to the front hand (hand 0):

| Hand holds | Score |
|---|---|
| a gun with ammo 0 and spare 0 | 0 |
| a gun | `(ammo + spare * mag) / (2 * mag)` (0..1) |
| a one-handed melee weapon | `QOL.meleeSwapScore` = 0.6 |

Two-handed items (the sign, or picking one up) always take `'both'`. A long gun held alone in hand 0 with hand 1 empty isn't "both hands full" (hand 1 is free), so it's a `take` into hand 1, as today.

### 2c. Hold E and click (pick the hand)
- `PlayerCommand.useHeld?: boolean` (E is down), added in `src/input/playerInput.ts` and passed through `src/net/link.ts` unchanged (the guest sends whole commands).
- When `pickupPlan` gives a `swap`, **E acts on release, not press**: release without a click → smart swap. While E is held, an LMB press swaps hand 0 and an RMB press swaps hand 1 at once; that click is consumed (no shot, no punch: `stepActor` drops `press`/`attack` for that tick). The release that follows does nothing.
- With a free hand (`take`), E still acts on press: no delay where no choice exists.
- `Actor.useHeldAt?: number` (world time E went down) so the HUD can tell a hold from a tap: after `QOL.holdShow` = 0.18 s held, the prompt switches to the chooser.

### 2d. The prompt (E2 glyph, extended), `src/ui/hud.ts`
- **Take**: `[E]` glyph · weapon icon (the existing `iconKey` textures, scale 0.5) · name in Anton (`WEAPONS[id].name` / `MELEE[id].name`) · a mouse icon with the target hand lit (`mouseIcon`, already in hud.ts) · an ammo note: `EMPTY` (grey `#9a9ba0`) or the round count for guns.
- **Swap**: same, plus `→` and the outgoing weapon's icon at 50% alpha with a thin ink strike line.
- **Chooser** (E held ≥ 0.18 s): two rows, `LMB` + the front hand's icon and `RMB` + the back hand's icon, the smart pick drawn brighter; releasing still takes the smart pick.
- **Pull**: `[E] PULL` + the blade icon (shows for stuck knives/axes and the planted sign, which the prompt never showed).
- **Pocket**: `[E] GRENADE +1`.
- The prompt anchors over the item as now (`project(item) + 0.45 H`), pops in on target change (existing 0.18 s pop).

### 2e. The item itself
`src/render/canvas/itemPainter.ts`: the item `pickupPlan` points at (local player only; the co-op guest computes it from its puppet world, it's a pure function of state) gets a **white ink outline** (2 px at 1080p, `rgba(255,255,255,0.9)`) and a slow glint (a 1-frame white star every 1.2 s). Ink and white only (art direction).

Tests: the HUD's target equals the sim's choice in 6 setups (free hand, both full with an empty gun, both full with two loaded guns of different fill, holding the sign, stuck knife nearby, grenade on the floor) · hold E + RMB swaps hand 1 and doesn't fire · tap E swaps the empty gun first · the click that picks a hand doesn't punch.

## 3. Punching at other depths

Depth is hard to read in this camera (`depthFactor` 0.6, a 2.7 H deep floor seen almost edge-on). Three parts, **heroes only** (enemy AI already lines up exactly; their numbers stay):

### 3a. Wider band
`TUNING.melee.hero.depthBand` = **0.3** (enemies keep `melee.depthBand` 0.2). Used by `hittable()`, `downedTarget()` (finisher), `swingTargets()` (melee weapons: `def.depthBand + 0.1` for heroes), `sweepTarget`, `kickContact`. One helper: `meleeBand(a, base)`.

### 3b. Depth snap
When a hero starts a punch, uppercut, finisher, melee swing/thrust or a sweep:
1. Pick the **snap target**: the living, hittable enemy that (in order) is under the cursor (cursor inside its projected hurtbox, `rayVsActor` with a zero-length test or a point-in test), else is the nearest ahead of the hero within `reach + QOL.snapAhead` (0.3 H) in x, with `|Δz| <= QOL.snapBand` = **0.5 H**. Bodies on the floor count for the finisher.
2. Store `attack.snapZ = target.pos.z` (and `attack.snapId`).
3. (As built: an enemy already on your depth line wins over a nearer one off it, and the slide stops `QOL.snapNear` = 0.1 H short of his depth.) During the startup frames, move the hero's z toward `snapZ` at up to `QOL.snapSpeed` = **3.0 H/s**, total at most `QOL.snapMax` = **0.3 H** per attack, through `moveWithCollision` (props stop it). x isn't touched (facing still follows the cursor).
4. In the air: the same, with the snap applied to `pos.z` alongside the air steer.

Why: 0.3 H in a 4-frame startup (0.133 s) needs 2.25 H/s, so 3.0 always gets there; a target 0.5 H away in depth ends inside the 0.3 band after the 0.3 snap.

### 3c. The depth cue
`src/render/canvas/characterPainter.ts`, in the contact shadow pass:
- Every living enemy with `|Δz| <= melee.hero.depthBand` from the **local** hero and `|Δx| <= 2.5 H` gets a thin light ring on its shadow ellipse: `rgba(255,255,255,0.35)`, 1.5 px at 1080p, same ellipse as the shadow.
- The current snap target (what LMB would snap to right now: the same `snapTarget()` exported from `src/sim/combat.ts`; `GameScene` calls it once a frame with the local player's cursor and passes the ring set to the painter's options) gets the ring at 0.7 alpha and 2.5 px.
- Off when the local hero holds a gun in both hands (no melee to aim) and in cutscenes (`world.inputLocked`).

Tests: a grunt 0.45 H deeper and 0.5 H ahead is hit by a light punch (it misses today) · the snap moves the hero ≤ 0.3 H in z · a grunt 0.6 H deeper isn't snapped to · enemies still need 0.2 H to hit the hero (a grunt at 0.25 H misses) · the balance bot (`tests/balance.test.ts`) with 0.35 s reactions still loses wave A.

## 4. Catching

- `THROWN.catchWindow` 0.15 → **0.25 s** (`src/data/melee.ts`; the existing "earlier does not" catch test in `tests/throwing.test.ts` presses 0.3 s early, so it still holds; keep its early press ≥ 0.3 s).
- **Auto-catch** (no F) with a free hand, for "friendly" flying weapons only:
  - popped-up disarms (`it.popUntil > world.time`, M10b);
  - your own weapon after it bounced off something (`Item.bounced = true`, set in `stepItems` where a thrown item reverses off a wall and in `thrownHits` where it bounces off a body; never in its first flight). **Not an empty gun** (ammo 0, spare 0): you threw it away on purpose, and auto pickup skips empties too (item 1). Melee weapons and loaded guns only;
  - partner passes (`Item.passTo === a.id`, added in M18; this milestone adds the field and the rule).
  Enemy throws (`thrownBy` is an enemy) still need F.
- Same conditions as `canCatch` minus the F timing: alive, `free`/`attack`, a free hand, not holding a body, not holding the sign; within `THROWN.catchReach` of the hand point (unchanged).
- `snatch()` in `src/sim/items.ts` checks `autoCatch(world, o, it) || canCatch(world, o)`.

Tests: a popped weapon falls into a free hand without F · your *loaded* gun rebounding off the wall is caught without F; an empty one isn't · an enemy knife still hits without F, and is caught with F 0.22 s before it arrives. Existing tests: "a gun thrown at the wall bounces back and can be caught with F" and "without F it flies past you" (`tests/throwing.test.ts`) throw an **empty** pistol, so both keep passing; add a loaded-pistol variant for the auto-catch.

## 5. Cover: shooting from behind your own cover (the reported bug)

**Today** (`castRay`, `src/sim/hitscan.ts`): after the screen ray picks the first hurtbox, a prop blocks if it's in front of the **target** in depth and the ray crosses its screen outline first. That's wrong whenever the prop is also in front of the **shooter**: the bullet, flying from a muzzle behind the table to a target behind the table, never passes the table.

**As built (2026-10-28): three rules** (`coverBetween` in `src/sim/hitscan.ts`): (1) a prop right in front of the shooter (≤ `OWN_COVER` 0.7 H behind its back face) and under his muzzle is his own cover and never blocks his shots; (2) a prop in front of the target that hides the hit point on screen blocks (you can't hit what you can't see; a pure 3D test let bullets curl round a table that visibly hides the target); (3) otherwise the bullet's 3D path (below) decides. **Planned: a 3D segment test.** "If it looks like a hit, it's a hit" still picks the target in screen space; the cover check then asks whether the bullet's path in the world crosses the prop:
1. `muzzleW` = the muzzle's world point: `unprojectAt(muzzle, shooterZ)`. `castRay` gets an optional `muzzle?: ScreenPoint` (`fire()` passes `rig.muzzle`: its `from` is moved back along the barrel for point-blank shots, which mustn't be the segment's start); without it (AI line-of-fire checks) `from` is used. The muzzle is drawn at the shooter's depth, so this is exact.
2. `hitW` = the hit point on the target: `unprojectAt(hit.point, target.pos.z)`.
3. For each prop (except the cannon, as now): slab-test the segment `muzzleW → hitW` against the prop's box (`x0..x1`, `0..top`, `z0..z1`; the pole as its shaft box; a tipped table uses its upright box after landing). The first intersection along the segment blocks; its entry point is the impact (decal, sparks, `surface: 'prop'`).
4. The shot-out-of-hand check (`gun`) uses the same test to the weapon's point.
5. Misses are unchanged (the ray at the shooter's depth to a wall/floor/prop).

Consequences: from behind a table you can shoot anyone at your depth or behind you, and over the table at anyone in front whose hurtbox the bullet reaches above the table top. Enemies behind cover keep their cover against a hero in front (the segment dips into the box). Enemy shots follow the same rule, so a hero crouched behind a table is still covered from the front.

Debug: F1 draws the last 8 shots' world segments projected to the screen (thin cyan, 0.5 s), each prop's box as a wireframe and an X at blocked points (`UIScene.drawHurtboxes` gets a `drawCover` pass). Lab `qol-cover`: a table in the middle, the hero and grunts at four positions (in front, behind, same depth across, deeper across), number keys move the hero between them.

Tests (`tests/guns.test.ts`, the existing cover test keeps passing): hero behind the table hits a grunt at the same depth across it · a grunt hiding behind the table is covered from a hero in front (chest shot blocked) · his head above the table top is hit · a grunt in front of the table is hit by a hero behind it.

## 6. Bullets hit the cursor

- `aimRig()` (`src/anim/aim.ts`) gets a muzzle correction: after placing the gun, compute the angle error `δ` between the barrel and the muzzle→target line, rotate the aim by `δ`, recompute (4 iterations as built: 2 left up to 3 px; the muzzle offset is ≤ 0.08 H against a target ≥ 0.3 H away, so it converges to < 0.1 px). The painter and the sim keep sharing the rig, so the drawn barrel, the tracer and the hit all line up with the cursor.
- Guard: when the cursor is within `QOL.aimMinDist` = 0.3 H (screen-scaled) of the muzzle, or behind it, skip the correction (today's angle).
- Spread stays (pistol ±1°, `WEAPONS[].spread`).
- Enemies use the same rig, so their shots lose the same 16–20 px bias; their `TUNING.ai.ranged.aimError` (±0.3 H) dominates anyway. Check the balance bot and the stage bots still pass; note any change in the PR.

Tests: with spread stubbed to 0 (a test weapon), the ray passes within 1 px of the cursor at 3 distances and both depths · the muzzle flash point equals the painter's muzzle (existing assumption, now asserted).

## 7. Grenade landing marker

- Extract `lobTarget(world, a, aim): { x, z }` from `lobGrenade()` in `src/sim/melee.ts` (the clamping to `GRENADE.playerRange` / `maxRange` and the room bounds). `lobGrenade` and the marker both call it.
- While the local hero cooks (`a.cook !== undefined`), winds up a lob, or holds a live grenade (`a.holding` is a live grenade item), draw on the floor at `lobTarget`:
  - a target ring: ink ellipse 0.25 H radius (projected), white inner stroke;
  - the blast radius `GRENADE.radius` (2 H) as a faint white ellipse outline at 20% alpha, so you see who's in it;
  - a white arc around the target ring sweeping down with the fuse left (`fuse / GRENADE.fuse`), blinking at 6 Hz in the last 0.5 s.
- Drawn in the actor layer at floor level (sorted with depth like a decal), co-op: each player sees only their own marker.

Tests: `lobTarget` equals where the grenade lands (±0.05 H) for 4 cursor points incl. one beyond range.

## 8. Throws find depth

Thrown weapons (`tossHeld` in `src/sim/melee.ts`, `throwGun` in `src/sim/guns.ts`) fly at the thrower's depth today, so a knife at a grunt one step deeper passes in front of him.

- `throwTarget(world, a, aim): Actor | undefined`: the living enemy whose projected hurtbox contains the cursor, else the one within `QOL.throwMagnet` = 0.35 H (screen-scaled at his depth) of the cursor, nearest first; `|Δz| <= QOL.throwDepth` = 1.2 H.
- With a target: the item flies in a straight 3D line from the hand to the target's aim point (head if the cursor is on the head, else chest): `vel = normalize(targetPoint - from) * speed`, blades keep their slight drop (aim compensated: add `0.5 * g * drop * t^2` to the aim height, t = distance / speed). `thrownHits` stays screen-space and still hits whatever the path crosses first.
- Without a target: today's behaviour.
- M18's weapon pass reuses this with the partner as the target.

Tests: a knife thrown at a grunt 0.6 H deeper kills him (it misses today) · a gun thrown at a grunt's head stuns him (M10b click-throw-punch) at another depth · without a target the throw stays at the thrower's depth.

## 9. F grabs with any free hand

- `canGrab(a)` (`src/sim/combat.ts`) today: front hand empty, back hand empty or a one-handed gun.
- New: if the **front** hand holds a one-handed item (a one-handed gun or a one-handed melee weapon) and the back hand is empty, F first moves it to the back hand (`a.hands = [null, a.hands[0]]`, an instant swap with event `handSwap`), then grabs as normal. Steals (`stealTarget`) use the same swap when they need the front hand.
- The item stays in the back hand after the throw (no swap back).
- As built: with the front hand full, F on an **armed** enemy does nothing (M14's gun block, F just before a blade lands, stays a pure parry; no steal).
- The human-shield rule works unchanged (a one-handed gun in the back fires past the shield).
- Look & sound: a 3-frame "toss to the other hand" pose layer (the item arcs from the front hand to the back), a cloth + clack sound.

Tests: pistol in front, back empty, F next to a grunt → he's grabbed, the pistol is in hand 1 and fires with RMB past him · two guns: F does nothing (as today) · a knife in front moves back too.

---

## Numbers (new `QOL` block in `src/data/tuning.ts`, all invented)
```ts
qol: {
  ownThrowIgnore: 1.0,   // s: your own thrown gun isn't auto-picked again
  meleeSwapScore: 0.6,   // smart swap score of a one-handed melee weapon
  holdShow: 0.18,        // s: E held this long shows the hand chooser
  snapBand: 0.5, snapAhead: 0.3, snapSpeed: 3.0, snapMax: 0.3, // depth snap (H, H, H/s, H)
  aimMinDist: 0.3,       // H: no muzzle correction closer than this
  throwMagnet: 0.35, throwDepth: 1.2, // H: throws find depth
},
melee.hero: { depthBand: 0.3 },
THROWN.catchWindow: 0.25 (was 0.15)
```

## Look & sound checklist
- Prompt: weapon icons, names, mouse-hand icons, the swap arrow, the chooser rows (ink and white, Anton). Item outline + glint.
- Depth rings on enemy shadows (two strengths).
- Grenade marker (ring, blast radius, fuse arc, blink).
- Hand swap: pose layer + cloth/clack. Auto pickup: the soft pickup variant. Auto catch: the existing catch slap.
- F1: cover segments, prop boxes, blocked X.

## Labs
`qol-pickup` (a floor of weapons: loaded, empty, the sign, a stuck knife, a grenade), `qol-depth` (grunt dummies at z offsets 0.15 / 0.35 / 0.5 / 0.7 H, rings and snap visible), `qol-cover` (section 5), `qol-throw-depth` (dummies at three depths, a rack of knives), `qol-grenade-marker`. Registered in a new `src/labs/qolLabs.ts`, imported by `LabIndexScene` and the lab scene like `comboLabs`.
