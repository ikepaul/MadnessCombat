// Sim events -> sounds (PLAN.md M4: hook all M1-M3 events). The sim never calls audio; this
// subscribes to a world's events. Layering follows design/audio-direction.md.
import { type SoundId } from '../data/audio';
import { project } from '../render/camera';
import type { HitKind } from '../sim/events';
import type { World } from '../sim/world';
import type { AudioEngine, PlayOptions } from './mixer';

const HEAVY: HitKind[] = ['heavy', 'uppercut', 'finisher', 'sweep', 'body', 'wall'];

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
  world.events.on('doorOpen', (e) => {
    const d = world.room.doors[e.door];
    if (d) play('door', at(d.wall === 'left' ? -world.room.halfWidth : world.room.halfWidth, 1, (d.z0 + d.z1) / 2));
  });
}
