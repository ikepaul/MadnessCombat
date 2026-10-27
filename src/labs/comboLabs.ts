// M10b combo & fatality labs (PLAN.md M10b, design/combos-and-fatalities.md). Reference frames:
// ep2 f3310 / ep1 f1929 (launcher, punt), ep3 f2350-f2510 (wall bounce), ep2 f3060-f3140 (pop &
// catch), ep3 f1210-f1230 (thrown empty gun), ep3 f6660-f6710 (over the shoulder).
import { type Actor, createActor, type HeldItem, newHand } from '../sim/actor';
import { spawnEnemy } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CONTROLS = 'LMB light · RMB heavy (cursor high = uppercut) · F grab · LMB/RMB fire with a gun';

function hero(world: World, x: number, held: HeldItem = null, facing: 1 | -1 = 1): Actor {
  const a = createActor('hero', x, 9.2, facing);
  if (held) a.hands[0] = newHand(held);
  world.actors.push(a);
  world.player = a;
  return a;
}

const grunt = (world: World, x: number, held: HeldItem = null, z = 9.2) => spawnEnemy(world, 'grunt', held, x, z, { face: x > 0 ? -1 : 1 });
const airborne = (world: World) => world.actors.filter((a) => a.flight?.juggle && a.flight.phase === 'air').length;

registerLab({
  slug: 'combo-juggle',
  title: `Launcher -> juggle: LMB to stun a grunt, then RMB with the cursor high (uppercut) launches him ~1 H. While he's up: LMB jabs keep him there (at most 3), RMB spikes him into the floor (one bounce), F grabs him out of the air; shots at him count as head hits. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -1.6);
    grunt(world, 0.4);
    grunt(world, 2.6, null, 9.7);
  },
  info: (world) => `airborne ${airborne(world)}`,
});

registerLab({
  slug: 'combo-wall-bounce',
  title: `Wall bounce: a heavy (or a thrown body) that slams a grunt into a wall or a solid prop without killing him bounces him back up, toward you: a juggle starter. In improbability mode the same bounce is rubbery; outdoors the bounds don't bounce. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [{ kind: 'crate', x0: -3.2, x1: -2.4, z0: 8.8, z1: 9.6, top: 0.8 }] };
    hero(world, 1.6);
    grunt(world, 2.6);
    grunt(world, -1.7);
  },
  info: (world) => `airborne ${airborne(world)}`,
});

registerLab({
  slug: 'combo-pop-catch',
  title: `Pop & catch: a light punch that knocks the weapon out of a grunt's hand sends it spinning up (~1 H); F with a free hand snatches it out of the air, and your first hit with it counts as a chain hit. Enemies never catch, and leave a popped weapon alone for a moment. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -1.6);
    grunt(world, 0.2, 'knife');
    grunt(world, 1.4, 'pistol', 9.6);
    grunt(world, 2.6, 'baton');
  },
});

registerLab({
  slug: 'combo-gun-throw',
  title: `Click -> throw -> punch: your pistol is empty. Click (dry), click again to throw it: a gun to the head stuns like a punch and starts a chain, so one heavy right after kills. A gun to the body still knocks down. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    const h = hero(world, -2.6, 'pistol');
    h.hands[0]!.ammo = 0;
    h.hands[0]!.spare = 0;
    grunt(world, 0.4);
    grunt(world, 2.2, null, 9.6);
  },
});

registerLab({
  slug: 'fatality-head-punt',
  title: `Head punt (fatality): launch a grunt (stun, then uppercut) and finish him with a heavy while he's in the air: the head comes off and flies along the hit, knocking down the grunt it meets. Kill cam. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -2.4);
    grunt(world, -0.9);
    grunt(world, 1.2);
    grunt(world, 2.4, null, 9.5);
  },
});

registerLab({
  slug: 'fatality-over-shoulder',
  title: `Over the shoulder (fatality + counter): with a gun in hand, RMB shoots the enemy in contact right behind you (within 0.6 H) without turning round: point blank, head. Face away from them and let them come. ${CONTROLS}`,
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, 0, 'pistol');
    grunt(world, -2.4);
    grunt(world, -3.2, null, 9.6);
  },
});
