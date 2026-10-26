// Locomotion (PLAN.md M1): walk on the floor plane, jump, dive/prone, stand on props. Runs
// while an actor is in the `free` combat state. Numbers come from TUNING (research/mechanics/move-*).
import { aboutFeet } from '../anim/skeleton';
import { GRAVITY, JUMP_V0, TUNING } from '../data/tuning';
import { project } from '../render/camera';
import { type Actor, alive } from './actor';
import { clamp, moveWithCollision, surfaceBelow } from './collision';
import type { PlayerCommand } from './command';
import type { World } from './world';

const { move: MOVE, jump: JUMP, prone: PRONE } = TUNING;
export const DIVE_TIME = PRONE.downTime * 2; // the forward dive is a longer drop: 1 H over 0.3 s (invented split)

/** Combat walk whenever an enemy is in the room or the player is armed (invented rule, PLAN.md M1). */
export function inCombat(world: World, a: Actor): boolean {
  // zombies only ever shuffle (enemy-zombie)
  if (a.kind === 'zombie') return false;
  return a.hands.some((h) => h !== null) || world.actors.some((o) => o !== a && o.kind !== 'hero' && alive(o));
}

export function stepLocomotion(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  const b = a.body;
  b.stateTime += dt;

  let ix = cmd.moveX, iz = cmd.moveZ;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  let speed = inCombat(world, a) ? MOVE.combatWalkSpeed : MOVE.walkSpeed;
  if (a.holding) speed *= TUNING.grab.carrySpeed;
  speed *= a.walkFactor ?? 1;
  const wantX = ix * speed, wantZ = iz * speed * MOVE.depthFactor;

  updateFacing(a, cmd, ix);

  const enter = (s: typeof b.state) => { b.state = s; b.stateTime = 0; };

  switch (b.state) {
    case 'ground': {
      if (cmd.jump && !a.holding) {
        b.vel = { x: wantX, y: JUMP_V0, z: wantZ };
        b.takeoff = { x: wantX, z: wantZ };
        enter('air');
        world.events.emit('jump', { actorId: a.id, ...a.pos });
        break;
      }
      if (cmd.dive && !a.holding) {
        if (len > 0.1) {
          const d = PRONE.diveDistance / DIVE_TIME;
          const ux = ix / Math.max(len, 1e-6), uz = iz / Math.max(len, 1e-6);
          b.vel = { x: ux * d, y: 0, z: uz * d * MOVE.depthFactor };
          // melee-low-sweep: diving into an adjacent enemy goes in feet first
          b.sweep = Math.abs(ux) > 0.3 && sweepTarget(world, a, Math.sign(ux) as 1 | -1, 1.0) !== undefined;
          b.swept = [];
          if (b.sweep) a.facing = Math.sign(ux) as 1 | -1;
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
    case 'air':
      airStep(world, a, wantX, wantZ, dt);
      break;
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
      if (b.stateTime >= PRONE.upTime) { b.sweep = false; enter('ground'); }
      break;
  }

  if (b.state !== 'air') b.groundY = surfaceBelow(world.room, a.pos.x, a.pos.z, a.pos.y);
  b.squashLeft = Math.max(0, b.squashLeft - dt);
  syncLocomotionPose(a, len > 0.1);
}

/** One tick of a jump or fall: steer a little, exact constant-gravity step, land on what's below. */
function airStep(world: World, a: Actor, wantX: number, wantZ: number, dt: number): void {
  const b = a.body;
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
    b.state = 'ground';
    b.stateTime = 0;
    world.events.emit('land', { actorId: a.id, ...a.pos, fallSpeed });
  }
}

/**
 * An action (shot, punch, swing, throw, grenade) started in the air: the jump carries on under
 * it (same steering and gravity), facing stays with the action. Landing keeps the action going.
 */
export function stepAirborneAction(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  let ix = cmd.moveX, iz = cmd.moveZ;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const speed = (inCombat(world, a) ? MOVE.combatWalkSpeed : MOVE.walkSpeed) * (a.walkFactor ?? 1);
  a.body.stateTime += dt;
  airStep(world, a, ix * speed, iz * speed * MOVE.depthFactor, dt);
  a.body.squashLeft = Math.max(0, a.body.squashLeft - dt);
  a.pose.tuck = a.body.state === 'air' ? 0.6 + 0.4 * (1 - clamp(Math.abs(a.body.vel.y) / JUMP_V0, 0, 1)) : 0;
  a.pose.squash = a.body.squashLeft / TUNING.jump.landSquash;
  a.pose.groundY = a.body.groundY;
  a.pose.walkPhase = undefined;
}

/** A standing, living actor within `reach` ahead on the same depth band. */
export function sweepTarget(world: World, a: Actor, dir: 1 | -1, reach: number): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (o === a || o.state === 'dead' || o.state === 'grabbed' || o.state === 'down' || o.state === 'downed' || o.state === 'getUp' || o.state === 'knockback') continue;
    if (o.body.height < 0.9 || Math.abs(o.pos.z - a.pos.z) > TUNING.melee.depthBand) continue;
    const d = (o.pos.x - a.pos.x) * dir;
    if (d >= -0.1 && d <= reach && d < bestD) { best = o; bestD = d; }
  }
  return best;
}

