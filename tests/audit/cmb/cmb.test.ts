// CMB audit probes (design/audit/cmb.md): latency per verb, input buffering, time to kill per
// verb x enemy, verb x target-state matrix, combo reliability, depth fairness, style comparison.
// Opt-in: `AUDIT=1 npx vitest run tests/audit/cmb`. Prints tables; writes nothing.
import { describe, it } from 'vitest';
import { TEST_ROOM } from '../../../src/data/rooms/testRoom';
import { STAGE1 } from '../../../src/data/stages/stage1';
import { STAGE2 } from '../../../src/data/stages/stage2';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { TUNING } from '../../../src/data/tuning';
import type { WeaponId } from '../../../src/data/weapons';
import type { MeleeId } from '../../../src/data/melee';
import { project } from '../../../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../../../src/sim/actor';
import { newAiState } from '../../../src/sim/ai';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import type { RoomDef } from '../../../src/sim/room';
import { stageRunner, type StageDef } from '../../../src/sim/stage';
import { spawnEnemy, WaveDirector } from '../../../src/sim/waves';
import { World } from '../../../src/sim/world';

const Z = 9.2;
const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
type Cmd = Partial<PlayerCommand>;

function setup(x = 0, room: RoomDef = EMPTY) {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}
function dummy(world: World, x: number, o: { kind?: 'grunt' | 'zombie'; variant?: Actor['variant']; hp?: number; held?: string; z?: number } = {}): Actor {
  const g = createActor(o.kind ?? 'grunt', x, o.z ?? Z, -1, o.held ? { held: o.held as never } : {});
  g.variant = o.variant;
  if (o.hp !== undefined) g.hp = g.maxHp = o.hp;
  world.actors.push(g);
  return g;
}
const step = (world: World, cmd: Cmd = {}) => { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); };
const headOf = (a: Actor) => project(a.pos.x, a.pos.y + 0.79, a.pos.z);
const chestOf = (a: Actor) => project(a.pos.x, a.pos.y + 0.45, a.pos.z);
const ahead = (h: Actor, dx = 1, y = 0.7) => project(h.pos.x + dx, y, h.pos.z);
const ready = (h: Actor) => h.state === 'free' && h.body.state === 'ground' && h.cook === undefined && !h.attack;
const ms = (t: number) => Math.round((t * 1000) / 60);
const evRec = (world: World) => {
  const log: { t: number; type: string; p: Record<string, unknown> }[] = [];
  world.events.onAny((type, p) => { if (type !== 'tick' && type !== 'footstep') log.push({ t: world.tick, type: String(type), p: p as Record<string, unknown> }); });
  return log;
};

// ---------------------------------------------------------------- latency
interface Verb { name: string; prep?: (w: World, h: Actor) => void; cmd: (t: number, w: World, h: Actor) => Cmd; sig: string; until?: number }
const VERBS: Verb[] = [
  { name: 'walk start', cmd: () => ({ moveX: 1 }), sig: 'footstep' },
  { name: 'light', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ attack: t === 0 ? 'light' : null, aim: ahead(h) }), sig: 'hit' },
  { name: 'heavy', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ attack: t === 0 ? 'heavy' : null, aim: ahead(h) }), sig: 'hit' },
  { name: 'uppercut', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ attack: t === 0 ? 'heavy' : null, aim: ahead(h, 0.3, 2.5) }), sig: 'hit' },
  { name: 'jump (to land)', cmd: (t) => ({ jump: t === 0 }), sig: 'land' },
  { name: 'dive moving', cmd: (t) => ({ moveX: t < 30 ? 1 : 0, dive: t === 0 }), sig: 'dive' },
  { name: 'prone + get up', cmd: (t) => ({ dive: t === 0 || t === 20 }), sig: 'standUp' },
  { name: 'sweep (dive into)', prep: (w) => dummy(w, 0.7, { hp: 99 }), cmd: (t) => ({ moveX: t < 20 ? 1 : 0, dive: t === 0 }), sig: 'hit' },
  { name: 'flying kick', prep: (w) => dummy(w, 1.0, { hp: 99 }), cmd: (t) => ({ jump: t === 0, dive: t === 6 }), sig: 'hit' },
  { name: 'grab', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ grab: t === 0, aim: ahead(h) }), sig: 'grab' },
  { name: 'grab -> throw', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ grab: t === 0 || t === 20, aim: ahead(h) }), sig: 'throw' },
  { name: 'pistol fire', prep: (_w, h) => { h.hands[0] = newHand('pistol'); }, cmd: (t, _w, h) => ({ press: [t === 0, false], aim: ahead(h, 2) }), sig: 'shot' },
  { name: 'reload pistol', prep: (_w, h) => { h.hands[0] = newHand('pistol', 0, 1); }, cmd: (t, _w, h) => ({ reload: t === 0, aim: ahead(h, 2) }), sig: 'reload', until: 80 },
  { name: 'Q throw gun', prep: (_w, h) => { h.hands[0] = newHand('pistol'); }, cmd: (t, _w, h) => ({ throwGun: t === 0, aim: ahead(h, 2) }), sig: 'throw' },
  { name: 'knife LMB', prep: (w, h) => { h.hands[0] = newHand('knife'); dummy(w, 0.5, { hp: 99 }); }, cmd: (t, _w, h) => ({ attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(h) }), sig: 'hit' },
  { name: 'bat LMB', prep: (w, h) => { h.hands[0] = newHand('bat'); dummy(w, 0.7, { hp: 99 }); }, cmd: (t, _w, h) => ({ attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(h) }), sig: 'hit' },
  { name: 'sign LMB sweep', prep: (w, h) => { h.hands[0] = newHand('sign'); dummy(w, 1.0, { hp: 99 }); }, cmd: (t, _w, h) => ({ attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(h) }), sig: 'hit' },
  { name: 'sign RMB thrust', prep: (w, h) => { h.hands[0] = newHand('sign'); dummy(w, 1.0, { hp: 99 }); }, cmd: (t, _w, h) => ({ attack: t === 0 ? 'heavy' : null, press: [false, t === 0], aim: ahead(h) }), sig: 'hit' },
  { name: 'grenade cook 0.5s+lob', prep: (_w, h) => { h.grenades = 1; }, cmd: (t, _w, h) => ({ grenade: t < 30, aim: ahead(h, 3, 0) }), sig: 'throw', until: 120 },
  { name: 'E takedown (unaware)', prep: (w) => { const g = dummy(w, 0.45, { hp: 4 }); g.facing = 1; g.ai = newAiState(w); g.ai.aware = false; }, cmd: (t, _w, h) => ({ pickup: t === 0, aim: ahead(h) }), sig: 'takedown', until: 150 },
];

