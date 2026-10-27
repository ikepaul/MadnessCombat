# Handoff: work done in parallel with the audit session

For the Claude session auditing and bug-fixing the game (other account). Written 2026-10-28 by the session that planned and built M17 and M18. Read this before resuming, and merge `main` first.

## What landed on `main` while you were away
1. **PR #37**: plans for M17–M20 (docs only): `design/qol-pass.md`, `design/coop-moves.md`, `design/rage.md`, new milestones in `PLAN.md`, decisions in `research/design-decisions.md`, one colour exception in `design/art-direction.md` (the full-rage red eye slit).
2. **M17, quality-of-life pass** (branch `m17-qol`, its own PR). Five commits, one per part. Tests: `tests/qol.test.ts`. Labs: `/?lab=qol-pickup | qol-depth | qol-cover | qol-throw-depth | qol-grenade-marker`.

## Behaviour that changed on purpose (don't "fix" these back)
| Area | New behaviour | Where |
|---|---|---|
| Walk-over pickup | With one hand full, walking over a **loaded** gun fills the empty hand. Empty guns are never auto-picked (E still takes them); your own thrown gun is ignored for 1 s. | `pickupPlan()` in `src/sim/guns.ts` |
| E prompt | Driven by the same `pickupPlan()` the sim uses: shows with both hands full, shows PULL for stuck blades, shows the weapon icon, name, ammo, target hand and what a swap replaces. | `src/ui/hud.ts` `promptTarget` / `drawPlan` |
| E with both hands full | Acts on **release**, not press: tap = smart swap (empty gun first, then the emptier gun, then a melee weapon); hold E + LMB/RMB = that hand, and that click neither fires nor punches. | `stepUse()` in `guns.ts`, `PlayerCommand.useHeld`, `Actor.useHeldAt` |
| Hero melee depth | Heroes reach 0.3 H in depth (enemies still 0.2). A hero's punch/swing slides him up to 0.3 H toward its target's depth during the wind-up (stops 0.1 H short). | `meleeBand()` in `src/sim/actor.ts`, `snapTarget()` / `snapStep()` in `combat.ts` |
| Catching | F window 0.25 s (was 0.15). Popped disarms, your own *loaded* rebounds and passes (`Item.passTo`) are caught without F into a free hand. Enemy throws still need F. | `autoCatch()` in `src/sim/items.ts` |
| Grab | F with a one-handed item in front and the back hand empty moves it to the back and grabs. With the front hand full, F on an **armed** enemy does nothing (keeps M14's gun block a pure parry). | `freeFrontHand()` in `combat.ts` |
| Cover | Three rules: your own cover never blocks your shots; a prop that hides the hit point on screen blocks; otherwise the bullet's 3D path decides. You can now shoot from behind a table at someone at your depth across it (this was blocked: the reported bug). | `coverBetween()` in `src/sim/hitscan.ts`; `castRay` has a new optional `muzzle` argument |
| Bullet direction | The aim rig turns the gun so the muzzle points at the cursor; shots used to land 16–20 px off it. Enemies use the same rig. | `aimRig()` in `src/anim/aim.ts` |
| Thrown weapons | A knife/axe/gun thrown at an enemy under (or near) the cursor flies to his depth. | `throwToDepth()` in `items.ts` |
| Grenades | A landing marker while cooking / winding up / holding a live grenade. | `lobTarget()` in `melee.ts`, `src/render/canvas/markerPainter.ts` |

New data: `TUNING.qol`, `TUNING.melee.hero.depthBand`, `THROWN.catchWindow` 0.25. New events/fields: `handSwap` event, `pickup.auto`, `Item.bounced / ownedBy / ownedAt / passTo`, `Attack.snapZ / snapped`, `ActorSnap.useHeldAt`.

Existing tests I changed (on purpose): `tests/guns.test.ts` (a loaded gun is now walked into the second hand), `tests/melee.test.ts` (the hero's depth miss case moved from 0.25 H to 0.65 H).

## M18, co-op moves (branch `m18-coop-moves`, its own PR)
Nine co-op moves plus a partner bot. Tests: `tests/coopMoves.test.ts`. Labs: `/?lab=coop-*` (N = the bot's half). Dev route: `/?coop=bot` (AI player 2 in any stage).

| Area | New behaviour (on purpose) | Where |
|---|---|---|
| Hits on a grunt your partner holds | No longer absorbed by the human-shield rule: the partner's 3rd jab or any heavier blow (incl. bullets, thrown weapons) kills him; the holder keeps the corpse. Enemies' hits still use the shield rule. | `heldByPartner` / `heldHit` in `combat.ts`; `hittable()` now takes `world` |
| Grabbed living grunts (held by a hero) | Face **away** from the holder (was: facing him). | `World.updateHeld` |
| Chains | Hits by either player keep one chain (`chain.team`). | `chainBonus` |
| Double-team | Both players' damaging hits within 0.25 s = kill (tough ones +2). | `doubleTeam` |
| Bodies flying into a partner | Bounce off him (no damage, no knockdown) instead of hitting him; thrown corpses fly past. | `pingPong`, `thrownBodyHits` |
| Grab (F) | With the cursor on your partner and both hands empty, F lifts the partner (heroes were never grabbable). F on a grunt your partner holds starts the wishbone. | `tryLift`, `startWishbone` |
| Q | With the cursor on your partner, Q passes instead of throwing. | `tryPass` |
| Carried / tossed / swung heroes | Untouchable (applyHit returns, rays pass), and grunt AI ignores them. | `applyHit`, `castRay`, `ai.ts` `nearestPlayer` / `assignTokens` |
| Gravity | A tossed hero falls at 25% gravity (a flat missile). | `movement.ts` |
| `world.blood` | New sim flag the scene sets each frame (stage 1 has no blood): the wishbone tears only with blood. Defaults to true (tests, labs). | `World` |

New events/fields: `coopMove`, `kill.team / alsoId`, fatality kinds `held | wishbone | double | pingpong`, `Flight.by / pings / lethal / pierce`, `Actor.lastHeroHit / lastHitBy / heldHits / tender / grabbedBy2 / carried / spin / tossT`, `Pose.cut`, `AttackKind 'wishbone'`, `ActorSnap.grabbedBy / holding / carried`, setting `coopHints`. `die()` has a new last parameter `{ team, alsoId }`.

## Known gaps / things worth a look
- Not built from the M17 spec: the F1 cover debug overlay, the 3-frame hand-swap pose layer (only its sound).
- Not built from the M18 spec: the authored poses (restrain, wishbone, lift/carry, giant swing...), most of the new VFX (double star, smears, flashes, speed lines, the spin's floor arc), the Controls page's co-op list; hitting the wishbone's holder drops the grunt instead of handing him to the other.
- Balance: the co-op balance bots with 0.35 s reactions now lose wave A on all three seeds (2 of 3 before); the 0.1/0.2 s pairs clear, the solo 0.35 s bot still loses as required. Bots don't use the cursor, so the depth snap picks targets for them by distance.
- If you touch `combat.ts`, `guns.ts`, `items.ts`, `hitscan.ts`, `aim.ts` or `hud.ts`, expect conflicts with this work: merge `main` first.

## What's next in the plan
M19–M20 (the rage meter and rage fatalities). Stage 4 rooms (M15–M16) are being built on another PC.
