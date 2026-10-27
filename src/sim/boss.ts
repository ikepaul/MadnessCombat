// Stage-1 boss, the hovering necromancer (PLAN.md M8, research/mechanics/boss-halo, our own
// design: design/art-direction.md). He never walks or falls: this state machine replaces the
// movement and combat steps while he lives. Moves so far: the entrance (floats down from above the
// frame), the ward (our shield: blocks rays from his front for ~1 s, then a window), and one act
// at a time: the lightning raise (a corpse rises as a zombie), the lightning strike (knockdown +
// disarm, dodged by moving), and the hover dash -> grab -> body slams -> throw. Phase 2, from his
// first head wound: he sweeps the corpses off the screen, summons the cannon (shadow, drop, crush;
// it stays as terrain) and fires volleys from behind it. Only head hits hurt him (3 kill).
import { lyingAt } from '../anim/skeleton';
import { TUNING } from '../data/tuning';
import { isWeapon } from '../data/weapons';
import { project, type ScreenPoint, scaleAt } from '../render/camera';
import { type Actor, alive, createActor } from './actor';
import { type Cannon, dropCannon, landCannon } from './cannon';
import { applyHit, die, dropBody, setClip } from './combat';
import type { HitKind } from './events';
import { canRaise, raiseCorpse } from './zombies';
import type { World } from './world';

const B = TUNING.boss, ST = B.strike, D = B.dash, SL = B.slam, SW = B.sweep, CN = B.cannon;

/** What he is doing (one at a time); none = hovering, the ward free to rise. */
export type BossAct =
  | { kind: 'cast'; spell: 'raise' | 'strike'; t: number; targetId: number; at: { x: number; z: number }; bolted: boolean }
  | { kind: 'dash'; t: number; targetId: number; from: { x: number; z: number }; to: { x: number; z: number } }
  | { kind: 'grab'; t: number; targetId: number; slams: number; done: number; presses: number; side: 1 | -1 }
  | { kind: 'recover'; t: number; time: number }
  | { kind: 'sweep'; t: number; dir: 1 | -1; pushed: boolean }
  | { kind: 'summon'; t: number; cannon: Cannon }
  | { kind: 'volley'; t: number; from: { x: number; z: number }; started: boolean };

export interface BossState {
  phase: 'enter' | 'fight';
  /** Seconds in the phase. */
  t: number;
  act?: BossAct;
  /** Seconds until the next raise / strike / dash may start. */
  raiseIn: number;
  strikeIn: number;
  dashIn: number;
  /** Seconds the ward stays up (> 0 = up), then the window before it can rise again. */
  ward: number;
  window: number;
  /** Shots the ward stopped while up (ep1: a blocked burst is answered with lightning). */
  blocked: number;
  /** Phase 2 (sweep, cannon) starts at his first head wound or after TUNING.boss.sweep.after s. */
  stage: 1 | 2;
  /** His cannon once summoned, and the seconds until its next volley. */
  cannon?: Cannon;
  cannonIn: number;
  /** From the start of phase 2 until his cannon lands: hits don't count. */
  untouchable?: boolean;
}

export const isBoss = (a: Actor | undefined): a is Actor & { boss: BossState } => !!a && a.kind === 'boss' && !!a.boss;

/** The boss arrives: above the frame at (x, z), floating down over B.descend. */
export function spawnBoss(world: World, x: number, z: number, facing: 1 | -1): Actor {
  const a = createActor('boss', x, z, facing);
  a.hp = a.maxHp = B.hp;
  a.pos.y = B.startHeight;
  a.pose.root = { r: 0, tx: 0, ty: 0, sx: B.scale, sy: B.scale };
  a.pose.ward = 0;
  a.pose.cast = 0;
  a.pose.grip = 0;
  a.pose.push = 0;
  a.boss = { phase: 'enter', t: 0, raiseIn: B.firstRaise, strikeIn: ST.first, dashIn: D.first, ward: 0, window: 0, blocked: 0, stage: 1, cannonIn: 0 };
  world.actors.push(a);
  world.events.emit('bossArrive', { actorId: a.id, phase: 'descend', x, y: a.pos.y, z });
  return a;
}