function latency(v: Verb) {
  const { world, hero } = setup();
  v.prep?.(world, hero);
  const log = evRec(world);
  const s0 = JSON.stringify([hero.state, hero.body.state, hero.pose.clip]);
  let first = -1, sig = -1, back = -1;
  const until = v.until ?? 90;
  for (let t = 0; t < until; t++) {
    step(world, v.cmd(t, world, hero));
    const s = JSON.stringify([hero.state, hero.body.state, hero.pose.clip]);
    const own = log.some((e) => e.t === world.tick && (e.p.actorId === hero.id || e.p.attackerId === hero.id));
    if (first < 0 && (s !== s0 || own || Math.abs(hero.pos.x) > 1e-6)) first = t + 1;
    if (sig < 0 && log.some((e) => e.type === v.sig && e.t === world.tick)) sig = t + 1;
    if (first > 0 && back < 0 && t > 0 && ready(hero) && sig > 0) back = t + 1;
  }
  return { first, sig, back, events: [...new Set(log.filter((e) => e.p.actorId === hero.id || e.p.attackerId === hero.id).map((e) => `${e.type}@${e.t}`))].slice(0, 6).join(' ') };
}

// ---------------------------------------------------------------- buffering
interface First { name: string; prep?: (w: World, h: Actor) => void; cmd: (t: number, w: World, h: Actor) => Cmd }
const FIRSTS: First[] = [
  { name: 'light', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ attack: t === 0 ? 'light' : null, aim: ahead(h) }) },
  { name: 'heavy', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ attack: t === 0 ? 'heavy' : null, aim: ahead(h) }) },
  { name: 'knife swing', prep: (w, h) => { h.hands[1] = newHand('knife'); dummy(w, 0.5, { hp: 99 }); }, cmd: (t, _w, h) => ({ attack: t === 0 ? 'heavy' : null, press: [false, t === 0], aim: ahead(h) }) },
  { name: 'jump (landing)', cmd: (t) => ({ jump: t === 0 }) },
  { name: 'prone get-up', cmd: (t) => ({ dive: t === 0 || t === 12 }) },
  { name: 'hero flinch', prep: (w, h) => { const g = dummy(w, 0.5, { hp: 99 }); w.hitActor(g, h, 'light', -1, 0, { x: h.pos.x, y: 0.8, z: Z }); h.hp = 3; } , cmd: () => ({}) },
  { name: 'throw body', prep: (w) => dummy(w, 0.5, { hp: 99 }), cmd: (t, _w, h) => ({ grab: t === 0 || t === 12, aim: ahead(h) }) },
];
type Second = { name: string; cmd: (h: Actor) => Cmd; sig: (log: ReturnType<typeof evRec>, h: Actor) => number };
const count = (type: string, filt: (p: Record<string, unknown>, h: Actor) => boolean = () => true) =>
  (log: ReturnType<typeof evRec>, h: Actor) => log.filter((e) => e.type === type && (e.p.actorId === h.id) && filt(e.p, h)).length;
const SECONDS: Second[] = [
  { name: 'light', cmd: (h) => ({ attack: 'light', aim: ahead(h) }), sig: count('punch', (p) => p.kind === 'light' || p.kind === 'finisher') },
  { name: 'heavy', cmd: (h) => ({ attack: 'heavy', aim: ahead(h) }), sig: count('punch', (p) => p.kind === 'heavy' || p.kind === 'finisher') },
  { name: 'jump', cmd: () => ({ jump: true }), sig: count('jump') },
  { name: 'dive', cmd: () => ({ dive: true, moveX: 1 }), sig: count('dive') },
  { name: 'grab', cmd: (h) => ({ grab: true, aim: ahead(h) }), sig: (log, h) => log.filter((e) => (e.type === 'grab' || e.type === 'throw') && e.p.actorId === h.id).length },
];
function firstRun(f: First, extra?: { at: number; s: Second }) {
  const { world, hero } = setup();
  f.prep?.(world, hero);
  const log = evRec(world);
  let R = -1;
  for (let t = 0; t < 120; t++) {
    let c = f.cmd(t, world, hero);
    if (extra && t === extra.at) c = { ...c, ...extra.s.cmd(hero) };
    step(world, c);
    if (R < 0 && t > 0 && ready(hero) && hero.body.state === 'ground' && !hero.holding) R = t + 1;
    if (R < 0 && f.name === 'throw body' && t > 12 && ready(hero)) R = t + 1;
  }
  return { R, log, hero };
}
function bufferRow(f: First, s: Second) {
  const base = firstRun(f);
  const baseN = s.sig(base.log, base.hero);
  const cells: string[] = [];
  for (const off of [-12, -6, -3, -1, 0]) {
    const at = base.R - 1 + off; // tick index t at which the press is applied (R is ticks, 1-based)
    if (at < 1) { cells.push('n/a'); continue; }
    const r = firstRun(f, { at, s });
    cells.push(s.sig(r.log, r.hero) > baseN ? 'ok' : 'DROP');
  }
  return { ready: base.R, cells };
}

