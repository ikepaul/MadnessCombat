// Grunt AI (PLAN.md M3, research/mechanics/enemy-grunt-unarmed): walk in, get an attack
// token, stand at punch range and swing every 0.6-1.0 s. Grunts with a melee weapon stand at
// its reach and swing it; knife grunts also throw from range now and then (enemy-behaviours).
// Gun grunts (M7, enemy-grunt-armed) keep 3-5 H away, use a table as cover when one is near,
// raise the gun with a 0.4 s telegraph and fire with aim error; their bullets hit whoever is in
// the way, other grunts included (enemy-behaviours: friendly fire). Melee grunts without a token wait
// on a ring 1.5-2.5 H from the player and drift in depth. At most TUNING.ai.maxAttackers hold
// a token, so enemies trickle into the fight instead of swarming (classic beat-'em-up rule).
// Co-op: every grunt fights the nearest standing player, and the token limit is per player.
import { isMelee, MELEE } from '../data/melee';
import { TUNING } from '../data/tuning';
import { GRENADE } from '../data/melee';
import { GUNS, isWeapon, WEAPONS, type WeaponDef } from '../data/weapons';
import { project, type ScreenPoint } from '../render/camera';
import { type Actor, alive, type Brain, type Hand } from './actor';
import { clamp, moveWithCollision } from './collision';
import { IDLE_COMMAND, type PlayerCommand } from './command';
import type { Cannon } from './cannon';
import { castRay } from './hitscan';
import { notHoldable } from './items';
import { canFlip } from './cover';
import { alert, checkHeld, lookOut } from './stealth';
import type { World } from './world';

const AI = TUNING.ai, R = AI.ranged;

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
  /** The player this grunt fights (nearest standing player; kept while it holds a token). */
  target?: number;
  /** Seconds until a knife grunt considers throwing again. */
  throwT?: number;
  /** Gun grunts: distance kept from the player (picked per grunt). */
  keep?: number;
  /** Gun grunts: seconds into the aim telegraph (undefined = not aiming). */
  aimT?: number;
  /** Gun grunts: seconds left in the current burst (automatic guns). */
  burstT?: number;
  /** Gun grunts: aim error of the current shot / burst (H). */
  err?: [number, number];
  /** M7 stealth: false = unaware (idles, smokes or patrols facing a fixed way). */
  aware?: boolean;
  /** What an unaware enemy does, and its patrol span (x). */
  idle?: 'stand' | 'smoke' | 'chat' | 'patrol' | 'dance' | 'cower';
  /** M14 world-crowd-dancefloor: grunts sharing a crowd name are alerted together. */
  crowd?: string;
  /** M14 crowd: seconds until this grunt shoves the player again. */
  shoveT?: number;
  patrol?: [number, number];
  /** Patrol: walking direction and the wait at a turn. */
  patrolDir?: 1 | -1;
  waitT?: number;
  /** Seconds a player has been in sight (alert after TUNING.stealth.notice). */
  noticeT?: number;
  /** One in four gun grunts kicks a table over for cover (combat-cover). */
  flipper?: boolean;
  /** Cooking the encounter's grenade: seconds since the pin. */
  nadeT?: number;
  /** enemy-squad-leader: the leader this grunt sticks to; `charge` once he's dead. */
  leader?: number;
  charge?: boolean;
  /** enemy-elite-bodyguard: the VIP this guard stays next to, and on which side. */
  guard?: number;
  guardSide?: 1 | -1;
  /** M8 wave B: this grunt goes for the boss's cannon and fires it (no cannon: he just fights). */
  role?: 'cannon' | 'welder' | 'roof';
  /** M9 world-breach: caught off guard by an entry from above, this many seconds left. */
  surpriseT?: number;
}

export function newAiState(world: World): AiState {
  const [r0, r1] = AI.waitRing;
  return { cooldown: 0, ring: r0 + world.rng() * (r1 - r0), waitZ: 9.3, driftT: 0, ready: 0, flipper: world.rng() < AI.flipChance };
}

/** The gun a grunt fights with (front hand first), if any. */
export function gunHand(a: Actor): { h: Hand; w: WeaponDef; i: 0 | 1 } | undefined {
  for (const i of [0, 1] as const) {
    const h = a.hands[i];
    if (h && isWeapon(h.item)) return { h, w: WEAPONS[h.item], i };
  }
  return undefined;
}