/** One tick of a living boss (World.step calls this instead of stepActor). */
export function stepBoss(world: World, a: Actor & { boss: BossState }, dt: number): void {
  const s = a.boss;
  s.t += dt;
  a.stateT += dt;
  a.pose.impact = Math.max(0, a.pose.impact - dt);
  a.pose.lean *= Math.exp(-8 * dt);
  const target = nearestPlayer(world, a);
  if (target && !s.act) a.facing = target.pos.x >= a.pos.x ? 1 : -1;

  if (s.phase === 'enter') {
    // eased float down: fast out of the sky, settling onto the hover height
    const u = Math.min(1, s.t / B.descend), e = 1 - (1 - u) * (1 - u);
    a.pos.y = B.startHeight + (B.hover - B.startHeight) * e;
    if (u >= 1) {
      s.phase = 'fight';
      s.t = 0;
      world.events.emit('bossArrive', { actorId: a.id, phase: 'land', ...a.pos });
    }
    return;
  }

  a.pos.y = B.hover + Math.sin(s.t * B.hoverRate) * B.hoverBob;
  s.raiseIn -= dt;
  s.strikeIn -= dt;
  s.dashIn -= dt;
  s.cannonIn -= dt;
  stepWard(world, a, s, dt);
  const act = s.act;
  if (act?.kind === 'cast') stepCast(world, a, s, act, dt);
  else if (act?.kind === 'dash') stepDash(world, a, s, act, dt);
  else if (act?.kind === 'grab') stepGrab(world, a, s, act, dt);
  else if (act?.kind === 'sweep') stepSweep(world, a, s, act, dt);
  else if (act?.kind === 'summon') stepSummon(a, s, act, dt);
  else if (act?.kind === 'volley') stepVolley(world, a, s, act, dt);
  else if (act?.kind === 'recover') { act.t += dt; if (act.t >= act.time) s.act = undefined; }
  else choose(world, a, s);
  // hand up while casting or summoning the cannon
  const handUp = act?.kind === 'cast' ? act.t / B.castTime : act?.kind === 'summon' ? act.t / CN.shadow : 0;
  a.pose.cast = handUp > 0 ? Math.min(1, handUp) : Math.max(0, (a.pose.cast ?? 0) - dt / 0.2);
  a.pose.grip = act?.kind === 'grab' ? Math.min(1, (a.pose.grip ?? 0) + dt / 0.15) : Math.max(0, (a.pose.grip ?? 0) - dt / 0.2);
  a.pose.push = act?.kind === 'sweep' ? Math.min(1, act.t / SW.windup) : Math.max(0, (a.pose.push ?? 0) - dt / 0.3);
}

/**
 * Free to act. Phase 2 opens with the sweep, the summon and a volley; after that volleys come
 * back on their timer. Otherwise: dash at someone close, else strike, else raise.
 */
function choose(world: World, a: Actor, s: BossState): void {
  if (s.ward > 0) return;
  if (s.stage === 1 && s.t >= SW.after) { startPhase2(world, a, s); return; }
  if (s.cannon && s.cannonIn <= 0) { s.act = { kind: 'volley', t: 0, from: { x: a.pos.x, z: a.pos.z }, started: false }; return; }
  const p = nearestPlayer(world, a);
  if (p && s.dashIn <= 0 && grabbable(p) && Math.abs(p.pos.x - a.pos.x) <= D.range && Math.abs(p.pos.z - a.pos.z) <= D.depthBand) {
    startDash(world, a, s, p);
    return;
  }
  if (p && s.strikeIn <= 0 && Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) <= ST.range) {
    startCast(world, a, s, 'strike', p);
    return;
  }
  if (s.raiseIn <= 0) {
    const zombies = world.actors.filter((o) => o.kind === 'zombie' && alive(o)).length;
    const corpse = zombies < B.maxZombies ? raiseTarget(world, a) : undefined;
    if (corpse) startCast(world, a, s, 'raise', corpse);
    else s.raiseIn = 0.5; // nothing to raise yet: look again shortly
  }
}

