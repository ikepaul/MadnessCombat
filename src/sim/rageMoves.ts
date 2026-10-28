// M19 rage fatalities (design/rage.md sections 2-3): Tab with a full bar fires a super picked by
// what you hold: Rampage (fists), Spin shot (a gun), Cut line (a blade), Home run (a club or the
// sign). While it runs the world stands still for everyone but the hero and his victims (World.step
// calls stepRageRun instead of the usual step); the release is the moment the world resumes.
// Timelines are in world seconds on the 30 fps grid; the feel layer adds the slow-mo.
import { aimRig } from '../anim/aim';
import { STANDING } from '../anim/skeleton';
import { isMelee, MELEE } from '../data/melee';
import { TUNING } from '../data/tuning';
import { isWeapon, WEAPONS } from '../data/weapons';
import { project, scaleAt } from '../render/camera';
import { type Actor, alive, createActor } from './actor';
import { die, dropBody, setClip } from './combat';
import type { PlayerCommand } from './command';
import type { HitKind } from './events';
import { dropCooking, lobCooking } from './melee';
import { newRage, type RageKind, type RageRun } from './rage';
import type { World } from './world';

const F = 1 / 30;
const R = TUNING.rage;

/** Per-run working state the timelines need (kept off the snapshot-able RageRun). */
interface Work {
  from: { x: number; z: number };
  /** Beats already fired this run ("strike3", "release"...). */
  fired: Set<string>;
  /** Strike variant per victim (Rampage), screen angle (Spin shot), cut normal (Cut line). */
  variant: Map<number, number>;
  /** Spin shot: the starting screen angle (y up) and turn direction, and the sweep (2 pi, or pi with two guns: the back hand covers the far half). */
  phi0: number;
  dir: 1 | -1;
  sweep: number;
  long: boolean;
}
const work = new WeakMap<RageRun, Work>();

// ---------- starting one ----------

/** The supers by what the hero holds (design/rage.md 3): any gun, else the front-most melee weapon. */
export function rageKindFor(a: Actor): RageKind {
  if (a.hands.some((h) => !!h && isWeapon(h.item))) return 'spinShot';
  const m = a.hands.map((h) => (h && isMelee(h.item) ? MELEE[h.item] : undefined)).find((d) => !!d);
  if (!m) return 'rampage';
  return m.edge === 'blade' && !m.twoHanded ? 'cutLine' : 'homeRun';
}

/** Living regular enemies on screen (design/rage.md 2.3), nearest first, at most `cap`. */
export function rageVictims(world: World, a: Actor, cap: number = R.cap): Actor[] {
  const out = world.actors.filter((o) => {
    if (!o.ai || !alive(o) || (o.kind !== 'grunt' && o.kind !== 'zombie') || o.entering || o.invulnerable || o.protected) return false;
    if (o.koed || o.surrendered || o.takenBy !== undefined || o.hover !== undefined || o.state === 'rising' || o.state === 'dead') return false;
    if (o.variant === 'riot' || o.variant === 'target' || o.variant === 'vending' || o.variant === 'vip') return false;
    const m = R.screenMargin * scaleAt(o.pos.z), [sx] = project(o.pos.x, o.pos.y + 0.5, o.pos.z);
    return sx >= -m && sx <= 1920 + m;
  });
  return out.sort((p, q) => Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) - Math.hypot(q.pos.x - a.pos.x, q.pos.z - a.pos.z)).slice(0, cap);
}

/** Tab (design/rage.md 2.2): fire if the bar is full and the hero is free to. True if the press was used. */
export function tryRage(world: World, a: Actor, cmd: PlayerCommand): boolean {
  if (!cmd.rage || a.playerIndex === undefined || world.rage || world.puppet) return false;
  if (!a.rage || a.rage.value < 1) return false;
  if (!alive(a) || (a.state !== 'free' && a.state !== 'attack') || a.carried || a.traversing || world.inputLocked || world.lastStand) return false;
  if (a.holding?.kind === 'actor' && world.actorById(a.holding.id)?.carried) return false;
  const victims = rageVictims(world, a);
  if (!victims.length) { world.events.emit('rageFizzle', { actorId: a.id, ...a.pos }); return true; }
  startRage(world, a, victims);
  return true;
}

