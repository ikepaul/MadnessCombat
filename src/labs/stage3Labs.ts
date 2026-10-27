// M11 replica labs (research/mechanics/world-improbability-mode, world-arena-collapse,
// world-falling-hazard, move-fall-transition, boss-clown clips 2-3, enemy-sun-brute (our vending
// machine)). Most start stage 3 at the room that shows the mechanic.
import { lyingAt } from '../anim/skeleton';
import { STAGE3 } from '../data/stages/stage3';
import { createActor, newHand } from '../sim/actor';
import { gruntBrain, newAiState } from '../sim/ai';
import { dropBlock, flyIn, setImprobable, startCollapse } from '../sim/improbability';
import { stageRunner } from '../sim/stage';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CONTROLS = 'LMB/RMB punch, swing or fire · F grab / shield · E pull / use · Q throw';

function hero(world: World, x: number, z = 9.2) {
  const a = createActor('hero', x, z, 1);
  world.addPlayer(a);
  return a;
}

function grunt(world: World, x: number, z = 9.2, held: Parameters<typeof newHand>[0] | null = null) {
  const g = createActor('grunt', x, z, -1, { held: held ?? undefined });
  g.ai = newAiState(world);
  g.brain = gruntBrain(world);
  world.actors.push(g);
  return g;
}

function stageFrom(world: World, room: string) {
  const h = hero(world, 0);
  STAGE3.loadout(h);
  world.flags.add('s3-title');
  world.seq.run(stageRunner(STAGE3, room, Object.keys(STAGE3.rooms[room].entries)[0]), 'stage');
  return h;
}

registerLab({
  slug: 'world-improbability-mode',
  title: `Improbability mode (ep3 1:18): knockback x2.4, bodies bounce off the walls and the ceiling (one in ten sticks up there), and they come in flying. ${CONTROLS}`,
  palette: 'warm',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, -1);
    setImprobable(world, true);
    for (const [x, z] of [[1.0, 9.0], [2.0, 9.8], [-2.5, 8.7]]) grunt(world, x, z);
    world.seq.run(function* more() {
      for (let i = 0; i < 4; i++) { yield 3; const g = grunt(world, 0, 8.6 + i * 0.4); flyIn(world, g, (i % 2 ? 1 : -1) as 1 | -1); }
    });
  },
});

registerLab({
  slug: 'world-arena-collapse',
  title: `The collapse (ep3 1:25): a crack, about a second, and the left half of the room falls into the void with everything on it. Nobody walks off the edge. ${CONTROLS}`,
  palette: 'warm',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, 1.6);
    for (const [x, z] of [[-2.5, 9.0], [-1.2, 9.7], [-0.4, 8.8], [2.6, 9.4]]) grunt(world, x, z);
    for (const [x, z] of [[-2, 10], [-0.8, 9.2]]) {
      const c = createActor('grunt', x, z, 1, { dead: true, clip: 'lying', clipT: 1, root: lyingAt(Math.PI / 2) });
      world.actors.push(c);
    }
    world.seq.run(function* go() { yield 2; startCollapse(world, -1, 0); });
  },
  info: (world) => `${world.collapse?.phase ?? 'waiting'}`,
});

registerLab({
  slug: 'world-falling-tank',
  title: `The falling tank (ep3 1:42, our own object): a shadow for ~0.9 s, then it crushes whatever's under it and stays as a solid block. ${CONTROLS}`,
  palette: 'warm',
  setup(world) {
    world.room = { ...world.room, props: [] };
    hero(world, 2);
    grunt(world, -1.4, 9.6);
    world.seq.run(function* drops() { for (;;) { yield 2; if (!world.room.props.some((p) => p.kind === 'tank')) dropBlock(world, -1.6, 9.6); else return; } });
  },
});

registerLab({
  slug: 'move-fall-transition',
  title: `Falling in (ep3 1:34): a shadow on the street, then you drop out of the sky and land face down, and get up. The clock street. ${CONTROLS}`,
  palette: 'warm',
  setup(world) { stageFrom(world, 'street'); },
});

registerLab({
  slug: 'boss-clown-jetpack',
  title: `The jetpack mini-boss (ep3 1:28): the camera room after the collapse. He hovers over the void with a machine gun: cover or a human shield; he can't be killed here. He flies off and comes back through the door to shove you off. ${CONTROLS}`,
  palette: 'warm',
  setup(world) {
    const h = stageFrom(world, 'camera');
    h.hands = [newHand('pistol', undefined, 2), newHand('pistol', undefined, 2)];
  },
});

registerLab({
  slug: 'boss-clown-pin',
  title: `Pinning (ep3 2:01): pull the street sign out (E), then RMB thrust him with his back to the tank. Out in the open he only flinches. ${CONTROLS}`,
  palette: 'warm',
  setup(world) {
    world.setRoom(STAGE3.rooms.street.room);
    hero(world, -2.8);
    world.room.props.push({ kind: 'tank', x0: -0.6, x1: 1.6, z0: 9.2, z1: 10.0, top: 1.25, facing: 1 });
    const sign = world.spawnItem('sign', 'grunt', { x: -2.2, y: 0, z: 9.0 }, { x: 0, y: 0, z: 0 }, 0);
    sign.state = 'planted';
    const mb = grunt(world, 2.4, 9.6, 'scimitar');
    mb.variant = 'riot';
    mb.protected = true;
  },
  info: (world) => `${world.actors.find((a) => a.variant === 'riot')?.corpse?.pinned ? 'pinned' : 'not yet'}`,
});

registerLab({
  slug: 'enemy-vending-brute',
  title: `The brute (our vending machine): ~6 hits (bullets half), slow, only big knockdown punches, never knocked down himself. ${CONTROLS}`,
  palette: 'warm',
  setup(world) {
    world.setRoom(STAGE3.rooms.street.room);
    world.room.vending = undefined;
    hero(world, -2.4).hands = [newHand('sign'), null];
    const b = grunt(world, 2.2, 9.6);
    b.variant = 'vending';
    b.hp = b.maxHp = 6;
  },
  info: (world) => { const b = world.actors.find((a) => a.variant === 'vending'); return b ? `brute ${b.hp}/${b.maxHp}` : '-'; },
});