// ---------- ward ----------

/** The ward rises when a gun on his front side threatens him and the window is over (only between acts). */
function stepWard(world: World, a: Actor, s: BossState, dt: number): void {
  if (s.ward > 0) {
    s.ward -= dt;
    if (s.ward <= 0) {
      s.ward = 0;
      s.window = B.wardWindow;
      world.events.emit('ward', { actorId: a.id, up: false, ...a.pos });
      // ep1: the burst he just blocked is answered with lightning
      if (s.blocked > 0) s.strikeIn = Math.min(s.strikeIn, ST.afterWard);
      s.blocked = 0;
    }
  } else if (s.window > 0) s.window = Math.max(0, s.window - dt);
  else if (!s.act && threatened(world, a)) {
    s.ward = B.wardUp;
    world.events.emit('ward', { actorId: a.id, up: true, ...a.pos });
  }
  const k = dt / B.wardFade;
  a.pose.ward = s.ward > 0 ? Math.min(1, (a.pose.ward ?? 0) + k) : Math.max(0, (a.pose.ward ?? 0) - k);
}

/** guns.ts: a shot stopped on the ward. */
export function wardBlocked(a: Actor): void {
  if (isBoss(a)) a.boss.blocked++;
}

// ---------- lightning: raise and strike ----------

function startCast(world: World, a: Actor, s: BossState, spell: 'raise' | 'strike', o: Actor): void {
  s.act = { kind: 'cast', spell, t: 0, targetId: o.id, at: { x: o.pos.x, z: o.pos.z }, bolted: false };
  a.facing = o.pos.x >= a.pos.x ? 1 : -1;
  world.events.emit('bossCast', { actorId: a.id, targetId: o.id, ...a.pos });
}

/** Telegraph (hand up, crackle), then the bolt: a corpse rises, or the strike lands where they stood. */
function stepCast(world: World, a: Actor, s: BossState, c: Extract<BossAct, { kind: 'cast' }>, dt: number): void {
  c.t += dt;
  if (!c.bolted && c.t >= B.castTime) {
    c.bolted = true;
    const [hx, hy] = handPoint(a);
    const from = { x: hx, y: hy, z: a.pos.z };
    if (c.spell === 'raise') {
      // the corpse may have been gibbed or picked up meanwhile: the bolt still strikes, nothing rises
      const o = world.actorById(c.targetId);
      if (o) {
        world.events.emit('lightning', { actorId: a.id, targetId: o.id, from, to: { x: o.pos.x, y: o.pos.y + 0.15, z: o.pos.z } });
        raiseCorpse(world, o);
      }
    } else {
      // the strike lands where the target stood when the hand went up; whoever is still there is hit
      const hit = world.activePlayers.find((p) => Math.abs(p.pos.x - c.at.x) <= ST.radius && Math.abs(p.pos.z - c.at.z) <= ST.depthBand);
      const to = hit ? { x: hit.pos.x, y: hit.pos.y + 0.55, z: hit.pos.z } : { x: c.at.x, y: 0, z: c.at.z };
      world.events.emit('lightning', { actorId: a.id, targetId: hit?.id ?? 0, from, to });
      if (hit) applyHit(world, a, hit, 'lightning', Math.sign(hit.pos.x - a.pos.x) || a.facing, 0, to, 'body');
    }
  }
  if (c.t >= B.castTime + B.boltTime) {
    s.act = undefined;
    if (c.spell === 'raise') s.raiseIn = B.raiseEvery;
    else s.strikeIn = ST.every;
  }
}

