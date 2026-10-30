# M14b playtest (slice F), about 15 minutes

This is the playtest from `PLAN.md` M14b, with routes and switches filled in. Rate each line **1–5** (5 = feels right). Where a line names a switch, play it once with the new value and once with the old one, then answer "which feels better: new or old?".

**Setup.** `npm run dev` (or `preview_start` "dev"), then open `http://localhost:5173` with the route given. Difficulty is Pro unless a line says otherwise. **F6** opens the tuning panel. Type part of a key into its filter box (for example `health.mercy`), change the value, and it applies live. Switches are checkboxes. A list such as `hit.chainStun` shows one field per entry (`.0`, `.1`, `.2`). Values you change turn red and stay saved across reloads, and the HUD shows `TUNED · n`. Click **Reset all** before each group so one A/B test doesn't leak into the next.

## The switches (new value → old value)

| Slice | Key path (F6) | New | Old | What it changes |
|---|---|---|---|---|
| B | `TUNING.health.mercy` | 0.3 | 0 | After losing a life, the hero ignores further hits this long (s). Scaled by difficulty: Noob 0.5, Notch 0.15 |
| B | `TUNING.input.buffer` | 0.15 | 0 | Jump/dive/attack/grab/E pressed while busy are replayed when free (s) |
| B | `TUNING.input.shotLatch` | 0.1 | 0 | A shot pressed just before the cooldown ends still fires (s) |
| B | `TUNING.input.firstDifferentWins` | ☑ | ☐ | Inside one move, the first press of a different kind wins |
| B | `TUNING.jump.buffer` / `TUNING.jump.coyote` | 0.1 / 0.08 | 0 / 0 | Jump pressed just before landing / just after walking off an edge |
| B | `TUNING.hit.chainStun.0` / `.1` / `.2` | 0.7 / 0.45 / 0.25 | 0.7 / 0.7 / 0.7 | Stun of the 1st, 2nd and 3rd+ jab of a chain |
| B | `TUNING.hit.toughShrug` | 4 | 0 | Riot and tough targets shrug off the 4th jab of a chain |
| B | `TUNING.flyKick.minHeight` | 0.5 | 0 | The air kick only fires this high above the ground (H); lower, you dive on landing |
| B | `TUNING.melee.weaponFinisher` | ☑ | ☐ | A swing or stab at a downed body hits it; an uppercut at one finishes it |
| B | `GUNS.toughShotCap` | 4 | 99 | One shotgun blast deals at most this to the agent or the riot (pellet damage 1, which was 2, is not in F6) |
| C | `TUNING.enc.stomp.on` | ☑ | ☐ | Unarmed grunts stomp a prone hero after a drawn tell |
| C | `TUNING.enc.zombieMaxAttackers` | 4 | 99 | Zombies' own attack cap |
| C | `TUNING.enc.chargeUncapped` | 3 | 99 | A charging squad skips the attack queue only while this many of it are alive |
| C | `TUNING.enc.scriptedHitsHurt` | ☐ | ☑ | Teaching and cutscene hits (the intro's cross, the boss's flings) cost a life |
| C | `TUNING.enc.heavyTell` | 0.3 | 0 | A grunt's knockdown heavy has a visible wind-up (s) |
| C | `TUNING.enc.gunTelegraph.pro` (also `noob` / `hacker` / `notch`) | 0.4 | 0.4 | Gun grunts' aim time before firing (s). Unchanged: try 0.5 or 0.3 if shots feel unfair or toothless |
| C | `TUNING.enc.bossAimBand` | 9 | 0.8 | How far across the depth the stage 1 boss's volleys reach (H) |
| C | `TUNING.enc.stuckHint` | 20 | 0 | A quiet room shows its last caption again after this long (s) |
| C | `TUNING.enc.exitCue` | 2.5 | 0 | The exit arrow appears when the exit opens (s it shows) |
| C | `TUNING.duel.regunAfter` | 10 | (none) | Stage 3 sword duel: a loaded gun drops again after this long without one (s) |
| C | `TUNING.ai.holdRelease` | 1.5 | (none) | The crate room's guards hold their spots until you get this close (H) |
| D | `FEEL.pose.slumpBlend` / `FEEL.pose.snapEase` | 0.15 / 0.05 | 0 / 0 | A body's snap into the slump, or on landing, is blended |
| D | `FEEL.pose.grabEase` | 0.05 | 0 | A grabbed or released body eases to its new place |
| D | `FEEL.pose.turnTime` | 0.067 | 0 | The body turns over 2 frames, head first (0 = instant mirror) |
| D | `FEEL.pose.walkSwing` / `FEEL.pose.walkSwingLag` | 0.095 / 1 | 0.07 / 0 | The stride fix: feet don't skate |
| D | `FEEL.pose.walkBlend` | 0.1 | 0 | The walk swing eases in and out |
| D | `FEEL.pose.stompPose` (F) | 1 | 0 | The stomp's drawn wind-up and stamp |
| D | `FEEL.drawOrder.playerBias` | 0.0015 | 0 | Players draw in front at equal depth |
| D | `FEEL.hitStop.bossPhaseKill` | 0.167 | 0.067 | Hit-stop on a boss's killing blow (s) |
| D | `FEEL.hitStop.setPiece` / `FEEL.shake.setPiece` / `FEEL.shake.prop` / `FEEL.shake.shield` | 0.067 / 12 / 5 / 1 | 0 / 0 / 0 / 0 | Set-piece and prop hit-stop and shake |
| #43 | `TUNING.waves.variety.on` | 1 | 0 | Spawns in groups, spread over the doors, with the odd flanker (0 = the single-file trickle) |
| F | `TUNING.health.healMeleeOnly` | 0 (default) | — | **Your decision.** 1 = only hand-to-hand kills heal (fists, blades, blunt, finishers, thrown bodies). Gun, thrown-weapon and explosion kills don't |