// ---------------------------------------------------------------- time to kill
type Strat = { name: string; give?: (h: Actor) => void; range: number; cmd: (t: number, h: Actor, o: Actor) => Cmd };
const melee = (name: string, item: MeleeId | null, kind: 'light' | 'heavy' | 'smart'): Strat => ({
  name, range: item === 'sign' ? 1.0 : 0.5, give: (h) => { if (item) h.hands[0] = newHand(item); },
  cmd: (t, h, o) => {
    const dx = o.pos.x - h.pos.x;
    const k = kind === 'smart' ? (o.state === 'stun' ? 'heavy' : 'light') : kind;
    const c: Cmd = { aim: project(o.pos.x, 0.7, o.pos.z), moveX: Math.abs(dx) > (item === 'sign' ? 1.0 : 0.5) ? Math.sign(dx) : 0 };
    if (t % 2 === 0) { c.attack = k; c.press = [k === 'light', k === 'heavy']; }
    return c;
  },
});
const gun = (name: string, w: WeaponId, aim: 'head' | 'body', range = 3): Strat => ({
  name, range, give: (h) => { h.hands[0] = newHand(w, undefined, 1); h.hands[0].semi = false; },
  cmd: (t, h, o) => ({ aim: aim === 'head' ? headOf(o) : chestOf(o), press: [t % 2 === 0, false], hold: [true, false], reload: h.hands[0]?.ammo === 0 }),
});
const STRATS: Strat[] = [
  melee('fists L mash', null, 'light'), melee('fists H mash', null, 'heavy'), melee('fists L->H smart', null, 'smart'),
  melee('knife', 'knife', 'light'), melee('bat', 'bat', 'light'), melee('sign', 'sign', 'light'),
  gun('pistol head', 'pistol', 'head'), gun('pistol body', 'pistol', 'body'), gun('deagle body', 'deagle', 'body'),
  gun('smg body (hold)', 'smg', 'body'), gun('shotgun body 2H', 'shotgun', 'body', 2),
];
const TARGETS: { name: string; make: (w: World, x: number) => Actor }[] = [
  { name: 'grunt', make: (w, x) => dummy(w, x) },
  { name: 'armed grunt', make: (w, x) => dummy(w, x, { held: 'pistol' }) },
  { name: 'zombie', make: (w, x) => dummy(w, x, { kind: 'zombie', hp: TUNING.zombie.hp }) },
  { name: 'agent', make: (w, x) => dummy(w, x, { variant: 'agent', hp: TUNING.ai.agent.hp }) },
  { name: 'brute', make: (w, x) => dummy(w, x, { variant: 'vending', hp: TUNING.brute.hp }) },
  { name: 'bodyguard', make: (w, x) => dummy(w, x, { variant: 'bodyguard', hp: TUNING.ai.bodyguardHits }) },
  { name: 'riot', make: (w, x) => dummy(w, x, { variant: 'riot', hp: TUNING.ai.riotHp }) },
];
function ttk(s: Strat, tg: (typeof TARGETS)[number]) {
  const { world, hero } = setup(-3);
  s.give?.(hero);
  hero.invulnerable = true;
  const o = tg.make(world, -3 + s.range);
  let hits = 0;
  world.events.on('hit', (e) => e.actorId === o.id && e.damage > 0 && hits++);
  for (let t = 0; t < 60 * 15; t++) {
    step(world, s.cmd(t, hero, o));
    if (!alive(o)) return { s: (t + 1) / 60, hits };
  }
  return { s: Infinity, hits };
}