/** The raised casting hand, world coordinates (the bolt leaves from here; style frame pose). */
export function handPoint(a: Actor): [number, number] {
  return [a.pos.x + a.facing * 0.15 * B.scale, a.pos.y + 1.2 * B.scale];
}

// ---------- hover dash, grab, body slams, throw ----------

const grabbable = (p: Actor) => alive(p) && (p.state === 'free' || p.state === 'attack' || p.state === 'stun') && p.grabbedBy === undefined;

function startDash(world: World, a: Actor, s: BossState, p: Actor): void {
  a.facing = p.pos.x >= a.pos.x ? 1 : -1;
  // glide to just in front of him (at his depth)
  const to = { x: clampX(world, p.pos.x - a.facing * D.stopShort), z: p.pos.z };
  s.act = { kind: 'dash', t: 0, targetId: p.id, from: { x: a.pos.x, z: a.pos.z }, to };
  world.events.emit('bossDash', { actorId: a.id, targetId: p.id, phase: 'windup', ...a.pos });
}

function stepDash(world: World, a: Actor, s: BossState, d: Extract<BossAct, { kind: 'dash' }>, dt: number): void {
  const t0 = d.t;
  d.t += dt;
  if (d.t < D.windup) { a.pose.lean = -0.25 * Math.min(1, d.t / 0.1); return; } // leans back
  if (t0 < D.windup) world.events.emit('bossDash', { actorId: a.id, targetId: d.targetId, phase: 'go', ...a.pos });
  const u = Math.min(1, (d.t - D.windup) / D.time);
  a.pos.x = d.from.x + (d.to.x - d.from.x) * u;
  a.pos.z = d.from.z + (d.to.z - d.from.z) * u;
  a.pose.lean = 0.3; // leans into it
  if (u < 1) return;
  const p = world.actorById(d.targetId);
  if (p && grabbable(p) && Math.abs(p.pos.x - a.pos.x) <= D.reach && Math.abs(p.pos.z - a.pos.z) <= D.grabBand) startGrab(world, a, s, p);
  else { s.act = { kind: 'recover', t: 0, time: D.recover }; s.dashIn = D.coolMiss; }
}

function startGrab(world: World, a: Actor, s: BossState, p: Actor): void {
  s.act = { kind: 'grab', t: 0, targetId: p.id, slams: SL.count, done: 0, presses: 0, side: 1 };
  p.state = 'grabbed';
  p.stateT = 0;
  p.grabbedBy = a.id;
  p.attack = undefined;
  p.flight = undefined;
  p.body.vel = { x: 0, y: 0, z: 0 };
  world.events.emit('grab', { actorId: a.id, targetId: p.id, ...p.pos });
}

/**
 * Lifts him overhead, then slams him into the floor on alternating sides once every SL.every
 * seconds. The held player mashing buttons takes slams off. After the last one: the throw.
 */