Not in F6 (fixes, no A/B): hit-stop inside slow-mo (slice A clock change), music carrying on through rooms, shotgun pellet damage, and the loudness changes (block 0.45, alert 1.0, shotgun 0.7, new `hitDirt`).

## A: Stability (2 min)

1. `/?stage=1&beat=boss`: die at the boss. Does the restart put you back at the boss, with no intro?
2. `/?stage=3&room=vending`: knife the boss before he teleports, then stand still. Nothing should crash or lock up.
3. `/?stage=3&room=street`: punch the vending brute mid-swing. He should flinch or shrug it off, with no frozen pose.
4. Anywhere: die, press Esc straight away, wait 3 s, then Resume with Space. The restart should come once, not twice, and not while the menu is open.

## B: Controls and combat (4 min)

1. `/?stage=2&room=roofA`: stand in an SMG burst. Flip `TUNING.health.mercy` 0.3 ↔ 0. Does one burst cost one life (new) or all three (old)? Which feels fairer?
2. `/?stage=1&beat=riot`: jab-lock the riot shield. Flip `TUNING.hit.chainStun.*` and `toughShrug` (see the table). Should the lock end, or keep going?
3. `/?wave=A`: jump just before landing, dive right after a punch, punch during a flinch. Flip `TUNING.input.buffer` 0.15 ↔ 0 and `TUNING.jump.buffer` 0.1 ↔ 0. Do the inputs feel eaten (old), or does anything fire when you didn't mean it to (new)?
4. `/?wave=A`: knock a grunt down with a knife or bat in hand, then swing at him on the floor (`melee.weaponFinisher`).
5. `/?stage=2&room=corridor`: shotgun the riot (`GUNS.toughShotCap` 4 ↔ 99). One blast should no longer delete him.
6. Air kick from a low jump (`flyKick.minHeight` 0.5 ↔ 0). Does it land or dive when you expect?

## C: Encounters and pacing (4 min)

1. `/?wave=A`: lie prone next to unarmed grunts. Flip `TUNING.enc.stomp.on`. Can you read the tell and roll or get up in time? Is prone still worth using against guns?
2. `/?stage=2&room=corridor`: play the corridor through the boss's fling and the zombies. It is still the hardest room for the gunner bot (3.7 deaths at r = 0.2). Is it too hard? Would you want a checkpoint after the fling (ENC-19)?
3. `/?stage=3&room=camera`: the jetpack room with its new caption. Does the caption get you to go prone? The bots die here 5 times out of 5.
4. `/?stage=2&room=office`: clear it and wait. Do the exit arrow and sting appear, and does the caption come back after 20 s (`enc.exitCue`, `enc.stuckHint`)?
5. `/?wave=A` with `TUNING.waves.variety.on` 1 ↔ 0: groups and flankers versus the old trickle.
6. `/?stage=1&beat=boss`: dodge the volleys (`enc.bossAimBand` 9 ↔ 0.8). Is the safe strip gone, and is it still fair?

## D: Look and sound (3 min)

1. `/?wave=A`: throw bodies into walls. Flip `FEEL.pose.slumpBlend` 0.15 ↔ 0. Do you still see the pop?
2. Turn back and forth fast (`FEEL.pose.turnTime` 0.067 ↔ 0), and walk at full speed (`walkSwing` / `walkSwingLag`). Do the feet still skate?
3. A kill cam into a multi-kill (`/?wave=A`, a grenade into a group). Does it feel smooth, with no stutter?
4. Prone next to an unarmed grunt: watch his wind-up and stamp (`FEEL.pose.stompPose` 1 ↔ 0). Is it readable? Does it look like our style?
5. Walk `/?stage=2&room=office` → corridor → elevator. Does the music carry on? Do blocks sound smaller than hits? Can you hear the "!" alert? Is the shotgun less overpowering? Are desert floor hits audible (`/?stage=3&room=desert`)?

## E: Shell (1 min)

1. Settings → Controls: rebind grab to Space. Do you see the swap message? Does the jump move to F?
2. Alt-tab in the middle of a fight. It should pause and resume cleanly.
3. Press R right after the last kill of `/?stage=2&room=final`. The end card should ignore it, and replay needs R held.

## F: Gun cost (1 min, the CMB-03 decision)

1. `/?stage=2&room=lobby`: play it gun only (head shots), once with `TUNING.health.healMeleeOnly` 0 and once with 1. Then do a fists run with 1. Does melee-only healing make you want to punch more, or does it just feel like a penalty? **Keep it (1) or drop it (0)?**

   The probe (bots, reaction 0.25 s) found almost no difference: the gun-head bot takes 0 hits in the lobby and 8 in the office whether or not kills heal. The aim alone keeps it safe, so this switch only matters for players who get hit while shooting.

## How to send me results

1. For each group, write one line per numbered item: `B1 4 new`, meaning a rating of 4 and the new value felt better (`old` or `same` otherwise). Add a few words wherever something felt off.
2. If you changed numbers you want to keep, open F6 → **Copy changes** and paste the JSON it puts on the clipboard (the edited paths and values).
3. Paste both into the chat. I'll apply "Copy changes", remove the switches you kept, revert the rest, tick M14b and update `CLAUDE.md`.
