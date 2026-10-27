// M6 replica labs (research/mechanics/throw-*, combat-*, melee-weapons, melee-environment-weapon,
// move-jump-onto-object). The reference clips are local-only; compare against
// research/mechanics/<slug>/frames-N.jpg when they are on this machine.
import { GRENADE } from '../data/melee';
import { WEAPONS } from '../data/weapons';
import { project } from '../render/camera';
import { type Actor, alive, type Brain, newHand } from '../sim/actor';
import { newAiState } from '../sim/ai';
import { IDLE_COMMAND } from '../sim/command';
import type { ItemKind } from '../sim/items';
import type { World } from '../sim/world';
import { type DummySpec, dummy, hero, respawner } from './meleeLabs';
import { registerLab } from './registry';

const CONTROLS = 'LMB / RMB use each hand · E pick up / pull out · Q throw · F grab / catch · G hold to cook, release to lob · 2/3 blood on';

/** Dummies that count as enemies (split aim, combat walk). */
function enemies(specs: DummySpec[], delay = 1.5) {
  const r = respawner(specs, delay);
  const mark = (world: World) => { for (const a of world.actors) if (a.kind === 'grunt' && !a.ai) a.ai = newAiState(world); };
  return {
    setup(world: World) { r.setup(world); mark(world); },
    step(world: World) { r.step(world); mark(world); },
  };
}

