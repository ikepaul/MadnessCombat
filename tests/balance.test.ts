// Balance tool (opt-in): scripted players fight stage 1 wave A headless at three reaction
// speeds, alone and in co-op, and print the outcome. Run with
// `BALANCE=1 npx vitest run tests/balance.test.ts` after changing TUNING.ai or a wave script.
// Always-on checks: quick, competent players clear wave A alone and together.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { WaveDirector } from '../src/sim/waves';
import { World } from '../src/sim/world';

/** One bot's command: walk to the nearest grunt, light to stun, heavy on the stunned (or juggled, M10b) grunt. */
function botCommand(world: World, hero: Actor, reaction: number, state: { wait: number }): PlayerCommand {
  const cmd: PlayerCommand = { ...IDLE_COMMAND };
  if (hero.state === 'downed' || !alive(hero)) return cmd;
  // a downed teammate comes first: stand in the circle
  const down = world.players.find((p) => p !== hero && p.state === 'downed');
  if (down) {
    const dx = down.pos.x - hero.pos.x, dz = down.pos.z - hero.pos.z;
    if (Math.hypot(dx, dz) > TUNING.coop.reviveRadius * 0.6) { cmd.moveX = Math.sign(dx); cmd.moveZ = Math.abs(dz) > 0.1 ? Math.sign(dz) : 0; }
  }
  // M10b: a grunt bounced back off a wall is airborne and juggled: a competent player finishes him
  const juggled = (a: Actor) => !!a.flight?.juggle && a.flight.phase === 'air';
  const foes = world.actors.filter((a) => a.ai && alive(a) && !a.entering && (a.state !== 'knockback' || juggled(a)));
  const t = foes.sort((a, b) => Math.abs(a.pos.x - hero.pos.x) - Math.abs(b.pos.x - hero.pos.x))[0];
  if (!t) return cmd;
  const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z;
  cmd.face = dx >= 0 ? 1 : -1;
  if (!down) {
    if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
    if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
  }
  if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.15 && hero.state === 'free') {
    state.wait -= world.dt;
    if (state.wait <= 0) { cmd.attack = t.state === 'stun' || juggled(t) ? 'heavy' : 'light'; state.wait = reaction; }
  }
  return cmd;
}

/** `reaction` = seconds between being in range and swinging. */
function fightWaveA(seed: number, reaction: number, players = 1) {
  const A = STAGE1.rooms.arena;
  const world = new World(A.room);
  (world as unknown as { seed: number }).seed = seed;
  for (let i = 0; i < players; i++) world.addPlayer(createActor('hero', players === 1 ? 0 : i ? 0.6 : -0.6, 9.2, 1));
  world.director = new WaveDirector(A.script);
  let hitsTaken = 0, cleared = false;
  const states = world.players.map(() => ({ wait: 0 }));
  world.events.on('hit', (e) => world.players.some((p) => p.id === e.actorId) && e.damage > 0 && hitsTaken++);
  world.events.on('roomCleared', () => (cleared = true));
  for (let i = 0; i < 60 * 240 && !cleared && world.activePlayers.length > 0; i++) {
    world.commands = world.players.map((p, k) => botCommand(world, p, reaction, states[k]));
    world.step();
  }
  return { cleared, kills: world.kills, hitsTaken, seconds: Math.round(world.tick / 60) };
}

describe('balance (stage 1 wave A)', () => {
  it('a quick, competent player clears wave A alone', () => {
    for (const seed of [1, 2, 3]) expect(fightWaveA(seed, 0.1).cleared).toBe(true);
  });

  it('two quick, competent players clear co-op wave A', () => {
    for (const seed of [1, 2, 3]) expect(fightWaveA(seed, 0.1, 2).cleared).toBe(true);
  });

  it.skipIf(!process.env.BALANCE)('report', () => {
    const rows = [`ai ${JSON.stringify(TUNING.ai)}`];
    for (const players of [1, 2]) {
      for (const reaction of [0.1, 0.2, 0.35]) {
        for (const seed of [1, 2, 3]) rows.push(`${players}p reaction ${reaction}s seed ${seed}: ${JSON.stringify(fightWaveA(seed, reaction, players))}`);
      }
    }
    console.log(rows.join('\n'));
  });
});
