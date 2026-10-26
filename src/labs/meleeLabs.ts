// M2 replica labs (research/mechanics/melee-*, move-knockdown-getup). Each recreates the
// setup of its reference clip. The clips are local-only (gitignored); compare against
// research/mechanics/<slug>/frames-N.jpg when they are on this machine.
import { TUNING } from '../data/tuning';
import { type Actor, createActor, type HeldItem } from '../sim/actor';
import { attackTiming } from '../sim/combat';
import { IDLE_COMMAND } from '../sim/command';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CONTROLS = 'LMB light · RMB heavy (aim up = uppercut) · F grab/throw · Ctrl dive · K +20 corpses · 2/3 blood on';

function hero(world: World, x: number, z: number): Actor {
  world.room = { ...world.room, props: [] };
  const a = createActor('hero', x, z, 1);
  world.actors.push(a);
  world.player = a;
  return a;
}

interface DummySpec { x: number; z: number; hp?: number; held?: HeldItem; facing?: 1 | -1 }

/** Dummies face the player and stand still. */
function dummy(world: World, s: DummySpec): Actor {
  const d = createActor('grunt', s.x, s.z, s.facing ?? -1, { held: s.held ?? null });
  if (s.hp) d.hp = d.maxHp = s.hp;
  d.brain = () => ({ ...IDLE_COMMAND, face: faceToward(world, d) });
  world.actors.push(d);
  return d;
}

function faceToward(world: World, a: Actor): 1 | -1 {
  const p = world.player;
  return !p || p.pos.x >= a.pos.x ? 1 : -1;
}

/**
 * When every dummy of the wave is dead, a new wave stands up after `delay` s at the same
 * spots. The corpses stay, so bodies pile up as in the episodes.
 */
function respawner(specs: DummySpec[], delay = 1.5) {
  let wave: Actor[] = [];
  let clearedAt = -1;
  return {
    setup(world: World) {
      wave = specs.map((s) => dummy(world, s));
      clearedAt = -1;
    },
    step(world: World) {
      if (wave.some((d) => d.state !== 'dead')) return;
      if (clearedAt < 0) clearedAt = world.time;
      if (world.time - clearedAt < delay) return;
      wave = specs.map((s) => dummy(world, s));
      clearedAt = -1;
    },
  };
}

/** Keeps the player alive in labs that are about being hit. */
function healPlayer(world: World): void {
  const p = world.player;
  if (p && p.state === 'free' && p.hp < p.maxHp) p.hp = p.maxHp;
}

{
  const r = respawner([{ x: 0.2, z: 9.2 }, { x: 1.4, z: 9.6 }, { x: 1.0, z: 8.6 }]);
  registerLab({
    slug: 'melee-punch-knockback',
    title: `Punch grunts at arm's length (0.5-0.6 H, depth band 0.2 H): heavy kills and throws the body ~1.5 H, 2 lights kill (ep1 0:21-0:43). ${CONTROLS}`,
    setup(world) {
      hero(world, -1.4, 9.2);
      r.setup(world);
    },
    step: r.step,
  });
}

{
  // move-knockdown-getup clip-1: a grunt lands a heavy punch, the hero flies, lies, gets up
  let hitAt = -1, upAfter = -1;
  registerLab({
    slug: 'move-knockdown-getup',
    title: `Get knocked down by a boxer dummy (heavy punch every 2 s in range): ~1.5 H back, 0.37 s air, 0.2 s skid, 0.2 s lie, 0.4 s get-up with i-frames (ep1 f519-f554). ${CONTROLS}`,
    setup(world) {
      hitAt = upAfter = -1;
      const p = hero(world, -0.2, 9.2);
      const boxer = createActor('grunt', 0.35, 9.2, -1);
      boxer.hp = boxer.maxHp = 99;
      let next = 1.0;
      boxer.brain = (a, dt) => {
        next -= dt;
        const inRange = Math.abs(p.pos.x - a.pos.x) < TUNING.melee.range && Math.abs(p.pos.z - a.pos.z) < TUNING.melee.depthBand;
        const swing = next <= 0 && inRange && a.state === 'free';
        if (swing) next = 2.0;
        return { ...IDLE_COMMAND, face: faceToward(world, a), attack: swing ? 'heavy' : null };
      };
      world.actors.push(boxer);
      world.events.on('hit', (e) => {
        if (e.actorId === p.id && e.kind === 'heavy') { hitAt = world.time; upAfter = -1; }
      });
    },
    step(world) {
      const p = world.player!;
      if (hitAt >= 0 && upAfter < 0 && p.state === 'free') upAfter = world.time - hitAt;
      healPlayer(world);
    },
    info: () => (upAfter >= 0 ? `hit -> controllable ${upAfter.toFixed(2)} s (measured ~1.1-1.17 s)` : hitAt >= 0 ? 'down...' : 'walk into range'),
  });
}

{
  const r = respawner([{ x: 0.0, z: 9.2, hp: TUNING.health.tough }, { x: 1.6, z: 9.2, hp: TUNING.health.tough }]);
  registerLab({
    slug: 'melee-hitstun-finisher',
    title: `Tough dummies (hp ${TUNING.health.tough}): light = 0.7 s stun, heavy = knockdown, punch the downed body = finisher (ep1 f1116-f1200). ${CONTROLS}`,
    setup(world) {
      hero(world, -1.2, 9.2);
      r.setup(world);
    },
    step: r.step,
    info: (world) => world.actors.filter((a) => a.kind === 'grunt').map((a) => `${a.state}${a.state === 'stun' ? ` ${a.stateT.toFixed(2)}s` : ''} hp ${a.hp}`).join(' | '),
  });
}

{
  const r = respawner([{ x: -1.3, z: 9.2 }, { x: 1.2, z: 9.2 }, { x: 2.0, z: 9.7 }, { x: 1.6, z: 8.6 }, { x: 2.8, z: 9.2 }], 2);
  registerLab({
    slug: 'melee-grab-throw',
    title: `Grab (F) at contact range, throw (F) toward the cursor: a thrown body knocks down whoever it hits and dies on a fast wall impact. Corpses too (ep1 0:24, ep2 1:12). ${CONTROLS}`,
    setup(world) {
      hero(world, -2.0, 9.2);
      r.setup(world);
      world.spawnCorpses(3);
    },
    step: r.step,
  });
}

{
  const r = respawner([{ x: 0.0, z: 9.2, held: 'baton', hp: TUNING.health.tough }, { x: 1.8, z: 9.2, held: 'pistol' }], 2);
  registerLab({
    slug: 'melee-low-sweep',
    title: `Run at a grunt and dive (Ctrl) next to him: feet-first sweep, ~1 H knockback, he drops what he holds (ep1 f585-f625). ${CONTROLS}`,
    setup(world) {
      hero(world, -1.6, 9.2);
      r.setup(world);
    },
    step: r.step,
    info: (world) => `items on the floor ${world.items.length}`,
  });
}

{
  const r = respawner([{ x: 0.0, z: 9.2 }, { x: 1.4, z: 9.5 }, { x: 1.1, z: 8.7 }]);
  const light = attackTiming('light');
  registerLab({
    slug: 'melee-decapitation',
    title: `Light punch (stun), then a heavy to the head within ${(TUNING.hit.stun + light.recovery).toFixed(1)} s: the head flies off. Grab it (F) and throw it: it staggers, no kill (ep1 0:52, 1:03). ${CONTROLS}`,
    setup(world) {
      hero(world, -1.2, 9.2);
      r.setup(world);
    },
    step: r.step,
    info: (world) => `heads ${world.items.filter((i) => i.kind === 'head').length}`,
  });
}
