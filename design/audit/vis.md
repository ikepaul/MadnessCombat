# Feel, audio & visuals audit (VIS = FAS + VIS)

Auditor: VIS, 2026-10-27/28, branch `m14b-audit` (rebased under me mid-audit to `1ec6731`: M17–M20 + difficulty are now on it; every code claim below was re-checked against that head).

## 1. Coverage

**Read fully:** `src/feel/feel.ts`, `src/data/feel.ts`, `src/render/feelFx.ts`, `src/render/post.ts`, `src/audio/{hooks,mixer,voices,music,scheduler}.ts`, `src/data/audio.ts`, `assets/music/cues.json`, effect settings in `src/settings.ts`, `src/render/vfx.ts`, `src/anim/{skeleton,clips,layers}.ts`, `src/sim/events.ts`, `design/animation-ux-revamp.md`, the colour/effects parts of `design/art-direction.md`. **Skimmed** (grep + line ranges): `characterPainter.ts`, `sceneryPainter.ts`, `weaponPainter.ts`, `gunFx.ts`, `decals.ts`, `GameScene.ts` render/audio wiring, `combat.ts` (shield, throw), `audio/synth.ts` (only `render`), `design/audio-direction.md`.

**Probes** (all `describe.skipIf(!process.env.AUDIT)`, typecheck clean):
- `tests/audit/vis/feelLoad.test.ts`: the five busiest fights (s1 wave B, s1 boss, s2 office, s3 street, s3 desert) × two bot styles (dual SMG full auto / fists), 60 s real time each, through the real `FixedClock` (hit-stop freezes, kill cam slows), the real `FeelDirector` and the real `hookWorldAudio` into a fake engine with the real `VoicePool` limits. Prints frozen ticks, slow-mo share, shakes, chroma, kill cams (and overlapping ones), plays/s, voice steals by sound.
- `tests/audit/vis/coverage.test.ts`: event → sound / feel / VFX / HUD matrix from the sources (every `GameEvents` key, emitted or not).
- `tests/audit/vis/popDetector.test.ts`: samples the painter's own `buildSkeleton` + root every tick through a 30 s scripted session (walk, stop, turn, light/heavy/uppercut, jump, dive, crawl, get up, grab, throw, shoot, reload, gun throw, knife, sword, sign; grunts take light/head/heavy/uppercut/bullet/headshot/sweep/slash hits, die, get knocked down). Flags a part moving > 0.1 H in one tick while both neighbouring ticks move < ⅓ of that, root rotation > 0.5 rad likewise, and lists facing flips apart.

**Browser pane** (dev server `dev-npm`, `__game.step` driven): loudness table of every sound id (recordings decoded + peak-normalised as the mixer does, recipes rendered via `synth.render`), the kill-cam playback-rate bug reproduced on the live `AudioEngine`, stills of `/?wave=A` and `/?stage=2&room=office` (+ a forced explosion), the stage 3 toy street. Screenshots in the session's tool-results folder (`…/tool-results/mcp-Claude_Browser-blob-*.jpg`).

