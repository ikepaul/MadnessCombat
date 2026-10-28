// STB-00 repro: the soak's only exception (combat.ts stepAttack reading `attack.t` of undefined):
// the vending-machine brute hit during his own attack keeps state 'attack' with no attack
// (applyHit clears `attack`, then the brute's no-flinch branch skips the state change).
// `AUDIT=1 npx vitest run tests/audit/stb/crash.test.ts`
import { describe, expect, it } from 'vitest';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { createActor } from '../../../src/sim/actor';
import { IDLE_COMMAND } from '../../../src/sim/command';
import { spawnEnemy } from '../../../src/sim/waves';
import { World } from '../../../src/sim/world';
import { brawler, progress, run, stageWorld } from '../harness';

describe.skipIf(!process.env.AUDIT)('STB-00 crash repro', () => {
  it('direct: a punch on the vending brute mid-swing does not throw on the next tick', () => {
    const world = new World(STAGE3.rooms.street.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const brute = spawnEnemy(world, 'grunt', null, 0.6, 9.2, { face: -1 });
    brute.variant = 'vending';
    brute.hp = brute.maxHp = 6;
    brute.brain = () => ({ ...IDLE_COMMAND });
    brute.state = 'attack';
    brute.stateT = 0;
    brute.attack = { kind: 'heavy', heavy: true, t: 0.05, done: false };
    world.hitActor(hero, brute, 'light', -1, 0, { ...brute.pos, y: 0.6 });
    console.log('STB-00 after the hit: state', brute.state, 'attack', brute.attack);
    expect(() => { world.command = { ...IDLE_COMMAND }; world.step(); }).not.toThrow();
  });

  it('soak seeds: 3/street progress∘brawler and masher, 120 s, no exception', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = stageWorld(3, 'street', 1, seed);
      const r = run(world, [progress(brawler(0.15))], { seconds: 120, keepAlive: true });
      expect(r.exceptions, `seed ${seed}`).toEqual([]);
    }
  });
});

describe.skipIf(!process.env.AUDIT)('STB-16 crash repro', () => {
  it('a blade stuck in an actor that a script removes (boss teleport, jetpack exit, target flees) does not crash an empty-handed hero', () => {
    const world = new World(STAGE3.rooms.vending.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    hero.hands = [null, null];
    const boss = createActor('grunt', 0.5, 9.2, -1);
    world.actors.push(boss);
    const knife = world.spawnItem('knife', 'grunt', { x: 0.5, y: 0.6, z: 9.2 }, { x: 0, y: 0, z: 0 }, 0);
    knife.state = 'stuck';
    knife.stuckTo = boss.id;
    // the script's `world.actors.splice(...)` runs in seq.step, before the actors move this tick
    world.seq.run(function* teleport() { world.actors.splice(world.actors.indexOf(boss), 1); });
    expect(() => { for (let i = 0; i < 3; i++) { world.command = { ...IDLE_COMMAND }; world.step(); } }).not.toThrow();
  });
});