/** Start a solo rage fatality on these victims (also used by labs and tests). */
export function startRage(world: World, a: Actor, victims: Actor[]): void {
  const kind = rageKindFor(a);
  // a carried body drops, a cooked grenade goes toward the cursor (it hangs in the air with the world)
  if (a.holding?.kind === 'actor') { const o = world.actorById(a.holding.id); a.holding = undefined; if (o) { o.grabbedBy = undefined; dropBody(o); } }
  if (a.cook !== undefined) { if (!lobCooking(world, a)) dropCooking(world, a); }
  (a.rage ??= newRage()).value = 0;
  a.attack = undefined;
  a.state = 'free';
  a.body.vel = { x: 0, y: 0, z: 0 };
  // nearest-neighbour order for the dashes; by angle for the spin
  const order: Actor[] = [];
  let at = { x: a.pos.x, z: a.pos.z };
  const left = [...victims];
  while (left.length) {
    left.sort((p, q) => Math.hypot(p.pos.x - at.x, p.pos.z - at.z) - Math.hypot(q.pos.x - at.x, q.pos.z - at.z));
    const o = left.shift()!;
    order.push(o);
    at = { x: o.pos.x, z: o.pos.z };
  }
  const run: RageRun = { kind, heroes: [a.id], victims: order.map((o) => o.id), pending: [], phase: 'ignite', t: 0 };
  const gunHands = a.hands.filter((h) => !!h && isWeapon(h.item));
  const long = gunHands.some((h) => !WEAPONS[h!.item as keyof typeof WEAPONS].oneHanded);
  const w: Work = { from: { x: a.pos.x, z: a.pos.z }, fired: new Set(), variant: new Map(), phi0: a.facing > 0 ? 0 : Math.PI, dir: a.facing > 0 ? 1 : -1, sweep: gunHands.length > 1 ? Math.PI : 2 * Math.PI, long };
  // Rampage: five strikes, shuffled so neighbours always differ (seeded by the hero, not the sim rng)
  order.forEach((o, i) => w.variant.set(o.id, (i + a.id) % 5));
  if (kind === 'spinShot') {
    const [hx, hy] = project(a.pos.x, a.pos.y + 0.6, a.pos.z);
    for (const o of order) { const [ox, oy] = project(o.pos.x, o.pos.y + 0.79, o.pos.z); w.variant.set(o.id, Math.atan2(-(oy - hy), ox - hx)); }
  }
  if (kind === 'cutLine') order.forEach((o, i) => w.variant.set(o.id, i % 2 ? 1 : -1));
  work.set(run, w);
  world.rage = run;
  for (const o of order) {
    if (o.grabbedBy !== undefined) { const h = world.actorById(o.grabbedBy); if (h) h.holding = undefined; o.grabbedBy = undefined; }
    o.rageMarked = true;
    o.attack = undefined;
    o.state = 'stun';
    o.stateT = 0;
    o.stunFor = Infinity;
    o.flight = undefined;
    o.pos.y = o.pose.groundY;
    o.pose.telegraph = undefined;
  }
  setClip(a, 'idle');
  world.events.emit('rageStart', { kind, heroes: [a.id], victims: run.victims });
  world.events.emit('rageBeat', { kind, beat: 'ignite', actorId: a.id, ...a.pos });
}

// ---------- running it ----------

/** One tick of the running rage fatality (World.step calls it instead of stepping the world). */
export function stepRageRun(world: World, dt: number): void {
  const run = world.rage!, w = work.get(run)!, a = world.actorById(run.heroes[0]);
  run.t += dt;
  if (!a) { endRage(world); return; }
  a.pose.clipT += dt;
  const once = (key: string) => (w.fired.has(key) ? false : (w.fired.add(key), true));
  const victims = run.victims.map((id) => world.actorById(id)).filter((o): o is Actor => !!o);
  switch (run.kind) {
    case 'rampage': return rampage(world, run, w, a, victims, once);
    case 'homeRun': return homeRun(world, run, w, a, victims, once);
    case 'cutLine': return cutLine(world, run, w, a, victims, once);
    case 'spinShot': return spinShot(world, run, w, a, victims, once);
  }
}

