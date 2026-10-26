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
    play('voxDeath', at(e.x, e.y + 0.7, e.z));
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
  world.events.on('doorOpen', (e) => {
    const d = world.room.doors[e.door];
    if (d) play('door', at(d.wall === 'left' ? -world.room.halfWidth : world.room.halfWidth, 1, (d.z0 + d.z1) / 2));
  });
}
