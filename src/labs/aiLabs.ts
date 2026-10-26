// M3 replica labs (research/mechanics/enemy-*, world-kill-counter). The reference clips are
// local-only; compare against research/mechanics/<slug>/frames-N.jpg when they're on hand.
import { STAGE1 } from '../data/stages/stage1';
import { createActor } from '../sim/actor';
import { type RoomScript, spawnEnemy, WaveDirector } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CONTROLS = 'LMB light · RMB heavy · F grab/throw · Ctrl dive · F1 shows attack tokens';

function hero(world: World, x: number, z: number) {
  const a = createActor('hero', x, z, 1);
  world.actors.push(a);
  world.player = a;
  return a;
}

registerLab({
  slug: 'enemy-grunt-unarmed',
  title: `Four unarmed grunts: two hold attack tokens and come to punch range, swinging every 0.6-1.0 s; the rest wait 1.5-2.5 H away (ep1 0:21-1:00). ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -0.5, 9.2);
    for (const [x, z] of [[2.4, 9.0], [2.9, 9.8], [-2.9, 8.6], [-2.6, 10.1]]) spawnEnemy(world, 'grunt', null, x, z);
  },
  info: (world) => `tokens ${[...world.tokens].join(', ') || '-'}  ·  attacking ${world.actors.filter((a) => a.ai && a.state === 'attack').length}`,
});

/** enemy-spawning: both doors take turns; each opens 0.3 s before a grunt steps out. */
const DOORS: RoomScript = {
  spawns: [{ id: 'left', kind: 'door', door: 0 }, { id: 'right', kind: 'door', door: 1 }],
  waves: [{
    id: 'A', threshold: 0, maxAlive: 3,
    entries: Array.from({ length: 10 }, (_, i) => [i === 0 ? 1 : 1.2, i % 2 ? 'right' : 'left', 'grunt', null]),
  }],
};

registerLab({
  slug: 'enemy-spawning',
  title: `Door entries: a door swings open 0.3 s before each grunt steps through, at most 3 alive (ep2 doors, lifts). ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, 0, 9.2);
    world.director = new WaveDirector(DOORS);
  },
  info: (world) => `spawned ${world.director?.spawned ?? 0}/10  ·  ${world.director?.state}`,
});

registerLab({
  slug: 'world-kill-counter',
  title: `Stage 1 arena, wave A: the counter appears at the first kill and pops on each one; the body-count card ends the room. ${CONTROLS}`,
  setup(world) {
    world.setRoom(STAGE1.rooms.arena.room);
    hero(world, 0, 9.2);
    world.director = new WaveDirector(STAGE1.rooms.arena.script);
  },
});