const IGNITE = 0.3;

/** Slide the hero from one spot to another over [t0, t0 + len] (an ink dash; the ghosts are VFX). */
function dash(a: Actor, from: { x: number; z: number }, to: { x: number; z: number }, t: number, t0: number, len: number): void {
  const u = Math.max(0, Math.min(1, (t - t0) / len));
  a.pos.x = from.x + (to.x - from.x) * u;
  a.pos.z = from.z + (to.z - from.z) * u;
}

/** Where the hero stands to strike `o` (coming from `from`), and which way he faces. */
function spotFor(o: Actor, from: { x: number }, gap: number): { x: number; z: number; side: 1 | -1 } {
  const side = (Math.sign(o.pos.x - from.x) || 1) as 1 | -1;
  return { x: o.pos.x - side * gap, z: o.pos.z, side };
}

// Rampage: a dash and a strike per victim (5 variants); each freezes mid-reaction; all die at the release.
const STRIKE = 9 * F;
const RAMPAGE_CLIP = ['uppercut', 'punchHeavy', 'punchHeavy', 'kick', 'punchLight'];

function rampage(world: World, run: RageRun, w: Work, a: Actor, vs: Actor[], once: (k: string) => boolean): void {
  const t = run.t;
  if (t < IGNITE) return;
  run.phase = 'run';
  const i = Math.min(vs.length - 1, Math.floor((t - IGNITE) / STRIKE));
  const t0 = IGNITE + i * STRIKE;
  if (t < IGNITE + vs.length * STRIKE) {
    const o = vs[i], prev = i > 0 ? spotFor(vs[i - 1], i > 1 ? vs[i - 2].pos : w.from, 0.42) : w.from;
    const s = spotFor(o, prev, 0.42);
    if (once(`dash${i}`)) world.events.emit('rageBeat', { kind: run.kind, beat: 'dash', actorId: a.id, targetId: o.id, i, x: prev.x, y: a.pos.y, z: prev.z });
    dash(a, prev, s, t, t0, 3 * F);
    a.facing = s.side;
    const v = w.variant.get(o.id) ?? 0;
    if (t >= t0 + 3 * F && once(`wind${i}`)) setClip(a, RAMPAGE_CLIP[v]);
    if (t >= t0 + 5 * F && once(`strike${i}`)) strike(world, run, a, o, v, s.side);
    return;
  }
  finale(world, run, a, t, IGNITE + vs.length * STRIKE, once, (o) => {
    const v = w.variant.get(o.id) ?? 0, dir = Math.sign(o.pos.x - a.pos.x) || 1;
    // uppercut / backfist: the head comes off; haymaker: flung; hammer: crumples; knee: drops
    const decap = o.kind === 'grunt' && (v === 0 || v === 4);
    const kind: HitKind = v === 1 ? 'heavy' : v === 2 ? 'smash' : v === 3 ? 'bullet' : 'uppercut';
    kill(world, a, o, kind, dir, decap, 'fists');
    if (v === 0) { const head = world.items.filter((it) => it.kind === 'head').pop(); if (head) { head.vel = { x: 0, y: 4.5, z: 0 }; head.spin = 16; } }
  });
}

