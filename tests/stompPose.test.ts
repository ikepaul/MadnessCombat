// M14b Look & sound: the stomp's drawn wind-up and stamp (src/anim/stomp.ts), render only.
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { FEEL } from '../src/data/feel';
import { TUNING } from '../src/data/tuning';
import { buildSkeleton } from '../src/anim/layers';
import { installStompPose, STAMP } from '../src/anim/stomp';
import { createActor } from '../src/sim/actor';
import { World } from '../src/sim/world';

const P = FEEL.pose as { stompPose: number };

function scene() {
  const world = new World({ ...TEST_ROOM, props: [] });
  installStompPose(world);
  const g = createActor('grunt', 0, 9.2, 1);
  world.actors.push(g);
  const foot = (t: number) => buildSkeleton(g, t).skeleton.footF;
  return { world, g, foot };
}

describe('stomp pose', () => {
  const old = P.stompPose;
  afterEach(() => { P.stompPose = old; });

  it('tell lifts the front foot, the stamp plants it ahead, then it eases back', () => {
    const { world, g, foot } = scene();
    const rest = foot(0);
    g.pose.telegraph = 0;
    world.events.emit('stomp', { actorId: g.id, targetId: 0, phase: 'tell', x: 0, y: 0, z: 9.2 });
    const up = foot(world.time + TUNING.enc.stomp.tell);
    expect(up[1]).toBeLessThan(rest[1] - 0.15);
    expect(up[0]).toBeGreaterThan(0.25); // clear of the coat
    g.pose.telegraph = undefined;
    world.events.emit('stomp', { actorId: g.id, targetId: 0, phase: 'hit', x: 0, y: 0, z: 9.2 });
    const down = foot(world.time + STAMP.drive + 0.01);
    expect(down[0]).toBeGreaterThan(rest[0] + 0.2);
    expect(down[1]).toBeGreaterThan(-0.05);
    const after = foot(world.time + STAMP.drive + STAMP.hold + STAMP.back + 0.05);
    expect(after[0]).toBeCloseTo(rest[0], 5);
  });

  it('switched off (FEEL.pose.stompPose = 0) the clip is untouched', () => {
    P.stompPose = 0;
    const { world, g, foot } = scene();
    const rest = foot(0);
    g.pose.telegraph = 0;
    world.events.emit('stomp', { actorId: g.id, targetId: 0, phase: 'tell', x: 0, y: 0, z: 9.2 });
    expect(foot(world.time + TUNING.enc.stomp.tell)[1]).toBeCloseTo(rest[1], 5);
  });
});
