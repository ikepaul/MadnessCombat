# Combos & fatalities: brainstorm

Status: **brainstorm** (2026-10-27). The six moves in section 6 are now milestone **M10b** in `PLAN.md`; pillars 1–3 and reward option 1 are recorded in `research/design-decisions.md`. Everything else here is still a candidate.

Same rule as everything else: we take the **mechanics** of what the hero does in episodes 1–3, never names, designs or text. Every move below is described with our own verbs and our own inputs (see "Controls" in `CLAUDE.md`).

## 1. What the hero actually does (the vocabulary)

Re-watched from the beat logs (`research/episodes/`) plus frames checked on the YouTube uploads. Time = seconds in the 30 fps upload.

| Moment | Ep / time | Why it's cool | In the game today? |
|---|---|---|---|
| Low sweep, then strike the one who falls | 1 / 19.7 | opener that floors a guy who just knocked you down | sweep yes, no follow-up link |
| Face punch → stun → finish → hit him again on the floor | 1 / 37.3 | the original combo: stun, kill, desecrate | yes (stun + finisher) |
| Punch a head clean off, head flies into the crowd | 1 / 64.3 | decapitation as a projectile | yes (heavy kill decaps, heads throwable) |
| Hurl a body onto the pile | 1 / 43 | crowd control with corpses | yes (grab/throw) |
| Grenade onto a pile of bodies | 1 / 46 | clean-up as spectacle | yes |
| Shoot from prone | 1 / 82.5 | dodge + kill in one motion | yes |
| Stand on the cannon, two pistols pointing opposite ways | 1 / 95.3 | split aim from high ground | yes (Shift split aim) |
| Uppercut launches a grunt ~1 H up | 2 / 110 | **launcher**: the start of a juggle | uppercut yes, no juggle |
| Twist an enemy's rifle out of his hands, shoot him with it | 2 / 114.5 | steal → execute | steal yes, no "execute" beat |
| Knock a blade/gun spinning into the air, catch it | 2 / 177, 102 | disarm that feeds your next attack | disarm yes, the air-catch only for thrown weapons |
| Throw the grenade back up the hole | 2 / 151.3 | turn their attack into yours | yes |
| Two shotguns firing two ways stepping out of a lift | 2 / 193 | entrance kill | split aim yes |
| Shoot the gun out of a hand → surrender → hold at gunpoint | 2 / 233 | humiliation instead of a kill | yes (stage 2 end) |
| Drop from a vent with a knife in each hand, stab head + neck | 3 / 20.7 | double stealth kill | drop kill yes (one knife) |
| Throw a knife across the room, then walk over and pull it back out | 3 / 24–31 | ranged kill with a pay-off later | yes |
| Empty rifle thrown into a face, then jump on the table | 3 / 40.3 | weapon churn: empty gun = projectile | yes |
| Punch sends a grunt ricocheting off wall and ceiling; one sticks head-first in the ceiling | 3 / 78–83 | knockback as a weapon (improbability mode) | partial (wall-slam kills) |
| Hold a grunt up as a shield against a machine gun | 3 / 88 | yes | yes |
| Rip a sign out of the ground, sweep two at once, pin a boss to a wall with it | 3 / 109–121 | long weapon + **pin** | yes (thrust pins) |
| Grab the boss's weapon out of the air mid-swing and hit him with it | 3 / 161 | reversal | partial (steal is grounded only) |
| Catch a thrown knife and throw it straight back | 3 / 192 | parry-into-kill | yes |
| Throw a grunt into the vending machine, then throw the gun at him | 3 / 194 | throw → throw follow-up | throws yes, no link |
| Impaled from behind, blast the attacker over your shoulder without turning | 3 / 222 | last-stand reversal | scripted only |

**Takeaway:** the hero's "combos" are almost never long button strings. They are **chains of different verbs** (disarm → catch → use; throw body → throw gun; launch → shoot) and **context kills** (wall, ceiling, pile, cannon, table). That's what our system should reward.

## 2. Pillars

1. **Verb chains, not button strings.** A combo = two or more *different* actions on one or more enemies inside the chain window. Punch strings already exist (`TUNING.combo`, 0.8 s, +1 damage); build on that window rather than adding a fighting-game command list.
2. **Fatalities are short and never take control away.** ≤ 0.8 s of animation, the world keeps running (enemies can still hit you, other players keep playing), at most a kill-cam slow-down that the feel budget already allows. No cutscenes, no button prompts on screen.
3. **Contextual, not memorised.** A fatality triggers from *where* and *how* the kill happens (stunned enemy + heavy, enemy next to a wall, body on a pile, last enemy of a wave), with no special input beyond the normal verbs.
4. **Stage 1 stays bloodless.** Fatalities there are decapitations, flattenings and launches; red gore comes in from stage 2 like the rest of the blood.
5. **Each one ships with its sound and VFX** (rule from `CLAUDE.md`), so keep the list small and good.