/** A strike that freezes the victim in a reaction pose (variant 0-4), with the hit's star and sound. */
function strike(world: World, run: RageRun, a: Actor, o: Actor, variant: number, side: 1 | -1): void {
  run.pending.push(o.id);
  o.facing = (-side) as 1 | -1;
  setClip(o, 'stun');
  o.pose.impact = 0.1;
  // the pending poses (design/rage.md 3.1): arched, bent back, folded, doubled, twisted
  const root = [{ r: 0.25 }, { r: 0.45 }, { sy: 0.82 }, { r: -0.4 }, { r: 0.15 }][variant % 5];
  o.pose.root = { ...STANDING, ...root };
  o.pose.lean = variant === 3 ? 0.3 : -0.3;
  o.pose.react = { part: variant === 4 ? 'head' : 'body', age: 0, v: 0.5 };
  const at = { x: o.pos.x - side * 0.15, y: o.pos.y + 0.7, z: o.pos.z };
  world.events.emit('punch', { actorId: a.id, x: at.x, y: at.y, z: at.z, kind: variant === 0 ? 'uppercut' : 'heavy', facing: side });
  world.events.emit('hit', { actorId: o.id, attackerId: a.id, kind: 'heavy', part: variant === 4 ? 'head' : 'body', damage: 0, killed: false, dirX: side, dirZ: 0, combo: true, chain: run.pending.length, ...at });
  world.events.emit('rageBeat', { kind: run.kind, beat: 'strike', actorId: o.id, targetId: o.id, i: run.pending.length, variant, ...at });
}

/** The finale's pose and silence, then the release: every pending victim dies on one tick and the world resumes. */
function finale(world: World, run: RageRun, a: Actor, t: number, tF: number, once: (k: string) => boolean, deathOf: (o: Actor) => void): void {
  run.phase = 'finale';
  if (once('finale')) { setClip(a, 'idle'); world.events.emit('rageBeat', { kind: run.kind, beat: 'finale', actorId: a.id, ...a.pos }); }
  if (t < tF + 6 * F) return;
  run.phase = 'release';
  world.events.emit('rageBeat', { kind: run.kind, beat: 'release', actorId: a.id, ...a.pos });
  for (const id of run.pending) { const o = world.actorById(id); if (o && alive(o)) deathOf(o); }
  endRage(world);
}

/** A rage kill: dies like a normal kill (counter, healing, gore), typed and flagged as a rage kill. */
function kill(world: World, a: Actor, o: Actor, kind: HitKind, dirX: number, decap: boolean, type: import('./rage').KillType): void {
  o.rageMarked = undefined;
  o.state = 'stun';
  o.pose.root = { ...STANDING };
  die(world, o, a, kind, dirX, 0, decap, kind, { type });
}

// Home run: dash, wind, contact per victim; at the release they all launch as thrown bodies.
const SWING = 8 * F;

function homeRun(world: World, run: RageRun, w: Work, a: Actor, vs: Actor[], once: (k: string) => boolean): void {
  const t = run.t;
  if (t < IGNITE) return;
  run.phase = 'run';
  const end = IGNITE + vs.length * SWING;
  if (t < end) {
    const i = Math.min(vs.length - 1, Math.floor((t - IGNITE) / SWING)), t0 = IGNITE + i * SWING;
    const o = vs[i], prev = i > 0 ? spotFor(vs[i - 1], i > 1 ? vs[i - 2].pos : w.from, 0.6) : w.from;
    const s = spotFor(o, prev, 0.6);
    if (once(`dash${i}`)) world.events.emit('rageBeat', { kind: run.kind, beat: 'dash', actorId: a.id, targetId: o.id, i, x: prev.x, y: a.pos.y, z: prev.z });
    dash(a, prev, s, t, t0, 3 * F);
    a.facing = s.side;
    if (t >= t0 + 3 * F && once(`wind${i}`)) setClip(a, a.hands[0] && isMelee(a.hands[0].item) && MELEE[a.hands[0].item].twoHanded ? 'swingLong' : 'swing');
    if (t >= t0 + 5 * F && once(`strike${i}`)) strike(world, run, a, o, 1, s.side);
    return;
  }
  finale(world, run, a, t, end, once, (o) => {
    const dir = Math.sign(o.pos.x - a.pos.x) || 1;
    kill(world, a, o, 'smash', dir, false, 'blunt');
    // launched toward the nearest wall; the world resumes this tick, so they bowl over whoever they cross
    const toward = Math.abs(world.room.halfWidth - o.pos.x) < Math.abs(-world.room.halfWidth - o.pos.x) ? 1 : -1;
    o.corpse!.phase = 'tumble';
    o.flight = { vx: toward * 12, vz: 0, vy: 2, r: 0, r0: 0, rTo: Math.PI / 2, spin: toward * 18, phase: 'air', t: 0, airtime: 0.5, thrownBy: a.id, hit: [] };
  });
}