/** Melee fighters share the attack tokens; gun grunts shoot from range instead. Unaware ones don't fight yet. */
function usesTokens(world: World, a: Actor): boolean {
  if ((gunHand(a) && a.variant !== 'agent') || a.ai?.aware === false || a.ai?.idle === 'cower' || a.takenBy !== undefined || a.variant === 'vip') return false;
  // the cannoneer works the cannon instead of queueing for a punch
  if (a.ai?.role === 'cannon' && landedCannon(world)) return false;
  // a squad sticks to its living leader unless a player walks right up to it
  const l = a.ai?.leader !== undefined ? world.actorById(a.ai.leader) : undefined;
  return !l || !alive(l) || world.activePlayers.some((p) => dist(a, p) < AI.squadEngage);
}

/** Zombies and a charging squad don't wait for a token. */
const uncapped = (a: Actor) => a.kind === 'zombie' || !!a.ai?.charge;

/** Can be shot at: standing (no get-up i-frames, not knocked flat). */
const shootable = (p: Actor) => p.state === 'free' || p.state === 'attack' || p.state === 'stun';

/** Can still fight: not knocked about, held or dead. */
function ableToFight(a: Actor): boolean {
  return a.state === 'free' || a.state === 'attack' || a.state === 'stun';
}

/** The standing player nearest to `a`, if any. */
function nearestPlayer(world: World, a: Actor): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  // M18: a partner carried or swung by the other is out of reach (they turn on the carrier)
  for (const p of world.activePlayers) {
    if (p.carried) continue;
    const d = dist(a, p);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/**
 * Hand out attack tokens (once per tick, before the actors step): holders keep theirs while
 * they and their target can fight; each standing player gets up to TUNING.ai.maxAttackers,
 * given to the able grunts nearest that player.
 */
export function assignTokens(world: World): void {
  markFear(world);
  const tokens = world.tokens;
  const standing = world.activePlayers.filter((p) => !p.carried);
  for (const id of [...tokens]) {
    const a = world.actorById(id);
    const target = a?.ai?.target !== undefined ? world.actorById(a.ai.target) : undefined;
    if (!a || !ableToFight(a) || !usesTokens(world, a) || !target || !standing.includes(target)) {
      tokens.delete(id);
      // a freed token waits before the next grunt steps in, so knockdowns buy breathing room
      if (target) world.tokenFreeAt.push({ player: target.id, t: world.time + AI.tokenCooldown });
    }
  }
  world.tokenFreeAt = world.tokenFreeAt.filter((f) => f.t > world.time);
  // grunts without a token turn to whichever standing player is nearest
  for (const a of world.actors) {
    if (a.ai && !tokens.has(a.id)) a.ai.target = nearestPlayer(world, a)?.id;
  }
  for (const a of world.actors) {
    if (a.ai && uncapped(a) && !tokens.has(a.id) && a.ai.target !== undefined && a.state === 'free' && !a.entering && usesTokens(world, a)) {
      tokens.add(a.id);
      a.ai.ready = 0;
    }
  }
  for (const p of standing) {
    let used = world.tokenFreeAt.filter((f) => f.player === p.id).length;
    for (const id of tokens) if (world.actorById(id)?.ai?.target === p.id) used++;
    if (used >= AI.maxAttackers) continue;
    const waiting = world.actors
      .filter((a) => a.ai && usesTokens(world, a) && !tokens.has(a.id) && a.ai.target === p.id && a.state === 'free' && !a.entering)
      .sort((a, b) => dist(a, p) - dist(b, p));
    for (const a of waiting) {
      if (used >= AI.maxAttackers) break;
      tokens.add(a.id);
      a.ai!.ready = 0;
      used++;
    }
  }
}

/** enemy-behaviours: the last enemy of a wave (everyone else dead, nobody left to come) sweats. */
function markFear(world: World): void {
  const foes = world.actors.filter((a) => a.ai && alive(a) && a.kind !== 'zombie' && a.variant !== 'vip');
  const last = foes.length === 1 && !!world.director?.allSpawned(world);
  for (const a of foes) a.pose.sweat = last;
}

function dist(a: Actor, b: Actor): number {
  return Math.hypot(a.pos.x - b.pos.x, (a.pos.z - b.pos.z) * 2);
}

/** Brain for a grunt: melee (fists or a melee weapon) or ranged (a gun). */
export function gruntBrain(world: World): Brain {
  return (a, dt) => {
    const ai = a.ai!;
    ai.cooldown = Math.max(0, ai.cooldown - dt);
    // being taken down: held still
    if (checkHeld(world, a)) return { ...IDLE_COMMAND };
    // M10 enemy-welder: the room script works him
    if (ai.role === 'welder') return { ...IDLE_COMMAND, face: a.facing };
    // M10: hands up (a hold-up): stand still facing whoever holds him
    if (a.surrendered) {
      const p = world.activePlayers[0];
      return { ...IDLE_COMMAND, face: p && p.pos.x < a.pos.x ? -1 : 1 };
    }
    // world-breach: someone just dropped through the ceiling
    if ((ai.surpriseT ?? 0) > 0) {
      ai.surpriseT! -= dt;
      a.pose.lean = -0.15;
      if (ai.surpriseT! <= 0 && ai.aware === false) alert(world, a);
      return { ...IDLE_COMMAND, face: a.facing };
    }
    // M14 enemy-behaviours: the cowering grunt never fights: he sweats and watches
    if (ai.idle === 'cower') {
      const q = world.activePlayers[0];
      a.pose.sweat = true;
      return { ...IDLE_COMMAND, face: q && q.pos.x < a.pos.x ? -1 : 1 };
    }
    if (ai.aware === false) return unawareStep(world, a, dt);
    // enemy-squad-leader: the leader is down, the squad charges
    if (ai.leader !== undefined) {
      const l = world.actorById(ai.leader);
      if (!l || !alive(l)) {
        ai.leader = undefined;
        ai.charge = true;
        world.events.emit('squadCharge', { actorId: a.id, ...a.pos });
      }
    }
    const p = ai.target !== undefined ? world.actorById(ai.target) : undefined;
    const face = (p && p.pos.x < a.pos.x ? -1 : 1) as 1 | -1;
    if (!p || !alive(p) || p.state === 'downed') { stopAiming(world, a); return { ...IDLE_COMMAND, face }; }

    // walking in from off-screen or a door: straight in until inside the bounds
    if (a.entering) {
      ai.cooldown = Math.max(ai.cooldown, R.settle);
      return { ...IDLE_COMMAND, moveX: -Math.sign(a.pos.x) * AI.speed, face: (-Math.sign(a.pos.x) || 1) as 1 | -1 };
    }
    // the VIP (a stage's target) stays put, watching
    if (a.variant === 'vip') return { ...IDLE_COMMAND, face };
    if (ai.role === 'cannon') {
      const c = landedCannon(world);
      if (c) return cannonStep(a, p, c);
      ai.role = undefined; // nothing to man: fight like the rest
    }
    const gun = gunHand(a);
    // M14 enemy-agent: closes in and fights hand to hand; the heavy pistol only beyond closeRange
    const brawl = a.variant === 'agent' && dist(a, p) < TUNING.ai.agent.closeRange;
    if (gun && !brawl) return rangedStep(world, a, p, gun, face, dt);
    stopAiming(world, a);
    if (brawl) return meleeStep(world, a, p, face, dt);
    // enemy-behaviours: empty-handed grunts go for a weapon on the floor nearby
    const loot = !a.hands[0] && !a.hands[1] && a.kind !== 'zombie' ? scavenge(world, a) : undefined;
    if (loot) return loot;
    return meleeStep(world, a, p, face, dt);
  };
}

/** Unaware: stand / smoke facing a fixed way, or patrol a span; look out for players. */
function unawareStep(world: World, a: Actor, dt: number): PlayerCommand {
  const ai = a.ai!, S = TUNING.stealth;
  lookOut(world, a, dt);
  // M14 world-crowd-dancefloor: the crowd dances (the stage 1 dancer's loop) until the alarm
  a.pose.dancing = ai.aware === false && ai.idle === 'dance' ? true : undefined;
  // an unaware guard's gun hangs lowered
  const aim = gunHand(a) ? project(a.pos.x + a.facing * 2, a.pos.y + 0.1, a.pos.z) : undefined;
  if (ai.aware !== false) return { ...IDLE_COMMAND, face: a.facing, aim };
  if (ai.idle !== 'patrol' || !ai.patrol) return { ...IDLE_COMMAND, face: a.facing, aim };
  if ((ai.waitT ?? 0) > 0) { ai.waitT! -= dt; return { ...IDLE_COMMAND, face: a.facing, aim }; }
  const dir = (ai.patrolDir ??= a.facing);
  const end = dir > 0 ? ai.patrol[1] : ai.patrol[0];
  if ((end - a.pos.x) * dir <= 0.02) {
    // turn round at the end of the beat, after a wait
    ai.patrolDir = (-dir) as 1 | -1;
    ai.waitT = S.patrolWait;
    return { ...IDLE_COMMAND, face: ai.patrolDir, aim };
  }
  return { ...IDLE_COMMAND, moveX: dir * S.patrolSpeed, face: dir, aim: gunHand(a) ? project(a.pos.x + dir * 2, a.pos.y + 0.1, a.pos.z) : undefined };
}

/** Walk to (and pick up) the nearest weapon on the floor within TUNING.ai.scavenge. */
function scavenge(world: World, a: Actor): PlayerCommand | undefined {
  let best: (typeof world.items)[number] | undefined, bestD = Infinity;
  for (const it of world.items) {
    if (it.state !== 'floor' || notHoldable(it.kind)) continue;
    // M10b pop & catch: a weapon popped out of a hand is the player's for a moment
    if (it.popUntil !== undefined && world.time < it.popUntil) continue;
    // not from under a player's feet
    if (world.activePlayers.some((p) => Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z) < AI.scavengeClear)) continue;
    const d = Math.hypot(it.pos.x - a.pos.x, it.pos.z - a.pos.z);
    if (d <= AI.scavenge && d < bestD) { best = it; bestD = d; }
  }
  if (!best || a.state !== 'free') return undefined;
  const face = (best.pos.x < a.pos.x ? -1 : 1) as 1 | -1;
  if (Math.hypot(best.pos.x - a.pos.x, (best.pos.z - a.pos.z) * 1.5) <= GUNS.pickupRange * 0.9) return { ...IDLE_COMMAND, face, pickup: true };
  return { ...steer(a, best.pos.x, best.pos.z, 0.05), face };
}

