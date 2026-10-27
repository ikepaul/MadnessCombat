// Playtest 2026-10-27: bodies from the last room stayed drawn in the next one, because the
// scene re-baked frozen corpses on 'roomChanged' before the old actors were cleared.
import { describe, expect, it } from 'vitest';
import { STAGE3 } from '../src/data/stages/stage3';
import { createActor } from '../src/sim/actor';
import { enterRoom } from '../src/sim/stage';
import { World } from '../src/sim/world';

describe('room change', () => {
  it('the old room is empty of bodies and items when the change is announced', () => {
    const world = new World(STAGE3.rooms.street.room);
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    const body = createActor('grunt', 1, 9.2, 1, { dead: true });
    body.corpse = { phase: 'frozen', t: 0, raisable: false, gibbed: false, slumped: false };
    world.actors.push(body);
    world.spawnItem('pistol', 'grunt', { x: 0, y: 0, z: 9.2 }, { x: 0, y: 0, z: 0 }, 0);
    let atChange: { bodies: number; items: number } | undefined;
    world.events.on('roomChanged', () => { atChange = { bodies: world.actors.filter((a) => a.corpse).length, items: world.items.length }; });
    enterRoom(world, STAGE3, 'desert', 'west');
    expect(atChange).toEqual({ bodies: 0, items: 0 });
  });
});
