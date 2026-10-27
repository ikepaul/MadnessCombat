// M7 replica labs (research/mechanics/enemy-grunt-armed, enemy-behaviours, enemy-squad-leader,
// enemy-elite-bodyguard, enemy-zombie, melee-stealth-kill, move-drop-from-above). The reference
// clips are local-only; compare against research/mechanics/<slug>/frames-N.jpg when on hand.
import { lyingAt } from '../anim/skeleton';
import { type Actor, createActor, type HeldItem, newHand } from '../sim/actor';
import { spawnEnemy, type SpawnOpts } from '../sim/waves';
import type { World } from '../sim/world';
import { raiseAll } from '../sim/zombies';
import { registerLab } from './registry';

const CONTROLS = 'LMB/RMB fire or punch · E pick up / takedown · F grab · Q throw · G grenade';

function hero(world: World, x: number, z: number, held: HeldItem = null): Actor {
  const a = createActor('hero', x, z, 1);
  if (held) a.hands[0] = newHand(held);
  world.actors.push(a);
  world.player = a;
  return a;
}

const enemy = (world: World, x: number, z: number, held: HeldItem = null, opts: SpawnOpts = {}) => spawnEnemy(world, 'grunt', held, x, z, opts);

function drop(world: World, item: Exclude<HeldItem, null>, x: number, z: number, ammo?: number) {
  const it = world.spawnItem(item, 'grunt', { x, y: 0, z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  if (ammo !== undefined) it.ammo = ammo;
  return it;
}

const aiming = (world: World) => world.actors.filter((a) => a.ai?.aimT !== undefined).length;

registerLab({
  slug: 'enemy-grunt-armed',
  title: `Armed grunts (ep2 office, ep3 street): pistol, SMG and shotgun keep their distance, raise the gun with a 0.4 s red telegraph, then fire; baton and sword close in. Break line of sight or shoot first. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 9.2, 'pistol');
    enemy(world, 2.6, 9.0, 'pistol');
    enemy(world, 3.0, 9.9, 'smg');
    enemy(world, 1.6, 8.6, 'shotgun');
    enemy(world, 2.2, 10.1, 'baton');
    enemy(world, -0.4, 10.2, 'sword');
  },
  info: (world) => `aiming ${aiming(world)}  ·  tokens ${world.tokens.size}`,
});

registerLab({
  slug: 'enemy-behaviours',
  title: `Enemy quirks: a gunner kicks the table over for cover, grunts in a line shoot each other (friendly fire), an empty-handed grunt grabs the empty pistol on the floor and finds it empty, a knife grunt throws from range, one grenade per encounter. ${CONTROLS}`,
  setup(world) {
    const h = hero(world, -2.6, 8.4, 'smg');
    h.hands[0]!.spare = 3;
    const flipper = enemy(world, 1.9, 10.15, 'pistol');
    flipper.ai!.flipper = true;
    enemy(world, 3.0, 8.4, 'rifle');
    enemy(world, 1.0, 8.5);
    enemy(world, 2.8, 9.4, 'knife');
    drop(world, 'pistol', 0.2, 8.6, 0).spare = 0;
  },
  info: (world) => `grenades left ${world.enemyGrenades}  ·  aiming ${aiming(world)}`,
});

registerLab({
  slug: 'enemy-squad-leader',
  title: `Squad leader (ep3 2:11 desert): the grunt in shades has the only gun; his knife squad waits round him until he dies, then charges at once. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 9.2);
    drop(world, 'knife', -2.0, 9.0);
    drop(world, 'knife', -2.2, 9.5);
    enemy(world, 2.4, 9.3, 'pistol', { variant: 'leader', squad: 'S' });
    for (const [x, z] of [[2.0, 8.6], [2.9, 9.9], [3.1, 8.8], [1.8, 10.1]]) enemy(world, x, z, 'knife', { squad: 'S' });
  },
  info: (world) => `charging ${world.actors.filter((a) => a.ai?.charge).length}`,
});