/** Chest point of `p` (+ an aim error in H), on screen. */
function chestAim(p: Actor, err: [number, number] = [0, 0]): ScreenPoint {
  return project(p.pos.x + err[0], p.pos.y + 0.55 + err[1], p.pos.z);
}

/** Drop the telegraph (hit, target gone, or out of ammo). */
function stopAiming(world: World, a: Actor): void {
  const ai = a.ai!;
  if (ai.aimT !== undefined && ai.burstT === undefined) world.events.emit('aimCancel', { actorId: a.id, ...a.pos });
  ai.aimT = undefined;
  ai.burstT = undefined;
  a.pose.telegraph = undefined;
}

/**
 * Gun grunt: keep the distance (behind a table if one is near), then raise the gun (aim
 * telegraph), fire after TUNING.ai.ranged.telegraph with aim error, cool down 0.6-1.2 s.
 * Empty: reload with a spare, otherwise click and throw the gun at the player (gun-empty-throw).
 */
function rangedStep(world: World, a: Actor, p: Actor, gun: NonNullable<ReturnType<typeof gunHand>>, face: 1 | -1, dt: number): PlayerCommand {
  const ai = a.ai!;
  const { h, w, i } = gun;
  const press: [boolean, boolean] = [false, false], hold: [boolean, boolean] = [false, false];
  // the gun hangs lowered (pointing at the floor ahead) until it's raised to aim
  const lowered = project(a.pos.x + face * 2, a.pos.y + 0.1, a.pos.z);
  if (a.state !== 'free' && a.state !== 'attack') { stopAiming(world, a); return { ...IDLE_COMMAND, face }; }
  // M10 the elevator roof gunner: stays put and only shoots once the welder's slot is open
  if (ai.role === 'roof' && !world.flags.has('slotOpen')) { stopAiming(world, a); return { ...IDLE_COMMAND, face, aim: lowered }; }

  // firing a burst (automatic guns): keep the trigger down
  if (ai.burstT !== undefined) {
    ai.burstT -= dt;
    if (ai.burstT <= 0 || h.ammo <= 0) { ai.burstT = undefined; ai.aimT = undefined; a.pose.telegraph = undefined; }
    else { hold[i] = true; return { ...IDLE_COMMAND, face, aim: chestAim(p, ai.err), hold }; }
  }

  // cooking the encounter's grenade, then the lob at the player's feet
  if (ai.nadeT !== undefined) {
    ai.nadeT += dt;
    if (ai.nadeT < AI.grenadeCook) return { ...IDLE_COMMAND, face, grenade: true, aim: lowered };
    ai.nadeT = undefined;
    ai.cooldown = Math.max(ai.cooldown, 0.8);
    return { ...IDLE_COMMAND, face, grenade: false, aim: project(p.pos.x, 0, p.pos.z) };
  }

  // out of ammo: reload, or click and throw it
  if (h.reload > 0) return { ...positionFor(world, a, p, w, face), face, aim: lowered };
  if (h.ammo <= 0) {
    stopAiming(world, a);
    if (h.spare > 0) return { ...IDLE_COMMAND, face, reload: true, aim: lowered };
    if (ai.cooldown > 0) return { ...positionFor(world, a, p, w, face), face, aim: lowered };
    ai.cooldown = 0.5;
    press[i] = true;
    return { ...IDLE_COMMAND, face, press, aim: chestAim(p) };
  }

  // the aim telegraph: gun raised at the player, then the shot
  if (ai.aimT !== undefined) {
    if (!shootable(p)) { stopAiming(world, a); return { ...IDLE_COMMAND, face, aim: lowered }; }
    ai.aimT += dt;
    // M14: an armed zombie takes longer over it
    const tel = a.kind === 'zombie' ? TUNING.zombie.gunTelegraph : R.telegraph;
    a.pose.telegraph = Math.min(1, ai.aimT / tel);
    if (ai.aimT + 1e-6 < tel) return { ...IDLE_COMMAND, face, aim: chestAim(p) };
    // someone stepped into the line during the telegraph: usually hold fire
    if (allyInLine(world, a, p) && world.rng() < R.holdFire) { stopAiming(world, a); ai.cooldown = 0.3; return { ...IDLE_COMMAND, face, aim: lowered }; }
    // fire: aim error picked per shot (per burst for automatics)
    ai.err = [(world.rng() * 2 - 1) * R.aimError, (world.rng() * 2 - 1) * R.aimError];
    const [i0, i1] = R.interval;
    ai.cooldown = i0 + world.rng() * (i1 - i0);
    press[i] = true;
    if (w.auto) { ai.burstT = R.burst; hold[i] = true; }
    else { ai.aimT = undefined; a.pose.telegraph = undefined; }
    return { ...IDLE_COMMAND, face, aim: chestAim(p, ai.err), press, hold };
  }

  // start aiming: cooled down, in range, and not too many others aiming at this player
  const dx = Math.abs(p.pos.x - a.pos.x);
  const [, k1] = keepRange(w, a);
  const aimers = world.actors.filter((o) => o.ai?.aimT !== undefined && o.ai.target === p.id).length;
  if (ai.cooldown <= 0 && shootable(p) && dx <= k1 + 1.5 && aimers < R.maxAimers && a.state === 'free' && a.body.state === 'ground') {
    // the encounter's one grenade, now and then, when no other grunt is near the player
    const [g0, g1] = AI.grenadeRange;
    if (world.enemyGrenades > 0 && dx >= g0 && dx <= Math.min(g1, GRENADE.maxRange) && world.rng() < AI.grenadeChance &&
      !world.actors.some((o) => o !== a && o.ai && alive(o) && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < AI.grenadeClear)) {
      world.enemyGrenades--;
      a.grenades++;
      ai.nadeT = 0;
      return { ...IDLE_COMMAND, face, grenade: true, aim: lowered };
    }
    // a table right here to kick over for cover
    const flip = ai.flipper ? flipTarget(world, a, p) : -1;
    if (flip >= 0) {
      ai.flipper = false;
      ai.cooldown = 0.6;
      return { ...IDLE_COMMAND, face: a.facing, flip };
    }
    // an ally in the way: usually step to another depth first (friendly fire stays occasional)
    if (allyInLine(world, a, p) && world.rng() < R.holdFire) {
      ai.cooldown = 0.4;
      ai.waitZ = world.room.zFront + 0.2 + world.rng() * (world.room.zBack - world.room.zFront - 0.5);
      ai.driftT = 2;
      return { ...positionFor(world, a, p, w, face), face, aim: lowered };
    }
    ai.aimT = 0;
    a.pose.telegraph = 0;
    world.events.emit('aimStart', { actorId: a.id, targetId: p.id, weapon: w.id, ...a.pos });
    return { ...IDLE_COMMAND, face, aim: chestAim(p) };
  }
  if (ai.role === 'roof') return { ...IDLE_COMMAND, face, aim: lowered };
  return { ...positionFor(world, a, p, w, face), face, aim: lowered };
}

