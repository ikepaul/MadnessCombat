// M1 replica labs (research/mechanics/move-*). Compare against the reference frames:
// move-walk (ep1 f470-f588), move-jump (ep1 f2380-f2410), move-prone-dodge (ep1 f2415-f2525).
import { createActor } from '../sim/actor';
import type { World } from '../sim/world';
import { registerLab } from './registry';

function hero(world: World, x: number, z: number) {
  const a = createActor('hero', x, z, 1);
  world.actors.push(a);
  world.player = a;
  return a;
}

registerLab({
  slug: 'move-walk',
  title: 'Walk: calm 0.8 H/s with no enemies (ep1 f470-f588). WASD to move.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.5, 9.2);
  },
});

registerLab({
  slug: 'move-jump',
  title: 'Jump over the cannonball: airtime 0.63 s, apex 1.15 H (ep1 f2380-f2410). Space to jump.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    const p = hero(world, -1.5, 9.2);
    world.cannons.push({ x: 2.8, z: p.pos.z, facing: -1, timer: 1.0 });
  },
});

registerLab({
  slug: 'move-prone-dodge',
  title: 'Drop prone under the cannonball: down 0.15 s, up 0.4 s (ep1 f2415-f2525). Ctrl/C to drop and get up.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    const p = hero(world, -1.5, 9.2);
    world.cannons.push({ x: 2.8, z: p.pos.z, facing: -1, timer: 1.0 });
  },
});
