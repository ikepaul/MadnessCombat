// Combat state machine (PLAN.md M2): punches, hit reactions, knockdown and get-up, grabs and
// throws, the low sweep, the finisher, death and corpses. Numbers from TUNING, which cites
// research/mechanics/melee-* and move-knockdown-getup.
import { afterKill, gibCorpse, goreKill } from './gore';
import { aboutFeet, lyingAt, rootToWorld, STANDING } from '../anim/skeleton';
import { GRAVITY, TUNING } from '../data/tuning';
import { DISARM, GRENADE, GUARD, GUN_BLOCK, isMelee, LOW_SLASH, MELEE, SHIELD, TOPPLE } from '../data/melee';
import { GUNS, isWeapon, WEAPONS } from '../data/weapons';
import { stepHands, stepUse } from './guns';
import { blastFlight } from './explosives';
import { tryTakedown } from './stealth';
import { ceilingBounce, knockbackScale, wallRestitution } from './improbability';
import { stepRising, zombieDamage, zombieLosesHead } from './zombies';
import { bossHit } from './boss';
import { ACTION_KINDS, actionTiming, disarm, dropCooking, faceCursor, holdsLong, lobHeldGrenade, startAction, startMeleeAction, stealTarget, stepAction, stepGrenade } from './melee';
import { project, type ScreenPoint, scaleAt, unprojectFloor } from '../render/camera';
import { type Actor, type AttackKind, alive, type Flight, meleeBand } from './actor';
import { clamp, moveWithCollision, stairHeight, stairsAt, surfaceBelow } from './collision';
import type { PlayerCommand } from './command';
import { type HitKind, MELEE_KINDS } from './events';
import { circleHits } from './hurtbox';
import { dropHeld } from './items';
import { DIVE_TIME, stepAirborneAction, stepAttackMove, stepLocomotion, sweepTarget } from './movement';
import type { VendingDef } from './room';
import type { World } from './world';

const M = TUNING.melee, H = TUNING.hit, G = TUNING.grab, C = TUNING.corpse, C_ = TUNING.combo, J = TUNING.juggle;
/** Hits that count toward a chain (M10b: thrown guns and shots too, not only punches and blades). */
const CHAIN_KINDS: HitKind[] = [...MELEE_KINDS, 'gun', 'bullet', 'knife'];
const PUNCH_CLIP: Partial<Record<AttackKind, string>> = {
  light: 'punchLight', heavy: 'punchHeavy', uppercut: 'uppercut', finisher: 'finisher', throw: 'throw',
};

/** Startup / active / recovery of each attack (s). `weapon` = the melee weapon of a swing. */
export function attackTiming(kind: AttackKind, weapon?: string): { startup: number; active: number; recovery: number } {
  if (kind === 'throw') return { startup: G.windup, active: 0, recovery: G.recovery };
  if (ACTION_KINDS.includes(kind)) return actionTiming(kind, weapon);
  return M[kind as 'light' | 'heavy' | 'uppercut' | 'finisher'];
}

/** M14 move-stairs: a body slides down a staircase this fast (H/s): ≈ 1 H in ≈ 0.25 s, ep4 f3426-f3432. */
const STAIR_SLIDE = 4;

/** Revamp A6: a hit reaction plays out over this long (s). invented */
export const REACT_LIFE = 0.6;

/** Timer reached a duration (tolerates float drift from summing 1/60 s ticks). */
const reached = (t: number, d: number) => t >= d - 1e-6;

/** Fist reach from the body centre so the max centre-to-centre range is `M.range` at face height. */
const FIST_REACH = M.range - 0.2 - M.fistRadius - 0.01;

export function stepActor(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  a.stateT += dt;
  a.pose.clipT += dt;
  if (a.pose.react && (a.pose.react.age += dt) > REACT_LIFE) a.pose.react = undefined;
  a.pose.impact = Math.max(0, a.pose.impact - dt);
  a.pose.hurt = Math.max(0, a.pose.hurt - dt);
  a.pose.lean *= Math.exp(-8 * dt);
  if (a.pose.squash) a.pose.squash *= Math.exp(-10 * dt);

  // throw-catch-return: F opens a short window to catch a thrown weapon
  if (cmd.grab) a.catchAt = world.time;
  // M7: E behind an unaware enemy is a takedown (before E picks anything up)
  if (a.state === 'free' && tryTakedown(world, a, cmd)) cmd = { ...cmd, pickup: false };
  // M17: E with both hands full waits for a click (that hand) or the release (the smart pick)
  cmd = stepUse(world, a, cmd);
  // a hand holding a gun fires instead of punching (M5): LMB = hand 0, RMB = hand 1
  if (a.state === 'free' || a.state === 'attack') {
    cmd = withoutGunPunches(a, cmd);
    // M10b: RMB spent on an over-the-shoulder shot doesn't also throw a heavy punch
    if (stepHands(world, a, cmd, dt)) cmd = { ...cmd, attack: null };
    stepGrenade(world, a, cmd, dt);
    cmd = stepGuard(world, a, cmd);
  }

  switch (a.state) {
    case 'free': {
      const b = a.body;
      // a punch pressed during the previous swing comes out as soon as it ends
      if (!cmd.attack && a.queued && world.time - a.queued.at <= M.buffer + 1e-6 && b.state === 'ground') {
        cmd = { ...cmd, attack: a.queued.kind, aim: a.queued.aim };
      }
      a.queued = undefined;
      if (!cmd.grab && !cmd.attack && a.grabQueued !== undefined && world.time - a.grabQueued <= G.buffer + 1e-6 && b.state === 'ground') cmd = { ...cmd, grab: true };
      a.grabQueued = undefined;
      // M14: on the belly with a blade, LMB slashes low
      if (b.state === 'prone' && cmd.attack === 'light' && lowSlash(world, a)) cmd = { ...cmd, attack: null };
      // M7: a grunt kicks a table over for cover
      if (cmd.flip !== undefined && b.state === 'ground' && !a.holding) { startAction(world, a, 'flip', cmd, { prop: cmd.flip }); break; }
      // M6: a melee weapon in the hand swings / stabs / is thrown instead of punching
      if (a.cook === undefined && startMeleeAction(world, a, cmd)) break;
      cmd = withoutItemPunches(a, cmd);
      // actions work in the air too (a jump carries on under them)
      const canAct = b.state === 'ground' || b.state === 'air';
      if (canAct && !a.holding && cmd.attack && a.cook === undefined) { startAttack(world, a, cmd); break; }
      // grabbing takes the front hand (a one-handed gun may stay in the back hand: human shield)
      if (canAct && a.cook === undefined && ((cmd.grab && (canGrab(a) || a.holding)) || (a.holding && cmd.attack))) {
        if (a.holding) startThrow(a, cmd);
        else if (b.state === 'ground') tryGrab(world, a);
        if (a.state !== 'free') break;
      }
      stepLocomotion(world, a, cmd, dt);
      if (b.state === 'diving' && b.sweep) sweepContact(world, a);
      if (b.state === 'air' && b.kick) kickContact(world, a);
      setClip(a, b.kick ? 'kick' : a.pose.welding ? 'weld' : a.pose.handsUp ? 'handsUp' : a.cook !== undefined ? 'cook' : a.holding ? 'carry' : holdsLong(a) ? 'holdLong' : a.ai?.aware === false && a.ai.idle === 'smoke' ? 'smoke' : 'idle');
      break;
    }
    case 'attack': {
      const k = a.attack?.kind;
      if (cmd.attack && (k === 'light' || k === 'heavy' || k === 'uppercut' || k === 'finisher')) a.queued = { kind: cmd.attack, aim: cmd.aim, at: world.time };
      // a grab pressed during a move comes out when it ends (playtest: chaining)
      if (cmd.grab && k !== 'throw') a.grabQueued = world.time;
      // in the air the jump carries on; on the ground keep walking through a swing
      // (finishers, item throws, pulls and steals are planted)
      if (a.body.state === 'air') stepAirborneAction(world, a, cmd, dt);
      else if (k !== 'finisher' && k !== 'toss' && k !== 'lob' && k !== 'pull' && k !== 'steal' && k !== 'flip' && k !== 'takedown') stepAttackMove(world, a, cmd, dt);
      else a.pose.walkPhase = undefined;
      stepAttack(world, a);
      break;
    }
    case 'stun':
      if (reached(a.stateT, a.stunFor)) enter(a, 'free');
      break;
    case 'knockback':
      if (stepFlight(world, a, dt) === 'stopped') {
        // a co-op hero out of lives stays down in a revive circle instead of getting up
        enter(a, a.goingDown ? 'downed' : 'down');
        if (a.goingDown) {
          a.goingDown = false;
          a.revive = 0;
          world.events.emit('playerDown', { actorId: a.id, ...a.pos });
        }
        setClip(a, 'lying');
      }
      break;
    case 'downed': {
      // revived by a teammate (stepRevives); meanwhile you can drag yourself along (playtest 2026-10-27)
      let ix = cmd.moveX, iz = cmd.moveZ;
      const len = Math.hypot(ix, iz);
      if (len > 1) { ix /= len; iz /= len; }
      if (len > 0.1) {
        const v = TUNING.prone.downedCrawlSpeed;
        const p = moveWithCollision(world.room, a.pos.x, a.pos.z, ix * v * dt, iz * v * TUNING.move.depthFactor * dt, a.pos.y);
        a.pos.x = p.x;
        a.pos.z = p.z;
        a.pose.walkPhase = (a.pose.walkPhase ?? 0) + dt * 6;
      } else a.pose.walkPhase = undefined;
      break;
    }
    case 'down':
      // M10: knocked out for good (interrogation) or dazed with stars for a while
      if (a.koed) break;
      // M14: a player knocked flat still slashes low with a blade
      if (a.kind === 'hero' && cmd.attack === 'light') lowSlash(world, a);
      if (a.dazedUntil !== undefined) {
        a.pose.dazed = world.time < a.dazedUntil;
        if (a.pose.dazed) break;
        a.dazedUntil = undefined;
      }
      if (reached(a.stateT, a.kind === 'hero' ? H.lie : H.enemyLie)) startGetUp(a);
      break;
    case 'getUp': {
      const u = clamp(a.stateT / H.getUp, 0, 1);
      const r0 = a.getUpFrom ?? -Math.PI / 2;
      a.pose.root = aboutFeet(r0 * (1 - u * u * (3 - 2 * u)));
      if (reached(a.stateT, H.getUp)) { a.pose.root = { ...STANDING }; enter(a, 'free'); }
      break;
    }
    case 'grabbed':
      break; // positioned by the holder (World.updateHeld)
    case 'dead':
      stepCorpse(world, a, dt);
      break;
    case 'rising':
      stepRising(world, a);
      break;
  }
  a.pose.dead = a.state === 'dead';
  // the painter reads what each hand holds from the pose
  a.pose.held = a.hands[0]?.item ?? null;
  a.pose.heldB = a.hands[1]?.item ?? null;
}