/** The first body on the line from our chest to the player's is another enemy. */
function allyInLine(world: World, a: Actor, p: Actor): boolean {
  const from = project(a.pos.x, a.pos.y + 0.6, a.pos.z), to = chestAim(p);
  const n = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const r = castRay(world, from, [(to[0] - from[0]) / n, (to[1] - from[1]) / n], a.pos.z, (o) => o === a);
  return !!r.hit && r.hit.actor !== p && r.hit.actor.playerIndex === undefined;
}

/** Index of a table right in front of us (in depth) that we can kick over toward the player, or -1. */
function flipTarget(world: World, a: Actor, p: Actor): number {
  return world.room.props.findIndex((t) => t.kind === 'table' && canFlip(world, t) && p.pos.z < t.z0 &&
    a.pos.x > t.x0 - 0.1 && a.pos.x < t.x1 + 0.1 && a.pos.z > t.z1 && a.pos.z - t.z1 < 0.45);
}

function keepRange(w: WeaponDef, a?: Actor): readonly [number, number] {
  // boss-clown: the mini-boss walks in shooting (and that's what makes him stealable)
  if (a?.variant === 'riot') return R.keepRiot;
  return w.id === 'shotgun' || w.id === 'sawedoff' ? R.keepShotgun : R.keep;
}