function updateFacing(a: Actor, cmd: PlayerCommand, ix: number): void {
  if (a.body.sweep && a.body.state !== 'ground') return;
  if (cmd.face) a.facing = cmd.face;
  else if (cmd.aim) {
    const [px] = project(a.pos.x, a.pos.y + 0.5, a.pos.z);
    if (cmd.aim[0] > px + MOVE.facingDeadzonePx) a.facing = 1;
    else if (cmd.aim[0] < px - MOVE.facingDeadzonePx) a.facing = -1;
  } else if (Math.abs(ix) > 0.1) a.facing = ix > 0 ? 1 : -1;
}

/**
 * Walking during a punch or throw (decided with the user): ground only, facing stays locked
 * to the swing, speed scaled by TUNING.move.attackMoveFactor.
 */
export function stepAttackMove(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  let ix = cmd.moveX, iz = cmd.moveZ;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const speed = (inCombat(world, a) ? MOVE.combatWalkSpeed : MOVE.walkSpeed) * MOVE.attackMoveFactor * (a.holding ? TUNING.grab.carrySpeed : 1);
  a.body.vel = { x: ix * speed, y: 0, z: iz * speed * MOVE.depthFactor };
  walkHorizontal(world, a, dt);
  advanceWalkCycle(world, a, Math.hypot(a.body.vel.x, a.body.vel.z) * dt);
  a.body.groundY = surfaceBelow(world.room, a.pos.x, a.pos.z, a.pos.y);
  a.pose.walkPhase = len > 0.1 ? a.body.cycle : undefined;
}

function walkHorizontal(world: World, a: Actor, dt: number): void {
  const p = moveWithCollision(world.room, a.pos.x, a.pos.z, a.body.vel.x * dt, a.body.vel.z * dt, a.pos.y, a.entering);
  a.pos.x = p.x;
  a.pos.z = p.z;
  // walked in from off-screen or through a door: the room bounds apply from now on
  if (a.entering && Math.abs(a.pos.x) <= world.room.halfWidth - MOVE.radius) a.entering = false;
}

/** Walk cycle phase: 2 pi per stride; a footstep event on every half cycle. */
function advanceWalkCycle(world: World, a: Actor, distance: number): void {
  const before = a.body.cycle;
  a.body.cycle += (distance / MOVE.strideLength) * Math.PI * 2;
  if (Math.floor(a.body.cycle / Math.PI) !== Math.floor(before / Math.PI)) world.events.emit('footstep', { actorId: a.id, ...a.pos });
}

/** Translate body state into the pose the painter draws. */
function syncLocomotionPose(a: Actor, moving: boolean): void {
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
  // prone falls forward onto the face, a sweep goes in feet first on the back
  const root = aboutFeet((b.sweep ? -1 : 1) * (Math.PI / 2) * p.prone, 1 - 0.08 * p.prone);
  if (p.squash > 0) { root.sx *= 1 + 0.08 * p.squash; root.sy *= 1 - 0.1 * p.squash; }
  p.root = root;
}
