// M14 replica labs for stage 4's new mechanics (research/mechanics/enemy-agent, gun-fire-mode,
// melee-blade-deflect, move-stairs, world-crowd-dancefloor, enemy-zombie). The ep4 reference clips
// aren't cut yet (research/README.md): these are checked against the notes' numbers.
import { type Actor, createActor, type HeldItem, newHand } from '../sim/actor';
import { spawnEnemy, type SpawnOpts } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CONTROLS = 'LMB/RMB fire or punch · E pick up · F grab · Q throw · B fire mode';

function hero(world: World, x: number, z: number, held: HeldItem = null, back: HeldItem = null): Actor {
  const a = createActor('hero', x, z, 1);
  if (held) a.hands[0] = newHand(held);
  if (back) a.hands[1] = newHand(back);
  world.actors.push(a);
  world.player = a;
  return a;
}

const enemy = (world: World, x: number, z: number, held: HeldItem = null, opts: SpawnOpts = {}) => spawnEnemy(world, 'grunt', held, x, z, opts);

function drop(world: World, item: Exclude<HeldItem, null>, x: number, z: number) {
  const it = world.spawnItem(item, 'grunt', { x, y: 0, z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  return it;
}

registerLab({
  slug: 'enemy-agent',
  title: `The agent (ep4 1:09-1:21): a suited elite with a heavy pistol. He closes in and brawls (jabs don't stun him, the first jab of a chain is blocked), shoots from beyond 3 H with the red telegraph, takes 3 head shots (12 hp), and blunt weapons hit him twice as hard: the baton by your feet takes him in 2. ${CONTROLS}`,
  palette: 'night',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 9.2, 'pistol').hands[0]!.spare = 3;
    drop(world, 'baton', -2.1, 9.4);
    enemy(world, 2.6, 9.4, 'deagle', { variant: 'agent' });
  },
  info: (world) => world.actors.filter((a) => a.variant === 'agent').map((a) => `agent ${a.hp}/${a.maxHp}`).join('  ·  '),
});

registerLab({
  slug: 'gun-fire-mode',
  title: `Fire-mode selector (ep4 0:59): pick up the rifle (E): it starts on single shot (one round per click, tighter spread). B flips it to full auto and back; the first flip shows the selector close-up. ${CONTROLS}`,
  palette: 'night',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 9.2);
    drop(world, 'rifle', -2.2, 9.3);
    for (const [x, z] of [[2.2, 9.0], [2.8, 9.8], [3.2, 8.8]]) enemy(world, x, z, null);
  },
  info: (world) => {
    const h = world.player?.hands.find((x) => x?.item === 'rifle');
    return h ? `rifle: ${h.semi ? 'single shot' : 'full auto'}, ${h.ammo} rounds` : 'pick up the rifle (E)';
  },
});

registerLab({
  slug: 'melee-blade-deflect',
  title: `Sword guard (ep4 2:45): hold RMB with the sword to guard (slow walk). Bullets and blades from the front glance off; one in four still gets through. Raise the guard just as a shot or swing lands (0.15 s) to parry: the bullet goes back into the shooter, a blade attacker is stunned. ${CONTROLS}`,
  palette: 'night',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 9.2, 'sword');
    enemy(world, 2.6, 9.0, 'smg');
    enemy(world, 3.0, 9.8, 'pistol');
    enemy(world, 1.4, 9.4, 'sword');
  },
  info: (world) => (world.player?.guard ? `guard up · ${world.player.guard.n} turned` : 'guard down (hold RMB)'),
});

/** A staircase up to the right: floor at x -0.5, 1.2 H up at x 2.5, across the middle of the room's depth. */
const STAIRS = { x0: -0.5, x1: 2.5, z0: 8.6, z1: 10.0, y0: 0, y1: 1.2 };

registerLab({
  slug: 'move-stairs',
  title: `Stairs (ep4 1:52): walk up and down the staircase (the feet follow the steps); shoot the grunts on it: their bodies slide down to the bottom before they lie still. The vertical camera pan comes with the real stairwell (M15). ${CONTROLS}`,
  palette: 'night',
  setup(world) {
    world.room = { ...world.room, props: [], stairs: [STAIRS] };
    hero(world, -2.6, 9.2, 'pistol').hands[0]!.spare = 3;
    enemy(world, 1.2, 9.3, null);
    enemy(world, 2.2, 9.6, null);
  },
  info: (world) => `hero feet ${world.player?.pos.y.toFixed(2) ?? '-'} H`,
});

registerLab({
  slug: 'world-crowd-dancefloor',
  title: `The dance floor (ep4 2:01-2:29): 35 grunts dance, ignoring you, until the first shot or kill: then the whole crowd turns at once. At most 2-3 swing at a time; the rest press in and shove (no damage). The one by the right wall cowers and never fights. K drops corpses, Z raises them (armed zombies take up guns here). ${CONTROLS}`,
  palette: 'night',
  setup(world) {
    world.room = { ...world.room, props: [] };
    world.flags.add('armedZombies');
    hero(world, -3.0, 9.2, 'smg', 'sword').hands[0]!.spare = 3;
    for (let i = 0; i < 35; i++) {
      const x = -1.6 + (i % 7) * 0.7 + ((i * 37) % 10) / 40, z = 8.4 + Math.floor(i / 7) * 0.45;
      enemy(world, x, z, null, { aware: false, idle: 'dance', crowd: 'club', face: 1 });
    }
    enemy(world, 3.6, 10.1, null, { aware: false, idle: 'cower', face: -1 });
  },
  info: (world) => `swinging (tokens) ${world.tokens.size}  ·  alive ${world.actors.filter((a) => a.ai && a.state !== 'dead').length}`,
});
