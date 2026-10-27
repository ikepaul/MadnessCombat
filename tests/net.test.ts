// Co-op networking (PLAN.md M4b): the relay's routing and the host -> guest snapshots.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND } from '../src/sim/command';
import { CoopRelay, type RelayClient } from '../src/net/relay';
import { applySnapshot, type Snapshot, SnapshotWriter } from '../src/net/snapshot';
import { WaveDirector } from '../src/sim/waves';
import { STAGE2 } from '../src/data/stages/stage2';
import { stageRunner } from '../src/sim/stage';
import { dropBlock, setImprobable, startCollapse } from '../src/sim/improbability';
import { World } from '../src/sim/world';

class Client implements RelayClient {
  got: [string, unknown][] = [];
  send(event: string, data?: unknown) { this.got.push([event, data]); }
  last(event: string) { return [...this.got].reverse().find(([e]) => e === event)?.[1] as Record<string, unknown> | undefined; }
}

describe('relay', () => {
  it('pairs one host with one guest and routes inputs and snapshots one way each', () => {
    const relay = new CoopRelay(() => ['http://192.168.1.20:5173/?coop=join']);
    const host = new Client(), guest = new Client(), third = new Client();
    relay.hello(host, 'host');
    expect(host.last('coop:welcome')).toMatchObject({ ok: true, peer: false, joinUrls: ['http://192.168.1.20:5173/?coop=join'] });
    relay.hello(guest, 'guest');
    expect(guest.last('coop:welcome')).toMatchObject({ ok: true, peer: true });
    expect(host.last('coop:peer')).toEqual({ connected: true });
    relay.hello(third, 'guest');
    expect(third.last('coop:welcome')).toMatchObject({ ok: false });

    relay.input(guest, { moveX: 1 });
    relay.input(host, { moveX: -1 }); // ignored: only the guest sends inputs
    expect(host.got.filter(([e]) => e === 'coop:input')).toEqual([['coop:input', { moveX: 1 }]]);
    relay.snap(host, { tick: 1 });
    relay.snap(guest, { tick: 2 }); // ignored: only the host sends snapshots
    expect(guest.got.filter(([e]) => e === 'coop:snap')).toEqual([['coop:snap', { tick: 1 }]]);

    relay.closed(guest);
    expect(host.last('coop:peer')).toEqual({ connected: false });
  });

  it('a guest before any host is told to wait; a second host is refused', () => {
    const relay = new CoopRelay();
    const guest = new Client(), host = new Client(), host2 = new Client();
    relay.hello(guest, 'guest');
    expect(guest.last('coop:welcome')).toMatchObject({ ok: false });
    relay.hello(host, 'host');
    relay.hello(host2, 'host');
    expect(host2.last('coop:welcome')).toMatchObject({ ok: false });
  });
});

/** A co-op host world mid-fight, and a puppet world fed through JSON like the websocket. */
function hostAndPuppet() {
  const A = STAGE1.rooms.arena;
  const host = new World(A.room);
  host.addPlayer(createActor('hero', -0.6, 9.2, 1));
  host.addPlayer(createActor('hero', 0.6, 9.2, -1));
  host.director = new WaveDirector(A.script);
  const writer = new SnapshotWriter(host, 1);
  const puppet = new World(A.room);
  const send = () => applySnapshot(puppet, JSON.parse(JSON.stringify(writer.take())) as Snapshot);
  return { host, puppet, writer, send };
}

describe('snapshots', () => {
  it('the puppet world shows the host world: actors, both players, items, kill count', () => {
    const { host, puppet, send } = hostAndPuppet();
    send(); // the first one is full
    for (let i = 0; i < 60 * 6; i++) {
      host.commands = [{ ...IDLE_COMMAND, moveX: 1 }, { ...IDLE_COMMAND }];
      host.step();
      if (i % 2 === 0) send();
    }
    // kill one grunt on the host, then sync
    const g = host.actors.find((a) => a.ai && !a.entering)!;
    host.hitActor(host.players[1], g, 'wall', 1, 0, g.pos);
    host.step();
    send();
    expect(puppet.players.map((p) => p.id)).toEqual(host.players.map((p) => p.id));
    expect(puppet.players[1].playerIndex).toBe(1);
    for (const a of host.actors) {
      const b = puppet.actorById(a.id)!;
      expect(b, `actor ${a.id}`).toBeDefined();
      expect(b.pos).toEqual(a.pos);
      expect(b.state).toBe(a.state);
      expect(b.pose.clip).toBe(a.pose.clip);
    }
    expect(puppet.kills).toBe(host.kills);
    expect(puppet.kills).toBe(1);
  });

  it('events are replayed on the guest, in order, without double counting kills', () => {
    const { host, puppet, send } = hostAndPuppet();
    send();
    const seen: string[] = [];
    puppet.events.on('hit', () => seen.push('hit'));
    puppet.events.on('kill', () => seen.push('kill'));
    puppet.events.on('heal', () => seen.push('heal'));
    for (let i = 0; i < 120; i++) host.step();
    const g = host.actors.find((a) => a.ai)!;
    host.players[0].hp = 2;
    g.hp = 1;
    host.hitActor(host.players[0], g, 'light', 1, 0, g.pos);
    send();
    expect(seen).toEqual(['hit', 'kill', 'heal']);
    expect(puppet.kills).toBe(1);
  });

  it('frozen corpses are left out of later snapshots, except the one where they froze', () => {
    const { host, writer } = hostAndPuppet();
    writer.take();
    host.spawnCorpses(5);
    for (let i = 0; i < 60 * 2; i++) host.step();
    const froze = writer.take();
    expect(froze.actors.filter((a) => a.corpse === 'frozen')).toHaveLength(5);
    host.step();
    expect(writer.take().actors.filter((a) => a.corpse === 'frozen')).toHaveLength(0);
    writer.needFull = true;
    expect(writer.take().actors.filter((a) => a.corpse === 'frozen')).toHaveLength(5);
  });
});