/** M14 melee-blade-deflect: a sword-class blade in the front hand with the back hand free guards on RMB. */
function guardBlade(a: Actor): boolean {
  const h = a.hands[0];
  return !!h && isMelee(h.item) && !!MELEE[h.item].guard && !a.hands[1];
}

/** Holding RMB with a guard blade, on the ground and free: the guard is up (and RMB never punches). */
function stepGuard(world: World, a: Actor, cmd: PlayerCommand): PlayerCommand {
  const blade = guardBlade(a);
  const on = blade && a.state === 'free' && a.body.state === 'ground' && !!cmd.hold?.[1];
  if (on && !a.guard) a.guard = { since: world.time, n: 0 };
  if (!on) a.guard = undefined;
  a.pose.guard = on || undefined;
  if (on) a.walkFactor = Math.min(a.walkFactor ?? 1, GUARD.walk);
  return blade && (cmd.attack === 'heavy' || cmd.attack === 'uppercut') ? { ...cmd, attack: null } : cmd;
}

/**
 * M14 acting from the ground: with a blade in the front hand, cut the nearest standing enemy
 * within the blade's reach at foot height (same depth band). Returns true if the slash was made
 * (it may miss; the cooldown runs either way).
 */
function lowSlash(world: World, a: Actor): boolean {
  const h = a.hands[0];
  const def = h && isMelee(h.item) ? MELEE[h.item] : undefined;
  if (!def || def.edge !== 'blade' || world.time - (a.lowSlashAt ?? -Infinity) < LOW_SLASH.every) return false;
  a.lowSlashAt = world.time;
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (o === a || !alive(o) || o.kind === 'hero' || o.state === 'down' || o.state === 'knockback' || o.body.height < 0.9) continue;
    const d = Math.abs(o.pos.x - a.pos.x);
    if (d <= def.reach && Math.abs(o.pos.z - a.pos.z) <= def.depthBand && d < bestD) { best = o; bestD = d; }
  }
  const dir = best ? (Math.sign(best.pos.x - a.pos.x) || a.facing) as 1 | -1 : a.facing;
  a.facing = dir;
  world.events.emit('punch', { actorId: a.id, x: a.pos.x + dir * def.reach * 0.7, y: a.pos.y + 0.15, z: a.pos.z, kind: 'slash', facing: dir });
  if (best) applyHit(world, a, best, 'slash', dir, 0, { x: best.pos.x, y: best.pos.y + 0.15, z: best.pos.z });
  return true;
}

/** Blows a sword guard turns: bullets, blades, clubs, thrown blades. */
const GUARDED: HitKind[] = ['bullet', 'slash', 'stab', 'smash', 'knife'];

/**
 * A blow from the front meets the guard: right after the guard went up it's a parry (a bullet
 * goes back into the shooter, a blade attacker is stunned); otherwise it's deflected, except every
 * GUARD.leakEvery-th one, which gets through (returns false: the hit lands as usual).
 */
function guardHit(world: World, o: Actor, by: Actor, kind: HitKind, at: { x: number; y: number; z: number }, bullet?: { damage: number; pointBlank: boolean }): boolean {
  const g = o.guard!;
  if (world.time - g.since <= GUARD.parryWindow + 1e-6) {
    g.since = -Infinity; // one parry per raise
    world.events.emit('block', { actorId: o.id, byId: by.id, how: 'parry', ...at });
    const dir = Math.sign(by.pos.x - o.pos.x) || 1;
    if (kind === 'bullet' && bullet) applyHit(world, o, by, 'bullet', dir, 0, { x: by.pos.x, y: by.pos.y + 0.6, z: by.pos.z }, 'body', false, { damage: bullet.damage, pointBlank: false });
    else if (alive(by)) { by.attack = undefined; by.state = 'stun'; by.stateT = 0; by.stunFor = H.stun; by.pose.lean = -0.3; setClip(by, 'stun'); }
    return true;
  }
  g.n++;
  if (g.n % GUARD.leakEvery === 0) return false;
  world.events.emit('block', { actorId: o.id, byId: by.id, how: 'deflect', ...at });
  return true;
}

/** LMB punches only with an empty front hand, RMB only with an empty back hand. */
function withoutGunPunches(a: Actor, cmd: PlayerCommand): PlayerCommand {
  const armed = (i: 0 | 1) => { const h = a.hands[i]; return !!h && isWeapon(h.item); };
  if (cmd.attack === 'light' && armed(0)) return { ...cmd, attack: null };
  if ((cmd.attack === 'heavy' || cmd.attack === 'uppercut') && armed(1)) return { ...cmd, attack: null };
  return cmd;
}

/** Same for melee weapons and the long weapon (which takes both hands). */
function withoutItemPunches(a: Actor, cmd: PlayerCommand): PlayerCommand {
  if (!cmd.attack) return cmd;
  const busy = (i: 0 | 1) => !!a.hands[i] || (i === 1 && holdsLong(a));
  if (cmd.attack === 'light' && busy(0)) return { ...cmd, attack: null };
  if ((cmd.attack === 'heavy' || cmd.attack === 'uppercut') && busy(1)) return { ...cmd, attack: null };
  return cmd;
}

/** Grab needs the front hand; the back hand may keep a one-handed gun (fire it past the shield). */
function canGrab(a: Actor): boolean {
  const back = a.hands[1];
  return !a.hands[0] && (!back || (isWeapon(back.item) && WEAPONS[back.item].oneHanded));
}

export function enter(a: Actor, s: Actor['state']): void {
  a.state = s;
  a.stateT = 0;
  if (s === 'free') {
    a.attack = undefined;
    // an action that ends mid-jump leaves you falling, not standing in the air
    if (a.body.state !== 'air' || a.pos.y <= a.body.groundY + 1e-6) {
      a.body.state = 'ground';
      a.body.stateTime = 0;
    }
    a.body.height = 1;
    a.pose.root = { ...STANDING };
  }
}

export function setClip(a: Actor, clip: string): void {
  if (a.pose.clip !== clip) {
    // the painter blends out of the old clip (render only: hit timing still follows the new clip)
    a.pose.prevClip = a.pose.clip;
    a.pose.prevT = a.pose.clipT;
    a.pose.clip = clip;
    a.pose.clipT = 0;
  }
}

// ---------- attacks ----------

function startAttack(world: World, a: Actor, cmd: PlayerCommand): void {
  // every punch turns to the cursor first, a chained one too (playtest: a combo couldn't turn round)
  if (cmd.face) a.facing = cmd.face;
  else faceCursor(a, cmd);
  let kind: AttackKind = cmd.attack!;
  if (kind === 'heavy' && cmd.aim && aimedUp(a, cmd.aim)) kind = 'uppercut';
  // a punch at a downed body with nobody standing in reach becomes the finisher
  if (kind !== 'uppercut' && a.body.state === 'ground' && !standingInReach(world, a) && downedInReach(world, a)) kind = 'finisher';
  a.state = 'attack';
  a.stateT = 0;
  a.attack = { kind, heavy: cmd.attack === 'heavy', t: 0, done: false };
  // M17: slide toward the target's depth during the wind-up
  a.attack.snapZ = snapTarget(world, a, cmd.aim, kind === 'finisher' ? M.finisher.reach : M.range, kind === 'finisher')?.pos.z;
  setClip(a, PUNCH_CLIP[kind] ?? 'idle');
}

/**
 * M17 depth snap (design/qol-pass.md 3b): the enemy a hero's blow is aimed at: the one under the
 * cursor, else the nearest ahead, within TUNING.qol.snapBand in depth. Heroes only. `downed` = a
 * body on the floor (the finisher).
 */