/** Walk to the firing spot: `keep` H from the player on our side, behind a table if one is close. */
function positionFor(world: World, a: Actor, p: Actor, w: WeaponDef, face: 1 | -1): PlayerCommand {
  const ai = a.ai!;
  const room = world.room, inside = room.halfWidth - 0.6;
  const [k0, k1] = keepRange(w, a);
  if (ai.keep === undefined || ai.keep < k0 || ai.keep > k1) ai.keep = k0 + world.rng() * (k1 - k0);
  // enemy-elite-bodyguard: stays at the VIP's side instead of chasing
  const vip = ai.guard !== undefined ? world.actorById(ai.guard) : undefined;
  if (vip && alive(vip)) return steer(a, clamp(vip.pos.x + (ai.guardSide ?? 1) * AI.guardGap, -inside, inside), vip.pos.z + (ai.guardSide ?? 1) * 0.25, 0.1);
  let tx = clamp(p.pos.x - face * ai.keep, -inside, inside);
  // no room on our side: go round to the other side
  if (Math.abs(tx - p.pos.x) < k0 * 0.6) tx = clamp(p.pos.x + face * ai.keep, -inside, inside);
  ai.driftT -= world.dt;
  if (ai.driftT <= 0) {
    ai.driftT = 2 + world.rng() * 2;
    ai.waitZ = room.zFront + 0.2 + world.rng() * (room.zBack - room.zFront - 0.5);
  }
  let tz = ai.waitZ;
  // combat-cover: a table between us and the player (in depth) shields us from the player's rays
  for (const prop of room.props) {
    if (prop.kind !== 'table' || prop.top > 0.9 && !prop.tip) continue;
    const cx = (prop.x0 + prop.x1) / 2, behind = prop.z1 + 0.25;
    if (p.pos.z >= prop.z0 || behind > room.zBack - 0.2 || Math.abs(cx - tx) > R.coverRange) continue;
    const d = Math.abs(cx - p.pos.x);
    if (d < k0 * 0.7) continue;
    tx = cx;
    tz = behind;
    break;
  }
  return steer(a, tx, tz, 0.15);
}

