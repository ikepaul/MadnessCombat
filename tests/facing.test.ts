// Playtest 2026-10-27: a punch chained during the previous one turns to the cursor.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { project } from '../src/render/camera';
import { createActor } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import { World } from '../src/sim/world';

describe('facing in a combo', () => {
  it('a punch queued during a punch comes out toward the cursor on the other side', () => {
    const world = new World({ ...TEST_ROOM, props: [] });
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const [sx, sy] = project(0, 0.5, 9.2);
    const right: [number, number] = [sx + 200, sy], left: [number, number] = [sx - 200, sy];
    world.command = { ...IDLE_COMMAND, attack: 'light', aim: right };
    world.step();
    expect(hero.state).toBe('attack');
    expect(hero.facing).toBe(1);
    // late in the swing (inside the buffer) the next punch is pressed with the mouse on the left
    world.command = { ...IDLE_COMMAND, aim: right };
    for (let i = 0; i < 17; i++) world.step();
    expect(hero.state).toBe('attack');
    world.command = { ...IDLE_COMMAND, attack: 'light', aim: left };
    world.step();
    // the hand stays on the punch button's aim; the next swing must start facing left
    world.command = { ...IDLE_COMMAND, aim: left };
    const first = hero.attack;
    let turned = false;
    for (let i = 0; i < 30; i++) {
      world.step();
      if (hero.state === 'attack' && hero.attack !== first) { turned = hero.facing === -1; break; }
    }
    expect(turned).toBe(true);
  });
});