describe('snapshots carry guns (M5)', () => {
  it('player 2 sees the hands, the ammo and every shot', () => {
    const { host, puppet, send } = hostAndPuppet();
    send();
    const shots: number[] = [];
    puppet.events.on('shot', (e) => shots.push(e.hand));
    host.players[1].hands[0] = newHand('pistol');
    host.commands = [{ ...IDLE_COMMAND }, { ...IDLE_COMMAND, press: [true, false], aim: [1600, 700] }];
    host.step();
    send();
    expect(shots).toEqual([0]);
    expect(puppet.players[1].hands[0]).toMatchObject({ item: 'pistol', ammo: 7 });
    expect(puppet.players[1].pose.held).toBe('pistol');
  });
});

describe('snapshots across room changes (M9)', () => {
  it('the full snapshot sent for a room change still carries that tick\'s events (the wipe uncovering)', () => {
    const host = new World(STAGE2.rooms.wall.room);
    host.addPlayer(createActor('hero', -2.9, 9.0, 1));
    host.addPlayer(createActor('hero', -2.4, 9.2, 1));
    host.seq.run(stageRunner(STAGE2, 'wall', 'west'), 'stage');
    const writer = new SnapshotWriter(host, 1);
    // as GameScene does: a room change asks for a full snapshot
    host.events.on('roomChanged', () => (writer.needFull = true));
    const snaps: Snapshot[] = [];
    writer.take(); // the guest's first (joining) snapshot
    for (let i = 0; i < 60 * 3; i++) host.step();
    // both walk off the right edge into the corner (co-op exits wait for everyone)
    host.players[0].pos.x = 3.3;
    host.players[1].pos.x = 3.3;
    for (let i = 0; i < 60 * 2 && host.roomId !== 'corner'; i++) {
      host.commands = [{ ...IDLE_COMMAND, moveX: 1 }, { ...IDLE_COMMAND, moveX: 1 }];
      host.step();
      snaps.push(JSON.parse(JSON.stringify(writer.take())) as Snapshot);
    }
    expect(host.roomId).toBe('corner');
    const change = snaps.find((s) => s.roomId === 's2-corner')!;
    expect(change.full).toBe(true);
    expect(change.events.some(([t, p]) => t === 'roomTransition' && (p as { phase: string }).phase === 'in')).toBe(true);
  });

  it('a guest who joins mid-room gets no stale events', () => {
    const { host, writer } = hostAndPuppet();
    writer.take();
    for (let i = 0; i < 30; i++) host.step();
    writer.needFull = true;
    writer.joining = true;
    expect(writer.take().events).toEqual([]);
  });
});

describe('snapshots carry stage 3 (M11)', () => {
  it('player 2 sees improbability mode, the collapse, the falling tank and the hovering jetpack', () => {
    const { host, puppet, writer } = hostAndPuppet();
    const send = () => applySnapshot(puppet, JSON.parse(JSON.stringify(writer.take())) as Snapshot);
    send();
    setImprobable(host, true);
    startCollapse(host, -1, 0);
    dropBlock(host, 1.5, 9.6);
    const jet = createActor('grunt', -2, 9.2, 1);
    jet.hover = 1.3;
    jet.pose.jetpack = true;
    host.actors.push(jet);
    for (let i = 0; i < 90; i++) host.step();
    send();
    expect(puppet.physics).toBe('improbable');
    expect(puppet.room.void).toEqual(host.room.void);
    expect(puppet.blocks.length).toBe(1);
    expect(puppet.actorById(jet.id)?.hover).toBe(1.3);
  });
});

describe('guest sees what the host sees (playtest 2026-10-27)', () => {
  it('snapshots carry the host palette (the guest decides colours and blood from it)', () => {
    const host = new World(STAGE1.rooms.arena.room);
    host.addPlayer(createActor('hero', 0, 9.2, 1));
    const writer = new SnapshotWriter(host, 1, () => 'warm');
    const s = JSON.parse(JSON.stringify(writer.take())) as Snapshot;
    expect(s.palette).toBe('warm');
  });

  it('a flying kick reaches the puppet (its pose leans into it)', () => {
    const { host, puppet, send } = hostAndPuppet();
    send();
    host.players[0].body.kick = true;
    send();
    expect(puppet.players[0].body.kick).toBe(true);
    host.players[0].body.kick = false;
    send();
    expect(puppet.players[0].body.kick).toBeFalsy();
  });
});

describe('guest exits (playtest 2026-10-27)', () => {
  it('the room exits reach the puppet, so the guest can show the E prompt', () => {
    const { host, puppet, send } = hostAndPuppet();
    host.exits = [{ def: { id: 'vent', kind: 'vent', x0: 2.3, x1: 3.2, z0: 9.9, z1: 10.4, to: 'vent', entry: 'vent' }, open: true }];
    send();
    expect(puppet.exits.map((e) => e.def.id)).toEqual(['vent']);
  });
});
