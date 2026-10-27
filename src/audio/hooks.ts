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

  world.events.on('footstep', (e) => play(world.room.outdoor ? 'stepDirt' : 'stepConcrete', at(e.x, e.y, e.z, { gain: e.actorId === world.player?.id ? 1 : 0.6 })));
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
    play('tick', { rate: lastHitCombo ? 1.35 : 1 });
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
  world.events.on('reload', (e) => {
    const p = at(e.x, e.y + 0.5, e.z);
    if (e.phase === 'start') play('magOut', p);
    else { play('magOut', { ...p, rate: 1.25 }); play('slideRack', { ...p, delay: 0.08 }); }
  });
  world.events.on('pickup', (e) => { play('grab', at(e.x, e.y + 0.4, e.z)); play('magOut', at(e.x, e.y + 0.4, e.z, { rate: 1.4, gain: 0.5 })); });
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
  // M8: the stage-1 boss
  world.events.on('bossArrive', (e) => { if (e.phase === 'descend') play('rumble', at(e.x, 1, e.z)); });
  world.events.on('bossCast', (e) => play('crackle', at(e.x, e.y + 1.2, e.z)));
  world.events.on('lightning', (e) => { play('thunder', at(e.to.x, e.to.y, e.to.z)); engine.duck(0.3); });
  world.events.on('ward', (e) => { if (e.up) play('wardHum', at(e.x, e.y + 0.7, e.z)); });
  world.events.on('bossDash', (e) => play(e.phase === 'go' ? 'whooshThrow' : 'cloth', at(e.x, e.y + 0.6, e.z, e.phase === 'go' ? { rate: 0.8 } : { gain: 0.6 })));
  world.events.on('bossSlam', (e) => { const p = at(e.x, e.y, e.z); play('impactHeavy', p); play('crack', { ...p, gain: 0.7 }); });
  world.events.on('wardHit', (e) => {
    const a = world.actorById(e.actorId);
    if (a) play('ricochet', at(a.pos.x + a.facing * 0.6, a.pos.y + 0.7, a.pos.z));
  });
  world.events.on('doorOpen', (e) => {
    const d = world.room.doors[e.door];
    if (d) play('door', at(d.wall === 'left' ? -world.room.halfWidth : world.room.halfWidth, 1, (d.z0 + d.z1) / 2));
  });
}
