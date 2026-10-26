import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { EventBus } from '../src/sim/events';
import { World } from '../src/sim/world';

describe('EventBus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = new EventBus<{ ping: { n: number } }>();
    const got: number[] = [];
    const off = bus.on('ping', (p) => got.push(p.n));
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(got).toEqual([1]);
  });

  it('the world emits tick and roomChanged', () => {
    const world = new World(TEST_ROOM);
    const ticks: number[] = [];
    const rooms: string[] = [];
    world.events.on('tick', (e) => ticks.push(e.tick));
    world.events.on('roomChanged', (e) => rooms.push(e.roomId));
    world.step();
    world.step();
    world.setRoom({ ...TEST_ROOM, id: 'other' });
    expect(ticks).toEqual([1, 2]);
    expect(rooms).toEqual(['other']);
  });
});