// ---------------------------------------------------------------- verb x state
type St = { name: string; make: (w: World, h: Actor) => Actor };
const S_DUMMY = (w: World, o: Partial<Parameters<typeof dummy>[2]> = {}) => dummy(w, 0.45, { hp: 50, ...o });
const settle = (w: World, g: Actor, cond: () => boolean) => { for (let i = 0; i < 120 && !cond(); i++) step(w); return g; };
const STATES: St[] = [
  { name: 'free', make: (w) => S_DUMMY(w) },
  { name: 'stun', make: (w, h) => { const g = S_DUMMY(w); w.hitActor(h, g, 'light', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); return g; } },
  { name: 'knockback(air)', make: (w, h) => { const g = S_DUMMY(w); g.pos.x = 0.3; w.hitActor(h, g, 'heavy', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); return g; } },
  { name: 'down', make: (w, h) => { const g = S_DUMMY(w); w.hitActor(h, g, 'heavy', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); settle(w, g, () => g.state === 'down'); g.pos.x = 0.45; return g; } },
  { name: 'getUp', make: (w, h) => { const g = S_DUMMY(w); w.hitActor(h, g, 'heavy', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); settle(w, g, () => g.state === 'getUp'); g.pos.x = 0.45; return g; } },
  { name: 'juggled', make: (w, h) => { const g = S_DUMMY(w); w.hitActor(h, g, 'light', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); w.hitActor(h, g, 'uppercut', 1, 0, { x: g.pos.x, y: 0.6, z: Z }); for (let i = 0; i < 6; i++) step(w); return g; } },
  { name: 'zombie', make: (w) => S_DUMMY(w, { kind: 'zombie' }) },
  { name: 'agent', make: (w) => S_DUMMY(w, { variant: 'agent' }) },
  { name: 'brute', make: (w) => S_DUMMY(w, { variant: 'vending' }) },
  { name: 'corpse', make: (w, h) => { const g = S_DUMMY(w, { hp: 1 }); w.hitActor(h, g, 'light', 1, 0, { x: g.pos.x, y: 0.8, z: Z }); settle(w, g, () => g.corpse?.phase === 'settled' || g.corpse?.phase === 'frozen'); g.pos.x = 0.45; return g; } },
];
const MVERBS: { name: string; prep?: (h: Actor) => void; cmd: (t: number, h: Actor, o: Actor) => Cmd }[] = [
  { name: 'LMB', cmd: (t, h) => ({ attack: t === 0 ? 'light' : null, aim: ahead(h) }) },
  { name: 'RMB', cmd: (t, h) => ({ attack: t === 0 ? 'heavy' : null, aim: ahead(h) }) },
  { name: 'upper', cmd: (t, h) => ({ attack: t === 0 ? 'heavy' : null, aim: ahead(h, 0.3, 2.5) }) },
  { name: 'F', cmd: (t, h) => ({ grab: t === 0, aim: ahead(h) }) },
  { name: 'sweep', cmd: (t) => ({ dive: t === 0, moveX: t < 10 ? 1 : 0 }) },
  { name: 'knife', prep: (h) => { h.hands[0] = newHand('knife'); }, cmd: (t, h) => ({ attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(h) }) },
  { name: 'pistol', prep: (h) => { h.hands[0] = newHand('pistol'); }, cmd: (t, _h, o) => ({ press: [t === 0, false], aim: o.state === 'dead' || o.state === 'down' ? chestOf(o) : headOf(o) }) },
];
function matrixCell(st: St, v: (typeof MVERBS)[number]) {
  const { world, hero } = setup(0);
  v.prep?.(hero);
  const o = st.make(world, hero);
  hero.pos.x = o.pos.x - 0.45;
  if (v.name === 'pistol') hero.pos.x = o.pos.x - 2.5;
  if (v.name === 'sweep') hero.pos.x = o.pos.x - 0.75;
  const hp0 = o.hp, s0 = o.state;
  const log = evRec(world);
  const seen = new Set<string>();
  for (let t = 0; t < 40; t++) {
    step(world, v.cmd(t, hero, o));
    seen.add(o.state);
  }
  const hit = log.find((e) => e.type === 'hit' && e.p.actorId === o.id);
  const extra = log.filter((e) => ['juggle', 'block', 'grab', 'fatality', 'shieldHit'].includes(e.type) && (e.p.actorId === o.id || e.p.actorId === hero.id)).map((e) => e.type + (e.p.phase ? `:${e.p.phase}` : ''));
  const punch = log.find((e) => e.type === 'punch' && e.p.actorId === hero.id);
  const dmg = Math.round((hp0 - o.hp) * 10) / 10;
  const out = hit ? `${hit.p.kind}${hit.p.part === 'head' ? '/h' : ''} -${dmg}${hit.p.killed ? ' KILL' : ''}` : extra.includes('grab') ? 'grabbed' : '-';
  return `${out} ${s0}->${[...seen].join('/')}${extra.length ? ' ' + [...new Set(extra)].join(',') : ''}${punch && !hit ? ` (${punch.p.kind})` : ''}`;
}

