// M19 rage labs (design/rage.md 8): the meter with every kind of kill, and each solo rage fatality
// with a bar that refills and grunts that come back, so a move can be watched again and again
// (F2 slow-mo works on top).
import { type Actor, createActor, type HeldItem, newHand } from '../sim/actor';
import type { ItemKind } from '../sim/items';
import { spawnEnemy } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

function hero(world: World, x: number, held: HeldItem = null): Actor {
  const a = createActor('hero', x, 9.2, 1);
  if (held) a.hands[0] = newHand(held);
  world.actors.push(a);
  world.player = a;
  return a;
}

/** Six grunts at mixed depths that stand still (no brain). */
function crowd(world: World): void {
  [[-1.2, 8.6], [-0.2, 9.6], [0.6, 8.9], [1.4, 10.1], [2.2, 9.2], [2.9, 8.7]].forEach(([x, z]) => {
    const g = spawnEnemy(world, 'grunt', null, x, z, { face: -1 });
    g.brain = undefined;
  });
}

/** Refill the bar between runs; bring the crowd back once everyone's dead (bodies cleared). */
function again(world: World): void {
  const h = world.player;
  if (!h || world.rage) return;
  h.rage = { value: 1, recent: h.rage?.recent ?? [], streak: 0 };
  if (!world.actors.some((a) => a.ai && a.state !== 'dead')) {
    world.actors.splice(0, world.actors.length, ...world.actors.filter((a) => a.kind === 'hero'));
    crowd(world);
  }
}

const RUN = 'Tab fires it (the bar refills here; the grunts come back once all are dead). F2: slow motion.';

registerLab({
  slug: 'rage-meter',
  title: 'Rage meter: kills fill the bar only when their type is not one of your last 2 (10%, +5% per varied kill in a row, up to 25%). Punch, stomp, kick, throw bodies and weapons, shoot, blow up... the lab bar lists your last types. Tab when full.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.8);
    for (let i = 0; i < 7; i++) spawnEnemy(world, 'grunt', null, -1.6 + i * 0.75, 8.7 + (i % 3) * 0.6, { face: -1 });
    const items: [ItemKind, number][] = [['pistol', -3.2], ['knife', -2.9], ['bat', -2.6], ['grenade', -2.3]];
    for (const [k, x] of items) { const it = world.spawnItem(k, 'grunt', { x, y: 0, z: 10.2 }, { x: 0, y: 0, z: 0 }, 0); it.state = 'floor'; }
  },
  info: (world) => { const r = world.player?.rage; return `rage ${Math.round((r?.value ?? 0) * 100)}%  streak ${r?.streak ?? 0}  last: ${(r?.recent ?? []).join(', ') || '-'}`; },
});

for (const [slug, held, name] of [
  ['rage-rampage', null, 'Rampage (empty hands): a dash and a strike per grunt, each frozen mid-reaction, all dying together at the release'],
  ['rage-spin-shot', 'pistol', 'Spin shot (a gun): a hop and a full turn, each grunt shot in the head as the barrel passes; your guns are reloaded'],
  ['rage-cut-line', 'sword', 'Cut line (a blade): you appear past each grunt, a white line hangs in the air, they split at the release (stage 1: heads)'],
  ['rage-home-run', 'bat', 'Home run (a club): each struck and frozen, then all launched at the walls, bowling over whoever is in the way'],
] as const) {
  registerLab({
    slug,
    title: `${name}. ${RUN}`,
    palette: slug === 'rage-cut-line' ? 'cool' : undefined,
    setup(world) {
      world.room = { ...world.room, props: [] };
      const h = hero(world, -2.6, held);
      h.rage = { value: 1, recent: [], streak: 0 };
      crowd(world);
    },
    step: again,
    info: (world) => (world.rage ? `${world.rage.kind} ${world.rage.phase} t ${world.rage.t.toFixed(2)}` : 'ready'),
  });
}