export function snapTarget(world: World, a: Actor, aim: ScreenPoint | undefined, reach: number, downed = false): Actor | undefined {
  if (a.playerIndex === undefined) return undefined;
  const Q = TUNING.qol;
  let best: Actor | undefined, bestScore = Infinity;
  for (const o of world.actors) {
    if (o === a || o.kind === 'hero' || o.kind === 'boss' || o.grabbedBy !== undefined) continue;
    if (downed ? !isDowned(o) : !alive(o) || o.state === 'getUp' || o.state === 'down' || o.state === 'downed') continue;
    const dz = Math.abs(o.pos.z - a.pos.z), ahead = (o.pos.x - a.pos.x) * a.facing;
    if (dz > Q.snapBand || ahead < -0.1 || ahead > reach + Q.snapAhead) continue;
    // under the cursor: near the projected chest or head (H at his depth)
    let under = false;
    if (aim) {
      const s = scaleAt(o.pos.z);
      for (const y of downed ? [0.15] : [0.4, 0.79]) {
        const [sx, sy] = project(o.pos.x, o.pos.y + y, o.pos.z);
        if (Math.hypot(aim[0] - sx, aim[1] - sy) < 0.3 * s) under = true;
      }
    }
    // under the cursor first, then anyone already on your depth line, then the nearest
    const score = (under ? -10 : 0) + (dz <= meleeBand(a) ? -5 : 0) + Math.abs(ahead) + dz * 2;
    if (score < bestScore) { best = o; bestScore = score; }
  }
  return best;
}

/** M17 depth snap: during the startup, move toward the target's depth (props stop it). */
function snapStep(world: World, a: Actor, startup: number): void {
  const atk = a.attack!, Q = TUNING.qol;
  if (atk.snapZ === undefined || atk.t > startup + 1e-6) return;
  // only as far as needed: to within snapNear of his depth, not onto it
  const left = Q.snapMax - (atk.snapped ?? 0), dz = atk.snapZ - a.pos.z;
  const step = Math.sign(dz) * Math.min(Math.max(0, Math.abs(dz) - Q.snapNear), Q.snapSpeed * world.dt, left);
  if (Math.abs(step) < 1e-6) return;
  const p = moveWithCollision(world.room, a.pos.x, a.pos.z, 0, step, a.pos.y);
  atk.snapped = (atk.snapped ?? 0) + Math.abs(p.z - a.pos.z);
  a.pos.z = p.z;
}

/** Heavy punch with the cursor steeply above the shoulder = uppercut. */
function aimedUp(a: Actor, aim: [number, number]): boolean {
  const [sx, sy] = project(a.pos.x, a.pos.y + 0.5, a.pos.z);
  return Math.atan2(sy - aim[1], Math.abs(aim[0] - sx)) > M.uppercutAimAngle;
}

function fistPoint(a: Actor, kind: AttackKind): { x: number; y: number; r: number } {
  if (kind === 'finisher') return { x: a.pos.x + a.facing * M.finisher.reach, y: a.pos.y + M.finisher.height, r: M.finisher.radius };
  const h = kind === 'uppercut' ? M.uppercut.height : M.light.height;
  // in the air the punch comes down at whoever is below (up to 0.9 H lower). invented
  const drop = Math.min(Math.max(0, a.pos.y - a.pose.groundY), 0.9);
  return { x: a.pos.x + a.facing * FIST_REACH, y: a.pos.y + h - drop, r: M.fistRadius };
}

function hittable(a: Actor, o: Actor): boolean {
  return o !== a && alive(o) && o.state !== 'grabbed' && o.state !== 'getUp' && o.state !== 'downed' && Math.abs(o.pos.z - a.pos.z) <= meleeBand(a);
}

function standingInReach(world: World, a: Actor): boolean {
  const f = fistPoint(a, 'light');
  return world.actors.some((o) => hittable(a, o) && o.state !== 'down' && circleHits(o, f.x, f.y, f.r) !== null);
}

function isDowned(o: Actor): boolean {
  return o.state === 'down' || (o.state === 'knockback' && o.flight?.phase === 'skid') || (o.state === 'dead' && o.corpse?.phase !== 'headless' && o.grabbedBy === undefined && o.flight === undefined);
}

function downedTarget(world: World, a: Actor): Actor | undefined {
  const f = fistPoint(a, 'finisher');
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (o === a || !isDowned(o) || Math.abs(o.pos.z - a.pos.z) > meleeBand(a)) continue;
    if (circleHits(o, f.x, f.y, f.r) === null) continue;
    const d = Math.abs(o.pos.x - a.pos.x);
    // living bodies first, then the nearest corpse
    const score = d + (alive(o) ? 0 : 10);
    if (score < bestD) { best = o; bestD = score; }
  }
  return best;
}

function downedInReach(world: World, a: Actor): boolean {
  return downedTarget(world, a) !== undefined;
}

function stepAttack(world: World, a: Actor): void {
  const atk = a.attack!;
  atk.t += world.dt;
  const tm = attackTiming(atk.kind, atk.weapon);
  snapStep(world, a, tm.startup);
  if (ACTION_KINDS.includes(atk.kind)) stepAction(world, a);
  else if (atk.kind === 'throw') {
    if (!atk.done && reached(atk.t, tm.startup)) { atk.done = true; releaseThrow(world, a); }
  } else if (reached(atk.t, tm.startup) && !reached(atk.t, tm.startup + tm.active)) {
    if (!atk.done && !reached(atk.t - world.dt, tm.startup)) {
      const f = fistPoint(a, atk.kind);
      world.events.emit('punch', { actorId: a.id, x: f.x, y: f.y, z: a.pos.z, kind: atk.kind as HitKind, facing: a.facing });
    }
    if (!atk.done) connect(world, a, atk.kind) && (atk.done = true);
  }
  if (a.attack === atk && reached(atk.t, tm.startup + tm.active + tm.recovery)) enter(a, 'free');
}

/** Active frames: hit the nearest hurtbox the fist touches. */
function connect(world: World, a: Actor, kind: AttackKind): boolean {
  const f = fistPoint(a, kind);
  if (kind === 'finisher') {
    const o = downedTarget(world, a);
    if (!o) return false;
    applyHit(world, a, o, 'finisher', a.facing, 0, { x: f.x, y: f.y, z: o.pos.z }, 'body', a.attack!.heavy);
    return true;
  }
  let best: Actor | undefined, bestD = Infinity, part: 'head' | 'body' = 'body';
  for (const o of world.actors) {
    if (!hittable(a, o) || o.state === 'down') continue;
    let p = circleHits(o, f.x, f.y, f.r);
    // M10b: a juggled grunt up in the air is in reach of a punch below him (the fist alone wouldn't reach)
    if (!p && o.flight?.juggle && o.flight.phase === 'air' && Math.abs(o.pos.x - f.x) < J.reachX && o.pos.y < J.reachUp) p = 'body';
    const d = Math.abs(o.pos.x - a.pos.x);
    if (p && d < bestD) { best = o; bestD = d; part = p; }
  }
  if (!best) return false;
  applyHit(world, a, best, kind as HitKind, a.facing, 0, { x: f.x, y: f.y, z: best.pos.z }, part);
  // M10b: a punch that launches or keeps a grunt juggled recovers at once, so the next one fits in his airtime
  if (best.flight?.juggle && best.flight.phase === 'air' && a.attack) {
    const tm = attackTiming(a.attack.kind, a.attack.weapon);
    a.attack.t = Math.max(a.attack.t, tm.startup + tm.active + tm.recovery - J.cancel);
  }
  return true;
}

// ---------- hits, damage, death ----------

const DAMAGE: Record<HitKind, number> = {
  light: M.light.damage, heavy: M.heavy.damage, uppercut: M.uppercut.damage, finisher: M.finisher.damage,
  sweep: TUNING.sweep.damage, body: G.damage, head: 0, wall: 99,
  // guns: the weapon sets bullet damage per hit (src/data/weapons.ts); a thrown gun's body hit
  bullet: 2, gun: GUNS.throwBody,
  // M6: melee weapons and thrown blades are one-hit kills on grunts (melee-weapons, throw-knives);
  // the explosion and the pin kill outright
  stab: MELEE.knife.damage, slash: 4, smash: 4, knife: 4, blast: 99, pin: 99,
  // M7: the stealth kill always kills
  takedown: 99,
  // M8: the boss's lightning strike knocks down (a hero loses one life like any hit)
  lightning: 2,
  // a cannonball (or the falling cannon) kills grunts and zombies outright
  cannon: 99,
  // M9: the fling itself only throws; the wall at the end does the damage
  fling: 1,
};

/**
 * Resolve a hit on `o`. dirX/dirZ = push direction. Grunts have 4 hp: light hits do 1, heavy
 * ones 2 (decided). The player loses exactly 1 life per hit, whatever hit him. Survivors are
 * stunned by light hits and knocked down by everything heavier. `heavy` = the finisher was RMB.
 * `bullet` = gun damage for this hit (1 to the head or 2 to the body kills a grunt, decided).
 */
