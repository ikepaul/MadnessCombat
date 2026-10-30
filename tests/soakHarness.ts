// Soak harness (design/audit/README.md §2a, promoted in M14b): headless stage worlds, composable
// bots, a run loop that checks the invariants (src/sim/invariants.ts) every tick. Not a test file
// (vitest only runs *.test.ts). No Phaser. Used by tests/soak.test.ts and the audit probes.
import { checkInvariants } from '../src/sim/invariants';
export { checkInvariants };
import { STAGE1 } from '../src/data/stages/stage1';
import { STAGE1_BEATS, type Stage1Beat, stage1From } from '../src/data/stages/stage1Script';
import { STAGE2 } from '../src/data/stages/stage2';
import { STAGE3 } from '../src/data/stages/stage3';
import { TUNING } from '../src/data/tuning';
import { isWeapon } from '../src/data/weapons';
import { project } from '../src/render/camera';
import { type Actor, alive, createActor } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { type StageDef, stageRunner } from '../src/sim/stage';
import { World } from '../src/sim/world';

export const ROOM_STAGES: Record<2 | 3, StageDef> = { 2: STAGE2, 3: STAGE3 };

/** A World running that stage from that room (stage 1: from that beat), like GameScene.setupStage. */
export function stageWorld(stage: 1 | 2 | 3, room?: string, players = 1, seed = 1): World {
  let world: World;
  if (stage === 1) {
    world = new World(STAGE1.rooms.arena.room);
    for (let i = 0; i < players; i++) world.addPlayer(createActor('hero', players > 1 ? (i ? 0.6 : -0.6) : 0, 9.2, 1));
    const beat = (room && (STAGE1_BEATS as readonly string[]).includes(room) ? room : 'intro') as Stage1Beat;
    world.seq.run(stage1From(beat));
  } else {
    const def = ROOM_STAGES[stage];
    const r = room && room in def.rooms ? room : def.start.room;
    const entry = r === def.start.room ? def.start.entry : Object.keys(def.rooms[r].entries)[0];
    world = new World(def.rooms[r].room);
    world.gore = def.gore ?? 'normal';
    for (let i = 0; i < players; i++) world.addPlayer(createActor('hero', 0.6 * i, 9.2, 1));
    world.players.forEach((p) => def.loadout(p));
    world.seq.run(stageRunner(def, r, entry), 'stage');
  }
  // STB-08: room stages reseed on entry from (stage, room, entry, attempt): seed 1 = the first try
  if (stage === 1) world.reseed(seed * 7919);
  else world.attempt = seed - 1;
  return world;
}

export const STAGE_ROOMS: Record<1 | 2 | 3, readonly string[]> = {
  1: STAGE1_BEATS,
  2: Object.keys(STAGE2.rooms),
  3: Object.keys(STAGE3.rooms),
};

// ---------------------------------------------------------------- bots

export type Bot = (world: World, me: Actor) => PlayerCommand;

/** Small seeded RNG for bots (separate from the world's). */
export function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const foes = (world: World) => world.actors.filter((a) => (a.ai || a.kind === 'zombie' || a.kind === 'boss') && alive(a) && !a.protected && a.playerIndex === undefined);
const nearest = (list: Actor[], me: Actor) => list.sort((a, b) => Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) - Math.hypot(b.pos.x - me.pos.x, b.pos.z - me.pos.z))[0];

export const idle: Bot = () => ({ ...IDLE_COMMAND });

/** Fuzz: a random verb (every verb in PlayerCommand), held 3-20 ticks, aim near enemies. */
export function masher(seed: number): Bot {
  const r = rng(seed);
  let cur: PlayerCommand = { ...IDLE_COMMAND }, left = 0;
  return (world, me) => {
    if (left-- <= 0) {
      left = 3 + Math.floor(r() * 18);
      const t = nearest(foes(world), me) ?? me;
      const aim = project(t.pos.x + (r() - 0.5), t.pos.y + r() * 1.2, t.pos.z);
      const v = Math.floor(r() * 17);
      cur = { ...IDLE_COMMAND, aim, moveX: Math.round(r() * 2 - 1), moveZ: r() < 0.3 ? Math.round(r() * 2 - 1) : 0 };
      if (v === 0) cur.jump = true;
      if (v === 1) cur.dive = true;
      if (v === 2) cur.attack = 'light';
      if (v === 3) cur.attack = 'heavy';
      if (v === 4) cur.grab = true;
      if (v === 5) cur.pickup = true;
      if (v === 6) cur.reload = true;
      if (v === 7) cur.throwGun = true;
      if (v === 8) cur.grenade = true;
      if (v === 9) cur.split = true;
      if (v === 10) { cur.press = [true, false]; cur.hold = [true, false]; }
      if (v === 11) { cur.press = [false, true]; cur.hold = [false, true]; }
      if (v === 12) cur.fireMode = true;
      if (v === 13) cur.attack = 'uppercut';
    }
    const c = { ...cur };
    // edges fire on the first tick of the hold only
    cur = { ...cur, jump: false, dive: false, attack: null, grab: false, pickup: false, reload: false, throwGun: false, fireMode: false, press: [false, false] };
    return c;
  };
}