// ---------------------------------------------------------------- bots for the style comparison
type Style = 'brawler' | 'gunHead' | 'gunBody' | 'mixed';
function styleBot(world: World, hero: Actor, style: Style, st: { wait: number; aimT: number; target?: number }): PlayerCommand {
  const cmd: PlayerCommand = { ...IDLE_COMMAND };
  if (!alive(hero) || hero.state === 'downed' || world.transition || hero.traversing || world.inputLocked) return cmd;
  const foes = world.actors.filter((a) => a.ai && alive(a) && !a.entering && !a.parked && !a.invulnerable && a.kind !== 'hero' && a.variant !== 'target' && a.state !== 'grabbed');
  const gunH = hero.hands.findIndex((h) => !!h && ['pistol', 'pistolSuppressed', 'deagle', 'smg', 'rifle', 'mg', 'shotgun', 'sawedoff'].includes(h.item));
  const useGun = style !== 'brawler' && gunH >= 0;
  // scavenge: empty-handed gunners walk over guns
  if (style !== 'brawler' && gunH < 0) {
    const g = world.items.find((it) => it.state === 'floor' && ['pistol', 'pistolSuppressed', 'deagle', 'smg', 'rifle', 'mg', 'shotgun', 'sawedoff'].includes(it.kind));
    if (g && (!foes.length || Math.abs(g.pos.x - hero.pos.x) < 3)) {
      cmd.moveX = Math.abs(g.pos.x - hero.pos.x) > 0.2 ? Math.sign(g.pos.x - hero.pos.x) : 0;
      cmd.moveZ = Math.abs(g.pos.z - hero.pos.z) > 0.15 ? Math.sign(g.pos.z - hero.pos.z) : 0;
      cmd.pickup = world.tick % 6 === 0;
      return cmd;
    }
  }
  const t = foes.sort((a, b) => Math.hypot(a.pos.x - hero.pos.x, a.pos.z - hero.pos.z) - Math.hypot(b.pos.x - hero.pos.x, b.pos.z - hero.pos.z))[0];
  if (!t) return cmd;
  const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z;
  const close = Math.abs(dx) < 0.7 && Math.abs(dz) < 0.2;
  if (useGun && !(style === 'mixed' && close)) {
    const h = hero.hands[gunH]!;
    if (st.target !== t.id) { st.target = t.id; st.aimT = 0; }
    st.aimT += world.dt;
    cmd.aim = style === 'gunBody' ? chestOf(t) : headOf(t);
    if (h.ammo === 0 && h.spare > 0) cmd.reload = true;
    else if (st.aimT >= st.wait) {
      const p: [boolean, boolean] = [gunH === 0, gunH === 1];
      cmd.press = p; cmd.hold = p; st.aimT = st.wait * 0.6; // follow-up shots come quicker
    }
    // keep some distance
    if (Math.abs(dx) < 1.5) cmd.moveX = -Math.sign(dx);
    return cmd;
  }
  cmd.aim = project(t.pos.x, 0.7, t.pos.z);
  if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
  if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
  if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.15 && hero.state === 'free') {
    st.aimT -= world.dt;
    if (st.aimT <= 0) { cmd.attack = t.state === 'stun' || (t.flight?.juggle && t.flight.phase === 'air') ? 'heavy' : 'light'; st.aimT = st.wait; }
  }
  return cmd;
}
function fightWaveA(style: Style, seed: number, reaction: number) {
  const A = STAGE1.rooms.arena;
  const world = new World(A.room);
  (world as unknown as { seed: number }).seed = seed;
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  if (style !== 'brawler') hero.hands[0] = newHand('pistol', undefined, 1);
  world.director = new WaveDirector(A.script);
  return runFight(world, hero, style, reaction, 240);
}
function fightStage(stage: StageDef, room: string, style: Style, seed: number, reaction: number, give?: WeaponId) {
  const world = new World(stage.rooms[room].room);
  world.attempt = seed; // STB-08: room stages reseed on entry
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  stage.loadout(hero);
  if (style !== 'brawler' && give) hero.hands[0] = newHand(give, undefined, 1);
  if (style === 'brawler') hero.hands = [null, null];
  world.seq.run(stageRunner(stage, room, Object.keys(stage.rooms[room].entries)[0]), 'stage');
  return runFight(world, hero, style, reaction, 150);
}
function runFight(world: World, hero: Actor, style: Style, reaction: number, seconds: number) {
  let hitsTaken = 0, cleared = false, deaths = 0, shots = 0, headKills = 0, kills = 0;
  world.events.on('hit', (e) => {
    if (e.actorId === hero.id && e.damage > 0) hitsTaken++;
    if (e.attackerId === hero.id && e.killed) { kills++; if (e.part === 'head' && e.kind === 'bullet') headKills++; }
  });
  world.events.on('shot', (e) => e.actorId === hero.id && shots++);
  world.events.on('roomCleared', () => (cleared = true));
  world.events.on('exitOpen', () => (cleared = true));
  const st = { wait: reaction, aimT: 0 };
  let t = 0;
  for (; t < 60 * seconds && !cleared; t++) {
    world.commands = [styleBot(world, hero, style, st)];
    world.step();
    if (!alive(hero) || hero.hp <= 0) { deaths++; hero.state = 'free'; hero.hp = TUNING.health.hero; hero.corpse = undefined; hero.flight = undefined; hero.pose.dead = false; hero.pose.root = { ...hero.pose.root, angle: 0 } as typeof hero.pose.root; }
  }
  return { cleared, s: Math.round(t / 6) / 10, hitsTaken, deaths, kills, headKills, shots };
}

// ---------------------------------------------------------------- the probes
const A = !process.env.AUDIT;
const table = (title: string, rows: string[]) => console.log(`\n### ${title}\n${rows.join('\n')}`);