// Cut line: the hero appears past each victim in turn (a white slash line hangs in the air); at
// the release every victim splits along his cut (stage 1: the cut is at the neck, heads only).
const PASS = 4 * F;

function cutLine(world: World, run: RageRun, w: Work, a: Actor, vs: Actor[], once: (k: string) => boolean): void {
  const t = run.t;
  if (t < IGNITE) return;
  run.phase = 'run';
  const end = IGNITE + vs.length * PASS;
  if (t < end) {
    const i = Math.min(vs.length - 1, Math.floor((t - IGNITE) / PASS));
    const o = vs[i];
    if (once(`cut${i}`)) {
      const from = { x: a.pos.x, z: a.pos.z };
      const dir = (Math.sign(o.pos.x - from.x) || a.facing) as 1 | -1;
      a.pos.x = Math.max(-world.room.halfWidth + 0.3, Math.min(world.room.halfWidth - 0.3, o.pos.x + dir * 0.45));
      a.pos.z = o.pos.z;
      a.facing = dir;
      setClip(a, 'swing');
      run.pending.push(o.id);
      world.events.emit('rageBeat', { kind: run.kind, beat: 'cut', actorId: a.id, targetId: o.id, i, x: from.x, y: a.pos.y, z: from.z });
    }
    return;
  }
  finale(world, run, a, t, end + 4 * F, once, (o) => {
    const dir = Math.sign(o.pos.x - a.pos.x) || 1;
    if (!world.blood) { kill(world, a, o, 'slash', dir, o.kind === 'grunt', 'blade'); return; }
    kill(world, a, o, 'slash', dir, false, 'blade');
    splitDiagonal(world, o, w.variant.get(o.id) ?? 1);
  });
}

/** Split a fresh corpse along a diagonal cut: the upper part slides off and falls, the lower crumples. */
function splitDiagonal(world: World, o: Actor, slope: number): void {
  const nx = 0.5 * slope, ny = -0.866, d = ny * -0.55;
  const top = createActor(o.kind, o.pos.x, o.pos.z, o.facing, { dead: true });
  top.pose = structuredClone(o.pose);
  top.variant = o.variant;
  world.actors.push(top);
  const half = (c: Actor, keep: 1 | -1, vx: number, vy: number) => {
    c.pose.cut = { nx, ny, d, keep };
    c.pose.death = undefined;
    c.pose.root = { ...STANDING };
    c.corpse = { phase: 'tumble', t: 0, raisable: false, gibbed: false, slumped: false };
    c.flight = { vx, vz: 0, vy, r: 0, r0: 0, rTo: Math.sign(vx || 1) * c.facing > 0 ? -Math.PI / 2 : Math.PI / 2, spin: 0, phase: 'air', t: 0, airtime: 0.35, hit: [] };
  };
  half(top, 1, slope * o.facing * 1.2, 1.2);
  half(o, -1, 0, 0.2);
}