export function applyHit(
  world: World, by: Actor | undefined, o: Actor, kind: HitKind, dirX: number, dirZ: number,
  at: { x: number; y: number; z: number }, part: 'head' | 'body' = 'body', heavy = false,
  bullet?: { damage: number; pointBlank: boolean },
): void {
  if (o.state === 'getUp' || o.state === 'downed') return; // i-frames (invented); downed heroes are out of the fight
  if (o.invulnerable || o.parked) return; // M9: the target before his last room, the boss's cameo; co-op: gone ahead
  // M8: the living boss has his own damage rule (src/sim/boss.ts)
  if (o.kind === 'boss' && o.state !== 'dead') { bossHit(world, by, o, kind, part, dirX, dirZ, at); return; }
  // held up by the boss for the body slams: nobody else gets a hit in (not a human shield)
  if (o.grabbedBy !== undefined && by?.id !== o.grabbedBy && world.actorById(o.grabbedBy)?.kind === 'boss' && kind !== 'blast') return;
  // combat-human-shield: a body held up as a shield takes what was meant for its holder
  if (o.grabbedBy !== undefined && by?.id !== o.grabbedBy && kind !== 'blast') { shieldHit(world, by, o, kind, at, part); return; }
  // M14 melee-blade-deflect: a raised sword turns bullets and blades coming from the front
  if (o.guard && by && GUARDED.includes(kind) && Math.sign(by.pos.x - o.pos.x) === o.facing && guardHit(world, o, by, kind, at, bullet)) return;
  // M14 gun block: F just before a blade or club lands, with a gun in hand, turns it and stuns the attacker
  if (by && alive(by) && (kind === 'slash' || kind === 'stab' || kind === 'smash') && o.hands.some((h) => !!h && isWeapon(h.item)) &&
    world.time - (o.catchAt ?? -Infinity) <= GUN_BLOCK.window + 1e-6) {
    o.catchAt = undefined;
    world.events.emit('block', { actorId: o.id, byId: by.id, how: 'parry', ...at });
    by.attack = undefined; by.state = 'stun'; by.stateT = 0; by.stunFor = H.stun; by.pose.lean = -0.3; setClip(by, 'stun');
    return;
  }
  const corpse = o.state === 'dead';
  const base = bullet ? bullet.damage : kind === 'gun' && part === 'head' ? GUNS.throwHead : kind === 'finisher' && heavy ? M.finisher.heavyDamage : DAMAGE[kind];
  // M10b: a launched grunt in the air (being juggled), and the uppercut that launches a stunned one
  const juggled = !corpse && !!o.flight?.juggle && o.flight.phase === 'air';
  const launcher = !corpse && !!by && kind === 'uppercut' && o.kind === 'grunt' && o.state === 'stun';
  const combo = !corpse && base > 0 && o.kind !== 'hero' && CHAIN_KINDS.includes(kind) && chainBonus(world, by, o, kind);
  let damage = corpse || base <= 0 || (o.protected && kind !== 'pin') ? 0 : o.kind === 'hero' ? 1 : o.kind === 'zombie' ? zombieDamage(kind, base)
    // M11 the brute (~6 melee hits): every blow is one, bullets half, explosions three
    : o.variant === 'vending' ? (base >= 99 ? (kind === 'blast' ? 3 : o.hp) : kind === 'bullet' ? 0.5 : 1)
    : o.variant === 'bodyguard' ? (part === 'head' || base >= 99 ? o.hp : 1)
    : o.variant === 'agent' ? agentDamage(o, kind, base, combo) : base + (combo ? C_.bonus : 0);
  // the launcher sends him up alive; jabs only keep him up (the heavy that follows finishes it)
  if (launcher) damage = J.launchDamage;
  else if (juggled && kind === 'light') damage = 0;
  // M12 boss-clown clip 4: the zombie mini-boss shrugs off most of it while he holds the sign
  const taken = o.damageScale !== undefined && damage < 99 ? damage * o.damageScale : damage;
  o.hp = Math.max(0, o.hp - taken);
  let killed = !corpse && o.hp <= 0;
  let dazedNow = false;
  // M10 world-interrogate-knockout: this one gets knocked silly instead (a melee blow), stars for ~5 s
  if (killed && o.dazeOnDefeat && MELEE_KINDS.includes(kind)) {
    killed = false;
    o.hp = 1;
    o.dazeOnDefeat = false;
    o.dazedUntil = world.time + TUNING.interrogate.dazed + H.enemyLie;
    dazedNow = true;
    world.events.emit('dazed', { actorId: o.id, ...o.pos });
  }
  // enemy-zombie: the head comes off and it keeps going (one more hit)
  if (!corpse && damage < 99 && (killed || part === 'head') && zombieLosesHead(world, o, kind, part, killed, dirX, dirZ)) killed = false;
  if (o.corpse?.phase !== 'frozen') o.pose.impact = H.impact;
  if (o.kind === 'hero' && damage > 0) o.pose.hurt = H.hurtFlash;
  if ((damage > 0 || corpse) && o.corpse?.phase !== 'frozen') addWound(o, at, part);
  world.events.emit('hit', { actorId: o.id, attackerId: by?.id ?? 0, kind, part, damage, killed, dirX, dirZ, combo, chain: o.chain?.count ?? 0, ...at });
  if (corpse) return;
  if (damage > 0 && !killed) o.pose.react = reaction(o, kind, part, dirX);

  dropCooking(world, o);
  if (o.state === 'attack') o.attack = undefined;
  if (o.holding) releaseHeld(world, o);
  if (o.grabbedBy !== undefined) releaseFrom(world, o);

  if (killed && o.kind === 'hero' && world.activePlayers.some((p) => p !== o)) {
    // co-op: out of lives with a teammate still standing -> knocked down into a revive circle
    o.goingDown = true;
    knockDown(world, o, kind === 'light' || kind === 'head' ? 'heavy' : kind, dirX, dirZ);
    return;
  }
  if (killed) {
    // melee-decapitation: a killing blow from a heavy attack knocks the head off (decided with the
    // user); so do a point-blank shotgun to the head (gun-shotgun) and a thrown gun to the head
    const pointBlank = !!bullet?.pointBlank;
    // playtest 2026-10-27: stage 3's extreme gore takes more heads and gibs (src/sim/gore.ts)
    const gore = goreKill(world, by, o, kind, part, pointBlank);
    // M10b head punt: a heavy that kills a juggled grunt sends the head flying into the next one
    const punt = juggled && o.kind === 'grunt' && (kind === 'heavy' || kind === 'uppercut');
    const decap = o.kind === 'grunt' && (punt || gore.decap || kind === 'heavy' || kind === 'uppercut' || kind === 'slash' || (kind === 'finisher' && heavy) || ((pointBlank || kind === 'gun') && part === 'head'));
    die(world, o, by, kind, dirX, dirZ, decap && !gore.gib, pointBlank ? 'heavy' : kind);
    if (gore.gib) gibCorpse(world, o);
    else if (punt) puntHead(world, o, by, dirX);
    afterKill(world, by, o, kind, dirX);
    return;
  }
  // M10b juggle: jabs keep him up, a heavy spikes him down, the launcher sends him up
  if (juggled && kind === 'light') { juggleJab(world, o); return; }
  if (juggled && (kind === 'heavy' || kind === 'uppercut')) { spike(world, o, dirX); return; }
  if (launcher) {
    knockDown(world, o, 'uppercut', dirX, dirZ);
    // straight up, nearly on the spot, so the jabs that follow can reach him
    o.flight!.vx *= J.drift;
    o.flight!.vz = 0;
    o.flight!.juggle = { jabs: 0, by: by!.id };
    world.events.emit('juggle', { actorId: o.id, phase: 'launch', ...o.pos });
    return;
  }
  // M11: the hovering jetpack and the vending-machine brute don't go down: a flinch, nothing more
  if (o.hover !== undefined || o.variant === 'vending') {
    if (o.state === 'attack' && o.hover !== undefined) o.attack = undefined;
    if (o.state !== 'attack') { o.state = 'stun'; o.stateT = 0; o.stunFor = 0.12; }
    o.pose.lean = -0.2;
    return;
  }
  // a light hit in the air can't freeze you mid-jump: it knocks you down instead
  const airborne = o.pos.y > o.pose.groundY + 0.05;
  // M10b click -> throw -> punch: an empty gun to a grunt's head stuns like a punch (body hits still knock down)
  const gunToHead = kind === 'gun' && part === 'head' && o.kind === 'grunt';
  switch ((airborne && kind === 'light') || dazedNow ? 'heavy' : gunToHead ? 'light' : kind) {
    case 'light':
    case 'stab':
      // M14 enemy-agent: jabs don't stun him (and the first of a chain is blocked)
      if (o.variant === 'agent' && kind === 'light') {
        o.pose.lean = -0.12;
        if (damage === 0) world.events.emit('block', { actorId: o.id, byId: by?.id ?? 0, ...at });
        break;
      }
      // enemy-zombie: light hits only make a zombie twitch
      if (o.kind === 'zombie') { o.state = 'stun'; o.stateT = 0; o.stunFor = TUNING.zombie.flinch; o.pose.lean = -0.2; setClip(o, 'stun'); break; }
      // combat-disarm: a punch knocks the weapon away 30% of the time (kicks and sweeps always: knockdowns drop it)
      if (kind === 'light' && o.kind !== 'hero' && (o.hands[0] || o.hands[1]) && world.rng() < DISARM.punchChance) disarm(world, by, o, 'knock', dirX);
      o.state = 'stun';
      o.stateT = 0;
      o.stunFor = o.kind === 'hero' ? H.heroFlinch : H.stun;
      o.pose.lean = -0.35;
      setClip(o, 'stun');
      break;
    case 'bullet':
      // a bullet that doesn't kill makes the target flinch; point blank knocks it down
      if (bullet?.pointBlank) { knockDown(world, o, 'heavy', dirX, dirZ); break; }
      o.state = 'stun';
      o.stateT = 0;
      o.stunFor = o.kind === 'hero' ? H.heroFlinch : GUNS.flinch;
      o.pose.lean = -0.25;
      setClip(o, 'stun');
      break;
    case 'head':
      o.state = 'stun';
      o.stateT = 0;
      o.stunFor = G.headStun;
      o.pose.lean = -0.25;
      setClip(o, 'stun');
      break;
    default:
      knockDown(world, o, kind, dirX, dirZ);
  }
}