describe.skipIf(A)('CMB probes', () => {
  it('latency per verb', () => {
    const rows = ['| verb | first change (ticks/ms) | signature event (ticks/ms) | ready again (ticks/ms) | events |', '|---|---|---|---|---|'];
    for (const v of VERBS) {
      const r = latency(v);
      rows.push(`| ${v.name} | ${r.first} / ${ms(r.first)} | ${v.sig} ${r.sig} / ${ms(r.sig)} | ${r.back} / ${ms(r.back)} | ${r.events} |`);
    }
    // pistol cadence when the button is mashed every 2 ticks vs every 8 ticks (0.133 s)
    for (const every of [2, 8, 9, 10]) {
      const { world, hero } = setup();
      hero.hands[0] = newHand('pistol', 99, 0);
      const log = evRec(world);
      for (let t = 0; t < 120; t++) step(world, { press: [t % every === 0, false], aim: ahead(hero, 2) });
      const shots = log.filter((e) => e.type === 'shot').length;
      rows.push(`| pistol press every ${every} ticks | | ${shots} shots in 2 s (${Math.ceil(120 / every)} presses) | | |`);
    }
    // walk stop / turn
    {
      const { world, hero } = setup();
      for (let t = 0; t < 30; t++) step(world, { moveX: 1 });
      const x0 = hero.pos.x; step(world, {}); const moved = hero.pos.x - x0;
      rows.push(`| walk stop | 1 | moved ${moved.toFixed(3)} H on the release tick (no decel) | | |`);
      const { world: w2, hero: h2 } = setup();
      for (let t = 0; t < 30; t++) step(w2, { moveX: 1, aim: ahead(h2, 1) });
      let turn = -1; const xs: number[] = [];
      for (let t = 0; t < 20; t++) { const x = h2.pos.x; step(w2, { moveX: -1, aim: ahead(h2, -1) }); xs.push(h2.pos.x - x); if (turn < 0 && h2.facing === -1 && h2.pos.x < x) turn = t + 1; }
      rows.push(`| turn (walk R -> L, aim L) | ${turn} | facing + direction flipped at tick ${turn} | | |`);
    }
    table('Latency per verb (60 Hz ticks; tick 1 = the tick the command is read)', rows);
  });

  it('buffering: second verb pressed N ticks before the first one is ready', () => {
    const rows = ['| first \\ second | ready at | ' + SECONDS.map((s) => `${s.name} (-12/-6/-3/-1/0)`).join(' | ') + ' |', '|---|---|' + SECONDS.map(() => '---').join('|') + '|'];
    for (const f of FIRSTS) {
      const cells = SECONDS.map((s) => bufferRow(f, s));
      rows.push(`| ${f.name} | ${cells[0].ready} | ${cells.map((c) => c.cells.join(' ')).join(' | ')} |`);
    }
    // jump pressed just before landing (jump buffer?) and just after walking off a ledge (coyote?)
    const pre: string[] = [];
    for (const before of [1, 2, 4, 6]) {
      const { world, hero } = setup();
      const log = evRec(world);
      let landT = -1;
      { const w = setup(); for (let t = 0; t < 80; t++) { step(w.world, { jump: t === 0 }); if (landT < 0 && w.hero.body.state === 'ground' && t > 2) landT = t; } }
      for (let t = 0; t < 120; t++) step(world, { jump: t === 0 || t === landT - before });
      pre.push(`${before}t early: ${log.filter((e) => e.type === 'jump').length > 1 ? 'jumps' : 'DROPPED'}`);
      void hero;
    }
    rows.push('', `jump pressed before landing: ${pre.join(', ')}`);
    table('Input buffering (ok = executed, DROP = lost)', rows);
  });

  it('time to kill per verb x enemy (contact range for melee, 3 H for guns; hero mashes every 2 ticks)', () => {
    const rows = ['| strategy | ' + TARGETS.map((t) => t.name).join(' | ') + ' |', '|---|' + TARGETS.map(() => '---').join('|') + '|'];
    for (const s of STRATS) rows.push(`| ${s.name} | ${TARGETS.map((tg) => { const r = ttk(s, tg); return Number.isFinite(r.s) ? `${r.s.toFixed(2)} s (${r.hits})` : `>15 s (${r.hits})`; }).join(' | ')} |`);
    table('Time to kill, seconds (hits that did damage)', rows);
  });

  it('knockback distance per hit kind (grunt, 99 hp vs lethal)', () => {
    const rows = ['| kind | survives: distance H / state | lethal: distance H |', '|---|---|---|'];
    for (const kind of ['light', 'heavy', 'uppercut', 'sweep', 'bullet', 'slash', 'smash', 'body', 'gun', 'finisher'] as const) {
      const res: string[] = [];
      for (const hp of [99, 1]) {
        const { world, hero } = setup(-3);
        const g = dummy(world, 0, { hp });
        world.hitActor(hero, g, kind, 1, 0, { x: 0, y: 0.6, z: Z });
        const st = g.state;
        for (let i = 0; i < 180; i++) step(world);
        res.push(`${g.pos.x.toFixed(2)}${hp === 99 ? ` / ${st}` : ''}`);
      }
      rows.push(`| ${kind} | ${res[0]} | ${res[1]} |`);
    }
    table('Knockback', rows);
  });

  it('verb x target state', () => {
    const rows = ['| state | ' + MVERBS.map((v) => v.name).join(' | ') + ' |', '|---|' + MVERBS.map(() => '---').join('|') + '|'];
    for (const st of STATES) rows.push(`| ${st.name} | ${MVERBS.map((v) => matrixCell(st, v)).join(' | ')} |`);
    table('Verb x target state: hit kind, damage, target states seen in 40 ticks, side events', rows);
  });

  it('combo reliability: L -> uppercut -> jabs -> heavy at plausible timings', () => {
    const rows = ['| gap L->up (s) | gap between jabs (s) | launch % | spike/punt % | kill % |', '|---|---|---|---|---|'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const g1 of [0.15, 0.25, 0.35, 0.5]) {
      for (const g2 of [0.1, 0.2, 0.3]) {
        let launch = 0, spike = 0, kill = 0;
        const N = 20;
        for (let n = 0; n < N; n++) {
          const { world, hero } = setup();
          const g = dummy(world, 0.5);
          const log = evRec(world);
          const jit = () => Math.round((rnd() - 0.5) * 4); // +-2 ticks human jitter
          const plan: [number, Cmd][] = [];
          let t = 0;
          plan.push([t, { attack: 'light' }]);
          t += Math.round(g1 * 60) + jit(); plan.push([t, { attack: 'heavy', up: true } as Cmd]);
          for (let j = 0; j < 3; j++) { t += Math.round(g2 * 60) + jit(); plan.push([t, { attack: 'light' }]); }
          t += Math.round(g2 * 60) + jit(); plan.push([t, { attack: 'heavy' }]);
          for (let k = 0; k < t + 60; k++) {
            const p = plan.find(([pt]) => pt === k);
            const up = p && (p[1] as Cmd & { up?: boolean }).up;
            step(world, { attack: p ? p[1].attack : null, aim: up ? ahead(hero, 0.3, 2.5) : project(g.pos.x, 0.7, g.pos.z), moveX: Math.abs(g.pos.x - hero.pos.x) > 0.5 ? Math.sign(g.pos.x - hero.pos.x) : 0 });
          }
          if (log.some((e) => e.type === 'juggle' && e.p.phase === 'launch')) launch++;
          if (log.some((e) => (e.type === 'juggle' && e.p.phase === 'spike') || e.type === 'fatality')) spike++;
          if (!alive(g)) kill++;
        }
        rows.push(`| ${g1} | ${g2} | ${(launch * 100) / N} | ${(spike * 100) / N} | ${(kill * 100) / N} |`);
      }
    }
    table('Combo reliability (20 attempts per cell, +-2 tick jitter)', rows);
  });

  it('depth fairness: punches and bullets near the depth band', () => {
    const rows: string[] = [];
    const punch: string[] = [];
    for (const dz of [0.1, 0.15, 0.2, 0.22, 0.25, 0.3]) {
      const { world, hero } = setup();
      const g = dummy(world, 0.5, { hp: 99, z: Z + dz });
      const log = evRec(world);
      for (let t = 0; t < 20; t++) step(world, { attack: t === 0 ? 'light' : null, aim: ahead(hero) });
      punch.push(`dz ${dz}: ${log.some((e) => e.type === 'hit' && e.p.actorId === g.id) ? 'hit' : 'miss'}`);
    }
    rows.push(`hero light vs grunt at depth offset: ${punch.join(', ')}`);
    // enemy punches on the hero at the same offsets (AI grunt)
    const enemy: string[] = [];
    for (const dz of [0.15, 0.25, 0.35]) {
      const { world, hero } = setup();
      hero.invulnerable = false;
      const g = spawnEnemy(world, 'grunt', null, 0.55, Z + dz);
      g.entering = undefined;
      let hits = 0;
      world.events.on('hit', (e) => e.actorId === hero.id && hits++);
      for (let t = 0; t < 60 * 6; t++) { step(world, {}); hero.hp = 3; }
      enemy.push(`dz ${dz}: ${hits} hits in 6 s (grunt z ${g.pos.z.toFixed(2)})`);
    }
    rows.push(`AI grunt vs idle hero: ${enemy.join(', ')}`);
    // bullets: aim at a far grunt's head with a near grunt slightly in front and offset in x
    const ray: string[] = [];
    for (const off of [0.15, 0.3, 0.45]) {
      const { world, hero } = setup(-3);
      hero.hands[0] = newHand('pistol', 99, 0);
      const far = dummy(world, 1, { hp: 99, z: Z + 0.6 });
      void dummy(world, 1 - off, { hp: 99, z: Z });
      const log = evRec(world);
      step(world, { press: [true, false], aim: headOf(far) });
      const h = log.find((e) => e.type === 'hit');
      ray.push(`x offset ${off}: hit ${h ? (h.p.actorId === far.id ? 'aimed (far)' : 'NEAR one') : 'nobody'}`);
    }
    rows.push(`pistol at the head of a grunt 0.6 H deeper, another grunt in front: ${ray.join(', ')}`);
    // prone: does lying down dodge everything?
    for (const held of [null, 'pistol'] as const) {
      const { world, hero } = setup();
      const g = spawnEnemy(world, 'grunt', held, held ? 3 : 0.6, Z);
      g.entering = undefined;
      let hits = 0;
      world.events.on('hit', (e) => e.actorId === hero.id && e.damage > 0 && hits++);
      step(world, { dive: true });
      for (let t = 0; t < 60 * 15; t++) { step(world, {}); hero.hp = 3; }
      const { world: w2, hero: h2 } = setup();
      const g2 = spawnEnemy(w2, 'grunt', held, held ? 3 : 0.6, Z);
      g2.entering = undefined;
      let hits2 = 0;
      w2.events.on('hit', (e) => e.actorId === h2.id && e.damage > 0 && hits2++);
      for (let t = 0; t < 60 * 15; t++) { step(w2, {}); h2.hp = 3; }
      rows.push(`${held ?? 'unarmed'} AI grunt, 15 s: hero prone takes ${hits} hits, hero standing takes ${hits2}`);
    }
    // corpse finisher surprise: LMB with a live grunt 0.9 H away and a corpse at the feet
    {
      const { world, hero } = setup();
      const c = dummy(world, 0.4, { hp: 1 });
      world.hitActor(hero, c, 'light', 1, 0, { x: 0.4, y: 0.8, z: Z });
      for (let i = 0; i < 200; i++) step(world);
      c.pos.x = 0.4;
      dummy(world, 0.95, { hp: 99 });
      const log = evRec(world);
      for (let t = 0; t < 30; t++) step(world, { attack: t === 0 ? 'light' : null, aim: ahead(hero), moveX: 1 });
      const p = log.find((e) => e.type === 'punch' && e.p.actorId === hero.id);
      rows.push(`LMB while walking at a grunt 0.95 H away over a corpse: punch kind = ${p?.p.kind}, moved ${hero.pos.x.toFixed(2)} H in 30 ticks`);
    }
    // getting-up enemies eat bullets
    {
      const { world, hero } = setup(-3);
      hero.hands[0] = newHand('pistol', 99, 0);
      const g = dummy(world, 0, { hp: 4 });
      world.hitActor(hero, g, 'heavy', 1, 0, { x: 0, y: 0.8, z: Z });
      g.hp = 4;
      for (let i = 0; i < 200 && g.state !== 'getUp'; i++) step(world);
      const log = evRec(world);
      let shots = 0;
      for (let t = 0; t < 24 && g.state === 'getUp'; t++) { step(world, { press: [t % 10 === 0, false], aim: chestOf(g) }); }
      shots = log.filter((e) => e.type === 'shot').length;
      const hits = log.filter((e) => e.type === 'hit' && e.p.actorId === g.id).length;
      rows.push(`pistol at a grunt getting up: ${shots} shots, ${hits} hit events, hp ${g.hp}, alive ${alive(g)}`);
    }
    table('Hit fairness', rows);
  });

  it('style comparison: brawler vs gunner (head / body) vs mixed', () => {
    const rows = ['| fight | style | reaction | cleared | s | hits taken | deaths | kills | head kills | shots |', '|---|---|---|---|---|---|---|---|---|---|'];
    const styles: Style[] = ['brawler', 'gunHead', 'gunBody', 'mixed'];
    for (const reaction of [0.2, 0.35]) {
      for (const style of styles) {
        for (const seed of [1, 2]) {
          const r = fightWaveA(style, seed, reaction);
          rows.push(`| S1 wave A seed ${seed} | ${style} | ${reaction} | ${r.cleared} | ${r.s} | ${r.hitsTaken} | ${r.deaths} | ${r.kills} | ${r.headKills} | ${r.shots} |`);
        }
      }
    }
    for (const [label, stage, room, give] of [['S2 office', STAGE2, 'office', 'pistolSuppressed'], ['S2 lobby', STAGE2, 'lobby', 'pistolSuppressed'], ['S3 street', STAGE3, 'street', 'pistol']] as const) {
      for (const style of styles) {
        const r = fightStage(stage, room, style, 1, 0.25, give);
        rows.push(`| ${label} | ${style} | 0.25 | ${r.cleared} | ${r.s} | ${r.hitsTaken} | ${r.deaths} | ${r.kills} | ${r.headKills} | ${r.shots} |`);
      }
    }
    table('Style comparison (gunners start with a pistol + 1 spare mag and scavenge)', rows);
  });
});