/** Melee grunt (fists or a melee weapon): the attack-token dance. */
function meleeStep(world: World, a: Actor, p: Actor, face: 1 | -1, dt: number): PlayerCommand {
  const ai = a.ai!;
  const room = world.room;
  const inside = room.halfWidth - 0.6;

  // a melee weapon sets how close to stand and swing from
  const h = a.hands[0];
  const weapon = h && isMelee(h.item) ? MELEE[h.item] : undefined;
  const reach = weapon ? weapon.reach : TUNING.melee.range;
  const stand = weapon ? Math.max(AI.punchDistance, weapon.reach - AI.weaponMargin) : AI.punchDistance;

  // enemy-behaviours: a knife grunt throws it from range now and then (then fights barehanded)
  // M11: axe grunts throw theirs too where a room allows it (research/stages.md stage 3 room 4:
  // an axe thrown round the corner); elsewhere they keep it, as before
  const throws = weapon?.id === 'knife' || (weapon?.id === 'axe' && world.flags.has('axeThrows'));
  if (throws && a.state === 'free' && a.kind !== 'zombie') {
    ai.throwT = (ai.throwT ?? AI.knifeThrowEvery * world.rng()) - dt;
    const dx = Math.abs(p.pos.x - a.pos.x), dz = Math.abs(p.pos.z - a.pos.z);
    const [r0, r1] = AI.knifeThrowRange;
    const last = world.lastEnemySwing.get(p.id) ?? -Infinity;
    if (ai.throwT <= 0) {
      ai.throwT = AI.knifeThrowEvery;
      if (dx >= r0 && dx <= r1 && dz <= 0.3 && p.state === 'free' && world.time - last >= AI.swingGap && world.rng() < AI.knifeThrowChance) {
        world.lastEnemySwing.set(p.id, world.time);
        const aim = project(p.pos.x, p.pos.y + 0.6, p.pos.z);
        return weapon.id === 'axe' ? { ...IDLE_COMMAND, face, throwGun: true, aim } : { ...IDLE_COMMAND, face, attack: 'light', aim };
      }
    }
  }

  let tx: number, tz: number;
  if (world.tokens.has(a.id)) {
    // punch (or weapon) spot on our side of the player, on the player's depth
    tx = p.pos.x - face * stand;
    tz = p.pos.z;
    const dx = Math.abs(p.pos.x - a.pos.x), dz = Math.abs(p.pos.z - a.pos.z);
    const target = p.state !== 'down' && p.state !== 'getUp' && p.state !== 'knockback';
    const inRange = dx <= reach - 0.02 && dx >= 0.3 && dz <= TUNING.melee.depthBand * 0.6;
    // the wind-up only counts once in range, so the player gets a beat to strike first
    ai.ready = inRange ? ai.ready + dt : 0;
    const last = world.lastEnemySwing.get(p.id) ?? -Infinity;
    if (target && inRange && ai.ready >= AI.windUp && ai.cooldown <= 0 && a.state === 'free' && world.time - last >= AI.swingGap) {
      world.lastEnemySwing.set(p.id, world.time);
      const [i0, i1] = AI.attackInterval;
      ai.cooldown = i0 + world.rng() * (i1 - i0);
      // armed: swing the weapon (LMB); unarmed: punch, sometimes heavy
      // M11 the vending-machine brute only throws big knockdown punches
      const heavy = a.variant === 'vending' || (!weapon && world.rng() < AI.heavyChance);
      return { ...IDLE_COMMAND, face, attack: heavy ? 'heavy' : 'light', aim: project(p.pos.x, p.pos.y + 0.6, p.pos.z) };
    }
  } else {
    // wait on the ring, on whichever side of the player we are, drifting in depth
    ai.driftT -= dt;
    if (ai.driftT <= 0) {
      ai.driftT = 1.5 + world.rng() * 1.5;
      ai.waitZ = room.zFront + 0.2 + world.rng() * (room.zBack - room.zFront - 0.5);
    }
    tx = p.pos.x - face * (ai.crowd ? TUNING.ai.crowd.ring : ai.ring);
    tz = ai.crowd ? p.pos.z + (ai.waitZ - (room.zFront + room.zBack) / 2) * 0.5 : ai.waitZ;
    // M14 crowd: pressing in, the ones right next to the player shove him (no damage)
    if (ai.crowd) crowdShove(world, a, p, dt);
    // enemy-squad-leader: the squad waits grouped round its leader (cohesion 2 H)
    const l = ai.leader !== undefined ? world.actorById(ai.leader) : undefined;
    if (l && alive(l)) {
      tx = l.pos.x + (ai.ring - 2) * AI.squadSpread * 2;
      tz = l.pos.z + (ai.waitZ - (room.zFront + room.zBack) / 2) * 0.4;
    }
  }
  tx = clamp(tx, -inside, inside);
  return { ...steer(a, tx, tz, world.tokens.has(a.id) ? 0.06 : 0.2), face };
}