/**
 * Combos (decided 2026-10-26, design in PLAN.md M4): hits by the same attacker on the same
 * target, each within TUNING.combo.window of the last, form a chain. The 3rd+ hit of a chain
 * and a heavy straight after a light (the quick cross) deal +1. Returns whether this hit gets it.
 */
function chainBonus(world: World, by: Actor | undefined, o: Actor, kind: HitKind): boolean {
  if (!by) { o.chain = undefined; return false; }
  const c = o.chain;
  let prev: string | undefined;
  if (c && c.by === by.id && world.time - c.t <= C_.window) {
    prev = c.last;
    c.count++;
    c.t = world.time;
    c.last = kind;
  } else {
    // M10b pop & catch: the first hit with a weapon you just caught is already a chain hit
    const primed = by.primedAt !== undefined && world.time - by.primedAt <= C_.window;
    o.chain = { by: by.id, count: primed ? 2 : 1, t: world.time, last: kind };
    by.primedAt = undefined;
  }
  const n = o.chain!.count;
  return n >= 3 || (n === 2 && (kind === 'heavy' || kind === 'uppercut') && (prev === 'light' || prev === 'gun'));
}

/**
 * M14 enemy-agent: he blocks the first jab of a chain (it does nothing), blunt weapons hit him
 * twice as hard; everything else as usual on his 12 hp. invented
 */
function agentDamage(o: Actor, kind: HitKind, base: number, combo: boolean): number {
  if (kind === 'light' && (o.chain?.count ?? 1) <= 1) return 0;
  if (kind === 'smash') return base * TUNING.ai.agent.bluntScale;
  return base + (combo ? C_.bonus : 0);
}

const HEAD_KINDS: HitKind[] = ['light', 'heavy', 'uppercut', 'head'];

/**
 * Revamp A6: which way a hit throws the body (drawn by src/anim/layers.ts). Pushed the way he
 * faces = hit from behind; punches and head shots snap the head; the rest fold the body. `v`
 * varies the size and side per actor and hit, without the sim's rng.
 */
function reaction(o: Actor, kind: HitKind, part: 'head' | 'body', dirX: number): NonNullable<Actor['pose']['react']> {
  const behind = Math.sign(dirX) === o.facing;
  const v = ((o.id * 37 + (o.chain?.count ?? 0) * 11 + o.pose.wounds.length * 5) % 10) / 10;
  return { part: behind ? 'back' : part === 'head' || HEAD_KINDS.includes(kind) ? 'head' : 'body', age: 0, v };
}

/** Revamp A7: how a kill looks (drawn by src/anim/layers.ts). */
function deathStyle(kind: HitKind): Actor['pose']['death'] {
  if (kind === 'bullet' || kind === 'gun' || kind === 'head') return 'drop';
  if (kind === 'heavy' || kind === 'uppercut' || kind === 'wall' || kind === 'fling' || kind === 'cannon' || kind === 'sweep') return 'fling';
  if (kind === 'stab' || kind === 'slash' || kind === 'knife' || kind === 'smash' || kind === 'takedown' || kind === 'pin') return 'crumple';
  return undefined;
}

function addWound(o: Actor, at: { x: number; y: number }, part: 'head' | 'body'): void {
  if (o.pose.wounds.length >= 6) return;
  const [lx, ly] = part === 'head' ? [0.12, -0.84] : [0.05 + (o.pose.wounds.length % 3) * 0.04, -0.3 - (at.y - o.pos.y) * 0.1];
  o.pose.wounds.push([lx, ly]);
}

/** Launch profile for each hit kind (measured knockback, sweep and uppercut numbers). */
function launch(kind: HitKind, dirX: number, dirZ: number): Pick<Flight, 'vx' | 'vz' | 'vy' | 'airtime'> {
  const n = Math.hypot(dirX, dirZ) || 1, ux = dirX / n, uz = dirZ / n;
  let dist: number = H.knockbackDistance, airtime: number = H.knockbackAirtime, skid: number = H.skid;
  if (kind === 'sweep') { dist = TUNING.sweep.distance; airtime = TUNING.sweep.airtime; skid = H.skid * 0.5; }
  // bullets and blades drop the body where it stands rather than throwing it
  if (kind === 'bullet' || kind === 'knife' || kind === 'stab') { dist = GUNS.knockback; airtime = GUNS.knockbackAirtime; skid = H.skid * 0.5; }
  if (kind === 'uppercut') {
    const vy = Math.sqrt(2 * GRAVITY * H.uppercutHeight);
    airtime = (2 * vy) / GRAVITY;
    const v = H.uppercutDrift / airtime;
    return { vx: ux * v, vz: uz * v, vy, airtime };
  }
  if (kind === 'finisher') return { vx: 0, vz: 0, vy: 0, airtime: 0.01 };
  // a takedown victim slumps forward where he stood
  if (kind === 'takedown') { dist = 0.25; airtime = 0.4; skid = 0.1; }
  // boss-halo clip 5: flung ~3.6 H across the room in ~0.33 s, flat and fast
  if (kind === 'fling') { dist = TUNING.boss.fling.distance; airtime = TUNING.boss.fling.airtime; skid = 0.05; }
  if (kind === 'blast') return blastFlight(dirX, dirZ);
  // distance covered in the air at constant speed plus a linearly decelerating skid
  const v = dist / (airtime + skid / 2);
  return { vx: ux * v, vz: uz * v, vy: (GRAVITY * airtime) / 2, airtime };
}

/** Land on the back with the head away from the push (or on the face if pushed from behind). */
function landingAngle(o: Actor, dirX: number): number {
  return o.facing === -Math.sign(dirX || -o.facing) ? -Math.PI / 2 : Math.PI / 2;
}

function startFlight(o: Actor, kind: HitKind, dirX: number, dirZ: number, scale = 1): void {
  const l = launch(kind, dirX, dirZ);
  // M11 improbability mode: bodies fly ~2.4x as far and fast (the airtime stays, the speed scales)
  if (scale !== 1) { l.vx *= scale; l.vz *= scale; l.vy *= Math.sqrt(scale); }
  const r = o.pose.root.r;
  o.flight = { ...l, r, r0: r, rTo: landingAngle(o, dirX), spin: 0, phase: 'air', t: 0, hit: [] };
  o.body.vel = { x: 0, y: 0, z: 0 };
}

function knockDown(world: World, o: Actor, kind: HitKind, dirX: number, dirZ: number): void {
  dropWeapon(world, o, dirX);
  o.state = 'knockback';
  o.stateT = 0;
  startFlight(o, kind, dirX, dirZ, knockbackScale(world));
  setClip(o, 'knockback');
}

/** Knocked down or killed: whatever the hands hold flies off and stays on the floor, ammo and all. */
function dropWeapon(world: World, o: Actor, dirX: number): void {
  o.hands.forEach((h, i) => {
    if (!h) return;
    const dir = (Math.sign(dirX) || o.facing) * (i === 0 ? 1 : 0.6);
    dropHeld(world, h.item, o.pos, dir, { ammo: h.ammo, spare: h.spare });
    o.hands[i] = null;
  });
  o.pose.held = null;
  o.pose.heldB = null;
  o.pose.aimAt = undefined;
}

/** `flight` = the knockback profile when it differs from the hit (a point-blank shotgun kill flies like a heavy hit). */
export function die(world: World, o: Actor, by: Actor | undefined, kind: HitKind, dirX: number, dirZ: number, decap: boolean, flight: HitKind = kind): void {
  dropWeapon(world, o, dirX);
  const wasDown = o.state === 'down' || o.state === 'knockback';
  o.state = 'dead';
  o.stateT = 0;
  o.hp = 0;
  o.pose.react = undefined;
  o.pose.death = deathStyle(kind);
  // a zombie that falls again stays down (enemy-zombie: only fresh corpses rise)
  o.corpse = { phase: 'tumble', t: 0, raisable: o.kind === 'grunt', gibbed: false, slumped: false };
  world.events.emit('kill', { actorId: o.id, byId: by?.id ?? 0, kind, decap, ...o.pos });
  creditKill(world, by?.id);
  if (decap) {
    o.pose.headless = true;
    o.corpse.phase = 'headless';
    o.flight = undefined;
    const [hx, hy] = rootToWorld(o.pose.root, o.facing, 0.01, -0.79);
    // item position = the bottom of the head
    world.spawnItem('head', o.kind, { x: o.pos.x + hx, y: o.pos.y + hy - 0.2, z: o.pos.z }, { x: dirX * 4.5, y: 3.2, z: dirZ * 2 }, dirX * 16);
    setClip(o, 'stun');
    return;
  }
  if (kind === 'wall' && o.flight) return; // keeps flying
  if (kind === 'finisher' || (wasDown && o.flight === undefined)) {
    // finished on the floor: stays where it lies
    o.flight = undefined;
    o.corpse.phase = 'settled';
    world.events.emit('corpseSettled', { actorId: o.id, ...o.pos });
    return;
  }
  if (kind !== 'wall') startFlight(o, flight, dirX, dirZ, knockbackScale(world));
  // revamp A7: a flung kill turns a full somersault on the way down (lands the same way up)
  if (o.pose.death === 'fling' && o.flight && kind !== 'wall') o.flight.rTo += Math.sign(o.flight.rTo || 1) * Math.PI * 2;
  setClip(o, 'knockback');
}