describe.skipIf(A)('CMB probes: dominant tactics', () => {
  function crowd(held: string | null, n: number, xs = [0.7, -0.7, 1.4]) {
    const { world, hero } = setup();
    const gs = Array.from({ length: n }, (_, i) => { const g = spawnEnemy(world, 'grunt', held as never, held ? (i % 2 ? -3.2 : 3.2) : xs[i], Z + (held ? (i - 1) * 0.3 : 0)); g.entering = undefined; return g; });
    let hits = 0, kills = 0;
    world.events.on('hit', (e) => { if (e.actorId === hero.id && e.damage > 0) hits++; if (e.attackerId === hero.id && e.killed) kills++; });
    return { world, hero, gs, res: () => ({ hits, kills }) };
  }
  it('prone camping, human shield, stun-lock', () => {
    const rows: string[] = [];
    for (const item of ['knife', 'pistol', null] as const) {
      const c = crowd(null, 3);
      if (item) c.hero.hands[0] = newHand(item, item === 'pistol' ? 99 : undefined, 0);
      step(c.world, { dive: true });
      for (let t = 0; t < 60 * 20; t++) {
        const g = c.gs.filter(alive).sort((a, b) => Math.abs(a.pos.x - c.hero.pos.x) - Math.abs(b.pos.x - c.hero.pos.x))[0];
        step(c.world, { attack: t % 6 === 0 ? 'light' : null, press: [t % 10 === 0, false], aim: g ? chestOf(g) : undefined });
        c.hero.hp = 3;
      }
      rows.push(`prone with ${item ?? 'empty hands'} vs 3 unarmed AI grunts, 20 s: ${JSON.stringify(c.res())} (hero body ${c.hero.body.state})`);
    }
    // human shield vs 3 pistol grunts: hold a grunt, fire the back-hand pistol (RMB)
    for (const shield of [true, false]) {
      const c = crowd('pistol', 3);
      c.hero.hands[1] = newHand('pistol', 99, 0);
      const s = createActor('grunt', 0.5, Z, -1); c.world.actors.push(s);
      if (shield) for (let t = 0; t < 3; t++) step(c.world, { grab: t === 0, aim: ahead(c.hero) });
      for (let t = 0; t < 60 * 20; t++) {
        const g = c.gs.filter(alive)[0];
        step(c.world, { press: [false, t % 12 === 0], hold: [false, false], aim: g ? headOf(g) : undefined });
        c.hero.hp = 3;
      }
      rows.push(`${shield ? 'with' : 'without'} a human shield vs 3 pistol grunts at 3.2 H, 20 s: ${JSON.stringify(c.res())} holding=${!!c.hero.holding}`);
    }
    // stun-lock: a riot (8 hp) or a tough grunt mashed with lights: does he ever swing back?
    for (const v of ['riot', undefined] as const) {
      const { world, hero } = setup();
      const g = spawnEnemy(world, 'grunt', null, 0.5, Z, { variant: v });
      g.entering = undefined;
      g.hp = g.maxHp = 40;
      let back = 0, freeTicks = 0;
      world.events.on('hit', (e) => e.actorId === hero.id && back++);
      for (let t = 0; t < 60 * 10; t++) { step(world, { attack: t % 24 === 0 ? 'light' : null, aim: project(g.pos.x, 0.7, g.pos.z), moveX: Math.abs(g.pos.x - hero.pos.x) > 0.5 ? 1 : 0 }); if (g.state === 'free') freeTicks++; hero.hp = 3; }
      rows.push(`light every 0.4 s on a 40-hp ${v ?? 'grunt'}: ${back} hits back in 10 s, ${freeTicks} ticks free, hp left ${g.hp}`);
    }
    table('Dominant tactics', rows);
  });
});