/** M14 world-crowd-dancefloor: a short harmless push on the player from a crowd grunt beside him. */
function crowdShove(world: World, a: Actor, p: Actor, dt: number): void {
  const C = TUNING.ai.crowd, ai = a.ai!;
  ai.shoveT = (ai.shoveT ?? C.shoveEvery[0] + world.rng() * (C.shoveEvery[1] - C.shoveEvery[0])) - dt;
  if (ai.shoveT > 0 || a.state !== 'free' || p.state !== 'free' || dist(a, p) > C.shoveRange) return;
  ai.shoveT = C.shoveEvery[0] + world.rng() * (C.shoveEvery[1] - C.shoveEvery[0]);
  const dir = Math.sign(p.pos.x - a.pos.x) || 1;
  const q = moveWithCollision(world.room, p.pos.x, p.pos.z, dir * C.shove, 0, p.pos.y);
  p.pos.x = q.x;
  p.pose.lean = -0.15 * dir * p.facing;
  a.pose.lean = 0.2;
  world.events.emit('shove', { actorId: a.id, targetId: p.id, soft: true, ...p.pos });
}

// ---------- M8: manning the boss's cannon (ep1 f2799-f2849) ----------

/** The boss's cannon once it's down (nobody else working it). */
function landedCannon(world: World): Cannon | undefined {
  return world.cannons.find((c) => c.live && (c.y ?? 0) <= 0);
}