/** An item lying on the floor. */
function floorItem(world: World, kind: ItemKind, x: number, z: number): void {
  const it = world.spawnItem(kind, 'grunt', { x, y: 0, z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  if (kind in WEAPONS) { it.ammo = WEAPONS[kind as keyof typeof WEAPONS].mag; it.spare = 1; }
}

/** Keeps the player alive in labs about being shot at or thrown at. */
function healPlayer(world: World): void {
  const p = world.player;
  if (p && p.state === 'free' && p.hp < p.maxHp) p.hp = p.maxHp;
}

const faceToPlayer = (world: World, a: Actor): 1 | -1 => ((world.player?.pos.x ?? 0) >= a.pos.x ? 1 : -1);

{
  const e = enemies([{ x: 0.4, z: 9.2 }, { x: 2.2, z: 9.2 }, { x: 2.9, z: 9.9 }, { x: 1.6, z: 8.6 }]);
  registerLab({
    slug: 'throw-knives',
    title: `Two knives: LMB / RMB stabs up close (<= 0.6 H) and throws at range (13 H/s, slight drop, one-hit kill). They stick in bodies and walls: E (or stand on one with empty hands) pulls it out in 0.5 s (ep3 f712-f950). ${CONTROLS}`,
    setup(world) {
      const h = hero(world, -2.2, 9.2);
      h.hands = [newHand('knife'), newHand('knife')];
      e.setup(world);
    },
    step: e.step,
    info: (world) => `stuck blades ${world.items.filter((i) => i.state === 'stuck').length}`,
  });
}

{
  const e = enemies([{ x: 1.2, z: 9.2 }, { x: 1.7, z: 9.5 }, { x: 1.5, z: 8.8 }, { x: 2.8, z: 9.6 }], 2.5);
  registerLab({
    slug: 'throw-grenade',
    title: `Hold G to pull the pin and cook (the pin drops), release to lob it to the floor point under the cursor (max 7 H for you, 4 H for enemies). Fuse 2.5 s from the pin (raised in the playtest so you can throw theirs back), blast 2 H: kills, gibs corpses close by (can't be raised), throws bodies ~1.5 H up, leaves a scorch (ep1 f1340-f1416). Cook too long and it goes off in your hand. ${CONTROLS}`,
    setup(world) {
      hero(world, -2.4, 9.2);
      e.setup(world);
      world.spawnCorpses(5);
    },
    step(world) {
      e.step(world);
      const p = world.player!;
      if (p.grenades < 3) p.grenades = 3;
      healPlayer(world);
    },
    info: (world) => {
      const c = world.actors.filter((a) => a.corpse);
      return `grenades ${world.player?.grenades ?? 0} · corpses ${c.length}, gibbed ${c.filter((a) => a.corpse?.gibbed).length}, raisable ${c.filter((a) => a.corpse?.raisable && !a.corpse.gibbed).length}`;
    },
  });
}

{
  // throw-grenade-return: grenades dropped from "the roof" land next to you; pick up and throw back
  const e = enemies([{ x: 2.2, z: 9.2 }, { x: 2.8, z: 9.7 }, { x: 2.5, z: 8.6 }], 2);
  let next = 2;
  registerLab({
    slug: 'throw-grenade-return',
    title: `A live grenade drops next to you every 4 s (1.3 s fuse, measured ep2 f4590-f4629; blinking = live). F picks it up with the fuse still running, F / LMB throws it back to the cursor (ep2 2:31). ${CONTROLS}`,
    setup(world) {
      next = 2;
      hero(world, -1.4, 9.2);
      e.setup(world);
    },
    step(world) {
      e.step(world);
      healPlayer(world);
      next -= world.dt;
      const p = world.player!;
      if (next > 0 || !alive(p)) return;
      next = 4;
      const side = world.rng() < 0.5 ? -1 : 1;
      const it = world.spawnItem('grenade', 'grunt', { x: p.pos.x + side * 0.5, y: 2.4, z: p.pos.z + (world.rng() - 0.5) * 0.2 }, { x: 0, y: 0, z: 0 }, 5);
      it.live = true;
      it.fuse = 1.3;
    },
    info: (world) => {
      const g = world.items.find((i) => i.kind === 'grenade' && i.live);
      return g ? `fuse ${Math.max(0, g.fuse ?? 0).toFixed(2)} s${g.state === 'held' ? ' (held)' : ''}` : 'waiting for the next grenade';
    },
  });
}

/** A dummy that throws a knife at the player every `every` s (the lab hands it a new one). */
function knifeThrower(world: World, x: number, z: number, every: number): Actor {
  const d = dummy(world, { x, z, held: 'knife' });
  d.ai = newAiState(world);
  let next = 1.5;
  const brain: Brain = (a, dt) => {
    next -= dt;
    const p = world.player;
    const face = faceToPlayer(world, a);
    if (!p || next > 0 || a.state !== 'free' || !a.hands[0]) return { ...IDLE_COMMAND, face };
    next = every;
    return { ...IDLE_COMMAND, face, attack: 'light', aim: project(p.pos.x, p.pos.y + 0.6, p.pos.z) };
  };
  d.brain = brain;
  return d;
}

{
  let thrower: Actor | undefined;
  let caught = 0;
  registerLab({
    slug: 'throw-catch-return',
    title: `A grunt throws a knife at you every 2.5 s. Press F with an empty hand just before it arrives (0.15 s window) to catch it, then LMB to throw it back (ep3 3:11). ${CONTROLS}`,
    setup(world) {
      caught = 0;
      hero(world, -1.8, 9.2);
      thrower = knifeThrower(world, 2.4, 9.2, 2.5);
      world.events.on('catch', (e) => { if (e.actorId === world.player?.id) caught++; });
    },
    step(world) {
      healPlayer(world);
      if (thrower && thrower.state === 'dead' && world.time % 3 < world.dt) thrower = knifeThrower(world, 2.4, 9.2, 2.5);
      if (thrower && alive(thrower) && thrower.state === 'free' && !thrower.hands[0] && !thrower.attack) thrower.hands[0] = newHand('knife');
    },
    info: () => `caught ${caught}`,
  });
}

{
  // combat-disarm: steal the rifle, knock weapons away, shoot one out of a hand
  const e = enemies([{ x: 0.4, z: 9.2, held: 'rifle' }, { x: 1.8, z: 9.2, held: 'pistol' }, { x: 2.6, z: 9.7, held: 'baton' }], 2);
  registerLab({
    slug: 'combat-disarm',
    title: `F on an armed grunt steals his weapon (0.4 s). Kicks/sweeps always knock weapons away, punches 30% of the time. With the pistol, a shot that crosses the weapon in a hand before the body knocks it away (ep2 1:54, 3:53; ep3 2:12). ${CONTROLS}`,
    setup(world) {
      hero(world, -1.4, 9.2);
      floorItem(world, 'pistol', -2.0, 8.7);
      e.setup(world);
      for (const a of world.actors) if (a.ai && a.hands[0]) a.pose.aimAt = { x: -5, y: 0.6, z: a.pos.z };
    },
    step(world) {
      e.step(world);
      // armed dummies point their guns at the player (they don't fire)
      const p = world.player;
      for (const a of world.actors) if (a.ai && a.hands[0] && p) a.pose.aimAt = { x: p.pos.x, y: p.pos.y + 0.6, z: p.pos.z };
    },
    info: (world) => `items on the floor ${world.items.filter((i) => i.state === 'floor').length}`,
  });
}

{
  // combat-human-shield: a machine gunner sprays; hold a grunt (or a corpse) in front of you
  let gunner: Actor | undefined;
  let absorbed = 0;
  const r = respawner([{ x: -0.6, z: 9.2 }, { x: -1.1, z: 9.5 }], 2);
  registerLab({
    slug: 'combat-human-shield',
    title: `A machine gunner fires a burst every 3 s. Grab a grunt (F) and hold him toward the gunner: the body takes the bullets (~30 before it falls apart), you walk at 0.6x and can fire the pistol in your back hand (RMB) (ep3 1:28). ${CONTROLS}`,
    setup(world) {
      absorbed = 0;
      const h = hero(world, -1.9, 9.2);
      h.hands = [null, newHand('pistol')];
      r.setup(world);
      gunner = dummy(world, { x: 2.9, z: 9.2, held: 'mg' });
      gunner.hp = gunner.maxHp = 99;
      let t = 0;
      gunner.brain = (a, dt) => {
        t += dt;
        const p = world.player;
        const burst = t % 3 > 1.6 && t % 3 < 2.8 && !!p;
        const aim = p ? project(p.pos.x, p.pos.y + 0.55, p.pos.z) : undefined;
        if (a.hands[0]) { a.hands[0].ammo = 100; a.hands[0].spare = 1; }
        return { ...IDLE_COMMAND, face: -1, aim, hold: [burst, false], press: [burst && t % 3 < 1.62, false] };
      };
      world.events.on('shieldHit', () => absorbed++);
    },
    step(world) {
      r.step(world);
      healPlayer(world);
    },
    info: () => `bullets absorbed ${absorbed}${gunner ? '' : ''}`,
  });
}

{
  // combat-cover: the table protects only what is behind it in depth
  const e = enemies([{ x: 1.9, z: 10.3 }, { x: 0.6, z: 8.6 }, { x: 2.9, z: 9.2 }]);
  registerLab({
    slug: 'combat-cover',
    title: `Cover: a waist-high prop stops a shot only if the shot crosses it on screen first AND it is in front of the target in depth. The grunt behind the table is safe from shots that cross the table; the one in front is not. Stand on the table (jump) to shoot over it (ep2 0:37, 3:27; ep3 0:39). ${CONTROLS}`,
    setup(world) {
      const h = hero(world, -2.2, 9.2, true);
      h.hands = [newHand('pistol'), null];
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies([{ x: 0.9, z: 9.2 }, { x: 1.8, z: 9.6 }, { x: 2.4, z: 8.8 }, { x: 3.0, z: 9.3 }], 1.5);
  registerLab({
    slug: 'melee-weapons',
    title: `Pick up (E) a baton, knife, sword, scimitar, axe, bat or pipe: LMB swings (reach 0.6-1.0 H, one-hit kill; blades can take the head), Q throws it (knives and axes stick) (ep2 1:06, ep3 0:45-1:12). ${CONTROLS}`,
    setup(world) {
      hero(world, -2.6, 9.2);
      const kinds: ItemKind[] = ['baton', 'knife', 'sword', 'scimitar', 'axe', 'bat', 'pipe'];
      kinds.forEach((k, i) => floorItem(world, k, -2.9 + i * 0.42, i % 2 ? 8.4 : 8.7));
      e.setup(world);
    },
    step: e.step,
  });
}

{
  // melee-environment-weapon: the street sign, planted in the floor
  const e = enemies([{ x: 0.6, z: 9.2 }, { x: 0.95, z: 9.35 }, { x: 3.1, z: 9.2 }, { x: 2.4, z: 9.7 }], 2);
  registerLab({
    slug: 'melee-environment-weapon',
    title: `Pull the street sign out of the floor (E, 0.5 s). LMB sweeps (1.5 H reach, hits everyone in the arc), RMB thrusts: a grunt within ~0.6 H of a wall or a pole gets pinned to it, and the sign stays in him (ep3 1:49-2:01). ${CONTROLS}`,
    setup(world) {
      hero(world, -2.0, 9.2);
      world.room = { ...world.room, props: [{ kind: 'pole', x0: 2.5, x1: 2.64, z0: 9.62, z1: 9.76, top: 3.4, lean: 0 }] };
      const it = world.spawnItem('sign', 'grunt', { x: -1.2, y: 0, z: 8.9 }, { x: 0, y: 0, z: 0 }, 0);
      it.state = 'planted';
      e.setup(world);
    },
    step: e.step,
    info: (world) => `pinned ${world.actors.filter((a) => a.corpse?.pinned).length}`,
  });
}

{
  const e = enemies([{ x: -3.0, z: 9.3 }, { x: 3.0, z: 9.2 }, { x: 2.6, z: 9.8 }, { x: -2.6, z: 8.7 }], 2);
  registerLab({
    slug: 'move-jump-onto-object',
    title: `Jump (Space) onto the table: you stand on its top (0.52 H), your gun fires from higher, over the bodies; walk off the edge to drop down (ep1 1:33, ep3 0:40). ${CONTROLS}`,
    setup(world) {
      const h = hero(world, 0.9, 9.0, true);
      h.hands = [newHand('pistol'), newHand('pistol')];
      e.setup(world);
      world.spawnCorpses(4);
    },
    step: e.step,
    info: (world) => `feet ${world.player?.pos.y.toFixed(2)} H`,
  });
}

/** Lab helper exported for tests: a live grenade at a point. */
export function liveGrenade(world: World, x: number, z: number, fuse: number = GRENADE.fuse) {
  const it = world.spawnItem('grenade', 'grunt', { x, y: 0, z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  it.live = true;
  it.fuse = fuse;
  return it;
}