function stepGrab(world: World, a: Actor, s: BossState, g: Extract<BossAct, { kind: 'grab' }>, dt: number): void {
  const p = world.actorById(g.targetId);
  if (!p || p.grabbedBy !== a.id) { s.act = { kind: 'recover', t: 0, time: SL.recover }; s.dashIn = D.coolHit; return; }
  g.t += dt;
  // mashing: any button press of the held player
  const cmd = p.playerIndex !== undefined ? world.commands[p.playerIndex] : undefined;
  if (cmd && (cmd.attack || cmd.jump || cmd.grab || cmd.dive || cmd.press?.[0] || cmd.press?.[1])) {
    g.presses++;
    if (g.presses % SL.mashPer === 0) g.slams = Math.max(SL.minSlams, g.slams - 1);
  }
  const overhead = { x: a.pos.x + a.facing * 0.05, y: a.pos.y + 1.25 * B.scale };
  p.facing = a.facing;
  setClip(p, 'lying');
  if (g.t < SL.lift) {
    // up off the floor into the air over his head
    const u = g.t / SL.lift;
    p.pos.y = overhead.y * u;
    p.pose.root = lyingAt(-Math.PI / 2 * u);
    return;
  }
  // slam cycle: swing down (0-0.35), lie (0.35-0.55), back up (0.55-1)
  const cycT = g.t - SL.lift, n = Math.floor(cycT / SL.every), u = (cycT % SL.every) / SL.every;
  if (n >= g.slams) { throwHero(world, a, s, p); return; }
  const side = (n % 2 ? -1 : 1) as 1 | -1;
  const floorX = clampX(world, a.pos.x + side * a.facing * 0.75);
  if (u < 0.35) {
    const k = (u / 0.35) ** 2; // accelerating into the floor
    p.pos.x = overhead.x + (floorX - overhead.x) * k;
    p.pos.y = overhead.y * (1 - k);
  } else if (u < 0.55) {
    p.pos.x = floorX;
    p.pos.y = 0;
    if (g.done <= n) {
      g.done = n + 1;
      world.events.emit('bossSlam', { actorId: a.id, targetId: p.id, n: g.done, ...p.pos });
      world.events.emit('bodyFall', { actorId: p.id, speed: 7, ...p.pos });
    }
  } else {
    const k = (u - 0.55) / 0.45;
    p.pos.x = floorX + (overhead.x - floorX) * k;
    p.pos.y = overhead.y * k;
  }
  g.side = side;
  p.pose.root = lyingAt(side > 0 ? -Math.PI / 2 : Math.PI / 2);
}

/** The throw across the room (ep1 f2109): a hard knockdown, one life. */
function throwHero(world: World, a: Actor, s: BossState, p: Actor): void {
  p.pos.y = 0.6;
  applyHit(world, a, p, 'heavy', a.facing, 0, { x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z });
  if (p.flight) { p.flight.vx *= SL.throwBoost; p.flight.vz *= SL.throwBoost; }
  world.events.emit('throw', { actorId: a.id, targetId: p.id, vx: p.flight?.vx ?? 0, vz: 0, ...p.pos });
  s.act = { kind: 'recover', t: 0, time: SL.recover };
  s.dashIn = D.coolHit;
}

/** He lets go mid-grab (hurt): the hero drops where he is. */
function letGo(world: World, a: Actor & { boss: BossState }): void {
  const g = a.boss.act;
  if (g?.kind !== 'grab') return;
  const p = world.actorById(g.targetId);
  if (p && p.grabbedBy === a.id) { p.grabbedBy = undefined; dropBody(p); }
  a.boss.act = { kind: 'recover', t: 0, time: SL.recover };
  a.boss.dashIn = D.coolHit;
}

// ---------- phase 2: the corpse sweep and the cannon ----------

/** Phase 2 starts now, whatever he was doing: the sweep, then the cannon. */
function startPhase2(world: World, a: Actor, s: BossState): void {
  if (s.act?.kind === 'grab' && isBoss(a)) letGo(world, a);
  s.stage = 2;
  // nothing hurts him until his cannon is down (so phase 2 always plays out)
  s.untouchable = true;
  if (s.ward > 0) { s.ward = 0; world.events.emit('ward', { actorId: a.id, up: false, ...a.pos }); }
  const p = nearestPlayer(world, a);
  const dir = (p && p.pos.x < a.pos.x ? -1 : 1) as 1 | -1;
  s.act = { kind: 'sweep', t: 0, dir, pushed: false };
  world.events.emit('bossSweep', { actorId: a.id, phase: 'windup', dir, count: 0, ...a.pos });
}


/**
 * Telekinetic sweep (ep1 f2229-f2259): his hand swings out flat, and every intact body on the
 * ground slides off the screen, away from him. Nothing left to raise; then the cannon.
 */