// ---------- flight (knockback, dead tumble, thrown bodies) ----------

/** Ballistic arc, then a decelerating skid. Returns the phase after this tick. */
export function stepFlight(world: World, a: Actor, dt: number): 'air' | 'skid' | 'stopped' {
  const f = a.flight;
  if (!f) return 'stopped';
  f.t += dt;
  const room = world.room;
  if (f.phase === 'air') {
    const prevY = a.pos.y;
    const want = { x: a.pos.x + f.vx * dt, z: a.pos.z + f.vz * dt };
    const p = moveWithCollision(room, a.pos.x, a.pos.z, f.vx * dt, f.vz * dt, a.pos.y);
    const lim = room.halfWidth - TUNING.move.radius;
    if (room.outdoor) { /* open ground: the bounds just stop the body */ }
    else if (Math.abs(want.x) > lim && Math.abs(p.x - want.x) > 1e-6) wallImpact(world, a, want.x > 0 ? 'right' : 'left', Math.abs(f.vx));
    else if (want.z > room.zBack - TUNING.move.radius && Math.abs(p.z - want.z) > 1e-6) wallImpact(world, a, 'back', Math.abs(f.vz));
    // M10b: a solid prop (cannon, crates, a table) bounces a sub-lethal slam back like a wall
    else if (Math.abs(p.x - want.x) > 1e-6 || Math.abs(p.z - want.z) > 1e-6) propBounce(world, a, Math.hypot(f.vx, f.vz));
    // M12 throw-catch-return: thrown into the vending machine (the glass goes, so does he)
    if (f.thrownBy !== undefined && alive(a) && (Math.abs(p.x - want.x) > 1e-6 || Math.abs(p.z - want.z) > 1e-6)) vendingSmash(world, a, want);
    a.pos.x = p.x;
    a.pos.z = p.z;
    // M10b: a juggled grunt hangs at the top of the arc for the time his jabs banked
    if (f.hang && f.hang > 0 && f.vy <= 0) { f.hang -= dt; f.vy = 0; }
    else {
      a.pos.y += f.vy * dt - 0.5 * GRAVITY * dt * dt;
      f.vy -= GRAVITY * dt;
    }
    // M11: off the ceiling (or stuck in it)
    if (ceilingBounce(world, a)) return 'stopped';
    if (f.thrownBy !== undefined) {
      f.r += f.spin * dt;
      thrownBodyHits(world, a);
    } else f.r = f.r0 + (f.rTo - f.r0) * clamp(f.t / f.airtime, 0, 1);
    const ground = surfaceBelow(room, a.pos.x, a.pos.z, Math.max(prevY, a.pos.y));
    a.pose.groundY = ground;
    if (f.vy <= 0 && a.pos.y <= ground && f.spiked) {
      // M10b: spiked into the floor: one bounce, then down for real
      a.pos.y = ground;
      f.spiked = false;
      f.vy = J.spikeBounce;
      world.events.emit('juggle', { actorId: a.id, phase: 'bounce', ...a.pos });
      a.pose.root = lyingAt(f.r);
      return 'air';
    }
    if (f.vy <= 0 && a.pos.y <= ground) {
      a.pos.y = ground;
      world.events.emit('bodyFall', { actorId: a.id, ...a.pos, speed: Math.hypot(f.vx, f.vz, f.vy) });
      if (f.thrownBy !== undefined) {
        // land flat on whichever side is closer
        f.r = Math.sin(f.r) >= 0 ? Math.PI / 2 : -Math.PI / 2;
        if (alive(a) && !f.hit.includes(-1)) damageThrown(world, a);
      }
      f.phase = 'skid';
      f.t = 0;
      f.thrownBy = undefined;
    }
    a.pose.root = lyingAt(f.r);
    return 'air';
  }
  // skid: speed falls linearly to 0 over H.skid
  const k = Math.max(0, 1 - f.t / H.skid);
  const p = moveWithCollision(room, a.pos.x, a.pos.z, f.vx * k * dt, f.vz * k * dt, a.pos.y);
  a.pos.x = p.x;
  a.pos.z = p.z;
  a.pose.root = lyingAt(f.r);
  if (reached(f.t, H.skid)) {
    a.flight = undefined;
    a.pose.root = lyingAt(f.r);
    if (f.wall) a.slumpWall = f.wall;
    return 'stopped';
  }
  return 'skid';
}

function wallImpact(world: World, a: Actor, wall: 'left' | 'right' | 'back', speed: number): void {
  const f = a.flight!;
  f.wall = wall;
  // M11 improbability mode: an elastic bounce, squashed like rubber. M10b: a living grunt slammed
  // in below the kill speed comes back off the wall airborne, ready to be juggled (one code path)
  const lethal = f.thrownBy !== undefined && speed >= G.wallKillSpeed;
  const bounce = juggleBounce(a, speed, lethal);
  const e = bounce ? Math.max(wallRestitution(world), J.wallBounce) : wallRestitution(world);
  if (wall === 'back') f.vz *= -e;
  else f.vx *= -e;
  if (e > 0.5) a.pose.squash = 0.35;
  world.events.emit('wallHit', { actorId: a.id, ...a.pos, wall, speed });
  if (bounce) popOffWall(world, a, speed);
  // melee-grab-throw: a fast wall impact kills
  if (f.thrownBy !== undefined && alive(a) && speed >= G.wallKillSpeed) {
    f.hit.push(-1);
    applyHit(world, world.actorById(f.thrownBy), a, 'wall', -Math.sign(f.vx) || 1, 0, a.pos);
  }
}

/** M10b: a sub-lethal slam into a wall or a solid prop sends a living grunt back up for a juggle. */
function juggleBounce(a: Actor, speed: number, lethal: boolean): boolean {
  return !lethal && alive(a) && a.kind === 'grunt' && a.state === 'knockback' && speed >= J.bounceMinSpeed;
}

function popOffWall(world: World, a: Actor, speed: number): void {
  const f = a.flight!;
  f.vy = Math.max(f.vy, J.bounceUp);
  f.juggle ??= { jabs: 0 };
  f.r0 = f.r;
  f.t = 0;
  f.airtime = (2 * f.vy) / GRAVITY;
  a.pose.squash = Math.max(a.pose.squash ?? 0, 0.15);
  world.events.emit('wallBounce', { actorId: a.id, ...a.pos, speed });
}

function propBounce(world: World, a: Actor, speed: number): void {
  const f = a.flight!;
  if (!juggleBounce(a, speed, f.thrownBy !== undefined && speed >= G.wallKillSpeed)) return;
  f.vx *= -J.wallBounce;
  f.vz *= -J.wallBounce;
  popOffWall(world, a, speed);
}

/** M10b juggle: a jab keeps the launched grunt up a little longer (at most J.maxJabs times). */
function juggleJab(world: World, o: Actor): void {
  const f = o.flight!, j = f.juggle!;
  o.pose.impact = H.impact;
  if (j.jabs >= J.maxJabs) return;
  j.jabs++;
  // each jab nudges him a little along the hit, no more (he stays in reach)
  f.vx = Math.sign(f.vx || 1) * Math.min(Math.abs(f.vx), 0.25);
  // he hangs at the top of the arc a little longer (no climbing: still in reach of the next jab)
  f.hang = (f.hang ?? 0) + J.jabAir;
  f.airtime += J.jabAir;
  world.events.emit('juggle', { actorId: o.id, phase: 'jab', ...o.pos });
}

/** M10b juggle: a heavy that doesn't kill drives him into the floor; he bounces once. */
function spike(world: World, o: Actor, dirX: number): void {
  const f = o.flight!;
  f.juggle = undefined;
  f.spiked = true;
  f.vy = -J.spikeSpeed;
  f.vx = Math.sign(dirX) * 0.4;
  f.vz = 0;
  world.events.emit('juggle', { actorId: o.id, phase: 'spike', ...o.pos });
}

/** M10b head punt: the head just knocked off leaves along the hit, fast, and floors whoever it meets. */
function puntHead(world: World, o: Actor, by: Actor | undefined, dirX: number): void {
  const head = [...world.items].reverse().find((it) => it.kind === 'head' && it.state === 'air' && Math.abs(it.pos.x - o.pos.x) < 1);
  if (!head) return;
  head.vel = { x: (Math.sign(dirX) || 1) * J.puntSpeed, y: 1.2, z: 0 };
  head.spin = (Math.sign(dirX) || 1) * 24;
  head.thrownBy = by?.id;
  head.punt = true;
  head.hit = [];
  world.events.emit('fatality', { actorId: o.id, kind: 'punt', itemId: head.id, ...head.pos });
}

/** A thrown body stopped by the vending machine smashes into it and dies. */
function vendingSmash(world: World, a: Actor, want: { x: number; z: number }): void {
  const R = TUNING.move.radius;
  const v = world.room.props.find((p) => p.kind === 'vending' && !p.smashed && want.x > p.x0 - R && want.x < p.x1 + R && want.z > p.z0 - R && want.z < p.z1 + R);
  if (!v || v.kind !== 'vending') return;
  v.smashed = true;
  // M14: thrown hard enough, a toppleable machine goes over (away from the throw) and lies there as low cover
  const speed = Math.hypot(a.flight!.vx, a.flight!.vz);
  if (v.toppleable && !v.fallen && speed >= G.wallKillSpeed) topple(world, v, (Math.sign(a.flight!.vx) || 1) as 1 | -1, a);
  world.events.emit('vendingSmash', { actorId: a.id, ...a.pos });
  applyHit(world, world.actorById(a.flight!.thrownBy!), a, 'wall', -Math.sign(a.flight!.vx) || 1, 0, { ...a.pos });
}

