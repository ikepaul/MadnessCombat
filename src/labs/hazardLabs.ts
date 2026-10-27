// M8 lab world-falling-hazard (research/mechanics/world-falling-hazard, ep1 1:16 the boss's cannon,
// ep3's giant marshmallow): the shadow grows for 0.8 s, the cannon drops and crushes whatever is
// under it, then stands as solid ground (jump onto it; it's no cover). Compared against the note's
// numbers (shadow 0.5-1.0 s first, crush, becomes terrain); the clips are local-only.
import { STAGE1 } from '../data/stages/stage1';
import { TUNING } from '../data/tuning';
import { type Actor, alive, createActor } from '../sim/actor';
import { type Cannon, dropCannon, removeCannon } from '../sim/cannon';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CN = TUNING.boss.cannon;
/** A drop every this many seconds; the last one stays this long before it's cleared. invented */
const EVERY = 4, STAY = 2.5;
/** Where the dummies stand (a drop picks one, or you if you stand still). */
const SPOTS = [-2.2, -0.6, 1.0, 2.6];

const state = new WeakMap<World, { next: number; last?: Cannon; landedAt?: number; crushed: number; drops: number }>();

function dummy(world: World, x: number): Actor {
  const g = createActor('grunt', x, 9.4, -1);
  world.actors.push(g);
  return g;
}

registerLab({
  slug: 'world-falling-hazard',
  title: `Falling cannon: its shadow grows for ${CN.shadow} s (whistle), then it drops in ${(CN.dropHeight / CN.fallSpeed).toFixed(2)} s and crushes whoever is under it (grunts die, you lose a life), shoving bodies clear; it then stands as solid ground (jump onto it) that shots pass over. One drops every ${EVERY} s on a dummy, or on you if you stand still. Life refills.`,
  setup(world) {
    world.setRoom(STAGE1.rooms.arena.room);
    const hero = createActor('hero', 0.2, 9.4, 1);
    world.actors.push(hero);
    world.player = hero;
    for (const x of SPOTS) dummy(world, x);
    state.set(world, { next: 1.5, crushed: 0, drops: 0 });
    world.events.on('kill', () => { const s = state.get(world); if (s) s.crushed++; });
  },
  step(world) {
    const s = state.get(world)!, p = world.player;
    if (p) p.hp = p.maxHp;
    // the last cannon goes once it has stood a while (it's terrain until then)
    if (s.last && !s.last.drop && s.landedAt === undefined) s.landedAt = world.time;
    if (s.last && s.landedAt !== undefined && world.time - s.landedAt >= STAY) {
      removeCannon(world, s.last);
      s.last = undefined;
      s.landedAt = undefined;
      // fresh dummies for the crushed ones
      const dead = world.actors.filter((a) => a.kind === 'grunt' && !alive(a));
      world.actors.splice(0, world.actors.length, ...world.actors.filter((a) => !dead.includes(a)));
      // baked corpses come off the corpse layer
      for (const a of dead) if (a.corpse?.phase === 'frozen') world.events.emit('corpseThawed', { actorId: a.id });
      for (const x of SPOTS) if (!world.actors.some((a) => a.kind === 'grunt' && Math.abs(a.pos.x - x) < 0.5)) dummy(world, x);
    }
    if (s.last || world.time < s.next) return;
    // on you if you stand still, else on a dummy in turn
    const still = p && Math.hypot(p.body.vel.x, p.body.vel.z) < 0.05;
    const x = still && p ? p.pos.x : SPOTS[s.drops % SPOTS.length];
    s.last = dropCannon(world, x, 9.4, 1);
    s.drops++;
    s.next = world.time + EVERY;
  },
  info(world) {
    const s = state.get(world);
    if (!s) return '';
    const c = s.last;
    const phase = !c ? `next in ${Math.max(0, s.next - world.time).toFixed(1)} s` : c.drop ? (c.drop.t < CN.shadow ? `shadow ${c.drop.t.toFixed(2)} s` : `falling, ${(c.y ?? 0).toFixed(1)} H up`) : 'landed: solid ground';
    return `${phase}  ·  drops ${s.drops}  ·  crushed ${s.crushed}`;
  },
});