function stepSweep(world: World, a: Actor, s: BossState, w: Extract<BossAct, { kind: 'sweep' }>, dt: number): void {
  w.t += dt;
  a.facing = w.dir;
  if (!w.pushed && w.t >= SW.windup) {
    w.pushed = true;
    let count = 0;
    for (const o of world.actors) {
      if (o.state !== 'dead' || o.swept || o.corpse?.gibbed || o.grabbedBy !== undefined || o.kind === 'boss') continue;
      // the bodies go off whichever edge is away from him
      const dir = Math.sign(o.pos.x - a.pos.x) || w.dir;
      if (o.corpse?.phase === 'frozen') { o.corpse.phase = 'settled'; world.events.emit('corpseThawed', { actorId: o.id }); }
      o.flight = undefined;
      o.swept = { vx: dir * SW.speed, vy: SW.hop };
      count++;
    }
    world.events.emit('bossSweep', { actorId: a.id, phase: 'push', dir: w.dir, count, ...a.pos });
  }
  if (w.t >= SW.windup + 0.4) startSummon(world, a, s);
}

/** A swept body slides off the screen with a little hop; gone once it's past the edge. */
export function stepSwept(world: World, o: Actor & { swept: { vx: number; vy: number } }, dt: number): boolean {
  o.pos.x += o.swept.vx * dt;
  o.pos.y = Math.max(0, o.pos.y + o.swept.vy * dt);
  o.swept.vy -= 12 * dt;
  o.pose.root = lyingAt((o.pose.root.r || Math.PI / 2) + Math.sign(o.swept.vx) * 4 * dt);
  return Math.abs(o.pos.x) > world.room.halfWidth + 1.2;
}

/** He raises his hand; the cannon's shadow appears beside him, then it drops (world-falling-hazard). */
function startSummon(world: World, a: Actor, s: BossState): void {
  const p = nearestPlayer(world, a);
  const facing = (p ? (p.pos.x >= a.pos.x ? 1 : -1) : a.facing) as 1 | -1;
  a.facing = facing;
  const c = dropCannon(world, clampX(world, a.pos.x + facing * CN.offset), a.pos.z, facing, a.id);
  s.cannon = c;
  s.act = { kind: 'summon', t: 0, cannon: c };
}

/** His hand stays up while it falls (src/sim/cannon.ts drops it); then the volley. */
function stepSummon(a: Actor, s: BossState, m: Extract<BossAct, { kind: 'summon' }>, dt: number): void {
  m.t += dt;
  if (m.cannon.drop) return;
  s.untouchable = false;
  s.act = { kind: 'volley', t: 0, from: { x: a.pos.x, z: a.pos.z }, started: false };
}

/**
 * He glides behind his cannon and fires a volley at whoever is nearest: TUNING.cannon's 1.3 s,
 * the barrel swinging to the target's depth. He can't raise the ward while he works it.
 */
function stepVolley(world: World, a: Actor, s: BossState, v: Extract<BossAct, { kind: 'volley' }>, dt: number): void {
  const c = s.cannon;
  if (!c) { s.act = undefined; return; }
  v.t += dt;
  const p = nearestPlayer(world, a);
  if (!v.started) {
    // turn the cannon toward them and take position behind it
    if (p) c.facing = p.pos.x >= c.x ? 1 : -1;
    const to = { x: clampX(world, c.x - c.facing * CN.behind), z: c.z };
    const u = Math.min(1, v.t / 0.3);
    a.pos.x = v.from.x + (to.x - v.from.x) * u;
    a.pos.z = v.from.z + (to.z - v.from.z) * u;
    a.facing = c.facing;
    if (u < 1) return;
    v.started = true;
    c.shots = CN.shots;
    c.timer = CN.firstShot;
  }
  a.facing = c.facing;
  if (p) c.aimZ = Math.max(c.z - CN.aimBand, Math.min(c.z + CN.aimBand, p.pos.z));
  if ((c.shots ?? 0) > 0) return;
  s.act = { kind: 'recover', t: 0, time: 0.6 };
  s.cannonIn = CN.every;
}