/** M14: the machine falls flat toward `dir`; anyone where it lands is knocked down. */
function topple(world: World, v: VendingDef, dir: 1 | -1, thrown: Actor): void {
  const standX = (v.x0 + v.x1) / 2;
  v.fallen = { dir, standX };
  if (dir > 0) { v.x0 = standX - 0.2; v.x1 = standX - 0.2 + TOPPLE.length; } else { v.x1 = standX + 0.2; v.x0 = standX + 0.2 - TOPPLE.length; }
  v.top = TOPPLE.top;
  const by = thrown.flight?.thrownBy !== undefined ? world.actorById(thrown.flight.thrownBy) : undefined;
  for (const o of world.actors) {
    if (o === thrown || !alive(o) || o.kind === 'hero') continue;
    if (o.pos.x > v.x0 && o.pos.x < v.x1 && o.pos.z > v.z0 - 0.2 && o.pos.z < v.z1 + 0.2) applyHit(world, by, o, 'heavy', dir, 0, { x: o.pos.x, y: o.pos.y + 0.5, z: o.pos.z });
  }
  world.events.emit('propToppled', { actorId: thrown.id, x: (v.x0 + v.x1) / 2, y: 0, z: (v.z0 + v.z1) / 2 });
}

/** A thrown body knocks down whoever it hits (melee-grab-throw). */
function thrownBodyHits(world: World, a: Actor): void {
  const f = a.flight!;
  for (const o of world.actors) {
    if (o === a || o.id === f.thrownBy || f.hit.includes(o.id) || !alive(o) || o.state === 'grabbed' || o.state === 'getUp' || o.state === 'down' || o.state === 'downed') continue;
    if (Math.abs(o.pos.z - a.pos.z) > 0.25 || Math.abs(o.pos.x - a.pos.x) > G.hitRadius) continue;
    if (a.pos.y > o.pos.y + o.body.height || a.pos.y + 0.4 < o.pos.y) continue;
    f.hit.push(o.id);
    const dir = Math.sign(f.vx) || 1;
    applyHit(world, world.actorById(f.thrownBy!), o, 'body', dir, f.vz / Math.max(1, Math.abs(f.vx)), { x: (a.pos.x + o.pos.x) / 2, y: a.pos.y + 0.3, z: o.pos.z });
    if (alive(a) && !f.hit.includes(-1)) damageThrown(world, a);
    // the projectile loses its speed and drops
    f.vx *= -0.25;
    f.vz *= 0.3;
  }
}

/** A thrown living body takes a hit when it first lands or hits someone. */
function damageThrown(world: World, a: Actor): void {
  const by = a.flight?.thrownBy;
  a.flight?.hit.push(-1);
  a.hp = Math.max(0, a.hp - (a.kind === 'hero' ? 1 : G.damage));
  if (a.hp <= 0) {
    a.state = 'dead';
    a.corpse = { phase: 'tumble', t: 0, raisable: true, gibbed: false, slumped: false };
    world.events.emit('kill', { actorId: a.id, byId: by ?? 0, kind: 'body', decap: false, ...a.pos });
    creditKill(world, by);
  }
}

/** Every kill the player makes heals a life, up to the max (decided with the user). */
function creditKill(world: World, byId: number | undefined): void {
  const p = world.players.find((h) => h.id === byId);
  if (!p || !alive(p) || p.state === 'downed' || p.hp >= p.maxHp) return;
  p.hp = Math.min(p.maxHp, p.hp + TUNING.health.healPerKill);
  world.events.emit('heal', { actorId: p.id, hp: p.hp });
}

// ---------- human shield (combat-human-shield) ----------

/**
 * A held body absorbs the hit: a live one dies on the first hit but keeps blocking; after
 * SHIELD.hits hits the body falls apart and the holder lets go.
 */
function shieldHit(world: World, by: Actor | undefined, o: Actor, kind: HitKind, at: { x: number; y: number; z: number }, part: 'head' | 'body'): void {
  const holder = world.actorById(o.grabbedBy!);
  o.shieldHits = (o.shieldHits ?? 0) + 1;
  o.pose.impact = H.impact;
  addWound(o, at, part);
  const wasAlive = alive(o);
  if (wasAlive) {
    o.hp = 0;
    o.state = 'dead';
    o.stateT = 0;
    o.corpse = { phase: 'tumble', t: 0, raisable: true, gibbed: false, slumped: false };
  }
  world.events.emit('hit', { actorId: o.id, attackerId: by?.id ?? 0, kind, part, damage: wasAlive ? 1 : 0, killed: wasAlive, dirX: 0, dirZ: 0, combo: false, chain: 0, ...at });
  if (wasAlive) world.events.emit('kill', { actorId: o.id, byId: by?.id ?? 0, kind, decap: false, ...o.pos });
  const broke = o.shieldHits >= SHIELD.hits;
  world.events.emit('shieldHit', { actorId: o.id, holderId: holder?.id ?? 0, broke, ...at });
  if (broke) {
    if (holder) holder.holding = undefined;
    o.grabbedBy = undefined;
    dropBody(o);
  }
}

// ---------- co-op revive ----------

/**
 * Co-op revive (decided with the user): a teammate standing in a downed hero's circle charges
 * the revive over TUNING.coop.reviveTime; stepping out drains it quickly. Full -> they get up
 * with TUNING.coop.reviveHp lives (and the get-up i-frames).
 */
export function stepRevives(world: World, dt: number): void {
  const R = TUNING.coop;
  for (const p of world.players) {
    if (p.state !== 'downed') continue;
    const helped = world.activePlayers.some((h) => h !== p && Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) <= R.reviveRadius);
    const before = p.revive ?? 0;
    p.revive = helped ? before + dt / R.reviveTime : Math.max(0, before - dt / R.reviveDrain);
    if (p.revive < 1 - 1e-9) continue;
    p.revive = undefined;
    p.hp = R.reviveHp;
    startGetUp(p);
    world.events.emit('revive', { actorId: p.id, ...p.pos });
  }
}

// ---------- get-up, sweep ----------

function startGetUp(a: Actor): void {
  // lying with the position at mid-body; standing up keeps the feet where they lie
  const r = a.pose.root.r;
  a.pos.x += a.facing * -0.5 * Math.sin(r);
  a.getUpFrom = r;
  a.slumpWall = undefined;
  a.pose.root = aboutFeet(r);
  a.state = 'getUp';
  a.stateT = 0;
  setClip(a, 'getUp');
}

function sweepContact(world: World, a: Actor): void {
  const b = a.body;
  if (b.stateTime > DIVE_TIME * 0.8) return;
  const o = sweepTarget(world, a, a.facing, TUNING.sweep.reach);
  if (!o || b.swept.includes(o.id)) return;
  b.swept.push(o.id);
  applyHit(world, a, o, 'sweep', a.facing, 0, { x: o.pos.x - a.facing * 0.1, y: 0.12, z: o.pos.z });
}

/** The flying kick's foot: the first enemy it touches takes a heavy blow, and the kicker bounces off. */
function kickContact(world: World, a: Actor): void {
  const K = TUNING.flyKick, b = a.body;
  const x = a.pos.x + a.facing * K.reach, y = a.pos.y + K.height;
  for (const o of world.actors) {
    if (!hittable(a, o) || b.swept.includes(o.id) || (a.kind === 'hero' && o.kind === 'hero')) continue;
    if (circleHits(o, x, y, K.radius) === null) continue;
    b.swept.push(o.id);
    applyHit(world, a, o, 'heavy', a.facing, 0, { x, y, z: o.pos.z });
    b.vel.x = -a.facing * K.bounceBack;
    b.vel.y = Math.max(b.vel.y, K.bounceUp);
    b.takeoff = { x: b.vel.x, z: 0 };
    return;
  }
}

// ---------- grab & throw ----------