**Not covered:** driver strips of every move (the headless driver doesn't exist in lean mode and the pane times out on screenshots after long step loops, so I used the pop detector instead); the aim rig's gun hands (painter-only, need projection); M19 rage look, stage 4 club lighting (not mine); co-op guest rendering; perf of particles (UXS/TEC).

## 2. What works (protect it)
- **Clip crossfades (A1) + overlap (A2) hold up:** in the pop detector, walk ↔ idle, jump/land, dive, prone, crawl, get-up, stun/knockback/lying and all hit reactions show no pops; the only intra-clip snaps are the authored 1-frame wind → hit keys that the smears (B1) cover.
- **The hit-stop budget holds in normal play:** across 10 fight runs the 6-frames/s cap was reached in at most 2 seconds per minute; average frozen time 0.5–3.2 %. Hit-stop never makes the game feel "stuck" under SMG fire.
- **Every gameplay event has a sound** except a handful (VIS-08); most set pieces have both a sound and a VFX. The audio hooks are thorough and positional (pan + depth).
- **The mix structure is right:** buses, compressor + limiter, ducking on explosions/boss/kill cam, voice limits with no-repeat variants, room reverb. Peaks after bus gain sit at −0.3…−20 dBFS with the big ones (explosion, shotgun, cannon, thunder) on top, as intended.
- **The hero rim (G1) and the dark hero suit** read well at the front of the room (office still).

## 3. Findings

### VIS-01 · Two kill cams within 0.6 s leave every looping sound slowed to 0.6× for good
- Type: bug S2
- Where: `src/audio/mixer.ts:290-294` (`killCam`: `setValueAtTime(value * 0.6, t)` then `setValueAtTime(value, t + seconds)` on every live voice)
- Evidence: **reproduced in the browser** on the live engine: an `ambRoom` loop at rate 0.98 → `killCam(0.6)` → 0.3 s later `killCam(0.6)` → rate stays **0.588 after 2 s and 3 s**. Control (one kill cam): back to 0.96. The second call reads the already-slowed `.value` and schedules its "restore" to that, after the first call's real restore. Triggers: a fatality (always kill-cams) followed by a multi-kill/last-of-wave kill, a punted head killing the last grunt, back-to-back multi-kills.
- Player impact: room tone, the elevator motor, the jetpack burner, the welder's cutter, the last-stand heartbeat and the boombox's diegetic track (all in `live`) stay pitched down ~9 semitones until they're restarted (room change).
- Proposal: store each live voice's base rate (`Live.rate`) and restore to it (`setValueAtTime(base, t + seconds)`), and skip the multiply if `inKillCam`; or apply kill-cam slowdown as one shared parameter instead of per voice.
- Test: unit test with a fake AudioParam timeline (or the pane script above): two kill cams 0.3 s apart → every loop back at its base rate 0.7 s after the second.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none; FAS-only.

### VIS-02 · The music restarts from bar 1 and re-decodes a 48 MB WAV on every room change
- Type: sound / perf
- Where: `src/audio/music.ts:55-60` (`setRoom` → `stop()` sets `current = null` → `setTrack` fetch + `decodeAudioData`), `GameScene.ts` roomChanged handler; `assets/music/cues.json` (every stage 2/3 room uses `madness-combat-v1`, one 48,066,338-byte WAV)
- Evidence: code read; the file size from disk. Every room, the same track is fetched and decoded again (~272 s stereo float ≈ 100 MB decoded), then starts at 0 after the decode finishes.
- Player impact: through stage 2's 11 rooms and stage 3's 9 the player hears the same opening again and again, with a silent gap during each decode; a decode hitch on lower-end laptops.
- Proposal: keep `current` across rooms when the next room's track id is the same (carry on playing), and cache decoded buffers in `decoded` (it already exists for the boombox). Ship the music as .ogg/.m4a (the loader accepts them) instead of a 48 MB WAV.
- Test: probe: `setRoom('s2-wall')` then `setRoom('s2-corner')` → no new `decodeAudioData`, the source's start time unchanged.
- Effort S · Impact ★★★ · Confidence likely (code)
- Risk: TEC (load time, memory); the user delivers the stems (only the plumbing is ours).

### VIS-03 · With a one-stem track, the music switches off whenever no enemy is active
- Type: sound / decision
- Where: `src/audio/music.ts` `setIntensity` (layer i on iff `i < level`), `GameScene` `music.setIntensity(activeEnemies(world))`, `cues.json` (`madness-combat-v1` has 1 stem)
- Evidence: code read. The single full mix is treated as intensity layer 1, so level 0 (intros, between waves, cutscenes, after the last kill) fades it out on the next bar, and it comes back on the bar after an enemy appears.
- Player impact: the user's track stutters on and off with the spawn rhythm instead of playing through a room (plausibly the opposite of what a single delivered mix is for).
- Proposal: a track with 1 stem plays at full from room start to room clear (level floor 1); intensity layers only apply to multi-stem tracks. Or a `minLevel` field in `cues.json`.
- Test: `setIntensity(0)` on a 1-stem track leaves its gain at 1.
- Effort S · Impact ★★ · Confidence likely
- Risk: the audio direction's "silence is allowed" (stealth openings): keep `music(null)` cues working.

### VIS-04 · Big flashes ignore effect intensity and reduced motion
- Type: bug S2 (accessibility)
- Where: `src/render/vfx.ts` booms (explosion, door smash, teleport), lightning room flash (`drawBolt`: additive 1800 px rect), `src/render/gunFx.ts:153-174` (muzzle room light, 520 px additive), parry streaks; vs `effectLevel()` used only in `feelFx.ts`, the character impact frame (`GameScene.ts:561`) and the M19 wisps
- Evidence: grep: `vfx.ts`/`gunFx.ts` never read `effectLevel()` for these. The setting text says reduced motion = "no shake, flashes or chromatic split"; revamp G3 is the rule.
- Player impact: a player who turned on reduced motion or effects "off" still gets full-room white flashes from every explosion, lightning bolt and (dual SMG) ~16 muzzle light pulses a second.
- Proposal: pass `flashes: number` (0 / 0.5 / 1 from `INTENSITY_SCALE`) into `Vfx.draw` / `GunFx.draw`; scale the additive room flashes and boom alpha by it (keep the small muzzle star and tracers at 1: they are gameplay info).
- Test: lab or unit: with `reducedMotion = true`, a draw after `explosion`/`lightning`/`shot` issues no `lighter` fill larger than 0.5 H.
- Effort S · Impact ★★ · Confidence likely (code)
- Risk: none.

### VIS-05 · Particles draw over every character, whatever their depth
- Type: look
- Where: `GameScene.ts:605-619` (`list.sort` far→near, then `this.vfx.draw(ctx)` and `gunFx.draw` on top), `vfx.ts` (puffs carry a `z` that is never used)
- Evidence: code read. Dust from a body falling at the back wall, blood mist from a hit at z 10.5, gib chunks and smoke all paint over the hero standing at the front.
- Player impact: back-of-room effects float in front of front-row bodies (breaks the depth read the art direction asks for); the hero gets covered by other people's dust in crowds.
- Proposal: give dust/blood/chunk/star particles their source `z` and push them into the sorted `list` in small per-depth batches (or draw two passes: particles behind z < hero.z before actors, the rest after). Flashes/bolts/UI marks stay on top.
- Test: still: a body fall at z 10.4 behind the hero at 9.2 → no particle pixel over the hero's silhouette.
- Effort M · Impact ★★ · Confidence likely
- Risk: TEC (sort cost with many particles: batch per actor).

### VIS-06 · A corpse that ends against a wall pops from lying flat to sitting in one tick
- Type: look (pop)
- Where: `src/sim/combat.ts` corpse settle (`slumped`), `src/anim/clips.ts` (`slumped` blend 0.15 only blends the clip, not the root); pop probe
- Evidence: pop detector: `dead/knockback/tumble → dead/slumped/settled`: **every part jumps 1.04–1.57 H in one tick**, root r −1.57 → 0 (head from 0.21 to 0.79 H high, body 0.63 H sideways). Also on the landing inside the tumble, the root snaps 0.94–1.15 rad (r 3.77 → −1.57) in one tick.
- Player impact: thrown bodies hitting a wall visibly teleport into the slumped pose; a tumbling body flips 55° as it touches down. Thrown bodies are the core toy, so this is seen constantly.
- Proposal: blend the root too: keep `pose.prevRoot` at `setClip` and lerp root (shortest angle) over the blend time in the painter; or drive the slump with a 0.2 s root ease from the settle frame. For the landing snap, ease r toward the nearest flat angle over 3 ticks instead of setting it.
- Test: the pop probe: no `→ slumped` or `tumble → tumble` row above 0.1 H.
- Effort S · Impact ★★★ · Confidence confirmed
- Risk: hurtboxes read the root (sim): blend only the drawn root.

### VIS-07 · Thrown bodies jump ~0.5 H on release; grabs snap 0.16–0.47 H
- Type: look (pop)
- Where: `combat.ts` throw release / grab attach; pop probe
- Evidence: `grabbed/grabbed → knockback` 0.54 H (head, hands) in one tick at release (body x 1.02 → 1.63, then 0.22 H/tick after); `free/idle → grabbed` 0.16 H whole body, and a 0.47 H jump when the held body changes side with the holder's facing.
- Player impact: the body visibly hops out of the hands at the throw and hops into them at the grab.
- Proposal: release from the hand position (start the flight where the grabbed body was drawn) and lerp the grabbed body to its hold offset over 3 ticks.
- Test: pop probe rows `→ grabbed` and `grabbed → knockback` under 0.1 H.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: CMB (throw hit timing): keep the sim position, offset only the draw.

### VIS-08 · Silent events: jump, a teammate going down/revived, edge spawns, shield bullets
- Type: sound
- Where: `src/audio/hooks.ts` (no handler); coverage probe
- Evidence: coverage matrix: emitted, no sound: `jump`, `playerDown`, `revive`, `spawn`, `shieldHit`, `cannonHit` (covered by `hit`), `dismember`, `aimCancel`. No response at all (sound/feel/VFX/HUD): `jump`, `playerDown`, `revive`, `spawn`, `shieldHit`, `aimCancel`. After the first bullet, a held shield's hits are `damage: 0` → a 0.5-gain "punching a corpse" thud, no blood (`combat.ts:972`). Declared, hooked, never emitted: `holdUp`, `surrender` (dead code in hooks).
- Player impact: co-op's most important moment (your partner is down / back up) has no audio cue; take-offs are mute while landings thump; enemies walking in from screen edges give no audio telegraph (doors do); shooting a human shield feels like hitting a pillow.
- Proposal: `jump` → `cloth` + light `whooshLight` (gain 0.5); `playerDown` → `voxHurt` low + a UI `stinger`-lite; `revive` → `heal`; `spawn` from an edge → a footstep pair at the edge (gain 0.5, panned); `shieldHit` → `impact` at full gain + blood mist; `dismember` → `squelch`. Delete or wire `holdUp`/`surrender`.
- Test: the coverage probe's "no response at all" list contains only `aimCancel`.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: UXS (co-op HUD cue may cover playerDown too).

### VIS-09 · The SMG's own voice limit cuts 97 % of its shots short
- Type: sound
- Where: `src/data/audio.ts` `shotSmg` (`limit: 3`), `impact` (limit 4), `hitConcrete`/`hitWood`; `VoicePool` steal = 20 ms fade
- Evidence: feelLoad probe, dual SMG: s3 street `shotSmg` 984 of 1010 plays stole a voice, `impact` 770/784, `hitWood` 207/215; s3 desert `shotSmg` 699/754, `hitConcrete` 371/402. The shot recording is 0.42 s long, so at ~16 shots/s every shot kills a tail that is still ringing.
- Player impact: dual SMGs sound like a buzz of clipped transients without body or room tail; bullet impacts chatter instead of layering.
- Proposal: for automatic weapons, let a shot steal only when the oldest voice is past its transient (e.g. > 80 ms) and instead skip the new impact sound when the limit is reached (impacts aren't the weapon's identity); raise `shotSmg` to 4–5 with a −2 dB per extra voice gain; add a short "tail" layer per burst end (the spec's reverb send does part of it). Numbers invented.
- Test: feelLoad probe: steals < 30 % of plays for `shotSmg` under dual full auto.
- Effort S · Impact ★★ · Confidence confirmed (counts) / opinion (how it sounds)
- Risk: TEC (voice count: probe max was 24 live voices).

### VIS-10 · Hit-stop and the kill cam multiply: a kill in slow-mo freezes 3.3× longer, and the per-second cap is broken
- Type: friction (feel)
- Where: `feel.ts` `stop()` budget keyed on `clock.tick * dt` (scaled ticks), `FixedClock.advance` (hit-stop ticks consumed at `feelScale` 0.3)
- Evidence: feelLoad probe: max frozen real ticks per real second = **14** (s1 wave B, s1 boss, s2 office, s3 desert, SMG) vs the cap of 12 (6 frames); the extra comes from kill-cam seconds where a 2-frame kill hit-stop lasts 13 real ticks (0.22 s).
- Player impact: multi-kills (exactly when the kill cam is on) stutter: slow-mo, then a full stop per extra kill. Mushy at the most rewarding moment.
- Proposal: during the kill cam (or any `feelScale < 1`), skip hit-stop (slow-mo already sells the hit), or divide the requested hit-stop by `feelScale`. Keep the budget in real time.
- Test: feelLoad probe: frozen real ticks per real second ≤ 12 in every fight.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: M19 rage strikes call `sink.hitStop` directly inside their own slow-mo (same multiplication); the rage owner should look at it.

### VIS-11 · Set-piece impacts have sound but no screen response
- Type: friction (feel)
- Where: `src/feel/feel.ts` (handles hit/kill/explosion/bossSlam/lightning/wallHit/juggle/shot/cameraShake only); coverage probe (feel column)
- Evidence: no shake/hit-stop on `blockDrop` land (the falling tank, which the audio ducks for), `wallDrop` land (the arena walls crushing), `doorSmash`, `propToppled`, `vendingSmash`, `swordDive` hit, `stab`, `collapse`, `cannonDrop` land gets one only through `cannon.ts:70`; scripts call `cameraShake` only for the elevator (`stage2Late.ts:130,133`).
- Player impact: the heaviest objects in the game land with a sound and a dust puff but the screen doesn't move, while a light punch shakes it 1.5 px.
- Proposal: add to `FeelDirector`: `blockDrop`/`wallDrop` land → shake 12 + 2-frame stop; `doorSmash`, `propToppled`, `vendingSmash` → shake `wall` (5); `swordDive` hit and `stab` → kill-cam-style chromatic + 2-frame stop. Numbers invented, under the explosion's 14.
- Test: feel unit test per event: a shake request ≥ 5 px.
- Effort S · Impact ★★ · Confidence likely
- Risk: none (respects intensity via FeelFx).

### VIS-12 · Dead feel numbers: boss phase kill and auto-fire caps are never used
- Type: tech / feel
- Where: `src/data/feel.ts` `hitStop.bossPhaseKill` (5 frames, art direction) and `hitStop.autoFireMax`; `grep` finds no reader
- Evidence: grep. A boss phase end gets the regular 2-frame kill stop (it does get the kill cam).
- Player impact: the boss going down lands like a grunt kill; the F6 tuning panel shows two knobs that do nothing.
- Proposal: use `bossPhaseKill` for `kill` of kind `boss` (and the stage 2/3 mini-bosses' last hit); delete `autoFireMax` or apply it to `bullet` hits from automatic weapons.
- Test: feel unit test: boss kill → hit-stop request of 5 frames.
- Effort S · Impact ★ · Confidence confirmed
- Risk: none.

### VIS-13 · Loudness outliers within their bus
- Type: sound
- Where: `src/data/audio.ts`; loudness table (§4)
- Evidence: (peak / RMS after def + bus gain, dBFS)
  - `block` (the agent's forearm block, `thump` recipe) −4.4 / **−15.2** and `thump` −2.9 / **−13.6** are hotter than a landed heavy punch `impactHeavy` −1.0 / −17.4: a blocked jab sounds bigger than a hit.
  - `alert` (the "!" when an unaware enemy notices you, a gameplay telegraph) is the quietest UI cue: −16.8 / −28.0, under the kill tick (−9.9).
  - `shotShotgun` RMS −10.4 is 6–7 dB above every other gun (pistol −17.1, rifle −16.2): it pumps the compressor and ducks everything after it.
  - outdoor bullet hits on the floor play `stepDirt` (`hooks.ts`), a 0.68 s grass footstep recording at −38 RMS: shots into the desert floor are near silent.
- Player impact: blocks feel like rewards, alerts get lost in fights, shotgun blasts swallow the next half second.
- Proposal: `block` gain 0.75 → 0.45 (≈ −4.4 dB) and a higher pitch; `alert` gain 0.6 → 1.0; `shotShotgun` gain 1 → 0.7; a `hitDirt` sound (short sand puff) for outdoor floor hits. Invented.
- Test: rerun the loudness script: every impact-bus cue's RMS within ±3 dB of `impact` unless it's a set-piece; `alert` ≥ −22 dB RMS.
- Effort S · Impact ★★ · Confidence confirmed (measured) / opinion (targets)
- Risk: none.

### VIS-14 · Outdoor rooms have no ambience; the wind and city beds are never played; reverb has two sizes
- Type: sound
- Where: `cues.json` (`ambience: null` for s2 wall/corner/roofA/roofB/office/corridor, s3 outside/street/desert); `ambCity`, `ambWind` defined in `audio.ts` but referenced nowhere; `GameScene.ts` only ever picks `'outdoor'` or `'medium'` reverb (`small`/`large` unused)
- Evidence: grep.
- Player impact: rooftops and the street are dead silent between fights (with VIS-03 the music drops too, so total silence); the big lobby and the small vent/elevator sound the same.
- Proposal: `ambCity` on stage 2 street rooms, `ambWind` on the roofs and the desert; a `reverb` field per room in cues.json (`small` vent/elevator/lift, `large` lobby/desert box when sealed).
- Test: every room in cues.json has an ambience or an explicit `"silent": true`; a room with `reverb` set uses it.
- Effort S · Impact ★★ · Confidence confirmed
- Risk: none (the beds were already turned down by the user, so levels are set).

### VIS-15 · The facing flip is an instant 0.38 H mirror (endorse revamp A3)
- Type: look
- Where: `characterPainter.ts` `ctx.scale(a.facing, 1)`; pop probe
- Evidence: every flip moves the hands 0.38 H in one tick (8 flips in the session, every one at idle); with the aim-follows-cursor rule this happens many times a minute.
- Player impact: the hero "blinks" around; reads as a glitch when the cursor crosses the body.
- Proposal: A3 as written (2-frame narrow + head first). **Endorse.**
- Test: pop probe: flips' max part jump per tick ≤ 0.2 H.
- Effort S · Impact ★★ · Confidence confirmed

### VIS-16 · Feet slide: the walk swing is half a stride (endorse revamp A4)
- Type: look
- Where: `src/anim/layers.ts` (`swing = sin(ph) * 0.07`), `movement.ts:243` (phase advances 2π per 0.6 H)
- Evidence: maths: a planted foot needs swing amplitude S/2π = 0.095 H for a 0.6 H stride; 0.07 makes the "planted" foot slide forward at ≥ 27 % of body speed at its slowest, i.e. ≥ 0.65 H/s at the hero's combat speed 2.4 H/s (the probe's samples agree).
- Player impact: the hero skates, worse since his speeds went up 35 %.
- Proposal: quick fix: amplitude `strideLength / (2π)` (0.095) and a flatter stance curve; the full fix is A4. **Endorse A4**, with the quick fix as an S step before it.
- Test: probe: foot world speed during the stance half ≤ 10 % of body speed.
- Effort S (quick) / M (A4) · Impact ★★ · Confidence confirmed

### VIS-17 · At equal depth the hero is drawn behind grunts
- Type: look / readability
- Where: `GameScene.ts:575-605` (actors pushed in `world.actors` order, hero first; `Array.sort` is stable, so equal `z` keeps him under later actors; only `attack`/`grabbed` get a bias)
- Evidence: code + `/?wave=A` still: hero and two grunts at z 9.20 in a row (everyone spawns on the 9.2 lane), heads overlapping.
- Player impact: in a crowd the hero's body is covered by enemies at his own depth; losing the hero is the readability failure the art direction ranks first.
- Proposal: tie-break equal (±0.01) depths with players last (`bias -= 0.0015` for heroes), after the attack bias.
- Test: unit: sort key of a hero vs a grunt at the same z puts the hero later.
- Effort S · Impact ★★ · Confidence likely
- Risk: none.

### VIS-18 · Colour rules: red used as decoration, a green tint on a non-zombie
- Type: look / decision
- Where: `sceneryPainter.ts:405-410` (toy-street awnings: every other stripe `#a3141c`), the street's red cans; `src/ui/hud.ts:162` "EMPTY" in `#ff5a50`; `characterPainter.ts:468` welder visor `rgba(160,255,190)` (green); `sceneryPainter.ts:315` welder slot outline orange `#ff9a3c`
- Evidence: colour grep over `src/render`, `src/ui`; stage 3 street screenshot (red/white stripes across the whole back wall).
- Player impact: in stage 3, where blood and red aim telegraphs matter most, a red-striped back wall competes with the telegraph line; green on the welder suggests "zombie".
- Proposal: awnings in two greys; "EMPTY" in white with a strike (or the red only while an enemy telegraph is impossible, i.e. keep it, user call); welder visor light grey-white. The signed-off exceptions (riot helmet stripe, boombox LED, grenade blink = telegraph) stay.
- Test: colour grep finds red only in BLOOD/telegraph/exception sites (a small allow-list test).
- Effort S · Impact ★ · Confidence confirmed (code) / opinion (impact)
- Risk: the toy street was signed off: question for the user.

### VIS-19 · Shield breaking and bullets into a held body have no feedback
- Type: friction
- Where: `combat.ts:960-981` (`shieldHit`: later hits `damage: 0`, `broke` drops the body with no event of its own besides `shieldHit`)
- Evidence: coverage probe (`shieldHit` no response); vfx mist requires `damage > 0`.
- Player impact: you can't hear or see how close your shield is to falling apart.
- Proposal: on `shieldHit`: blood mist + `impact` at full gain + 1 px shake; on `broke`: `bodyFall` + small gib burst.
- Test: coverage probe; lab `combat-human-shield` shows mist on every hit.
- Effort S · Impact ★ · Confidence likely

### VIS-20 · The 1-frame wind → hit keys snap up to 0.9 H; head and back hand snap with them
- Type: look (decision)
- Where: `poses.json` `punchHeavy` (5→6), `uppercut` (5→6), `punchLight` (3→4), `swing`, `swingLong`, `throw`
- Evidence: pop probe: intra-clip moves of 0.92 H (uppercut, fist + head), 0.81 H (heavy, back hand + head), 0.41 H (jab) in one tick, both halves of a 2-tick key. The fist is covered by the smear; the **head** jumping 0.8–0.9 H is not.
- Player impact: on heavies and uppercuts the head appears to teleport for one frame. It's the show's 1-frame hit, but the show moves the fist, not the head.
- Proposal: keep the 1-frame fist; author the head and back hand in `crossHit`/`upHit` closer to `crossWind`/`upWind` (≤ 0.25 H apart) so only the fist snaps.
- Test: pop probe: no `head` row above 0.3 H inside attack clips.
- Effort S · Impact ★ · Confidence confirmed (measured) / opinion (fix)

### VIS-21 · Hit reactions snap 0.28 H into the stun on the first tick
- Type: look
- Where: `layers.ts` `applyReaction` (k ramps over 0.05 s), `clips.ts` `stun` blend 0.04
- Evidence: pop probe `free/idle → stun/stun` 0.28 H (head, hands) on the first tick, 0.16 H back hand the tick after.
- Player impact: fine at hit-stop (the frame is frozen bright), noticeable on bullets, which have little hit-stop.
- Proposal: none urgent; keep, unless the hit-stop changes (VIS-10). Listed as the smoothness baseline.
- Effort — · Impact ★ · Confidence confirmed

### VIS-22 · Evaluation of the unbuilt revamp items (§3.3)
- Type: decision
- Evidence and verdict, one line each:
  - **A3 turning: endorse** (VIS-15, 0.38 H flips). **A4 stride: endorse** (VIS-16, ≥ 27 % slide). **A5 secondary motion: endorse low** (no pops left to hide; nice-to-have). **A8 jump & land: endorse** the landing dust part only — `land` already has dust (`vfx.ts`), the take-off has no sound or VFX (VIS-08). **A9 gun handling: endorse** — `reload` has sound + mag drop but the hero's pose doesn't change (no reload clip in `poses.json`). **A10 enemy body language: endorse** the melee wind-up glint as part of G2. **A11 pose editor: reject for M14b** (tooling).
  - **B2 ink-negative impact frame: neutral**. **B3 directional blood: endorse low**. **B4 muzzle light: partly built** (`gunFx.ts` room light flash, explosion `lighter` flash): drop from the menu, fold the rest into VIS-04. **B6 dust everywhere / B7 speed lines: endorse B7** (thrown bodies are the core toy and VIS-06 is about them). **B8 explosion upgrade: partly built** (flash, starburst, smoke, scorch decal): only the shockwave ring is missing.
  - **C2 directional shake: endorse** (shake is random per frame, `feelFx.ts`). **C3 victim-only hit-stop: reject for now** (frozen time averages 0.5–3.2 %, the budget holds; fix VIS-10 first). **C5 near-miss: neutral.**
  - **D1–D4: reject for M14b** (no evidence of a problem). **E3/E5/E6, F1, F3–F6: UXS's call**; F6 (separate shake/hit-stop/flash sliders) would also solve VIS-04 for players who want shake but no flashes: **endorse**. **G2 telegraph consistency: endorse.** **G3: endorse as a rule** (VIS-04 shows it isn't met).
- Effort — · Confidence measured where cited

### VIS-23 · Delayed sounds aren't counted by the voice pool
- Type: tech / sound
- Where: `mixer.ts` `play()` (voice duration from `now`, not `now + delay`), `hooks.ts` casings (0.3–0.45 s delay), shotgun rack, disarm clatter
- Evidence: code read: a delayed voice "ends" in the pool before it starts; casings (limit 6) can stack far above 6 under SMG fire, while a steal can stop a voice that hasn't played yet.
- Player impact: casing clatter piles up under full auto (the probe counted up to 24 live voices at once).
- Proposal: pass `now + delay` as the start to `pool.start`.
- Test: VoicePool unit test with delayed starts.
- Effort S · Impact ★ · Confidence likely

### VIS-24 · Feature: thrown-body speed lines (B7) as the cheap partner to VIS-06/07
- Type: feature (from existing systems: the improbability ghost trail in `vfx.ts drawTrails`)
- Proposal: a lighter always-on version of the ghost trail for bodies in `knockback` above 4 H/s, 2–3 ink streaks, scaled by effect intensity.
- Player impact: sells the throw, which is the game's signature, and hides the leftover release motion.
- Test: lab `throw-*` still with streaks; off at intensity off.
- Effort S · Impact ★★ · Confidence opinion

## 4. Baseline metrics

**Feel load per fight** (`tests/audit/vis/feelLoad.test.ts`, 60 s real time, invulnerable bot; the bot is weak, so kills are lower than a human's: compare relatively)

| fight / bot | kills | frozen real ticks/s max (cap 12) | frozen % | slow-mo % | s at cap | shakes/s max | shake px max | kill cams | sound plays/s max | voice steals | live voices max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s1 wave B · SMG | 10 | 14 | 1.4 | 1.0 | 0 | 9 | 6 | 1 | 34 | 3 | 16 |
| s1 wave B · fists | 4 | 4 | 0.5 | 0 | 0 | 2 | 6 | 0 | 25 | 11 | 10 |
| s1 boss · SMG | 11 | 14 | 1.9 | 2.9 | 1 | 23 | 12 | 3 | 65 | 144 | 20 |
| s1 boss · fists | 2 | 5 | 0.6 | 0 | 0 | 2 | 12 | 0 | 12 | 0 | 12 |
| s2 office · SMG | 18 | 14 | 2.3 | 1.0 | 0 | 18 | 6 | 1 | 56 | 71 | 17 |
| s2 office · fists | 8 | 8 | 1.0 | 0 | 0 | 4 | 6 | 0 | 24 | 5 | 10 |
| s3 street · SMG | 9 | 10 | 1.4 | 1.9 | 1 | 25 | 14 | 2 | 77 | 1961 | 24 |
| s3 street · fists | 7 | 8 | 0.9 | 0 | 0 | 7 | 6 | 0 | 33 | 9 | 13 |
| s3 desert · SMG | 22 | 14 | 3.2 | 2.9 | 2 | 22 | 6 | 3 | 76 | 1358 | 24 |
| s3 desert · fists | 4 | 4 | 0.5 | 0 | 0 | 2 | 6 | 0 | 24 | 10 | 8 |

Steals by sound (SMG runs): street `shotSmg` 984/1010, `impact` 770/784, `hitWood` 207/215; desert `shotSmg` 699/754, `hitConcrete` 371/402, `impact` 281/323; boss `shotSmg` 77/102, `ricochet` 17/20. Overlapping kill cams in these runs: 0 (the bot rarely multi-kills; VIS-01 was reproduced directly).

**Pose pops** (`tests/audit/vis/popDetector.test.ts`): 49 pops in 13 transitions; worst: `tumble → slumped` 1.57 H (all parts), tumble landing root snap 1.15 rad, `grabbed → knockback` 0.54 H, `idle → stun` 0.28 H, `tumble → lying` 0.18 H; authored 1-frame keys 0.34–0.92 H; facing flips 0.38 H (hero), 1.04 H (a slumped corpse re-facing). (One 1.23 H row is the probe teleporting the hero; ignore.)

**Coverage** (`tests/audit/vis/coverage.test.ts`): 121 event types; no sound: 10 (incl. `rageEnd`, `cameraShake`, `cannonHit` which are covered elsewhere); no response of any kind: 6 (`jump`, `playerDown`, `revive`, `spawn`, `shieldHit`, `aimCancel`); declared never emitted: 2 (`holdUp`, `surrender`).

**Loudness** (peak / RMS dBFS after def gain × bus gain; recordings peak-normalised to 0.89 as the mixer does; RMS over the whole file incl. tails), selected rows:

| id | bus | peak | RMS | len s |
|---|---|---|---|---|
| explosion | impacts | −0.3 | −14.8 | 1.60 |
| shotShotgun | weapons | −1.0 | **−10.4** | 0.28 |
| shotPistol / shotRifle / shotSmg | weapons | −1.9 / −2.4 / −5.4 | −17.1 / −16.2 / −20.6 | 0.42 / 0.36 / 0.42 |
| impact / impactHeavy | impacts | −1.0 / −1.0 | −17.9 / −17.4 | 0.5 |
| thump / block | impacts | −2.9 / −4.4 | **−13.6 / −15.2** | 0.25 |
| crack | impacts | −7.5 | −27.3 | 0.12 |
| whooshLight / Heavy | foley | −15.5 / −8.3 | −29.4 / −23.3 | 0.14 / 0.22 |
| voxEffort / Hurt / Death | voices | −15.9 / −14.3 / −12.0 | −31.9 / −29.3 / −29.1 | |
| alert | ui | **−16.8** | −28.0 | 0.22 |
| telegraph | weapons | −10.0 | −20.7 | 0.45 |
| tick (kill) | ui | −9.9 | −25.9 | 0.03 |
| stepDirt (also outdoor bullet floor hits) | foley | −9.9 | **−38.1** | 0.68 |
| ambRoom / ambCity / ambWind | world | −31.4 / −28.0 / −30.5 | −39.5 / −38.5 / −47.1 | loops |

## 5. Top 5
1. **VIS-01** two overlapping kill cams leave every loop (ambience, boombox, heartbeat, motors) at 0.6× pitch until the next room (reproduced).
2. **VIS-02** the music restarts from bar 1 and re-decodes a 48 MB WAV in every room.
3. **VIS-06** bodies pop 1–1.6 H from lying to slumped (and snap 55° on landing): blend the drawn root.
4. **VIS-04** explosion, lightning and muzzle room flashes ignore reduced motion / effect intensity.
5. **VIS-10** hit-stop inside the kill cam lasts 3.3× longer and breaks the 6-frames/s cap (multi-kills stutter).

## 6. Questions for the user
- **Music with one stem** (VIS-03): should your single track play straight through a room (my proposal), or drop out between waves as it does now?
- **Red in the toy street** (VIS-18): keep the red/white awnings and red cans as signed off, or grey them so red stays blood + telegraphs?
- **Reduced motion vs flashes** (VIS-04 / F6): one switch for shake + flashes, or separate sliders?
- **1-frame hits** (VIS-20): is the head jumping with the fist on heavies part of the look you want?