## 3. Combo ideas

Tag key: ⭐ = strongest candidates · (exists) = engine already has the parts.

### 3a. Fist strings (unarmed)
- ⭐ **Launcher → juggle.** Uppercut (RMB, cursor high) puts a stunned grunt airborne ~1 H for ~0.5 s. While he's up: LMB jabs keep him up a little (each hit +0.15 s air, max 3), RMB spikes him into the floor (knockdown + floor bounce), F grabs him out of the air and throws. Reference: 2/110, 1/64.
- ⭐ **Juggle into gun.** Launch, then shoot him in the air: airborne grunts take head hits on any body hit (they're spinning). Gives a reason to switch from fists to gun mid-chain.
- **Sweep → stomp.** Dive-sweep (exists) floors a grunt; a punch at him within the window is an instant finisher instead of the normal 1/2 damage. Reference: 1/19.7.
- **Stun-lock relay.** Jab grunt A (stun), turn and jab B, back to A: the chain counter is per attacker, not per target, so juggling *two* stunned grunts builds the combo. Encourages fighting crowds instead of one at a time.
- **Counter-punch.** Punch a grunt during his wind-up (the 0.5 s in-range pause before a swing): he's staggered longer and the hit counts as a chain hit 3 straight away. Cheap to build: a window check in `combat.ts`.

### 3b. Grab & throw chains
- ⭐ **Body bowling.** A thrown body that knocks down two or more grunts = chain hit for each; a punch on any of them in the window is a finisher. Reference: 2/72, 1/43.
- ⭐ **Throw → throw.** Throw a grunt into a wall/object, then throw your weapon (Q) at him before he gets up: pins/kills outright. Reference: 3/194 (vending machine, then the gun).
- **Pile driver.** Grab a grunt and jump (new: currently no jumping while carrying). Landing slams him into the floor. Probably too much new animation; keep as a maybe.
- **Shield rush.** Human shield (exists) + walk into another grunt = shove him over; release the shield into a third. Shield becomes a battering ram instead of a static wall.

### 3c. Disarm chains ("their weapon, your kill")
- ⭐ **Pop & catch.** A light-punch disarm (exists) sends the weapon spinning *up* instead of to the floor; F while it's in the air catches it (the existing snatch rule) and the next attack with it within the window is a chain hit. Reference: 2/102, 2/177, 3/161.
- ⭐ **Steal & execute.** Steal a gun (F on an armed grunt, exists): for 0.6 s the first shot at *the victim* is a guaranteed headshot fatality ("with his own gun"). Reference: 2/114.5.
- **Kick-disarm into knife throw.** Disarm, then Q-throw your current weapon at the next grunt; the chain carries over. Reference: 3/132–135.
- **Catch & return bonus.** Catching a thrown knife and throwing it back (exists) inside 0.5 s = it can't miss the thrower (homing to his head). Reference: 3/192.

### 3d. Gun-melee ("weapon churn")
- ⭐ **Click → throw → punch.** Empty click, throw the gun (exists): a gun that hits a head stuns; the follow-up punch counts as hit 3 of a chain. Reference: 3/40, 3/107.
- **Point-blank.** Shotgun or pistol at contact range on a stunned grunt = decapitation/head-burst fatality instead of the normal shot.
- **Pistol-whip.** Punch with a gun in hand (LMB is fire, so: melee when the target is inside 0.4 H). Reference: 2/202 gun-butt knockout. Probably map to F to avoid accidental fire; needs a decision.
- **Reload-cancel.** Throw the empty mag? Too silly, skip.

### 3e. Environment combos
- ⭐ **Wall bounce.** A heavy that sends a grunt into a wall bounces him back toward you, airborne: perfect juggle setup. (Wall slams already kill above 4 H/s; under that, bounce instead of nothing.) Reference: 3/78.
- **Ceiling stick.** Uppercut a grunt under a low ceiling hard enough: he sticks head-first in the ceiling and hangs there (frozen corpse layer). Pure fatality, see 4b. Reference: 3/83.
- **Table vault.** Jump onto a flipped table/crate and attack downward: air punches already hit whoever is below; landing from a prop counts as a drop kill (exists for vents).
- **Pin chain.** Long-weapon thrust pins a grunt to a wall (exists): punching a pinned grunt is a finisher; throwing a second weapon at him pins him "twice" (fatality).
- **Pile launch.** Grenade under a pile of corpses launches the corpses as projectiles that knock down live grunts. Reference: 1/46.

### 3f. Co-op combos
(2026-10-27: now milestone M18, with more moves: `coop-moves.md`.)
- **Hand-off.** Player 1 launches or throws a grunt toward player 2; player 2's hit on him inside the window continues player 1's chain (shared chain counter for the same target).
- **Double-team.** Both players hit the same stunned grunt in the same 0.2 s: instant decapitation.
- **Toss a weapon.** Q at your partner = a pass they catch with F (the catch rule already exists).

## 4. Fatality ideas

A fatality = a kill whose *conditions* swap in a special death (pose, gib, decal, sound, short kill-cam). No extra input.

### 4a. Unarmed
- ⭐ **Head punt.** Heavy at a grunt's head while he's stunned *and* off the ground (juggle) → head flies off at speed and hits the next grunt (stagger, or knock-down if the head is fast). Reference: 1/64.
- ⭐ **Curb stomp.** Finisher on a downed grunt right after a sweep → flat-head pose, dust ring, crunch. Bloodless, works in stage 1.
- **Through the floor-pile.** Body thrown onto a pile of ≥ 3 corpses: it's buried (sinks into the baked corpse layer), knocks the pile apart.
- **Ceiling hanger.** see 3e. Grunt stays in the ceiling for the rest of the room. Reference: 3/83.
- **Folded.** Wall slam at very high speed (improbability-style): body crumples into a compact pose against the wall and slides down, leaving a streak (stage 2+).

### 4b. Bladed / long weapons
- ⭐ **Double stab.** Two knives (one per hand) on an unaware or stunned enemy: head + neck, pull both out. Reference: 3/20.7. Extends the existing takedown when both hands hold knives.
- **Skewer pair.** Long-weapon thrust that passes through two grunts and pins both to the wall.
- **Axe lodge.** Axe kill on the head: the axe sticks, the body drops, you pull it out with E (same 0.5 s as pulling knives). Reference: 3/57.
- **Knife from the far side.** Thrown knife that kills at long range (≥ 6 H) gets a slow-mo kill-cam following the knife.

### 4c. Guns
- ⭐ **Over-the-shoulder.** Hit from behind while holding a shotgun/pistol and an enemy is in contact behind you: RMB fires backward without turning (the back hand already exists). Reference: 3/222. Doubles as a counter.
- **Executioner.** Point-blank shot on a surrendered or dazed enemy (hold-up, `dazeOnDefeat`): slow pose, single shot, head burst, longer kill-cam.
- **Split-aim double.** Two kills on the same tick with split aim (two directions): "two-way" kill-cam, both bodies drop together. Reference: 1/95, 2/193.
- **Grenade swallow.** Cooked grenade thrown into a stunned grunt's chest sticks to him; he panics (sweat) and runs into his friends.

### 4d. Boss / mini-boss finales
Bosses already have scripted endings. Ideas for player-driven versions:
- **Necromancer**: finishing blow while he's mid-cast reflects his own bolt (he raises himself, then crumbles).
- **Riot-helmet mini-boss**: knock the helmet off (3 heavies), then the next hit is a decap.
- **Zombie mini-boss with the sign**: grab the sign out of the air (exists in plan for M11/M12), then the swing back with it pins him; that pin *is* the fatality.

## 5. What combos give you (reward)

The game already heals 1 life per kill and gives +1 damage per chained hit. Options for more, pick at most one:

1. ⭐ **Nothing extra but feel.** Bigger hit-stop, pitch-up, kill-cam on fatalities. Matches the show (no score). Cheapest.
2. **Kill counter flair.** The counter (exists, M11) shows combo kills with a tick mark or tints them, like the zombie-green kills. Diegetic, no new HUD.
3. **Overheal / armour.** A 3+ chain kill gives a temporary 4th life that decays after 5 s. Rewards aggression, risky for balance.
4. **Style meter.** Rejected in advance: a big on-screen meter clashes with the art direction (no HUD clutter).

## 6. Suggested first slice

If we do one small milestone (say "M10b: combos & fatalities") I'd prototype these six, because they reuse what exists and cover all three stages:

1. Launcher → juggle (uppercut air time, jab keeps up, spike down).
2. Wall bounce (sub-lethal slams bounce back airborne).
3. Pop & catch disarm (disarm pops the weapon upward; existing snatch catches it).
4. Click → throw → punch (thrown gun stun counts as a chain hit).
5. Head punt fatality (decap on an airborne stunned grunt, head as a projectile).
6. Over-the-shoulder shot (back-hand fire at a contact enemy behind you).

Each needs: a lab (`/?lab=<slug>`), tuning in `TUNING.combo` / `src/data/feel.ts` marked `// invented`, a sound and VFX, and a balance-bot check that wave A doesn't get trivial.

## 7. Open questions

Decided 2026-10-27: fatalities are contextual (no input); reward is feel only. Still open (also in `research/design-decisions.md`):

- Pistol-whip: separate key (F with a gun in hand) or automatic at contact range?
- Should juggles work on zombies (tougher, 2–4 hits) or only grunts?
- Co-op combos now or with the M13 polish pass?
