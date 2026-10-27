// Sim events -> sounds (PLAN.md M4: hook all M1-M3 events). The sim never calls audio; this
// subscribes to a world's events. Layering follows design/audio-direction.md.
import { type SoundId } from '../data/audio';
import type { WeaponId } from '../data/weapons';
import { project } from '../render/camera';
import type { HitKind } from '../sim/events';
import type { World } from '../sim/world';
import type { AudioEngine, PlayOptions } from './mixer';

const HEAVY: HitKind[] = ['heavy', 'uppercut', 'finisher', 'sweep', 'body', 'wall', 'smash', 'slash', 'blast', 'pin'];
const BLADE: HitKind[] = ['slash', 'stab', 'knife', 'pin'];

export function hookWorldAudio(world: World, engine: AudioEngine): void {
  const at = (x: number, y: number, z: number, extra: PlayOptions = {}): PlayOptions => {
    const r = world.room;
    return { screenX: project(x, y, z)[0], depth: (z - r.zFront) / (r.zBack - r.zFront), ...extra };
  };
  const play = (id: SoundId, o: PlayOptions) => engine.play(id, o);
  const isEnemy = (id: number) => {
    const a = world.actorById(id);
    return !!a && a.kind !== 'hero';
  };
  let lastHitCombo = false;
  /** M10b: a kill at chain hit 3+ ticks higher still. */
  let lastHitChain = 0;

  // M14: a step up off the floor on a staircase sounds hollow
  world.events.on('footstep', (e) => play(world.room.outdoor ? 'stepDirt' : e.y > 0.05 && world.room.stairs?.length ? 'stairStep' : 'stepConcrete', at(e.x, e.y, e.z, { gain: e.actorId === world.player?.id ? 1 : 0.6 })));
  world.events.on('stairSlide', (e) => play('stairSlide', at(e.x, e.y, e.z)));
  world.events.on('land', (e) => play('land', at(e.x, e.y, e.z, { gain: Math.min(1, 0.5 + e.fallSpeed / 10) })));
  world.events.on('dive', (e) => play('dive', at(e.x, e.y, e.z)));
  world.events.on('standUp', (e) => play('cloth', at(e.x, e.y, e.z)));
  world.events.on('punch', (e) => {
    play(e.kind === 'light' ? 'whooshLight' : 'whooshHeavy', at(e.x, e.y, e.z));
    // non-verbal effort from grunts, not on every swing
    if (isEnemy(e.actorId) && Math.random() < 0.35) play('voxEffort', at(e.x, e.y, e.z));
  });
  world.events.on('hit', (e) => {
    lastHitCombo = e.combo;
    lastHitChain = e.chain;
    if (e.kind === 'takedown') return;
    const p = at(e.x, e.y, e.z);
    if (e.damage <= 0) {
      if (e.kind !== 'head') play('impact', { ...p, gain: 0.5 }); // punching a corpse
      return;
    }
    // blades cut (and knives thunk in); blunt weapons hit like heavy punches
    if (BLADE.includes(e.kind)) play('slash', p);
    if (e.kind === 'knife' || e.kind === 'stab') play('knifeFlesh', p);
    if (e.kind === 'blast') return; // the explosion itself carries it
    // punch = whoosh (on the swing) + flesh impact + low thump; heavy hits add a bone crack
    const heavy = HEAVY.includes(e.kind) || e.damage >= 2;
    play(heavy ? 'impactHeavy' : 'impact', { ...p, gain: e.combo ? 1.2 : 1 });
    if (heavy) play('crack', p);
    if (isEnemy(e.actorId) && !e.killed && Math.random() < 0.5) play('voxHurt', p);
  });
  world.events.on('kill', (e) => {
    if (!isEnemy(e.actorId)) return;
    // takedowns are silent (melee-stealth-kill)
    if (e.kind !== 'takedown') play('voxDeath', at(e.x, e.y + 0.7, e.z));
    // kill counter tick, pitched up for combo kills
    play('tick', { rate: lastHitChain >= 3 ? 1.5 : lastHitCombo ? 1.35 : 1 });
  });
  world.events.on('bodyFall', (e) => play('bodyFall', at(e.x, e.y, e.z, { gain: Math.min(1, 0.4 + e.speed / 8) })));
  world.events.on('wallHit', (e) => e.speed > 1.5 && play('wall', at(e.x, e.y, e.z, { gain: Math.min(1, e.speed / 6) })));
  world.events.on('grab', (e) => play('grab', at(e.x, e.y, e.z)));
  world.events.on('throw', (e) => play('whooshThrow', at(e.x, e.y, e.z)));
  world.events.on('heal', () => play('heal', {}));
  // guns (M5)
  const SHOT: Record<WeaponId, SoundId> = {
    pistol: 'shotPistol', pistolSuppressed: 'shotSuppressed', deagle: 'shotDeagle', smg: 'shotSmg',
    rifle: 'shotRifle', mg: 'shotMg', shotgun: 'shotShotgun', sawedoff: 'shotShotgun',
  };
  world.events.on('shot', (e) => {
    const p = at(e.x, e.y + 0.5, e.z);
    play(SHOT[e.weapon], p);
    // the casing lands a moment later; the pump shotgun racks after its shot
    play('casing', { ...p, delay: 0.3 + Math.random() * 0.15 });
    if (e.weapon === 'shotgun') play('slideRack', { ...p, delay: 0.3 });
    for (const r of e.rays) {
      if (!r.impact || r.surface === 'flesh' || r.surface === 'sky') continue;
      const q = at(r.impact.x, r.impact.y, r.impact.z, { gain: 0.6 / Math.max(1, e.rays.length / 2) });
      play(r.surface === 'prop' ? 'hitWood' : world.room.outdoor && r.surface === 'floor' ? 'stepDirt' : 'hitConcrete', q);
    }
  });
  world.events.on('dryFire', (e) => play('dryFire', at(e.x, e.y + 0.5, e.z)));
  // M14: the agent's block (a dry knock), a round deflected off a sword guard, a parry's ring
  world.events.on('block', (e) => {
    if (e.how === 'deflect') play('ricochet', at(e.x, e.y, e.z));
    else if (e.how === 'parry') { play('parry', at(e.x, e.y, e.z)); play('clang', at(e.x, e.y, e.z)); }
    else play('block', at(e.x, e.y, e.z));
  });
  // M14 gun-fire-mode: the selector's click
  world.events.on('fireMode', (e) => play('selector', at(e.x, e.y + 0.5, e.z)));
  world.events.on('reload', (e) => {
    const p = at(e.x, e.y + 0.5, e.z);
    if (e.phase === 'start') play('magOut', p);
    else { play('magOut', { ...p, rate: 1.25 }); play('slideRack', { ...p, delay: 0.08 }); }
  });
  // M17: a hand swap (F with a gun in front) is a cloth rustle and a clack; walking over a gun is softer
  world.events.on('handSwap', (e) => { play('cloth', at(e.x, e.y + 0.5, e.z, { gain: 0.6 })); play('magOut', at(e.x, e.y + 0.5, e.z, { rate: 1.6, gain: 0.4, delay: 0.05 })); });
  world.events.on('pickup', (e) => {
    play('grab', at(e.x, e.y + 0.4, e.z, e.auto ? { gain: 0.6 } : {}));
    // M8: the boombox's play button clicks; guns latch
    if (e.item === 'boombox') play('tick', at(e.x, e.y + 0.4, e.z, { rate: 0.7, gain: 0.8, delay: 0.15 }));
    else play('magOut', at(e.x, e.y + 0.4, e.z, { rate: 1.4, gain: 0.5 }));
  });
  // M6
  world.events.on('explosion', (e) => {
    play('explosion', at(e.x, Math.max(0.3, e.y), e.z));
    engine.duck(0.4);
  });
  world.events.on('grenadePin', (e) => { play('pin', at(e.x, e.y, e.z)); play('fuse', at(e.x, e.y, e.z)); });
  world.events.on('grenadeBounce', (e) => play('bounce', at(e.x, e.y, e.z)));
  world.events.on('stick', (e) => play(e.surface === 'flesh' ? 'knifeFlesh' : 'knifeWall', at(e.x, e.y, e.z)));
  world.events.on('pull', (e) => play(e.phase === 'start' ? 'cloth' : 'pullOut', at(e.x, e.y + 0.4, e.z)));
  world.events.on('catch', (e) => play('catchSlap', at(e.x, e.y, e.z)));
  // M10b combos & fatalities: launch whoosh, spike thud + crack, wall-bounce bump, the popped
  // weapon's spin, a gun clonking off a skull, and a higher kill tick for every fatality
  world.events.on('juggle', (e) => {
    if (e.phase === 'launch') play('whooshHeavy', at(e.x, e.y + 0.6, e.z, { rate: 0.9 }));
    else if (e.phase === 'spike') play('whooshHeavy', at(e.x, e.y + 0.6, e.z, { rate: 0.75 }));
    else if (e.phase === 'bounce') { play('heavyLand', at(e.x, e.y, e.z, { gain: 0.8 })); play('crack', at(e.x, e.y, e.z)); }
  });
  world.events.on('wallBounce', (e) => play('thump', at(e.x, e.y + 0.5, e.z, { rate: 0.85 })));
  world.events.on('popUp', (e) => play('whooshLight', at(e.x, e.y, e.z, { rate: 1.3 })));
  world.events.on('hit', (e) => { if (e.kind === 'gun' && e.part === 'head') play('hitMetal', at(e.x, e.y, e.z)); });
  // M18 co-op moves (design/coop-moves.md): a team chain pings, the double-team tings, bats crack,
  // a body bouncing off a partner thumps, the wishbone strains and tears, lifts and tosses whoosh
  world.events.on('coopMove', (e) => {
    const p = at(e.x, e.y + 0.5, e.z);
    if (e.kind === 'chain') play('tick', { rate: 2.0, gain: 0.7 });
    else if (e.kind === 'double') { play('tick', { rate: 2.6 }); play('clang', { ...p, rate: 1.6, gain: 0.5 }); }
    else if (e.kind === 'bat') { play('crack', p); play('whooshHeavy', { ...p, delay: 0.03 }); }
    else if (e.kind === 'pingpong') { play('thump', p); play('cloth', { ...p, gain: 0.7 }); }
    else if (e.kind === 'wishbone') { if (e.phase === 'start') { play('wireStrain', p); play('voxEffort', p); } else { play('slash', { ...p, rate: 0.7 }); play('impactHeavy', p); } }
    else if (e.kind === 'pass') play('whooshLight', { ...p, gain: 0.6 });
    else if (e.kind === 'lift') play(e.phase === 'start' ? 'voxEffort' : 'land', p);
    else if (e.kind === 'toss') { play('whooshThrow', { ...p, rate: 0.8 }); play('voxEffort', p); }
    else if (e.kind === 'spin') play(e.phase === 'hit' ? 'impactHeavy' : 'whooshHeavy', p);
    else if (e.kind === 'held' && e.phase === 'end') play('voxEffort', p);
  });
  world.events.on('fatality', (e) => {
    if (e.kind === 'punt') play('whooshThrow', at(e.x, e.y, e.z, { rate: 1.2 }));
    play('tick', { rate: 1.7 });
  });
  world.events.on('disarm', (e) => {
    const p = at(e.x, e.y + 0.5, e.z);
    if (e.how === 'shot') play('hitMetal', p);
    else if (e.how === 'steal') play('grab', p);
    // the weapon clatters away
    play('hitMetal', { ...p, gain: 0.5, delay: 0.35 });
  });
  world.events.on('pin', (e) => { play('clang', at(e.x, e.y + 0.5, e.z)); play('wall', at(e.x, e.y + 0.5, e.z)); });
  world.events.on('gib', (e) => play('bodyFall', at(e.x, e.y, e.z, { gain: 0.8, rate: 1.3 })));
  // M7
  world.events.on('aimStart', (e) => play('telegraph', at(e.x, e.y + 0.6, e.z)));
  world.events.on('alert', (e) => play('alert', at(e.x, e.y + 1, e.z)));
  world.events.on('takedown', (e) => {
    const p = at(e.x, e.y + 0.6, e.z);
    if (e.phase === 'start') { play('grab', p); if (e.how === 'wire') play('wireStrain', p); }
    // the kill itself stays quiet: a muffled thunk, no voice
    else if (e.how === 'knife') play('knifeFlesh', { ...p, gain: 0.6 });
  });
  world.events.on('tableFlip', (e) => play('whooshHeavy', at(e.x, 0.4, e.z)));
  world.events.on('tableLand', (e) => play('woodCrash', at(e.x, 0.3, e.z)));
  world.events.on('zombieRise', (e) => play(e.phase === 'start' ? 'bodyFall' : 'moan', at(e.x, e.y + 0.5, e.z, e.phase === 'start' ? { gain: 0.4, rate: 0.7 } : {})));
  world.events.on('zombieHeadless', (e) => play('pullOut', at(e.x, e.y + 0.8, e.z)));
  let lastWhistle = -Infinity;
  world.events.on('squadCharge', (e) => {
    if (world.time - lastWhistle < 1) return;
    lastWhistle = world.time;
    play('whistle', at(e.x, e.y + 0.8, e.z));
  });
  // zombies moan now and then while they shuffle
  world.events.on('tick', () => {
    for (const a of world.actors) {
      if (a.kind !== 'zombie' || a.state === 'dead' || a.state === 'rising' || Math.random() > world.dt / 4) continue;
      play('moan', at(a.pos.x, a.pos.y + 0.8, a.pos.z));
    }
  });
  // M12: the walls, the duel, the vending machine, the stab, the last stand's heartbeat
  let heart: number | undefined;
  world.events.on('wallDrop', (e) => {
    const r = world.room, x = e.side === 'right' ? r.halfWidth : e.side === 'left' ? -r.halfWidth : 0;
    if (e.phase === 'shadow') play('fallWhistle', at(x, 3, e.side === 'back' ? r.zBack : 9.2));
    else { play('heavyLand', at(x, 0.5, 9.2)); play('wall', at(x, 0.5, 9.2)); engine.duck(0.3); }
  });
  world.events.on('swordDive', (e) => play(e.phase === 'windup' ? 'crackle' : e.phase === 'dive' ? 'whooshHeavy' : 'slash', at(e.x, e.y + 0.6, e.z)));
  world.events.on('teleport', (e) => play('implode', at(e.x, e.y + 0.7, e.z)));
  world.events.on('wallBlast', (e) => { play('explosion', at(e.x, e.y, e.z, { gain: 0.8 })); play('wall', at(e.x, e.y, e.z)); });
  // M14: the door bursting in (wood + a heavy hit), the slab slapping down
  world.events.on('doorSmash', (e) => { play('hitWood', at(e.x, e.y, e.z)); play('impactHeavy', at(e.x, e.y, e.z)); });
  world.events.on('slabLand', (e) => play('hitWood', at(e.x, e.y, e.z)));
  // M14: the machine going over: a heavy crash after the glass
  world.events.on('propToppled', (e) => play('impactHeavy', at(e.x, e.y + 0.3, e.z, { delay: 0.12 })));
  world.events.on('vendingSmash', (e) => { play('glass', at(e.x, e.y + 0.8, e.z)); play('hitMetal', at(e.x, e.y + 0.5, e.z, { delay: 0.15 })); });
  world.events.on('stab', (e) => { play('knifeFlesh', at(e.x, e.y + 0.6, e.z)); play('stinger', {}); });
  world.events.on('bloodFlood', (e) => play('pullOut', at(e.x, 0.1, e.z, { rate: 0.6, gain: 0.6 })));
  world.events.on('lastStand', (e) => {
    if (e.phase === 'start') heart = engine.play('heartbeat', {});
    else if (heart !== undefined) { engine.stop(heart, 1.5); heart = undefined; }
  });
  world.events.on('roomChanged', () => { if (heart !== undefined) { engine.stop(heart, 0.2); heart = undefined; } });
  // M11: improbability (a boing on every bounce, the tape wobble), the jetpack, the collapse, the tank
  let burner: number | undefined;
  world.events.on('improbability', (e) => engine.setWobble(e.on));
  world.events.on('wallHit', (e) => { if (world.physics === 'improbable') play('boing', at(e.x, e.y + 0.5, e.z)); });
  world.events.on('flyIn', (e) => play('whooshThrow', at(e.x, e.y + 0.5, e.z)));
  world.events.on('ceilingStick', (e) => { play('wall', at(e.x, e.y + 0.8, e.z)); play('boing', at(e.x, e.y + 0.8, e.z, { rate: 0.6 })); });
  world.events.on('jetpack', (e) => {
    if (e.phase === 'up') burner = engine.play('burner', at(e.x, 1.2, e.z));
    else if (e.phase === 'away') { if (burner !== undefined) engine.stop(burner, 0.6); burner = undefined; }
    else play('door', at(e.x, 1, e.z));
  });
  world.events.on('shove', (e) => {
    // M14: a crowd grunt's shove is only a scuffle of cloth
    if (e.soft) { play('cloth', at(e.x, e.y + 0.6, e.z)); return; }
    play('whooshHeavy', at(e.x, e.y + 0.6, e.z)); play('impactHeavy', at(e.x, e.y + 0.6, e.z));
  });
  world.events.on('collapse', (e) => {
    if (e.phase === 'crack') { play('crack', { gain: 1 }); play('rumble', {}); }
    else { play('rumble', { gain: 1.2 }); play('explosion', { gain: 0.6, rate: 0.6 }); engine.duck(0.5); }
  });
  world.events.on('fellIntoVoid', (e) => play('voxDeath', at(e.x, e.y + 0.7, e.z, { rate: 1.2 })));
  world.events.on('blockDrop', (e) => {
    if (e.phase === 'shadow') play('fallWhistle', at(e.x, 3, e.z));
    else { play('heavyLand', at(e.x, 0.5, e.z)); play('explosion', at(e.x, 0.5, e.z, { gain: 0.7, rate: 0.8 })); engine.duck(0.4); }
  });
  world.events.on('bruteWake', (e) => { play('clang', at(e.x, 1, e.z)); play('thump', at(e.x, 0.3, e.z, { delay: 0.2 })); });
  world.events.on('cameraTurn', (e) => play('tick', at(e.x, e.y, e.z, { rate: 0.7 })));
  world.events.on('roomChanged', () => { if (burner !== undefined) { engine.stop(burner, 0.2); burner = undefined; } });
  // M10: the elevator (motor while it climbs), the welder's cutter, the cables, the ending
  let motor: number | undefined, cutter: number | undefined;
  const stopLoop = (v: number | undefined) => { if (v !== undefined) engine.stop(v, 0.25); return undefined; };
  world.events.on('elevator', (e) => {
    if (e.phase === 'start') motor = engine.play('motor', { gain: 1 });
    else motor = stopLoop(motor);
    if (e.phase === 'stop') play('ding', {});
    if (e.phase === 'fall') play('fallWhistle', { gain: 1.2, rate: 0.8 });
    if (e.phase === 'crash') { play('explosion', { gain: 0.8, rate: 0.7 }); play('heavyLand', {}); engine.duck(0.6); }
  });
  world.events.on('weld', (e) => {
    if (e.phase === 'start') cutter = engine.play('cutter', at(e.x, e.y + 0.2, e.z));
    else cutter = stopLoop(cutter);
  });
  world.events.on('roomChanged', () => { motor = stopLoop(motor); cutter = stopLoop(cutter); });
  world.events.on('roofLanding', (e) => { play('thump', at(e.x - 0.6, e.y, e.z)); play('thump', at(e.x + 0.6, e.y, e.z, { delay: 0.25 })); });
  world.events.on('slotCut', (e) => play('clang', at(e.x, e.y, e.z, { gain: 0.6 })));
  world.events.on('cableHit', (e) => play(e.broke ? 'cableSnap' : 'hitMetal', at(e.x, e.y, e.z)));
  world.events.on('hatch', (e) => { play('rungs', at(e.x, 1.2, e.z)); play('cloth', at(e.x, 1.5, e.z)); });
  world.events.on('speech', (e) => play('tick', at(e.x, e.y + 1.4, e.z, { rate: e.icon === 'photo' ? 0.8 : 1.3 })));
  world.events.on('knockout', (e) => play('impactHeavy', at(e.x, e.y + 0.8, e.z)));
  world.events.on('holdUp', (e) => play('voxHurt', at(e.x, e.y + 0.8, e.z, { rate: 1.2 })));
  world.events.on('surrender', (e) => { play('voxHurt', at(e.x, e.y + 0.8, e.z, { rate: 1.25 })); play('hitMetal', at(e.x, 0.4, e.z, { delay: 0.3 })); });
  world.events.on('dazed', (e) => play('tick', at(e.x, e.y + 0.6, e.z, { rate: 1.6 })));
  world.events.on('bossShot', (e) => { play('shotDeagle', at(e.x, e.y + 0.8, e.z)); play('stinger', { delay: 0.05 }); engine.duck(1.5); });
  // M9: room transitions, the boss's stage 2 cameo
  world.events.on('roomTransition', (e) => { if (e.phase === 'out') play('wipe', {}); });
  world.events.on('exitTaken', (e) => {
    const p = world.player;
    if (!p) return;
    if (e.kind === 'ladder' || e.kind === 'climb') { play('rungs', at(p.pos.x, 0.5, p.pos.z)); play('rungs', at(p.pos.x, 1, p.pos.z, { delay: 0.25 })); }
    else if (e.kind === 'vent') play('hitMetal', at(p.pos.x, 2, p.pos.z));
  });
  // co-op exits: going on ahead, the boost under a ceiling vent
  world.events.on('coopExit', (e) => {
    if (e.phase === 'ahead') {
      if (e.kind === 'ladder' || e.kind === 'climb') { play('rungs', at(e.x, 0.5, e.z)); play('rungs', at(e.x, 1, e.z, { delay: 0.25 })); }
      else if (e.kind === 'vent') play('hitMetal', at(e.x, 0.3, e.z));
      else play('cloth', at(e.x, 1, e.z));
    } else if (e.phase === 'brace' || e.phase === 'unbrace') play('cloth', at(e.x, 0.8, e.z));
    else if (e.phase === 'boost') { play('grab', at(e.x, 0.6, e.z)); play('whooshLight', at(e.x, 1.5, e.z)); play('hitMetal', at(e.x, 2.6, e.z, { delay: 0.25 })); }
    else { play('catchSlap', at(e.x, 2.4, e.z)); play('voxEffort', at(e.x, 1.6, e.z, { delay: 0.3 })); }
  });
  world.events.on('roomEnter', () => {
    const p = world.player;
    if (p && p.pos.y > 1) play('cloth', at(p.pos.x, p.pos.y, p.pos.z));
  });
  world.events.on('bossFling', (e) => { play('telekinesis', at(e.x, e.y + 0.7, e.z)); play('whooshHeavy', at(e.x, e.y + 0.7, e.z, { rate: 0.7 })); });
  world.events.on('massRaise', (e) => { play('crackle', at(e.x, e.y + 1.2, e.z)); play('thunder', at(e.x, e.y + 1.5, e.z, { gain: 0.7 })); play('moan', at(e.x, 0.8, e.z, { delay: 0.6 })); });
  world.events.on('targetFled', (e) => play('door', at(e.x, 1, e.z)));
  // M8: the stage-1 boss
  world.events.on('bossArrive', (e) => { if (e.phase === 'descend') play('rumble', at(e.x, 1, e.z)); });
  world.events.on('bossCast', (e) => play('crackle', at(e.x, e.y + 1.2, e.z)));
  world.events.on('lightning', (e) => { play('thunder', at(e.to.x, e.to.y, e.to.z)); engine.duck(0.3); });
  world.events.on('ward', (e) => { if (e.up) play('wardHum', at(e.x, e.y + 0.7, e.z)); });
  world.events.on('bossDash', (e) => play(e.phase === 'go' ? 'whooshThrow' : 'cloth', at(e.x, e.y + 0.6, e.z, e.phase === 'go' ? { rate: 0.8 } : { gain: 0.6 })));
  world.events.on('bossSlam', (e) => { const p = at(e.x, e.y, e.z); play('impactHeavy', p); play('crack', { ...p, gain: 0.7 }); });
  world.events.on('bossSweep', (e) => { if (e.phase === 'push') { play('telekinesis', at(e.x, e.y + 0.7, e.z)); if (e.count > 0) play('bodyFall', at(e.x + e.dir * 2, 0, e.z, { gain: 0.6, rate: 0.8 })); } });
  world.events.on('cannonDrop', (e) => {
    if (e.phase === 'shadow') play('fallWhistle', at(e.x, 2, e.z));
    else if (e.phase === 'land') { play('heavyLand', at(e.x, 0.3, e.z)); engine.duck(0.4); }
  });
  // the boss's cannon (the debug labs' cannon stays quiet, as before)
  world.events.on('cannonFire', (e) => { if (world.cannons.find((c) => c.x === e.x && c.z === e.z)?.live) { play('cannonBoom', at(e.x, 0.6, e.z)); engine.duck(0.25); } });
  world.events.on('wardHit', (e) => {
    const a = world.actorById(e.actorId);
    if (a) play('ricochet', at(a.pos.x + a.facing * 0.6, a.pos.y + 0.7, a.pos.z));
  });
  world.events.on('doorOpen', (e) => {
    const d = world.room.doors[e.door];
    if (d) play('door', at(d.wall === 'left' ? -world.room.halfWidth : world.room.halfWidth, 1, (d.z0 + d.z1) / 2));
  });
}
