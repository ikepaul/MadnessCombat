// UXS/TEC audit probes for co-op (opt-in: AUDIT=1 npx vitest run tests/audit/uxs).
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../../../src/data/stages/stage1';
import { createActor } from '../../../src/sim/actor';
import { IDLE_COMMAND } from '../../../src/sim/command';
import { applySnapshot, SnapshotWriter } from '../../../src/net/snapshot';
import { World } from '../../../src/sim/world';

function pair() {
  const host = new World(STAGE1.rooms.arena.room);
  host.addPlayer(createActor('hero', -0.6, 9.2, 1));
  host.addPlayer(createActor('hero', 0.6, 9.2, 1));
  const guest = new World(STAGE1.rooms.arena.room);
  guest.puppet = true;
  const w = new SnapshotWriter(host, 1);
  return { host, guest, w };
}

describe.skipIf(!process.env.AUDIT)('TEC co-op puppet', () => {
  it('an actor the host removes mid-room (boss leaves, body falls into the void) stays on the guest (TEC-03)', () => {
    const { host, guest, w } = pair();
    const boss = createActor('grunt', 2, 9.5, -1);
    host.actors.push(boss);
    host.step();
    applySnapshot(guest, w.take());
    expect(guest.actorById(boss.id)).toBeDefined();
    host.actors.splice(host.actors.indexOf(boss), 1); // what stage2Script/stage3Late/improbability do
    host.step();
    applySnapshot(guest, w.take());
    w.needFull = true; // even a full snapshot doesn't prune
    host.step();
    applySnapshot(guest, w.take());
    console.log(`[TEC-03] host actors ${host.actors.length}, guest actors ${guest.actors.length}; removed actor still on guest: ${!!guest.actorById(boss.id)}`);
    expect(guest.actorById(boss.id)).toBeDefined();
  });

  it("player 2's held keys stay held on the host when no more input arrives (guest leaves or its tab sleeps) (TEC-04)", () => {
    const { host } = pair();
    const p2 = host.players[1];
    const x0 = p2.pos.x;
    host.commands[1] = { ...IDLE_COMMAND, moveX: 1 }; // the last input the guest sent
    for (let i = 0; i < 180; i++) host.step(); // 3 s, nothing new from the guest
    console.log(`[TEC-04] P2 walked ${(p2.pos.x - x0).toFixed(2)} H in 3 s on his last input`);
    expect(p2.pos.x - x0).toBeGreaterThan(1);
  });
});