// Spin shot: a hop and a full turn; each victim is shot in the head as the barrel passes and dies at once.
function spinShot(world: World, run: RageRun, w: Work, a: Actor, vs: Actor[], once: (k: string) => boolean): void {
  const t = run.t, SPIN = w.long ? 1.1 : 0.9, LAND = 0.35;
  const hop = w.long ? 0 : 0.35;
  if (t < IGNITE) {
    a.pos.y = a.pose.groundY + hop * Math.max(0, (t - 0.2) / 0.1);
    a.pose.aim = project(a.pos.x + a.facing * 0.5, a.pos.y + 1.5, a.pos.z);
    return;
  }
  run.phase = 'run';
  if (t < IGNITE + SPIN) {
    // the barrel turns from the facing side, upward first (screen angles: y up)
    const u = (t - IGNITE) / SPIN, phi = w.phi0 + w.dir * w.sweep * u;
    a.facing = Math.cos(phi) >= 0 ? 1 : -1;
    const [hx, hy] = project(a.pos.x, a.pos.y + 0.6, a.pos.z);
    a.pose.aim = [hx + Math.cos(phi) * 300, hy - Math.sin(phi) * 300];
    a.pose.aimB = [hx - Math.cos(phi) * 300, hy + Math.sin(phi) * 300];
    vs.forEach((o, i) => {
      if (!alive(o)) return;
      const psi = w.variant.get(o.id) ?? 0;
      let diff = ((psi - w.phi0) * w.dir) % (2 * Math.PI);
      if (diff < 0) diff += 2 * Math.PI;
      const back = w.sweep < 2 * Math.PI && diff >= Math.PI;
      const due = (back ? diff - Math.PI : diff) / w.sweep;
      if (u >= due && once(`shot${i}`)) shoot(world, run, a, o, back ? 1 : 0, i);
    });
    return;
  }
  if (t < IGNITE + SPIN + LAND) {
    a.pos.y = a.pose.groundY + hop * Math.max(0, 1 - (t - IGNITE - SPIN) / 0.15);
    if (once('land')) world.events.emit('rageBeat', { kind: run.kind, beat: 'land', actorId: a.id, ...a.pos });
    return;
  }
  // the reward: every gun in hand is reloaded
  for (const h of a.hands) if (h && isWeapon(h.item)) { h.ammo = WEAPONS[h.item].mag; h.clicked = false; h.reload = 0; }
  a.pos.y = a.pose.groundY;
  endRage(world);
}

/** One spin-shot bullet: the gun's flash and tracer to his head, and he dies (head off / burst). */
function shoot(world: World, run: RageRun, a: Actor, o: Actor, back: 0 | 1, i: number): void {
  const idx = (a.hands[back] && isWeapon(a.hands[back]!.item) ? back : a.hands[0] && isWeapon(a.hands[0].item) ? 0 : 1) as 0 | 1;
  const h = a.hands[idx], def = h && isWeapon(h.item) ? WEAPONS[h.item] : WEAPONS.pistol;
  const head = project(o.pos.x, o.pos.y + 0.79, o.pos.z);
  const foot = project(a.pos.x, a.pos.y, a.pos.z), s = scaleAt(a.pos.z);
  const rig = aimRig(foot, s, a.facing, idx, head, def);
  if (idx === 0) a.pose.aim = head; else a.pose.aimB = head;
  world.events.emit('shot', { actorId: a.id, hand: idx, weapon: def.id, muzzle: rig.muzzle, eject: rig.eject, angle: Math.atan2(head[1] - rig.muzzle[1], head[0] - rig.muzzle[0]), rays: [{ end: head, surface: 'flesh' }], suppressed: def.suppressed, x: a.pos.x, y: a.pos.y, z: a.pos.z });
  world.events.emit('rageBeat', { kind: run.kind, beat: 'shot', actorId: a.id, targetId: o.id, i, x: o.pos.x, y: o.pos.y + 0.79, z: o.pos.z });
  kill(world, a, o, 'bullet', Math.sign(o.pos.x - a.pos.x) || 1, o.kind === 'grunt', 'gun');
}

/** The world resumes: bystanders reel for a moment, the hero is back in control. */
export function endRage(world: World): void {
  const run = world.rage;
  if (!run) return;
  world.rage = undefined;
  for (const id of run.victims) { const o = world.actorById(id); if (o && alive(o)) { o.rageMarked = undefined; o.stunFor = 0.3; o.pose.root = { ...STANDING }; } }
  for (const o of world.actors) {
    if (!o.ai || !alive(o) || run.victims.includes(o.id) || (o.state !== 'free' && o.state !== 'attack')) continue;
    o.attack = undefined;
    o.state = 'stun';
    o.stateT = 0;
    o.stunFor = R.aftershock;
    o.pose.telegraph = undefined;
    if (o.ai.aimT !== undefined) o.ai.aimT = undefined;
  }
  for (const id of run.heroes) {
    const a = world.actorById(id);
    if (!a) continue;
    a.state = 'free';
    a.stateT = 0;
    a.body.state = 'ground';
    a.pos.y = a.pose.groundY;
    setClip(a, 'idle');
  }
  world.events.emit('rageEnd', { kind: run.kind });
}
