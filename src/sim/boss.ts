// Stage-1 boss, the hovering necromancer (PLAN.md M8, research/mechanics/boss-halo, our own
// design: design/art-direction.md). He never walks or falls: this state machine replaces the
// movement and combat steps while he lives. This part: the entrance (floats down from above the
// frame), the lightning raise (hand up + crackle, then a bolt into an intact corpse) and the ward
// (our shield: blocks rays from his front for ~1 s, then a window). Only head hits with the ward
// down hurt him. The other stage-1 moves (lightning strike, dash-grab, sweep, cannon) come next.
import { TUNING } from '../data/tuning';
import { isWeapon } from '../data/weapons';
import { project, type ScreenPoint, scaleAt } from '../render/camera';
import { type Actor, alive, createActor } from './actor';
import { die } from './combat';
import type { HitKind } from './events';
import { canRaise, raiseCorpse } from './zombies';
import type { World } from './world';

const B = TUNING.boss;

export interface BossState {
  phase: 'enter' | 'fight';
  /** Seconds in the phase. */
  t: number;
  /** Raise in progress: the corpse he's pointing at and the telegraph time so far. */
  cast?: { targetId: number; t: number; bolted: boolean };
  /** Seconds until the next raise may start. */
  raiseIn: number;
  /** Seconds the ward stays up (> 0 = up), then the window before it can rise again. */
  ward: number;
  window: number;
  /** Where he hovers (the descent ends here). */
  home: { x: number; z: number };
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
  a.boss = { phase: 'enter', t: 0, raiseIn: B.firstRaise, ward: 0, window: 0, home: { x, z } };
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
  if (target && !s.cast) a.facing = target.pos.x >= a.pos.x ? 1 : -1;

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
  stepWard(world, a, s, dt);
  stepRaise(world, a, s, dt);
}

/** The ward rises when a gun on his front side threatens him and the window is over (not mid-cast). */
function stepWard(world: World, a: Actor, s: BossState, dt: number): void {
  if (s.ward > 0) {
    s.ward -= dt;
    if (s.ward <= 0) { s.ward = 0; s.window = B.wardWindow; world.events.emit('ward', { actorId: a.id, up: false, ...a.pos }); }
  } else if (s.window > 0) s.window = Math.max(0, s.window - dt);
  else if (!s.cast && threatened(world, a)) {
    s.ward = B.wardUp;
    world.events.emit('ward', { actorId: a.id, up: true, ...a.pos });
  }
  const k = dt / B.wardFade;
  a.pose.ward = s.ward > 0 ? Math.min(1, (a.pose.ward ?? 0) + k) : Math.max(0, (a.pose.ward ?? 0) - k);
}

/** Lightning raise: telegraph (hand up, crackle), the bolt, the corpse rises (src/sim/zombies.ts). */
function stepRaise(world: World, a: Actor, s: BossState, dt: number): void {
  const c = s.cast;
  if (!c) {
    a.pose.cast = Math.max(0, (a.pose.cast ?? 0) - dt / 0.2);
    s.raiseIn -= dt;
    if (s.raiseIn > 0 || s.ward > 0) return;
    const zombies = world.actors.filter((o) => o.kind === 'zombie' && alive(o)).length;
    const corpse = zombies < B.maxZombies ? raiseTarget(world, a) : undefined;
    if (!corpse) { s.raiseIn = 0.5; return; } // nothing to raise yet: look again shortly
    s.cast = { targetId: corpse.id, t: 0, bolted: false };
    a.facing = corpse.pos.x >= a.pos.x ? 1 : -1;
    world.events.emit('bossCast', { actorId: a.id, targetId: corpse.id, ...a.pos });
    return;
  }
  c.t += dt;
  a.pose.cast = Math.min(1, c.t / B.castTime);
  const o = world.actorById(c.targetId);
  if (!c.bolted && c.t >= B.castTime) {
    c.bolted = true;
    // the corpse may have been gibbed or picked up meanwhile: the bolt still strikes, nothing rises
    if (o) {
      const [hx, hy] = handPoint(a);
      world.events.emit('lightning', { actorId: a.id, targetId: o.id, from: { x: hx, y: hy, z: a.pos.z }, to: { x: o.pos.x, y: o.pos.y + 0.15, z: o.pos.z } });
      raiseCorpse(world, o);
    }
  }
  if (c.t >= B.castTime + B.boltTime) {
    s.cast = undefined;
    s.raiseIn = B.raiseEvery;
  }
}

/** The raised casting hand, world coordinates (the bolt leaves from here; style frame pose). */
export function handPoint(a: Actor): [number, number] {
  return [a.pos.x + a.facing * 0.15 * B.scale, a.pos.y + 1.2 * B.scale];
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

/** The ward stops a ray only from his front side (the shooter stands where he faces). */
export function wardFaces(a: Actor, shooterX: number): boolean {
  return Math.sign(shooterX - a.pos.x) === a.facing;
}

/**
 * Hits on the boss (applyHit hands them here). Only a player's bullet or thrown gun to the head
 * counts (the ward stops those from his front while it's up). Everything else just flashes him. Dies at 0.
 */
export function bossHit(world: World, by: Actor | undefined, o: Actor, kind: HitKind, part: 'head' | 'body', dirX: number, dirZ: number, at: { x: number; y: number; z: number }): void {
  const s = o.boss;
  // the ward has already stopped what came at his front (src/sim/hitscan.ts): whatever reached his head counts
  const counts = !!s && s.phase === 'fight' && part === 'head' && (kind === 'bullet' || kind === 'gun') && by?.playerIndex !== undefined;
  const damage = counts ? 1 : 0;
  o.hp = Math.max(0, o.hp - damage);
  o.pose.impact = TUNING.hit.impact;
  o.pose.lean = -0.15 * Math.sign(dirX || -o.facing) * o.facing;
  const killed = o.hp <= 0;
  world.events.emit('hit', { actorId: o.id, attackerId: by?.id ?? 0, kind, part, damage, killed, dirX, dirZ, combo: false, chain: 0, ...at });
  if (!killed) return;
  o.pose.ward = 0;
  o.pose.cast = 0;
  o.boss = undefined;
  die(world, o, by, kind, dirX, dirZ, false, 'heavy');
}
