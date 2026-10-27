// Combat state machine (PLAN.md M2): punches, hit reactions, knockdown and get-up, grabs and
// throws, the low sweep, the finisher, death and corpses. Numbers from TUNING, which cites
// research/mechanics/melee-* and move-knockdown-getup.
import { aboutFeet, lyingAt, rootToWorld, STANDING } from '../anim/skeleton';
import { GRAVITY, TUNING } from '../data/tuning';
import { DISARM, GRENADE, MELEE, SHIELD } from '../data/melee';
import { GUNS, isWeapon, WEAPONS } from '../data/weapons';
import { stepHands } from './guns';
import { blastFlight } from './explosives';
import { tryTakedown } from './stealth';
import { ceilingBounce, knockbackScale, wallRestitution } from './improbability';
import { stepRising, zombieDamage, zombieLosesHead } from './zombies';
import { bossHit } from './boss';
import { ACTION_KINDS, actionTiming, disarm, dropCooking, holdsLong, lobHeldGrenade, startAction, startMeleeAction, stealTarget, stepAction, stepGrenade } from './melee';
import { project, unprojectFloor } from '../render/camera';
import { type Actor, type AttackKind, alive, type Flight } from './actor';
import { clamp, moveWithCollision, surfaceBelow } from './collision';
import type { PlayerCommand } from './command';
import { type HitKind, MELEE_KINDS } from './events';
import { circleHits } from './hurtbox';
import { dropHeld } from './items';
import { DIVE_TIME, stepAirborneAction, stepAttackMove, stepLocomotion, sweepTarget } from './movement';
import type { World } from './world';

const M = TUNING.melee, H = TUNING.hit, G = TUNING.grab, C = TUNING.corpse, C_ = TUNING.combo;
const PUNCH_CLIP: Partial<Record<AttackKind, string>> = {
  light: 'punchLight', heavy: 'punchHeavy', uppercut: 'uppercut', finisher: 'finisher', throw: 'throw',
};

/** Startup / active / recovery of each attack (s). `weapon` = the melee weapon of a swing. */
export function attackTiming(kind: AttackKind, weapon?: string): { startup: number; active: number; recovery: number } {
  if (kind === 'throw') return { startup: G.windup, active: 0, recovery: G.recovery };
  if (ACTION_KINDS.includes(kind)) return actionTiming(kind, weapon);
  return M[kind as 'light' | 'heavy' | 'uppercut' | 'finisher'];
}

/** Timer reached a duration (tolerates float drift from summing 1/60 s ticks). */
const reached = (t: number, d: number) => t >= d - 1e-6;

/** Fist reach from the body centre so the max centre-to-centre range is `M.range` at face height. */
const FIST_REACH = M.range - 0.2 - M.fistRadius - 0.01;

