// Balance tool (opt-in): a scripted player fights stage 1 wave A headless at three reaction
// speeds and prints the outcome. Run with `BALANCE=1 npx vitest run tests/balance.test.ts`
// after changing TUNING.ai or the wave script. The one always-on check: a quick, competent
// player clears wave A (the room must stay beatable).
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

/** `reaction` = seconds between being in range and swinging. */
function fightWaveA(seed: number, reaction: number) {
  const A = STAGE1.rooms.arena;
  const world = new World(A.room);
  (world as unknown as { seed: number }).seed = seed;
  const hero = createActor('hero', 0, 9.2, 1);
  world.actors.push(hero);
  world.player = hero;
  world.director = new WaveDirector(A.script);
  let hitsTaken = 0, cleared = false, wait = 0;
  world.events.on('hit', (e) => e.actorId === hero.id && e.damage > 0 && hitsTaken++);
  world.events.on('roomCleared', () => (cleared = true));
  for (let i = 0; i < 60 * 180 && !cleared && alive(hero); i++) {
    const cmd: PlayerCommand = { ...IDLE_COMMAND };
    const foes = world.actors.filter((a) => a.ai && alive(a) && !a.entering && a.state !== 'knockback');
    const t = foes.sort((a, b) => Math.abs(a.pos.x - hero.pos.x) - Math.abs(b.pos.x - hero.pos.x))[0];
    if (t) {
      const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z;
      cmd.face = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
      if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
      if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.15 && hero.state === 'free') {
        wait -= world.dt;
        // the quick cross: a light to stun, then a heavy on the stunned grunt
        if (wait <= 0) { cmd.attack = t.state === 'stun' ? 'heavy' : 'light'; wait = reaction; }
      }
    }
    world.command = cmd;
    world.step();
  }
  return { cleared, kills: world.kills, hitsTaken, seconds: Math.round(world.tick / 60) };
}

describe('balance (stage 1 wave A)', () => {
  it('a quick, competent player clears wave A', () => {
    for (const seed of [1, 2, 3]) expect(fightWaveA(seed, 0.1).cleared).toBe(true);
  });

  it.skipIf(!process.env.BALANCE)('report', () => {
    const rows = [`ai ${JSON.stringify(TUNING.ai)}`];
    for (const reaction of [0.1, 0.2, 0.35]) {
      for (const seed of [1, 2, 3]) rows.push(`reaction ${reaction}s seed ${seed}: ${JSON.stringify(fightWaveA(seed, reaction))}`);
    }
    console.log(rows.join('\n'));
  });
});
