// M17 quality-of-life labs (design/qol-pass.md): pickup and the E prompt, the depth snap and rings,
// cover you can fire over, throws that find depth, the grenade landing marker.
import { type Actor, createActor, type HeldItem, newHand } from '../sim/actor';
import type { ItemKind } from '../sim/items';
import { spawnEnemy } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

function hero(world: World, x: number, held: HeldItem = null, z = 9.2): Actor {
  const a = createActor('hero', x, z, 1);
  if (held) a.hands[0] = newHand(held);
  world.actors.push(a);
  world.player = a;
  return a;
}

/** A grunt that stands still (no brain) at x, z. */
function dummy(world: World, x: number, z = 9.2, held: HeldItem = null): Actor {
  const g = spawnEnemy(world, 'grunt', held, x, z, { face: -1 });
  g.brain = undefined;
  return g;
}

function floor(world: World, kind: ItemKind, x: number, z: number, ammo?: number, spare?: number): void {
  const it = world.spawnItem(kind, 'grunt', { x, y: 0, z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  if (ammo !== undefined) it.ammo = ammo;
  if (spare !== undefined) it.spare = spare;
}

registerLab({
  slug: 'qol-pickup',
  title: 'Pickup: walk over a loaded gun with one hand full and it fills the other; empty guns and melee weapons need E. With both hands full, tap E swaps the worse hand (the prompt shows which); hold E and click LMB/RMB to pick the hand. A stuck knife shows PULL.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.8, 'pistol');
    floor(world, 'smg', -1.8, 9.2);
    floor(world, 'pistol', -1.0, 9.2, 0, 0);
    floor(world, 'shotgun', -0.2, 9.6);
    floor(world, 'bat', 0.6, 9.2);
    floor(world, 'sign', 1.4, 9.4);
    floor(world, 'grenade', 2.2, 9.0);
    const k = world.spawnItem('knife', 'grunt', { x: 3.0, y: 0.05, z: 9.2 }, { x: 0, y: 0, z: 0 }, 0);
    k.state = 'stuck';
  },
  info: (world) => `hands ${world.player?.hands.map((h) => h?.item ?? '-').join(' / ')}`,
});

registerLab({
  slug: 'qol-depth',
  title: 'Depth help: grunts stand 0.15 / 0.35 / 0.5 / 0.7 H deeper than you. Enemies on your depth line show a light ring on their shadow, the one your punch would snap to a brighter one; a punch slides you up to 0.3 H toward it. The last one (0.7 H) is out of reach.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.4);
    [0.15, 0.35, 0.5, 0.7].forEach((dz, i) => dummy(world, -1.2 + i * 1.3, 9.0 + dz));
  },
  info: (world) => `hero z ${world.player?.pos.z.toFixed(2)}`,
});

registerLab({
  slug: 'qol-cover',
  title: 'Cover: from behind the left table you can shoot the grunt at your depth across it and the one in front of it; the grunt behind the right table is covered from the front (his head above it is not). F1 shows the hurtboxes.',
  setup(world) {
    world.room = {
      ...world.room,
      props: [
        { kind: 'table', x0: -2.4, x1: -1.2, z0: 9.25, z1: 9.95, top: 0.55 },
        { kind: 'table', x0: 1.4, x1: 2.6, z0: 9.25, z1: 9.95, top: 0.55 },
      ],
    };
    hero(world, -1.8, 'pistol', 10.3);
    world.player!.hands[1] = newHand('pistol');
    dummy(world, 0.2, 10.3);
    dummy(world, -0.6, 8.5);
    dummy(world, 2.0, 10.25);
  },
});

registerLab({
  slug: 'qol-throw-depth',
  title: 'Throws find depth: Q (or LMB at range with a knife) at a grunt at another depth flies to his depth when the cursor is on him. Grunts at three depths; walk over the knives to take them (E).',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 'knife');
    dummy(world, 0.8, 8.5);
    dummy(world, 1.6, 9.2);
    dummy(world, 2.4, 10.1);
    for (let i = 0; i < 4; i++) floor(world, 'knife', -2.2 + i * 0.25, 9.6);
  },
});

registerLab({
  slug: 'qol-grenade-marker',
  title: 'Grenade marker: hold G to cook; the floor shows where it lands (clamped to your throw range), the blast radius and the fuse sweeping down (blinking in the last 0.5 s). Release to lob.',
  setup(world) {
    world.room = { ...world.room, props: [] };
    const h = hero(world, -2.4);
    h.grenades = 9;
    dummy(world, 1.0, 9.0);
    dummy(world, 1.6, 9.8);
  },
  step(world) {
    const h = world.player;
    if (h && h.grenades < 3) h.grenades = 9;
  },
});
