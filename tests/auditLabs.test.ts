// M14b labs (mercy, stomp, weapon finisher, slump): each sets up and runs 5 s without throwing.
import { describe, expect, it } from 'vitest';
import '../src/labs/auditLabs';
import { getLab } from '../src/labs/registry';
import { World } from '../src/sim/world';
import { STAGE1 } from '../src/data/stages/stage1';
import { IDLE_COMMAND } from '../src/sim/command';
const TEST_ROOM = STAGE1.rooms.arena.room;

describe('M14b audit labs', () => {
  for (const slug of ['audit-mercy', 'audit-stomp', 'audit-weapon-finisher', 'audit-slump']) {
    it(`${slug} runs`, () => {
      const lab = getLab(slug)!;
      expect(lab).toBeDefined();
      const world = new World(TEST_ROOM);
      lab.setup(world);
      for (let i = 0; i < 300; i++) { world.step(); lab.step?.(world); }
      expect(typeof (lab.info?.(world) ?? '')).toBe('string');
    });
  }

  it('the stomp lab stomps a prone hero', () => {
    const lab = getLab('audit-stomp')!;
    const world = new World(TEST_ROOM);
    lab.setup(world);
    let stomps = 0;
    world.events.on('stomp', (e) => { if (e.phase === 'tell') stomps++; });
    for (let i = 0; i < 600 && !stomps; i++) { world.command = { ...IDLE_COMMAND, dive: i === 0 }; world.step(); lab.step?.(world); }
    expect(stomps).toBeGreaterThan(0);
  });
});