/**
 * Get behind the cannon, on the far side from the player (walking round the barrel if needed),
 * then fire it: one ball per TUNING.cannon.interval while he stands there, at the player's depth
 * (src/sim/cannon.ts stops it the moment he's hit, knocked down or killed).
 */
function cannonStep(a: Actor, p: Actor, c: Cannon): PlayerCommand {
  const C = TUNING.boss.cannon;
  const side = (p.pos.x >= c.x ? 1 : -1) as 1 | -1;
  const spotX = c.x - side * C.behind, spotZ = c.z;
  const manning = c.byId === a.id;
  const wrongSide = Math.sign(a.pos.x - c.x) === side;
  if (manning && (wrongSide || Math.hypot(a.pos.x - spotX, a.pos.z - spotZ) > 0.2)) { c.byId = undefined; c.shots = 0; }
  if (wrongSide) {
    // round the barrel: step off its row first, then across
    const offZ = c.z + 0.65;
    if (Math.abs(a.pos.z - offZ) > 0.12) return { ...steer(a, a.pos.x, offZ, 0.05), face: side };
    return { ...steer(a, spotX, offZ, 0.05), face: side };
  }
  if (Math.hypot(a.pos.x - spotX, a.pos.z - spotZ) > 0.12) return { ...steer(a, spotX, spotZ, 0.05), face: side };
  if (c.byId !== a.id) {
    // takes it over: the first ball after a short wind-up
    c.byId = a.id;
    c.facing = side;
    c.shots = Infinity;
    c.timer = AI.cannonWindup;
  }
  c.aimZ = clamp(p.pos.z, c.z - C.aimBand, c.z + C.aimBand);
  return { ...IDLE_COMMAND, face: side };
}

/** Walk toward (tx, tz) with a small dead zone, at the grunt speed share. */
function steer(a: Actor, tx: number, tz: number, deadZone: number): PlayerCommand {
  const dx = tx - a.pos.x, dz = (tz - a.pos.z) / TUNING.move.depthFactor;
  const d = Math.hypot(dx, dz);
  if (d < deadZone) return { ...IDLE_COMMAND };
  // enemy-zombie: the slow shuffle; M11 the brute lumbers
  const slow = easeIn(d) * (a.kind === 'zombie' ? TUNING.zombie.speed : a.variant === 'vending' ? TUNING.brute.speed : AI.speed);
  return { ...IDLE_COMMAND, moveX: (dx / d) * slow, moveZ: (dz / d) * slow };
}

/** Ease off when close to the target so grunts don't jitter around it. */
function easeIn(d: number): number {
  return Math.min(1, 0.35 + d);
}
