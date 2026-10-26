// Unarmed grunt AI (PLAN.md M3, research/mechanics/enemy-grunt-unarmed): walk in, get an
// attack token, stand at punch range and swing every 0.6-1.0 s. Grunts without a token wait
// on a ring 1.5-2.5 H from the player and drift in depth. At most TUNING.ai.maxAttackers hold
// a token, so enemies trickle into the fight instead of swarming (classic beat-'em-up rule).
import { TUNING } from '../data/tuning';
import { type Actor, alive, type Brain } from './actor';
import { clamp } from './collision';
import { IDLE_COMMAND, type PlayerCommand } from './command';
import type { World } from './world';

const AI = TUNING.ai;

export interface AiState {
  /** Seconds until the next swing is allowed. */
  cooldown: number;
  /** Distance this grunt waits at while it has no token. */
  ring: number;
  /** Depth this grunt drifts toward while waiting. */
  waitZ: number;
  /** Re-pick waitZ after this many seconds. */
  driftT: number;
  /** Seconds spent in punch range (the wind-up before the first swing). */
  ready: number;
}

export function newAiState(world: World): AiState {
  const [r0, r1] = AI.waitRing;
  return { cooldown: 0, ring: r0 + world.rng() * (r1 - r0), waitZ: 9.3, driftT: 0, ready: 0 };
}

/** Can still fight: not knocked about, held or dead. */
function ableToFight(a: Actor): boolean {
  return a.state === 'free' || a.state === 'attack' || a.state === 'stun';
}

/**
 * Hand out attack tokens (once per tick, before the actors step): holders keep theirs while
 * they can fight, free tokens go to the able grunts nearest the player.
 */
export function assignTokens(world: World): void {
  const p = world.player;
  const tokens = world.tokens;
  for (const id of [...tokens]) {
    const a = world.actorById(id);
    if (!a || !ableToFight(a) || !p || !alive(p)) {
      tokens.delete(id);
      // a freed token waits before the next grunt steps in, so knockdowns buy breathing room
      world.tokenFreeAt.push(world.time + AI.tokenCooldown);
    }
  }
  world.tokenFreeAt = world.tokenFreeAt.filter((t) => t > world.time);
  if (!p || !alive(p) || tokens.size + world.tokenFreeAt.length >= AI.maxAttackers) return;
  const waiting = world.actors
    .filter((a) => a.ai && !tokens.has(a.id) && a.state === 'free' && !a.entering)
    .sort((a, b) => dist(a, p) - dist(b, p));
  for (const a of waiting) {
    if (tokens.size >= AI.maxAttackers) break;
    tokens.add(a.id);
    a.ai!.ready = 0;
  }
}

function dist(a: Actor, b: Actor): number {
  return Math.hypot(a.pos.x - b.pos.x, (a.pos.z - b.pos.z) * 2);
}

/** Brain for an unarmed grunt. */
export function gruntBrain(world: World): Brain {
  return (a, dt) => {
    const ai = a.ai!;
    ai.cooldown = Math.max(0, ai.cooldown - dt);
    const p = world.player;
    const face = (p && p.pos.x < a.pos.x ? -1 : 1) as 1 | -1;
    if (!p || !alive(p)) return { ...IDLE_COMMAND, face };
    const room = world.room;
    const inside = room.halfWidth - 0.6;

    // walking in from off-screen or a door: straight in until inside the bounds
    if (a.entering) return { ...IDLE_COMMAND, moveX: -Math.sign(a.pos.x) * AI.speed, face: (-Math.sign(a.pos.x) || 1) as 1 | -1 };

    let tx: number, tz: number;
    if (world.tokens.has(a.id)) {
      // punch spot on our side of the player, on the player's depth
      tx = p.pos.x - face * AI.punchDistance;
      tz = p.pos.z;
      const dx = Math.abs(p.pos.x - a.pos.x), dz = Math.abs(p.pos.z - a.pos.z);
      const target = p.state !== 'down' && p.state !== 'getUp' && p.state !== 'knockback';
      const inRange = dx <= TUNING.melee.range - 0.02 && dx >= 0.3 && dz <= TUNING.melee.depthBand * 0.6;
      // the wind-up only counts once in range, so the player gets a beat to strike first
      ai.ready = inRange ? ai.ready + dt : 0;
      if (target && inRange && ai.ready >= AI.windUp && ai.cooldown <= 0 && a.state === 'free' && world.time - world.lastEnemySwing >= AI.swingGap) {
        world.lastEnemySwing = world.time;
        const [i0, i1] = AI.attackInterval;
        ai.cooldown = i0 + world.rng() * (i1 - i0);
        return { ...IDLE_COMMAND, face, attack: world.rng() < AI.heavyChance ? 'heavy' : 'light' };
      }
    } else {
      // wait on the ring, on whichever side of the player we are, drifting in depth
      ai.driftT -= dt;
      if (ai.driftT <= 0) {
        ai.driftT = 1.5 + world.rng() * 1.5;
        ai.waitZ = room.zFront + 0.2 + world.rng() * (room.zBack - room.zFront - 0.5);
      }
      tx = p.pos.x - face * ai.ring;
      tz = ai.waitZ;
    }
    tx = clamp(tx, -inside, inside);
    return { ...steer(a, tx, tz, world.tokens.has(a.id) ? 0.06 : 0.2), face };
  };
}

/** Walk toward (tx, tz) with a small dead zone, at the grunt speed share. */
function steer(a: Actor, tx: number, tz: number, deadZone: number): PlayerCommand {
  const dx = tx - a.pos.x, dz = (tz - a.pos.z) / TUNING.move.depthFactor;
  const d = Math.hypot(dx, dz);
  if (d < deadZone) return { ...IDLE_COMMAND };
  const slow = easeIn(d);
  return { ...IDLE_COMMAND, moveX: (dx / d) * AI.speed * slow, moveZ: (dz / d) * AI.speed * slow };
}

/** Ease off when close to the target so grunts don't jitter around it. */
function easeIn(d: number): number {
  return Math.min(1, 0.35 + d);
}