/** Melee only (the balance bot): stun with light, heavy the stunned. */
export function brawler(reaction = 0.15): Bot {
  let wait = 0;
  return (world, me) => {
    const cmd: PlayerCommand = { ...IDLE_COMMAND };
    if (!alive(me) || me.state === 'downed') return cmd;
    const t = nearest(foes(world).filter((a) => !a.entering), me);
    if (!t) return cmd;
    const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z;
    cmd.face = dx >= 0 ? 1 : -1;
    cmd.aim = project(t.pos.x, t.pos.y + 0.6, t.pos.z);
    if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
    if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
    if (Math.abs(dx) < 0.65 && Math.abs(dz) < 0.15 && me.state === 'free') {
      wait -= world.dt;
      if (wait <= 0) { cmd.attack = t.state === 'stun' || t.state === 'down' ? 'heavy' : 'light'; wait = reaction; }
    }
    return cmd;
  };
}

/** Guns first: pick one up, aim at the nearest head, fire, reload, throw empties; else brawl. */
export function gunner(reaction = 0.2): Bot {
  const melee = brawler(reaction);
  let cd = 0;
  return (world, me) => {
    const gun = me.hands.findIndex((h) => h && isWeapon(h.item));
    const t = nearest(foes(world).filter((a) => !a.entering), me);
    if (gun < 0) {
      const it = world.items.filter((i) => i.state === 'floor' && isWeapon(i.kind) && (i.ammo ?? 1) > 0).sort((a, b) => Math.abs(a.pos.x - me.pos.x) - Math.abs(b.pos.x - me.pos.x))[0];
      if (it && Math.hypot(it.pos.x - me.pos.x, it.pos.z - me.pos.z) < 4) {
        const dx = it.pos.x - me.pos.x, dz = it.pos.z - me.pos.z;
        return { ...IDLE_COMMAND, moveX: Math.abs(dx) > 0.15 ? Math.sign(dx) : 0, moveZ: Math.abs(dz) > 0.08 ? Math.sign(dz) : 0, pickup: world.tick % 6 === 0 };
      }
      return melee(world, me);
    }
    if (!t) return { ...IDLE_COMMAND };
    const h = me.hands[gun]!;
    const cmd: PlayerCommand = { ...IDLE_COMMAND, aim: project(t.pos.x, t.pos.y + 0.85, t.pos.z) };
    cd -= world.dt;
    if (h.ammo <= 0 && h.spare <= 0) { cmd.throwGun = true; return cmd; }
    if (h.ammo <= 0) { cmd.reload = true; return cmd; }
    if (cd <= 0) { cmd.press = gun === 0 ? [true, false] : [false, true]; cmd.hold = gun === 0 ? [true, false] : [false, true]; cd = reaction; }
    return cmd;
  };
}

/** Plays `inner` while there are enemies, then walks to an open exit and takes it. */
export function progress(inner: Bot): Bot {
  return (world, me) => {
    if (foes(world).length || !alive(me)) return inner(world, me);
    const x = world.exits.find((e) => e.open && !e.def.warp)?.def;
    if (!x) return inner(world, me);
    const tx = Math.max(-world.room.halfWidth + 0.25, Math.min(world.room.halfWidth - 0.25, (x.x0 + x.x1) / 2));
    const tz = Math.max(world.room.zFront, Math.min(world.room.zBack - 0.3, (x.z0 + x.z1) / 2));
    const dx = tx - me.pos.x, dz = tz - me.pos.z;
    const cmd: PlayerCommand = { ...IDLE_COMMAND, moveZ: Math.abs(dz) > 0.08 ? Math.sign(dz) : 0, moveX: Math.abs(dx) > 0.1 ? Math.sign(dx) : 0 };
    // walk-in exits off the side: keep walking
    if (x.kind === 'door' || x.kind === 'edge' || x.kind === 'fall') { if (Math.abs(dx) <= 0.1) cmd.moveX = x.x0 > 0 ? 1 : x.x1 < 0 ? -1 : 0; }
    if (x.kind === 'breach' && me.grenades > 0) {
      cmd.aim = project((x.x0 + x.x1) / 2, 0, (x.z0 + x.z1) / 2);
      cmd.grenade = world.tick % 120 < 40;
    }
    if (Math.abs(dx) < 0.3 && world.tick % 10 === 0) cmd.pickup = true;
    return cmd;
  };
}

// ---------------------------------------------------------------- invariants + run