export function stepActor(world: World, a: Actor, cmd: PlayerCommand, dt: number): void {
  a.stateT += dt;
  a.pose.clipT += dt;
  a.pose.impact = Math.max(0, a.pose.impact - dt);
  a.pose.hurt = Math.max(0, a.pose.hurt - dt);
  a.pose.lean *= Math.exp(-8 * dt);

  // throw-catch-return: F opens a short window to catch a thrown weapon
  if (cmd.grab) a.catchAt = world.time;
  // M7: E behind an unaware enemy is a takedown (before E picks anything up)
  if (a.state === 'free' && tryTakedown(world, a, cmd)) cmd = { ...cmd, pickup: false };
  // a hand holding a gun fires instead of punching (M5): LMB = hand 0, RMB = hand 1
  if (a.state === 'free' || a.state === 'attack') {
    cmd = withoutGunPunches(a, cmd);
    stepHands(world, a, cmd, dt);
    stepGrenade(world, a, cmd, dt);
  }

  switch (a.state) {
    case 'free': {
      const b = a.body;
      // a punch pressed during the previous swing comes out as soon as it ends
      if (!cmd.attack && a.queued && world.time - a.queued.at <= M.buffer + 1e-6 && b.state === 'ground') {
        cmd = { ...cmd, attack: a.queued.kind, aim: a.queued.aim };
      }
      a.queued = undefined;
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
      setClip(a, a.pose.welding ? 'weld' : a.pose.handsUp ? 'handsUp' : a.cook !== undefined ? 'cook' : a.holding ? 'carry' : holdsLong(a) ? 'holdLong' : a.ai?.aware === false && a.ai.idle === 'smoke' ? 'smoke' : 'idle');
      break;
    }
    case 'attack': {
      const k = a.attack?.kind;
      if (cmd.attack && (k === 'light' || k === 'heavy' || k === 'uppercut' || k === 'finisher')) a.queued = { kind: cmd.attack, aim: cmd.aim, at: world.time };
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
    case 'downed':
      break; // revived by a teammate (stepRevives)
    case 'down':
      // M10: knocked out for good (interrogation) or dazed with stars for a while
      if (a.koed) break;
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
    a.pose.clip = clip;
    a.pose.clipT = 0;
  }
}

// ---------- attacks ----------

function startAttack(world: World, a: Actor, cmd: PlayerCommand): void {
  let kind: AttackKind = cmd.attack!;
  if (kind === 'heavy' && cmd.aim && aimedUp(a, cmd.aim)) kind = 'uppercut';
  // a punch at a downed body with nobody standing in reach becomes the finisher
  if (kind !== 'uppercut' && a.body.state === 'ground' && !standingInReach(world, a) && downedInReach(world, a)) kind = 'finisher';
  if (cmd.face) a.facing = cmd.face;
  a.state = 'attack';
  a.stateT = 0;
  a.attack = { kind, heavy: cmd.attack === 'heavy', t: 0, done: false };
  setClip(a, PUNCH_CLIP[kind] ?? 'idle');
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
  return o !== a && alive(o) && o.state !== 'grabbed' && o.state !== 'getUp' && o.state !== 'downed' && Math.abs(o.pos.z - a.pos.z) <= M.depthBand;
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
    if (o === a || !isDowned(o) || Math.abs(o.pos.z - a.pos.z) > M.depthBand) continue;
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
    const p = circleHits(o, f.x, f.y, f.r);
    const d = Math.abs(o.pos.x - a.pos.x);
    if (p && d < bestD) { best = o; bestD = d; part = p; }
  }
  if (!best) return false;
  applyHit(world, a, best, kind as HitKind, a.facing, 0, { x: f.x, y: f.y, z: best.pos.z }, part);
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
  if (o.invulnerable) return; // M9: the target before his last room, the boss's cameo
  // M8: the living boss has his own damage rule (src/sim/boss.ts)
  if (o.kind === 'boss' && o.state !== 'dead') { bossHit(world, by, o, kind, part, dirX, dirZ, at); return; }
  // held up by the boss for the body slams: nobody else gets a hit in (not a human shield)
  if (o.grabbedBy !== undefined && by?.id !== o.grabbedBy && world.actorById(o.grabbedBy)?.kind === 'boss' && kind !== 'blast') return;
  // combat-human-shield: a body held up as a shield takes what was meant for its holder
  if (o.grabbedBy !== undefined && by?.id !== o.grabbedBy && kind !== 'blast') { shieldHit(world, by, o, kind, at, part); return; }
  const corpse = o.state === 'dead';
  const base = bullet ? bullet.damage : kind === 'gun' && part === 'head' ? GUNS.throwHead : kind === 'finisher' && heavy ? M.finisher.heavyDamage : DAMAGE[kind];
  const combo = !corpse && base > 0 && o.kind !== 'hero' && MELEE_KINDS.includes(kind) && chainBonus(world, by, o, kind);
  const damage = corpse || base <= 0 || (o.protected && kind !== 'pin') ? 0 : o.kind === 'hero' ? 1 : o.kind === 'zombie' ? zombieDamage(kind, base)
    // M11 the brute (~6 melee hits): every blow is one, bullets half, explosions three
    : o.variant === 'vending' ? (base >= 99 ? (kind === 'blast' ? 3 : o.hp) : kind === 'bullet' ? 0.5 : 1)
    : o.variant === 'bodyguard' ? (part === 'head' || base >= 99 ? o.hp : 1) : base + (combo ? C_.bonus : 0);
  o.hp = Math.max(0, o.hp - damage);
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
    const decap = o.kind === 'grunt' && (kind === 'heavy' || kind === 'uppercut' || kind === 'slash' || (kind === 'finisher' && heavy) || ((pointBlank || kind === 'gun') && part === 'head'));
    die(world, o, by, kind, dirX, dirZ, decap, pointBlank ? 'heavy' : kind);
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
  switch ((airborne && kind === 'light') || dazedNow ? 'heavy' : kind) {
    case 'light':
    case 'stab':
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
  } else o.chain = { by: by.id, count: 1, t: world.time, last: kind };
  const n = o.chain!.count;
  return n >= 3 || (n === 2 && (kind === 'heavy' || kind === 'uppercut') && prev === 'light');
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
    a.pos.x = p.x;
    a.pos.z = p.z;
    a.pos.y += f.vy * dt - 0.5 * GRAVITY * dt * dt;
    f.vy -= GRAVITY * dt;
    // M11: off the ceiling (or stuck in it)
    if (ceilingBounce(world, a)) return 'stopped';
    if (f.thrownBy !== undefined) {
      f.r += f.spin * dt;
      thrownBodyHits(world, a);
    } else f.r = f.r0 + (f.rTo - f.r0) * clamp(f.t / f.airtime, 0, 1);
    const ground = surfaceBelow(room, a.pos.x, a.pos.z, Math.max(prevY, a.pos.y));
    a.pose.groundY = ground;
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
  // M11 improbability mode: an elastic bounce, squashed like rubber
  const e = wallRestitution(world);
  if (wall === 'back') f.vz *= -e;
  else f.vx *= -e;
  if (e > 0.5) a.pose.squash = 0.35;
  world.events.emit('wallHit', { actorId: a.id, ...a.pos, wall, speed });
  // melee-grab-throw: a fast wall impact kills
  if (f.thrownBy !== undefined && alive(a) && speed >= G.wallKillSpeed) {
    f.hit.push(-1);
    applyHit(world, world.actorById(f.thrownBy), a, 'wall', -Math.sign(f.vx) || 1, 0, a.pos);
  }
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
  for (const o of world.actors) {
    if (o === a || o.grabbedBy !== undefined || o.state === 'getUp' || o.state === 'downed' || Math.abs(o.pos.z - a.pos.z) > M.depthBand) continue;
    if (o.kind === 'boss' && alive(o)) continue; // he hovers out of reach of a grab
    if (o.state === 'dead' && (o.corpse?.phase === 'headless' || o.flight || o.corpse?.pinned || o.corpse?.gibbed)) continue;
    if (o.state === 'knockback') continue;
    const d = (o.pos.x - a.pos.x) * a.facing;
    // lying bodies are long: measure to the nearer end
    const reach = o.state === 'dead' || o.state === 'down' ? R + 0.4 : R;
    if (d < -0.2 || d > reach) continue;
    consider(Math.abs(d) + (alive(o) ? 0 : 1), o);
  }
  for (const it of world.items) {
    if (it.kind !== 'head' || it.state !== 'floor' || Math.abs(it.pos.z - a.pos.z) > M.depthBand) continue;
    const d = (it.pos.x - a.pos.x) * a.facing;
    if (d >= -0.2 && d <= R) consider(Math.abs(d) + 2, undefined, it.id);
  }
  if (!best) return;
  const pick = best as { act?: Actor; itemId?: number };
  if (pick.act) {
    const o = pick.act;
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
    case 'settled':
      if (reached(c.t, C.freezeDelay)) {
        c.phase = 'frozen';
        world.events.emit('corpseFrozen', { actorId: a.id });
      }
      break;
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
