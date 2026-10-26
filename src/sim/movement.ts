// Player movement (PLAN.md M1): walk on the floor plane, jump, dive/prone, stand on props.
// Numbers come from TUNING (research/mechanics/move-*).
import { GRAVITY, JUMP_V0, TUNING } from '../data/tuning';
import { project } from '../render/camera';
import type { Actor } from './actor';
import { clamp, moveWithCollision, surfaceBelow } from './collision';
import type { PlayerCommand } from './command';
import type { World } from './world';

const { move: MOVE, jump: JUMP, prone: PRONE } = TUNING;
const DIVE_TIME = PRONE.downTime * 2; // the forward dive is a longer drop: 1 H over 0.3 s (invented split)

/** Combat walk whenever an enemy is in the room or the player is armed (invented rule, PLAN.md M1). */
export function inCombat(world: World, a: Actor): boolean {
  return a.pose.held !== null || world.actors.some((o) => o !== a && o.kind !== 'hero' && !o.pose.dead);
}

export function stepPlayer(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  const b = a.body;
  b.stateTime += dt;

  let ix = cmd.moveX, iz = cmd.moveZ;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const speed = inCombat(world, a) ? MOVE.combatWalkSpeed : MOVE.walkSpeed;
  const wantX = ix * speed, wantZ = iz * speed * MOVE.depthFactor;

  updateFacing(a, cmd, ix);

  const enter = (s: typeof b.state) => { b.state = s; b.stateTime = 0; };

  switch (b.state) {
    case 'ground': {
      if (cmd.jump) {
        b.vel = { x: wantX, y: JUMP_V0, z: wantZ };
        b.takeoff = { x: wantX, z: wantZ };
        enter('air');
        world.events.emit('jump', { actorId: a.id, ...a.pos });
        break;
      }
      if (cmd.dive) {
        if (len > 0.1) {
          const d = PRONE.diveDistance / DIVE_TIME;
          b.vel = { x: (ix / Math.max(len, 1e-6)) * d, y: 0, z: (iz / Math.max(len, 1e-6)) * d * MOVE.depthFactor };
          enter('diving');
        } else {
          b.vel = { x: 0, y: 0, z: 0 };
          enter('goingProne');
        }
        world.events.emit('dive', { actorId: a.id, ...a.pos });
        break;
      }
      b.vel = { x: wantX, y: 0, z: wantZ };
      walkHorizontal(world, a, dt);
      advanceWalkCycle(world, a, Math.hypot(wantX, wantZ) * dt);
      // walked off a prop edge -> fall
      const ground = surfaceBelow(world.room, a.pos.x, a.pos.z, a.pos.y);
      if (ground < a.pos.y - 0.01) {
        b.takeoff = { x: b.vel.x, z: b.vel.z };
        b.vel.y = 0;
        enter('air');
      }
      break;
    }
    case 'air': {
      b.vel.x = b.takeoff.x + JUMP.airSteer * wantX;
      b.vel.z = b.takeoff.z + JUMP.airSteer * wantZ;
      const prevY = a.pos.y;
      // exact constant-gravity step, so airtime/apex match the measured values at any tick rate
      a.pos.y += b.vel.y * dt - 0.5 * GRAVITY * dt * dt;
      b.vel.y -= GRAVITY * dt;
      walkHorizontal(world, a, dt);
      const ground = surfaceBelow(world.room, a.pos.x, a.pos.z, Math.max(prevY, a.pos.y));
      b.groundY = ground;
      if (b.vel.y <= 0 && a.pos.y <= ground) {
        const fallSpeed = -b.vel.y;
        a.pos.y = ground;
        b.vel = { x: 0, y: 0, z: 0 };
        b.squashLeft = JUMP.landSquash;
        enter('ground');
        world.events.emit('land', { actorId: a.id, ...a.pos, fallSpeed });
      }
      break;
    }
    case 'diving': {
      walkHorizontal(world, a, dt);
      if (b.stateTime >= DIVE_TIME) { b.vel = { x: 0, y: 0, z: 0 }; enter('prone'); }
      break;
    }
    case 'goingProne':
      if (b.stateTime >= PRONE.downTime) enter('prone');
      break;
    case 'prone':
      if (cmd.dive || cmd.jump) {
        enter('standingUp');
        world.events.emit('standUp', { actorId: a.id, ...a.pos });
      }
      break;
    case 'standingUp':
      if (b.stateTime >= PRONE.upTime) enter('ground');
      break;
  }

  if (b.state !== 'air') b.groundY = surfaceBelow(world.room, a.pos.x, a.pos.z, a.pos.y);
  b.squashLeft = Math.max(0, b.squashLeft - dt);
  syncPose(a, len > 0.1);
}

function updateFacing(a: Actor, cmd: PlayerCommand, ix: number): void {
  if (cmd.aim) {
    const [px] = project(a.pos.x, a.pos.y + 0.5, a.pos.z);
    if (cmd.aim[0] > px + MOVE.facingDeadzonePx) a.facing = 1;
    else if (cmd.aim[0] < px - MOVE.facingDeadzonePx) a.facing = -1;
  } else if (Math.abs(ix) > 0.1) a.facing = ix > 0 ? 1 : -1;
}

function walkHorizontal(world: World, a: Actor, dt: number): void {
  const p = moveWithCollision(world.room, a.pos.x, a.pos.z, a.body.vel.x * dt, a.body.vel.z * dt, a.pos.y);
  a.pos.x = p.x;
  a.pos.z = p.z;
}

/** Walk cycle phase: 2 pi per stride; a footstep event on every half cycle. */
function advanceWalkCycle(world: World, a: Actor, distance: number): void {
  const before = a.body.cycle;
  a.body.cycle += (distance / MOVE.strideLength) * Math.PI * 2;
  if (Math.floor(a.body.cycle / Math.PI) !== Math.floor(before / Math.PI)) world.events.emit('footstep', { actorId: a.id, ...a.pos });
}

/** Translate body state into the pose the painter draws. */
function syncPose(a: Actor, moving: boolean): void {
  const b = a.body, p = a.pose;
  const down = PRONE.height;
  switch (b.state) {
    case 'goingProne': p.prone = clamp(b.stateTime / PRONE.downTime, 0, 1); break;
    case 'diving': p.prone = clamp(b.stateTime / DIVE_TIME, 0, 1); break;
    case 'prone': p.prone = 1; break;
    case 'standingUp': p.prone = 1 - clamp(b.stateTime / PRONE.upTime, 0, 1); break;
    default: p.prone = 0;
  }
  b.height = 1 - (1 - down) * p.prone;
  p.tuck = b.state === 'air' ? 0.6 + 0.4 * (1 - clamp(Math.abs(b.vel.y) / JUMP_V0, 0, 1)) : 0;
  p.squash = b.squashLeft / TUNING.jump.landSquash;
  p.walkPhase = b.state === 'ground' && moving ? b.cycle : undefined;
  p.groundY = b.groundY;
}