registerLab({
  slug: 'enemy-elite-bodyguard',
  title: `Elite bodyguards (ep3 3:38, ep2 3:50): a pair with automatic weapons stays at the target's side and shoots on sight; 2 hits each, 1 to the head. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.6, 9.2, 'deagle').hands[0]!.spare = 3;
    enemy(world, 2.6, 9.8, null, { variant: 'vip', squad: 'V', face: -1 });
    enemy(world, 1.8, 9.4, 'smg', { variant: 'bodyguard', squad: 'V' });
    enemy(world, 3.2, 9.4, 'rifle', { variant: 'bodyguard', squad: 'V' });
  },
  info: (world) => world.actors.filter((a) => a.variant === 'bodyguard').map((a) => `guard ${a.hp}/${a.maxHp}`).join('  ·  '),
});

registerLab({
  slug: 'enemy-zombie',
  title: `Zombies (ep1 0:49, ep2 1:59): five corpses turn green and get up in 1.0 s, shuffle in at 0.8 H/s, take 3 bullets or 2 axe hits, keep going headless. Gibbed corpses can't rise. Z raises every intact corpse again. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    const h = hero(world, -2.6, 9.2, 'pistol');
    h.hands[0]!.spare = 3;
    drop(world, 'axe', -2.0, 9.4);
    for (const [x, z] of [[1.2, 9.0], [1.9, 9.8], [2.6, 8.7], [3.0, 9.5], [2.2, 10.2]]) {
      const c = createActor('grunt', x, z, -1, { dead: true });
      c.pose.root = lyingAt(x > 2 ? -Math.PI / 2 : Math.PI / 2);
      c.pose.clip = 'lying';
      c.pose.clipT = 1;
      world.actors.push(c);
    }
  },
  // the bolt comes a second in
  step(world) { if (world.tick === 60) raiseAll(world); },
  info: (world) => `zombies ${world.actors.filter((a) => a.kind === 'zombie' && a.state !== 'dead').length}`,
});

registerLab({
  slug: 'melee-stealth-kill',
  title: `Takedowns (ep2 0:14 wire, ep3 0:20 knife): sneak up behind an unaware guard and press E: wire 1.5 s with empty hands, knife 0.6 s otherwise. Nobody hears it. Guards notice you in front of them, unsuppressed shots, explosions and loud deaths nearby; the suppressed pistol stays quiet. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -3.0, 9.2);
    drop(world, 'pistolSuppressed', -2.6, 8.7);
    drop(world, 'pistol', -2.4, 9.8);
    enemy(world, -1.4, 9.2, 'smg', { aware: false, idle: 'smoke', face: 1 });
    enemy(world, 1.6, 9.8, 'pistol', { aware: false, idle: 'patrol', patrol: [1.0, 3.0], face: 1 });
    enemy(world, 3.0, 8.7, 'baton', { aware: false, idle: 'stand', face: 1 });
  },
  info: (world) => `unaware ${world.actors.filter((a) => a.ai?.aware === false && a.state !== 'dead').length}`,
});

registerLab({
  slug: 'move-drop-from-above',
  title: `Drop from the vent (ep3 0:20, ep2 3:29): you fall in behind the guards dug in facing the door; landing next to an unaware one goes straight into the knife kill. ${CONTROLS}`,
  setup(world) {
    const h = hero(world, -0.1, 9.3);
    h.pos.y = 2.6;
    h.body.state = 'air';
    h.body.vel = { x: 0, y: 0, z: 0 };
    // the guards face the right-hand door, backs to the vent
    enemy(world, 0.35, 9.3, 'pistol', { aware: false, idle: 'stand', face: 1 });
    enemy(world, 1.2, 9.9, 'smg', { aware: false, idle: 'smoke', face: 1 });
  },
});

registerLab({
  slug: 'idles',
  title: `Idles (playtest 2026-10-27): unaware guards fidget (watch, stretch, scratch, glance, weight shift), the smoker smokes, two chat (turns alternate: one gestures, one nods). Stand still ~3.5 s and the hero fidgets too. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -3.0, 9.2);
    // the guards face away from the hero so they stay unaware
    enemy(world, -1.2, 9.0, null, { aware: false, idle: 'stand', face: 1 });
    enemy(world, 0.2, 9.6, 'pistol', { aware: false, idle: 'smoke', face: 1 });
    enemy(world, 1.5, 9.2, null, { aware: false, idle: 'chat', face: 1 });
    enemy(world, 2.3, 9.2, 'smg', { aware: false, idle: 'chat', face: -1 });
  },
});