function tryGrab(world: World, a: Actor): void {
  const R = G.range;
  // throw-grenade-return: a live grenade nearby comes first
  for (const it of world.items) {
    if (it.kind !== 'grenade' || !it.live || it.state === 'held' || Math.abs(it.pos.z - a.pos.z) > 0.35) continue;
    if (Math.hypot(it.pos.x - a.pos.x, it.pos.y - a.pos.y) > GRENADE.pickRange + 0.2) continue;
    it.state = 'held';
    it.heldBy = a.id;
    it.vel = { x: 0, y: 0, z: 0 };
    a.holding = { kind: 'item', id: it.id };
    world.events.emit('grab', { actorId: a.id, itemId: it.id, ...it.pos });
    return;
  }
  let best: { score: number; act?: Actor; itemId?: number } | undefined;
  const consider = (score: number, act?: Actor, itemId?: number) => {
    if (!best || score < best.score) best = { score, act, itemId };
  };
  // grab assist (playtest 2026-10-27): the nearest within a radius on either side, not just what
  // is straight ahead; living enemies first (+0), then bodies (+10), then heads (+20)
  for (const o of world.actors) {
    if (o === a || o.grabbedBy !== undefined || o.state === 'getUp' || o.state === 'downed') continue;
    if (o.kind === 'hero' || (o.kind === 'boss' && alive(o))) continue; // not your partner; he hovers out of reach
    if (o.state === 'dead' && (o.corpse?.phase === 'headless' || o.flight || o.corpse?.pinned || o.corpse?.gibbed)) continue;
    // M10b: a juggled grunt can be grabbed out of the air; other flying bodies can't
    if (o.state === 'knockback' && !(o.flight?.juggle && alive(o))) continue;
    const dx = Math.abs(o.pos.x - a.pos.x), dz = Math.abs(o.pos.z - a.pos.z);
    // lying bodies are long: measure to the nearer end
    const reach = o.state === 'dead' || o.state === 'down' ? G.assistRadius + 0.4 : G.assistRadius;
    if (dz > G.assistDepth || dx > reach) continue;
    consider(Math.hypot(dx, dz) + (alive(o) ? (o.variant && !o.ai ? 5 : 0) : 10), o);
  }
  for (const it of world.items) {
    if (it.kind !== 'head' || it.state !== 'floor' || Math.abs(it.pos.z - a.pos.z) > G.assistDepth) continue;
    const dx = Math.abs(it.pos.x - a.pos.x);
    if (dx <= R + 0.3) consider(dx + 20, undefined, it.id);
  }
  if (!best) return;
  const pick = best as { act?: Actor; itemId?: number };
  if (pick.act) {
    const o = pick.act;
    // turn to it (it may be behind you)
    if (Math.abs(o.pos.x - a.pos.x) > 0.02) a.facing = o.pos.x > a.pos.x ? 1 : -1;
    // combat-disarm: F on an armed enemy steals the weapon instead of grabbing the body
    if (alive(o) && stealTarget(world, a, o)) return;
    if (o.corpse?.phase === 'frozen') world.events.emit('corpseThawed', { actorId: o.id });
    if (o.corpse) { o.corpse.phase = 'tumble'; o.corpse.slumped = false; }
    if (alive(o)) {
      if (o.holding) releaseHeld(world, o);
      dropWeapon(world, o, a.facing);
      o.state = 'grabbed';
      o.stateT = 0;
      o.attack = undefined;
      setClip(o, 'grabbed');
    }
    o.grabbedBy = a.id;
    o.flight = undefined;
    a.holding = { kind: 'actor', id: o.id };
    world.events.emit('grab', { actorId: a.id, targetId: o.id, ...o.pos });
  } else {
    const it = world.items.find((i) => i.id === pick.itemId)!;
    it.state = 'held';
    it.heldBy = a.id;
    a.holding = { kind: 'item', id: it.id };
    world.events.emit('grab', { actorId: a.id, itemId: it.id, ...it.pos });
  }
}

function startThrow(a: Actor, cmd: PlayerCommand): void {
  const aim = cmd.aim;
  // toward the floor point under the cursor (free aim across depth), else straight ahead
  let dx = a.facing, dz = 0;
  const p = cmd.aim ? unprojectFloor(cmd.aim[0], cmd.aim[1]) : undefined;
  if (p) {
    const ex = p.x - a.pos.x, ez = p.z - a.pos.z, n = Math.hypot(ex, ez);
    if (n > 0.3) { dx = ex / n; dz = ez / n; }
  }
  if (Math.abs(dx) > 0.05) a.facing = dx > 0 ? 1 : -1;
  a.state = 'attack';
  a.stateT = 0;
  a.attack = { kind: 'throw', heavy: false, t: 0, done: false, aim };
  a.throwDir = { x: dx, z: dz };
  if (a.body.state !== 'air') a.body.vel = { x: 0, y: 0, z: 0 };
  setClip(a, 'throw');
}

function releaseThrow(world: World, a: Actor): void {
  const h = a.holding;
  if (!h) return;
  a.holding = undefined;
  const d = a.throwDir ?? { x: a.facing, z: 0 };
  const vx = d.x * G.speed, vz = d.z * G.speed;
  if (h.kind === 'item') {
    const it = world.items.find((i) => i.id === h.id);
    if (!it) return;
    // a live grenade is lobbed to the floor point under the cursor, not thrown at head height
    if (it.kind === 'grenade') { lobHeldGrenade(world, a, it, a.attack?.aim); return; }
    it.state = 'air';
    it.heldBy = undefined;
    it.thrownBy = a.id;
    it.hit = [];
    it.vel = { x: vx, y: G.vy, z: vz };
    it.spin = Math.sign(vx || 1) * 18;
    world.events.emit('throw', { actorId: a.id, itemId: it.id, ...it.pos, vx, vz });
    return;
  }
  const o = world.actorById(h.id);
  if (!o) return;
  o.grabbedBy = undefined;
  o.pos = { x: a.pos.x + a.facing * 0.35, y: a.pos.y + G.releaseHeight, z: a.pos.z };
  const r = o.pose.root.r;
  o.flight = { vx, vz, vy: G.vy, r, r0: r, rTo: r, spin: Math.sign(vx || 1) * -o.facing * G.spin, phase: 'air', t: 0, airtime: 0.5, thrownBy: a.id, hit: [] };
  if (alive(o)) {
    o.state = 'knockback';
    o.stateT = 0;
    setClip(o, 'knockback');
  } else {
    o.corpse!.phase = 'tumble';
    setClip(o, 'knockback');
  }
  world.events.emit('throw', { actorId: a.id, targetId: o.id, ...o.pos, vx, vz });
}

/** The holder got hit: let go of whatever is carried. */
function releaseHeld(world: World, a: Actor): void {
  const h = a.holding;
  a.holding = undefined;
  if (!h) return;
  if (h.kind === 'item') {
    const it = world.items.find((i) => i.id === h.id);
    if (it) { it.state = 'air'; it.heldBy = undefined; it.vel = { x: 0, y: 0, z: 0 }; }
    return;
  }
  const o = world.actorById(h.id);
  if (!o) return;
  o.grabbedBy = undefined;
  dropBody(o);
}

/** Being hit while held by someone frees you (the holder lets go). */
function releaseFrom(world: World, o: Actor): void {
  const holder = world.actorById(o.grabbedBy!);
  if (holder) holder.holding = undefined;
  o.grabbedBy = undefined;
}

/** Let a carried body fall where it is. */
export function dropBody(o: Actor): void {
  const r = o.pose.root.r;
  o.flight = { vx: 0, vz: 0, vy: 0, r, r0: r, rTo: r > 0.1 ? Math.PI / 2 : -Math.PI / 2, spin: 0, phase: 'air', t: 0, airtime: 0.3, hit: [] };
  if (alive(o)) {
    o.state = 'knockback';
    o.stateT = 0;
  } else if (o.corpse) o.corpse.phase = 'tumble';
}

// ---------- corpses ----------

function stepCorpse(world: World, a: Actor, dt: number): void {
  const c = a.corpse!;
  c.t += dt;
  if (a.grabbedBy !== undefined) return;
  switch (c.phase) {
    case 'headless':
      // melee-decapitation: the body stands a moment, then drops backward
      if (reached(c.t, C.headlessStand)) {
        c.phase = 'tumble';
        c.t = 0;
        a.flight = { vx: -a.facing * 0.8, vz: 0, vy: 1.6, r: 0, r0: 0, rTo: -Math.PI / 2, spin: 0, phase: 'air', t: 0, airtime: 0.3, hit: [] };
        setClip(a, 'knockback');
      }
      break;
    case 'tumble':
      if (!a.flight || stepFlight(world, a, dt) === 'stopped') settle(world, a);
      break;
    case 'settled': {
      // M14 move-stairs: a body on a staircase slides down to its low end before it lies still
      const st = stairsAt(world.room, a.pos.x, a.pos.z);
      const low = st ? (st.y0 < st.y1 ? st.x0 : st.x1) : 0;
      if (st && Math.abs(a.pos.x - low) > 0.02) {
        if (!c.sliding) { c.sliding = true; world.events.emit('stairSlide', { actorId: a.id, ...a.pos }); }
        a.pos.x += Math.sign(low - a.pos.x) * Math.min(Math.abs(low - a.pos.x), STAIR_SLIDE * dt);
        a.pos.y = stairHeight(world.room, a.pos.x, a.pos.z) ?? a.pos.y;
        a.pose.groundY = a.pos.y;
        c.t = 0;
        break;
      }
      if (reached(c.t, C.freezeDelay)) {
        c.phase = 'frozen';
        world.events.emit('corpseFrozen', { actorId: a.id });
      }
      break;
    }
    case 'frozen':
      break;
  }
}

function settle(world: World, a: Actor): void {
  const c = a.corpse!;
  c.phase = 'settled';
  c.t = 0;
  a.flight = undefined;
  // world-persistence-decals / PLAN.md M2: bodies that end against a side wall slump against it
  const hw = world.room.halfWidth;
  const wall = a.slumpWall;
  a.slumpWall = undefined;
  const nearSide = hw - Math.abs(a.pos.x) < C.slumpDistance + 0.5;
  if ((wall === 'left' || wall === 'right') && nearSide && a.pos.y < 0.05) {
    const side = wall === 'left' ? -1 : 1;
    c.slumped = true;
    a.facing = (-side) as 1 | -1;
    a.pos.x = side * (hw - 0.3);
    a.pose.root = { ...STANDING };
    setClip(a, 'slumped');
  } else setClip(a, 'lying');
  world.events.emit('corpseSettled', { actorId: a.id, ...a.pos });
}