describe.skipIf(A)('CMB probes: knife LMB context', () => {
  it('knife LMB on a downed / getting-up grunt and just out of reach', () => {
    const rows: string[] = [];
    for (const st of ['down', 'getUp', 'far 0.75', 'corpse only'] as const) {
      const { world, hero } = setup();
      hero.hands[0] = newHand('knife');
      const g = dummy(world, 0.45, { hp: st === 'corpse only' ? 1 : 50 });
      if (st === 'down' || st === 'getUp' || st === 'corpse only') {
        world.hitActor(hero, g, st === 'corpse only' ? 'light' : 'heavy', 1, 0, { x: g.pos.x, y: 0.8, z: Z });
        settle(world, g, () => (st === 'corpse only' ? g.corpse?.phase === 'frozen' : g.state === st));
        g.pos.x = 0.45;
      } else g.pos.x = 0.75;
      const log = evRec(world);
      for (let t = 0; t < 40; t++) step(world, { attack: t === 0 ? 'light' : null, press: [t === 0, false], aim: ahead(hero) });
      rows.push(`${st}: knife ${hero.hands[0] ? 'still in hand' : 'THROWN'}; hit on target: ${log.some((e) => e.type === 'hit' && e.p.actorId === g.id)}; target ${g.state}`);
    }
    table('Knife LMB context', rows);
  });
});