// ---------- helpers ----------

function clampX(world: World, x: number): number {
  const lim = world.room.halfWidth - 0.3;
  return Math.max(-lim, Math.min(lim, x));
}

/** The nearest intact corpse in range (canRaise: not gibbed, not headless, not held). */
function raiseTarget(world: World, a: Actor): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  for (const o of world.actors) {
    if (!canRaise(o)) continue;
    const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
    if (d <= B.raiseRange && d < bestD) { best = o; bestD = d; }
  }
  return best;
}

function nearestPlayer(world: World, a: Actor): Actor | undefined {
  let best: Actor | undefined, bestD = Infinity;
  for (const p of world.activePlayers) {
    const d = Math.abs(p.pos.x - a.pos.x);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** Someone holding a gun stands on his front side, close enough to shoot. */
function threatened(world: World, a: Actor): boolean {
  return world.activePlayers.some((p) => {
    const dx = p.pos.x - a.pos.x;
    return Math.sign(dx) === a.facing && Math.abs(dx) <= B.wardThreat && p.hands.some((h) => !!h && isWeapon(h.item));
  });
}

/** The ward diamond on screen (empty when it's down). */
export function wardPolygon(a: Actor): ScreenPoint[] {
  if (!isBoss(a) || a.boss.ward <= 0) return [];
  const W = B.ward, k = B.scale;
  const cx = a.pos.x + a.facing * W.x * k, cy = a.pos.y - W.y * k;
  const s = scaleAt(a.pos.z), [px, py] = project(cx, cy, a.pos.z);
  const hw = W.hw * k * s, hh = W.hh * k * s;
  return [[px, py - hh], [px + hw, py], [px, py + hh], [px - hw, py]];
}

/**
 * Hits on the boss (applyHit hands them here). Only a player's bullet or thrown gun to the head
 * counts (the ward stops those from his front while it's up). Everything else just flashes him.
 * The first one starts phase 2 at once, and nothing counts again until his cannon has landed; a
 * later one makes him drop whoever he's holding. Dies at 0.
 */
export function bossHit(world: World, by: Actor | undefined, o: Actor, kind: HitKind, part: 'head' | 'body', dirX: number, dirZ: number, at: { x: number; y: number; z: number }): void {
  const s = o.boss;
  // the ward has already stopped what came at his front (src/sim/hitscan.ts): whatever reached his head counts
  const counts = !!s && s.phase === 'fight' && !s.untouchable && part === 'head' && (kind === 'bullet' || kind === 'gun') && by?.playerIndex !== undefined;
  const damage = counts ? 1 : 0;
  o.hp = Math.max(0, o.hp - damage);
  o.pose.impact = TUNING.hit.impact;
  o.pose.lean = -0.15 * Math.sign(dirX || -o.facing) * o.facing;
  const killed = o.hp <= 0;
  world.events.emit('hit', { actorId: o.id, attackerId: by?.id ?? 0, kind, part, damage, killed, dirX, dirZ, combo: false, chain: 0, ...at });
  if (counts && isBoss(o)) {
    // the first wound opens phase 2 at once; later ones make him drop whoever he holds
    if (o.boss.stage === 1 && !killed) startPhase2(world, o, o.boss);
    else letGo(world, o);
  }
  if (!killed) return;
  o.pose.ward = 0;
  o.pose.cast = 0;
  o.pose.grip = 0;
  o.pose.push = 0;
  // nobody mans the cannon now (it stays: wave B's grunts take it over); one still falling lands
  if (s?.cannon) {
    if (s.cannon.drop) landCannon(world, s.cannon);
    s.cannon.shots = 0;
    s.cannon.byId = undefined;
  }
  o.boss = undefined;
  die(world, o, by, kind, dirX, dirZ, false, 'heavy');
}