export interface Violation { rule: string; tick: number; room?: string; detail: string }

export interface RunResult {
  events: Record<string, number>;
  roomsVisited: string[];
  deaths: number;
  cleared: boolean;
  exceptions: Violation[];
  violations: Violation[];
  msPerTick: { p50: number; p95: number; max: number };
  ticks: number;
  maxItems: number;
  maxActors: number;
}

/** Events that count as the room / script moving on (softlock rule). */
const ACTIVITY = ['spawn', 'waveStart', 'exitOpen', 'exitTaken', 'card', 'roomEnter', 'roomCleared', 'kill', 'music', 'warp', 'cameraTurn', 'jetpack', 'lightning'] as const;


export interface RunOpts { seconds: number; stopWhen?: (w: World) => boolean; stopOnRoomChange?: boolean; keepAlive?: boolean }

export function run(world: World, bots: Bot[], opts: RunOpts): RunResult {
  const events: Record<string, number> = {};
  const roomsVisited: string[] = [];
  const exceptions: Violation[] = [], violations: Violation[] = [];
  const seen = new Set<string>();
  const stuck = new Map<number, number>();
  let deaths = 0, cleared = false, lastActivity = 0, enteredRooms = 0, lastFoeSeen = 0, foesSeen = false, maxItems = 0, maxActors = 0;

  const report = (list: Violation[]) => (rule: string, detail: string) => {
    const key = rule + detail.replace(/[-\d.]+/g, '#');
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ rule, tick: world.tick, room: world.roomId ?? world.room.id, detail });
  };
  const offs: (() => void)[] = [];
  const ev = world.events as unknown as { emit: (t: string, e: unknown) => void };
  const emit = ev.emit.bind(world.events);
  ev.emit = (t: string, e: unknown) => {
    events[t] = (events[t] ?? 0) + 1;
    if ((ACTIVITY as readonly string[]).includes(t)) lastActivity = world.tick;
    if (t === 'roomEnter') { roomsVisited.push((e as { room: string }).room); enteredRooms++; }
    if (t === 'roomCleared') cleared = true;
    if (t === 'kill' && world.players.some((p) => p.id === (e as { actorId: number }).actorId)) deaths++;
    emit(t, e);
  };
  const times: number[] = [];
  for (let i = 0; i < opts.seconds * 60; i++) {
    world.commands = world.players.map((p, k) => (bots[k] ?? bots[0])(world, p));
    const t0 = performance.now();
    try {
      world.step();
    } catch (err) {
      report(exceptions)('exception', `${(err as Error).stack?.split('\n').slice(0, 4).join(' | ')}`);
      break;
    }
    times.push(performance.now() - t0);
    if (opts.keepAlive) for (const p of world.players) p.hp = Math.max(p.hp, 2);
    checkInvariants(world, stuck, report(violations));
    maxItems = Math.max(maxItems, world.items.length);
    maxActors = Math.max(maxActors, world.actors.length);
    const f = foes(world).length;
    if (f) { foesSeen = true; lastFoeSeen = world.tick; }
    const openExit = world.exits.some((x) => x.open && !x.def.warp);
    if (!f && !openExit && !cleared && !world.exitTaken && world.tick - lastActivity > 60 * 60) report(violations)('softlock', `60 s: no enemy, no open exit, no script activity`);
    if (foesSeen && !f && !openExit && !cleared && world.tick - lastFoeSeen === 60 * 10 && world.tick - lastActivity >= 60 * 10) report(violations)('slowOpen', `10 s after the last enemy: no exit, no beat`);
    if (cleared) break;
    if (world.activePlayers.length === 0 && !world.players.some((p) => p.parked) && !world.flags.has('ending')) break;
    if (opts.stopOnRoomChange && enteredRooms > 1) break;
    if (opts.stopWhen?.(world)) break;
  }
  for (const o of offs) o();
  ev.emit = emit;
  times.sort((a, b) => a - b);
  const q = (p: number) => +(times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0).toFixed(3);
  return { events, roomsVisited, deaths, cleared, exceptions, violations, msPerTick: { p50: q(0.5), p95: q(0.95), max: q(1) }, ticks: times.length, maxItems, maxActors };
}

/** A compact hash of the sim state (ids excluded: they come from a global counter). */
export function stateHash(world: World): string {
  const r = (n: number) => Math.round(n * 1000);
  const parts = world.actors.map((a) => `${a.kind}${a.state}${r(a.pos.x)},${r(a.pos.y)},${r(a.pos.z)}h${a.hp}`);
  parts.push(...world.items.map((i) => `${i.kind}${i.state}${r(i.pos.x)},${r(i.pos.y)},${r(i.pos.z)}`));
  parts.push(`t${world.tick}k${world.kills}`);
  return parts.join('|');
}

export const T = TUNING;
