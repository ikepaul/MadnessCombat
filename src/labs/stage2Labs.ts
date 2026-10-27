// M9 replica labs (research/mechanics/move-climb-vault, world-breach, world-objective-radar,
// boss-clown clip 1, boss-halo clip 5, boss-target clip 1). They start stage 2 at the room that
// shows the mechanic (the room graph, scripts and transitions run as in the stage).
import { lyingAt } from '../anim/skeleton';
import { STAGE2 } from '../data/stages/stage2';
import { bossInterruption, corridorSquad } from '../data/stages/stage2Script';
import { createActor, newHand } from '../sim/actor';
import { stageRunner } from '../sim/stage';
import { WaveDirector } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

const CONTROLS = 'E use (ladder) / takedown · G hold to cook a grenade · F grab / steal · LMB/RMB fire';

/** The hero (stage 2 loadout) and the stage from `room`. */
function stageFrom(world: World, room: string, loadout = true) {
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  if (loadout) STAGE2.loadout(hero);
  world.flags.add('s2-title');
  world.seq.run(stageRunner(STAGE2, room, Object.keys(STAGE2.rooms[room].entries)[0]), 'stage');
  return hero;
}

registerLab({
  slug: 'move-climb-vault',
  title: `Ladder and parapet (ep2 0:33): at the ladder press E: climb 1.1 H/s, the wipe, then the ~1 s vault over the parapet onto rooftop A. ${CONTROLS}`,
  palette: 'cool',
  setup(world) {
    const hero = stageFrom(world, 'corner');
    hero.hands[0] = newHand('pistolSuppressed', undefined, 2);
  },
  info: (world) => `room ${world.roomId}  ·  ${world.player?.traversing?.kind ?? '-'}`,
});

registerLab({
  slug: 'world-breach',
  title: `Breach (ep2 1:02): only an explosion on the marked tile opens the roof. Pick up the grenade, cook it (G) on the mark, step back: you drop into the office and the room is caught off guard for 1 s. ${CONTROLS}`,
  palette: 'cool',
  setup(world) { stageFrom(world, 'roofB').grenades = 1; },
  info: (world) => `room ${world.roomId}  ·  surprised ${world.actors.filter((a) => (a.ai?.surpriseT ?? 0) > 0).length}`,
});

registerLab({
  slug: 'world-objective-radar',
  title: `Tracker (ep2 0:43, 1:00): the radar top right points at the target; on rooftop B the blip closes in on the marked tile and sits dead centre on it. ${CONTROLS}`,
  palette: 'cool',
  setup(world) { stageFrom(world, 'roofA'); },
  info: (world) => {
    const t = world.tracker;
    const [x, y] = typeof t === 'function' ? t(world) : t ?? [0, 0];
    return `room ${world.roomId}  ·  blip ${x.toFixed(2)}, ${y.toFixed(2)}`;
  },
});

registerLab({
  slug: 'boss-clown',
  title: `The mini-boss (ep2 1:51, our riot-helmet design): he walks in firing the rifle with his squad. Get close and steal it (F), then use it on him. ${CONTROLS}`,
  palette: 'cool',
  setup(world) {
    world.setRoom(STAGE2.rooms.corridor.room);
    const hero = createActor('hero', 1.6, 8.8, -1);
    world.addPlayer(hero);
    world.director = new WaveDirector(corridorSquad());
  },
  info: (world) => {
    const r = world.actors.find((a) => a.variant === 'riot');
    return r ? `mini-boss ${r.hp}/${r.maxHp}  ·  ${r.hands[0]?.item ?? 'disarmed'}` : 'mini-boss not in yet';
  },
});

registerLab({
  slug: 'boss-halo-fling',
  title: `The boss interrupts (ep2 1:59): he drops in, flings you ~3.6 H across the corridor into the wall, raises every intact corpse (up to 8) and rises away. ${CONTROLS}`,
  palette: 'cool',
  setup(world) {
    world.setRoom(STAGE2.rooms.corridor.room);
    const hero = createActor('hero', -1.2, 8.9, 1);
    hero.hands[0] = newHand('rifle', undefined, 2);
    world.addPlayer(hero);
    for (let i = 0; i < 9; i++) {
      const c = createActor('grunt', -0.4 + i * 0.42, 8.4 + (i % 3) * 0.45, i % 2 ? 1 : -1, { dead: true, clip: 'lying', clipT: 1, root: lyingAt(i % 2 ? -Math.PI / 2 : Math.PI / 2) });
      world.actors.push(c);
    }
    world.seq.run(function* lab(s) { yield 1; yield* bossInterruption(s); });
  },
  info: (world) => `zombies ${world.actors.filter((a) => a.kind === 'zombie' && a.state !== 'dead').length}`,
});

registerLab({
  slug: 'boss-target',
  title: `The target (ep2 1:05, our bureaucrat design): you drop into his office; his panicked shot kills his own guard and he runs for the left door. He can't be hurt yet. ${CONTROLS}`,
  palette: 'cool',
  setup(world) { stageFrom(world, 'office').hands[0] = newHand('pistolSuppressed', undefined, 2); },
  info: (world) => `target ${world.actors.some((a) => a.variant === 'target') ? 'in the room' : 'gone'}`,
});
