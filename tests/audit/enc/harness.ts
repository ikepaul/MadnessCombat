// ENC audit harness (not a test file): stage worlds, bots, and per-room metrics for the
// difficulty curve, the beat sheet and the arrival baseline. Headless, no Phaser.
import { isMelee } from '../../../src/data/melee';
import { STAGE2 } from '../../../src/data/stages/stage2';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { STAGE1 } from '../../../src/data/stages/stage1';
import { STAGE1_BEATS, type Stage1Beat, stage1From } from '../../../src/data/stages/stage1Script';
import { TUNING } from '../../../src/data/tuning';
import { isWeapon } from '../../../src/data/weapons';
import { project } from '../../../src/render/camera';
import { type Actor, alive, createActor, type Hand } from '../../../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import { roof, cableSegment, shootCables } from '../../../src/sim/elevator';
import { explode } from '../../../src/sim/explosives';
import { disarm } from '../../../src/sim/melee';
import { type StageDef, stageRunner } from '../../../src/sim/stage';
import { World } from '../../../src/sim/world';

export type BotKind = 'brawler' | 'gunner';
export interface BotState { wait: number; targetId?: number; acquiredAt: number; lastPress: number; seen: Map<number, number>; err: number; stuckRoom: number; rngS: number }

const DEFS: Record<2 | 3, StageDef> = { 2: STAGE2, 3: STAGE3 };

/** Small deterministic rng for the bot's own aim error (not the world's). */
function brng(s: BotState): number {
  let t = (s.rngS = (s.rngS + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Things a player would want dead right now (on screen). */
export function foes(world: World): Actor[] {
  const lim = world.room.halfWidth + 0.3;
  return world.actors.filter((a) => {
    if (a.playerIndex !== undefined || !alive(a) || a.koed || a.invulnerable || a.parked) return false;
    if (Math.abs(a.pos.x) > lim || a.entering) return false;
    // the stage 1 fight, and the stage 3 sword duel (his cameo body can be shot there)
    if (a.kind === 'boss') return !!a.boss && (a.boss.phase === 'fight' || (a.boss.phase === 'cameo' && !a.invulnerable && !!a.pose.sword));
    if (a.variant === 'boombox') return true;
    if (a.variant === 'dancer' || a.variant === 'target' || a.variant === 'welder') return false;
    if (a.protected) return false;
    if (a.ai?.idle === 'cower') return false;
    return !!a.ai || a.kind === 'zombie';
  });
}

const gunOf = (h: Hand | null | undefined) => !!h && isWeapon(h.item);

/** The bot's command for this tick. */
export function botCommand(world: World, hero: Actor, kind: BotKind, reaction: number, st: BotState): PlayerCommand {
  const cmd: PlayerCommand = { ...IDLE_COMMAND };
  if (!alive(hero) || hero.state === 'downed' || hero.traversing || world.inputLocked) return cmd;
  // mashing out of a grab (the boss's slams)
  if (hero.state === 'grabbed') { cmd.attack = world.tick % 4 === 0 ? 'light' : null; return cmd; }
  if (hero.state === 'down') { if (world.tick % 20 === 0) cmd.jump = true; return cmd; }
  const list = foes(world);
  const t = list.sort((a, b) => Math.abs(a.pos.x - hero.pos.x) + Math.abs(a.pos.z - hero.pos.z) - Math.abs(b.pos.x - hero.pos.x) - Math.abs(b.pos.z - hero.pos.z))[0];
  if (!t) return progress(world, hero, cmd, st);
  // reaction: a newly seen enemy is acted on only after `reaction` s
  if (!st.seen.has(t.id)) st.seen.set(t.id, world.time);
  const ready = world.time - st.seen.get(t.id)! >= reaction;
  const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z;
  cmd.face = dx >= 0 ? 1 : -1;
  const gunHand = [0, 1].find((i) => gunOf(hero.hands[i]) && (hero.hands[i]!.ammo > 0 || hero.hands[i]!.spare > 0)) as 0 | 1 | undefined;
  if (kind === 'gunner') {
    if (gunHand !== undefined) {
      const h = hero.hands[gunHand]!;
      if (h.ammo <= 0) { if (h.reload <= 0) cmd.reload = true; return cmd; }
      // keep 1.5-4 H away in x, line up roughly in depth (rays are screen-space, depth is free)
      if (Math.abs(dx) < 1.3) cmd.moveX = -Math.sign(dx);
      else if (Math.abs(dx) > 4) cmd.moveX = Math.sign(dx);
      if (st.targetId !== t.id) { st.targetId = t.id; st.err = (brng(st) * 2 - 1) * reaction * 0.5; }
      const headY = t.kind === 'boss' ? t.pos.y + 0.95 * TUNING.boss.scale : t.pos.y + (t.state === 'down' ? 0.15 : 0.79);
      cmd.aim = project(t.pos.x, headY + st.err, t.pos.z);
      const gap = Math.max(0.12, reaction * 0.8);
      if (ready && world.time - st.lastPress >= gap) {
        st.lastPress = world.time;
        const press: [boolean, boolean] = [false, false];
        press[gunHand] = true;
        cmd.press = press;
        cmd.hold = press;
        st.err = (brng(st) * 2 - 1) * reaction * 0.5;
      }
      return cmd;
    }
    // an empty gun in hand: throw it at him
    const dry = [0, 1].find((i) => gunOf(hero.hands[i]) && hero.hands[i]!.ammo <= 0 && hero.hands[i]!.spare <= 0) as 0 | 1 | undefined;
    if (dry !== undefined && ready) {
      cmd.aim = project(t.pos.x, t.pos.y + 0.79, t.pos.z);
      if (world.tick % 10 === 0) { const press: [boolean, boolean] = [false, false]; press[dry] = true; cmd.press = press; }
      return cmd;
    }
    // look for a gun on the floor nearby
    const g = world.items.filter((it) => it.state === 'floor' && !it.locked && isWeapon(it.kind) && (it.ammo ?? 0) > 0)
      .sort((a, b) => Math.abs(a.pos.x - hero.pos.x) - Math.abs(b.pos.x - hero.pos.x))[0];
    if (g && Math.abs(g.pos.x - hero.pos.x) < 3 && (!hero.hands[0] || !hero.hands[1])) {
      const gx = g.pos.x - hero.pos.x, gz = g.pos.z - hero.pos.z;
      if (Math.hypot(gx, gz * 1.5) < 0.4) { cmd.pickup = world.tick % 6 === 0; return cmd; }
      cmd.moveX = Math.abs(gx) > 0.1 ? Math.sign(gx) : 0;
      cmd.moveZ = Math.abs(gz) > 0.08 ? Math.sign(gz) : 0;
      return cmd;
    }
  }
  // melee (balance-bot style): walk up, light to stun, heavy on the stunned
  if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
  if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
  if (t.kind === 'boss') { cmd.moveX = Math.abs(dx) < 2.8 ? -Math.sign(dx) : 0; return cmd; } // fists do nothing to him
  if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.15 && hero.state === 'free' && ready) {
    st.wait -= world.dt;
    if (st.wait <= 0) {
      const juggled = !!t.flight?.juggle && t.flight.phase === 'air';
      cmd.attack = t.state === 'stun' || juggled || t.state === 'down' ? 'heavy' : 'light';
      if (isMelee(hero.hands[0]?.item ?? '')) cmd.attack = 'light';
      st.wait = reaction;
    }
  }
  return cmd;
}

/** Nothing to fight: walk to the open exit and take it (or do the scripted bit the room wants). */
function progress(world: World, hero: Actor, cmd: PlayerCommand, st: BotState): PlayerCommand {
  // stage 1 ending: fetch the boombox
  const box = world.items.find((it) => it.kind === 'boombox' && !it.locked && it.state === 'floor');
  if (box) return walkTo(hero, cmd, box.pos.x, box.pos.z, true, world);
  const x = world.exits.find((e) => e.open && !e.def.warp)?.def;
  if (!x) return cmd;
  if (x.kind === 'breach' || x.kind === 'blasted' || x.kind === 'fall') return cmd;
  const lim = world.room.halfWidth - 0.21;
  const tx = Math.max(-lim, Math.min(lim, (x.x0 + x.x1) / 2)), tz = Math.max(x.z0, Math.min(x.z1, (x.z0 + x.z1) / 2 > 50 ? 9.0 : (x.z0 + x.z1) / 2));
  const use = x.kind === 'ladder' || x.kind === 'lift' || x.kind === 'vent' || x.kind === 'climb';
  if (!use) {
    // walk-in: walk off past the zone edge
    const r = walkTo(hero, cmd, tx, tz, false, world);
    if (Math.abs(hero.pos.x - tx) < 0.3) r.moveX = x.x0 > 0 ? 1 : -1;
    return r;
  }
  st.stuckRoom += world.dt;
  return walkTo(hero, cmd, tx, tz, true, world);
}

function walkTo(hero: Actor, cmd: PlayerCommand, tx: number, tz: number, pressE: boolean, world: World): PlayerCommand {
  const dx = tx - hero.pos.x, dz = tz - hero.pos.z;
  if (Math.abs(dx) > 0.12) cmd.moveX = Math.sign(dx);
  if (Math.abs(dz) > 0.08) cmd.moveZ = Math.sign(dz);
  if (pressE && Math.abs(dx) < 0.35 && Math.abs(dz) < 0.25) cmd.pickup = world.tick % 8 === 0;
  return cmd;
}

/**
 * Scripted help where a bot can't do what the room asks (each is a verb a real player has): the
 * breach grenade, the elevator roof + cables, the target's gun, the pin, the sign steal, the stage
 * 1 grenade beat. `cheats` counts them per room so the report can say so.
 */
export function assist(world: World, hero: Actor, roomT: number, cheats: Set<string>): void {
  if (!alive(hero) || world.transition) return;
  const none = foes(world).length === 0;
  const breach = world.exits.find((e) => e.open && e.def.kind === 'breach');
  if (breach && none && roomT > 3 && world.tick % 60 === 0) { cheats.add('breach'); explode(world, { x: (breach.def.x0 + breach.def.x1) / 2, y: 0, z: (breach.def.z0 + breach.def.z1) / 2 }, hero.id); }
  for (const it of [...world.items]) {
    // a live enemy grenade (or the elevator's) is thrown back out by a competent player
    if (it.kind === 'grenade' && it.live && (it.fuse ?? 9) < 0.6 && Math.hypot(it.pos.x - hero.pos.x, it.pos.z - hero.pos.z) < 1.0 && world.tick % 2 === 0) { /* leave it: dodging is the bot's problem */ }
  }
  // stage 1 grenade beat: the dropped grenade lobbed onto the pile 2 s after it lands
  const g = world.items.find((it) => it.kind === 'grenade' && !it.live && it.state === 'floor');
  if (g && none && world.roomId === undefined) {
    (g as unknown as { _t?: number })._t = ((g as unknown as { _t?: number })._t ?? 0) + world.dt;
    if ((g as unknown as { _t: number })._t > 2) {
      cheats.add('grenade');
      const bodies = world.actors.filter((a) => a.state === 'dead' && a.corpse && !a.corpse.gibbed);
      const cx = bodies.length ? bodies.reduce((s, a) => s + a.pos.x, 0) / bodies.length : 0;
      world.items.splice(world.items.indexOf(g), 1);
      explode(world, { x: cx, y: 0, z: 9.3 }, hero.id);
    }
  }
  // elevator: up on the roof once the doors open, then the cables
  if (world.roomId === 'elevator' && world.flags.has('ambush') && world.elevator?.phase === 'stopped') {
    cheats.add('elevator-roof');
    if (hero.pos.y < 1 && !hero.traversing) { hero.pos.y = roof(world)!.y; hero.body.groundY = roof(world)!.y; hero.pos.x = 0.5; }
    const seg = cableSegment(world);
    if (seg && world.tick % 20 === 0) { const y = (seg[0][1] + seg[1][1]) / 2; shootCables(world, [seg[0][0] - 40, y], [seg[0][0] + 40, y]); }
  }
  // the target's gun (stage 2 final): shot out of his hand after 4 s
  const target = world.actors.find((a) => a.variant === 'target' && a.protected && a.hands[0]);
  if (target && roomT > 4) { cheats.add('target-disarm'); disarm(world, hero, target, 'shot', 1); }
  // protected mini-bosses that need a pin / a steal
  for (const a of world.actors) {
    if (!alive(a) || a.variant !== 'riot') continue;
    const st = a as Actor & { _t?: number };
    st._t = (st._t ?? 0) + world.dt;
    if (a.protected && a.hands[0]?.item === 'scimitar' && st._t > 12) { cheats.add('pin'); world.hitActor(hero, a, 'pin', 1, 0, { ...a.pos }); }
    if (a.kind === 'zombie' && a.hands[0]?.item === 'sign' && st._t > 20) { cheats.add('sign-steal'); disarm(world, hero, a, 'knock', 1); }
  }
}

export interface RoomStat {
  room: string; seconds: number; hits: number; deaths: number; kills: number; failed: boolean;
  locked: number; combat: number; lull: number; toExit: number; cheats: string[];
}

export interface RunOpts { stage: 1 | 2 | 3; bot: BotKind; reaction: number; seed: number; maxDeaths?: number; maxSeconds?: number; rooms?: string[] }

/** A fresh world in `room` of a room-graph stage (or stage 1 at `room` = a beat). */
function makeWorld(stage: 1 | 2 | 3, room: string, entry: string | undefined, hands: Actor['hands'] | undefined, seed: number): World {
  if (stage === 1) {
    const world = new World(STAGE1.rooms.arena.room);
    (world as unknown as { seed: number }).seed = seed;
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    world.seq.run(stage1From(room as Stage1Beat));
    return world;
  }
  const def = DEFS[stage];
  const world = new World(def.rooms[room].room);
  world.attempt = seed; // STB-08: room stages reseed on entry
  world.gore = def.gore ?? 'normal';
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  def.loadout(hero);
  if (hands) hero.hands = structuredClone(hands);
  world.seq.run(stageRunner(def, room, entry ?? (room === def.start.room ? def.start.entry : Object.keys(def.rooms[room].entries)[0])), 'stage');
  return world;
}

/** Stage 1 beat markers (card / music / wave events). */
function stage1Marker(world: World, onBeat: (b: Stage1Beat) => void): void {
  world.events.on('waveStart', (e) => { if (e.wave === 'A') onBeat('riot'); if (e.wave === 'B') onBeat('waveB'); });
  world.events.on('card', (e) => { if (e.text.startsWith('A grenade')) onBeat('grenade'); if (e.text.startsWith('Quiet again')) onBeat('ending'); });
  world.events.on('music', (e) => { if (e.cue === 'boss') onBeat('boss'); });
}

/**
 * Play a whole stage with a bot. Deaths restart the room (stages 2-3) or the beat (stage 1; the
 * game itself restarts stage 1 from the intro). After `maxDeaths` in one room the hero turns
 * invulnerable there (counted as failed) so the run reaches the end.
 */
export function playStage(o: RunOpts): { rooms: RoomStat[]; total: number; arrivals: Arrival[]; extra: Extra } {
  const maxDeaths = o.maxDeaths ?? 5, maxSeconds = o.maxSeconds ?? 900;
  const rooms: RoomStat[] = [];
  const arrivals: Arrival[] = [];
  const extra: Extra = { stuck: [], offscreenShots: 0, enemyShots: 0, friendlyKills: 0, maxAttackersSeen: 0, simulMelee: [] as number[] };
  let room: string = o.stage === 1 ? 'intro' : DEFS[o.stage as 2 | 3].start.room;
  let entry: string | undefined, hands: Actor['hands'] | undefined;
  let cur: RoomStat | undefined;
  let world!: World;
  let ended = false, total = 0;
  const st: BotState = { wait: 0, acquiredAt: 0, lastPress: -9, seen: new Map(), err: 0, stuckRoom: 0, rngS: o.seed * 7919 };
  const cheats = new Set<string>();
  let roomT = 0;
  const newRoom = (id: string) => {
    if (cur) cur.cheats = [...cheats];
    cheats.clear();
    cur = { room: id, seconds: 0, hits: 0, deaths: 0, kills: 0, failed: false, locked: 0, combat: 0, lull: 0, toExit: 0, cheats: [] };
    rooms.push(cur);
    roomT = 0;
  };
  const boot = () => {
    world = makeWorld(o.stage, room, entry, hands, o.seed + (cur?.deaths ?? 0) * 101);
    const hero = world.player!;
    if (cur?.failed) hero.hp = hero.maxHp = 99;
    world.events.on('hit', (e) => { if (e.actorId === hero.id && e.damage > 0 && !world.flags.has('ending')) cur!.hits++; });
    world.events.on('kill', (e) => {
      const v = world.actorById(e.actorId);
      if (v?.kind !== 'hero') cur!.kills++;
      if (v && v.kind !== 'hero' && e.byId !== hero.id && world.actorById(e.byId)?.ai) extra.friendlyKills++;
      const a = track.get(e.actorId);
      if (a && v && v.kind !== 'hero') { a.killedAt = world.time; a.killX = v.pos.x; a.byHero = e.byId === hero.id; a.part = lastPart.get(e.actorId); }
    });
    const lastPart = new Map<number, string>();
    world.events.on('hit', (e) => lastPart.set(e.actorId, e.part));
    world.events.on('shot', (e) => {
      const a = world.actorById(e.actorId);
      if (a?.ai) { extra.enemyShots++; if (Math.abs(a.pos.x) > world.room.halfWidth + 0.1) extra.offscreenShots++; }
    });
    world.events.on('roomEnter', (e) => {
      if (o.stage === 1) return;
      if (e.room !== room) { room = e.room; entry = e.entry; hands = structuredClone(hero.hands); newRoom(e.room); }
    });
    world.events.on('roomCleared', () => (ended = true));
    if (o.stage === 1) stage1Marker(world, (b) => {
      if (STAGE1_BEATS.indexOf(b) <= STAGE1_BEATS.indexOf(room as Stage1Beat)) return;
      room = b; newRoom(b);
    });
    track.clear();
  };
  const track = new Map<number, Arrival>();
  newRoom(room);
  boot();
  const still = new Map<number, { x: number; z: number; t: number; acted: number }>();
  for (let i = 0; i < maxSeconds * 60 && !ended; i++) {
    const hero = world.player!;
    world.command = botCommand(world, hero, o.bot, o.reaction, st);
    try { world.step(); } catch (err) { extra.stuck.push(`CRASH in ${cur!.room} at ${cur!.seconds.toFixed(1)} s: ${(err as Error).message} ${((err as Error).stack ?? "").split('\n').slice(1, 5).map((l) => l.trim()).join(" < ")}`); extra.crashes = (extra.crashes ?? 0) + 1; break; }
    total += world.dt;
    roomT += world.dt;
    cur!.seconds += world.dt;
    assist(world, hero, roomT, cheats);
    // time categories
    const fs = foes(world);
    const pending = world.actors.some((a) => (a.ai || a.kind === 'zombie') && alive(a) && !a.koed && a.variant !== 'target' && a.variant !== 'dancer');
    if (world.inputLocked || world.transition || hero.traversing) cur!.locked += world.dt;
    else if (fs.length || pending) cur!.combat += world.dt;
    else if (world.exits.some((e) => e.open && !e.def.warp)) cur!.toExit += world.dt;
    else cur!.lull += world.dt;
    // arrivals and stuck enemies
    for (const a of world.actors) {
      if (!a.ai || a.playerIndex !== undefined) continue;
      let r = track.get(a.id);
      if (!r) { r = { room: cur!.room, t: world.time, x: a.pos.x, z: a.pos.z, entering: !!a.entering, inAt: a.entering ? undefined : world.time, aware: a.ai.aware !== false }; track.set(a.id, r); arrivals.push(r); }
      if (r.inAt === undefined && !a.entering) r.inAt = world.time;
      if (!alive(a) || a.ai.aware === false || a.entering || a.surrendered || a.ai.role || a.variant === 'vip' || a.variant === 'target') { still.delete(a.id); continue; }
      const s = still.get(a.id);
      const acted = (a.state !== 'free' ? 1 : 0) + (a.ai.aimT !== undefined ? 1 : 0) + (world.tokens.has(a.id) ? 1 : 0);
      if (!s || Math.hypot(a.pos.x - s.x, a.pos.z - s.z) > 0.15 || acted) still.set(a.id, { x: a.pos.x, z: a.pos.z, t: world.time, acted });
      else if (world.time - s.t > 4) { extra.stuck.push(`${cur!.room}: #${a.id} ${a.hands[0]?.item ?? a.hands[1]?.item ?? 'fists'} at (${a.pos.x.toFixed(1)}, ${a.pos.z.toFixed(1)}) still 4 s`); s.t = world.time + 999; }
    }
    const holders = [...world.tokens].filter((id) => alive(world.actorById(id)!)).length;
    extra.maxAttackersSeen = Math.max(extra.maxAttackersSeen, holders);
    // deaths: restart the room / beat
    if (!alive(hero) && !world.flags.has('ending')) {
      cur!.deaths++;
      if (cur!.deaths >= maxDeaths) cur!.failed = true;
      boot();
      st.seen.clear();
      st.lastPress = -9; // the new world's clock starts at 0 again (else a gunner never fires after a late death)
    }
    if (o.rooms && !o.rooms.includes(cur!.room)) break;
  }
  if (cur) cur.cheats = [...cheats];
  return { rooms, total, arrivals, extra };
}

export interface Arrival { room: string; t: number; x: number; z: number; entering: boolean; inAt?: number; aware: boolean; killedAt?: number; killX?: number; byHero?: boolean; part?: string }
export interface Extra { crashes?: number; stuck: string[]; offscreenShots: number; enemyShots: number; friendlyKills: number; maxAttackersSeen: number; simulMelee: number[] }

/** Arrival pattern of one room: entries, groups (<= 0.6 s apart), sides, and the farm metric. */
export function arrivalSummary(list: Arrival[], halfWidth = 3.6) {
  const by = new Map<string, Arrival[]>();
  for (const a of list) { if (!by.has(a.room)) by.set(a.room, []); by.get(a.room)!.push(a); }
  const rows: string[] = [];
  for (const [room, xs] of by) {
    const spawned = xs.filter((a) => a.entering).sort((a, b) => a.t - b.t);
    const placed = xs.length - spawned.length;
    const gaps = spawned.slice(1).map((a, i) => a.t - spawned[i].t);
    const groups: number[] = [];
    for (let i = 0; i < spawned.length; i++) { if (i === 0 || gaps[i - 1] > 0.6) groups.push(1); else groups[groups.length - 1]++; }
    const sides = new Set(spawned.map((a) => `${Math.sign(a.x)}`)).size;
    const points = new Set(spawned.map((a) => `${Math.sign(a.x)}:${a.z.toFixed(1)}`)).size;
    const killed = spawned.filter((a) => a.killedAt !== undefined && a.byHero);
    const quick = killed.filter((a) => a.inAt !== undefined && a.killedAt! - a.inAt < 1.5).length;
    const edge = killed.filter((a) => Math.abs(a.killX ?? 0) > halfWidth - 1.0).length;
    const heads = killed.filter((a) => a.part === 'head').length;
    const med = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
    rows.push(`${room.padEnd(9)} spawned ${String(spawned.length).padStart(2)} placed ${String(placed).padStart(2)} | gap med ${med(gaps).toFixed(2)}s | groups ${groups.length} (max ${groups.length ? Math.max(...groups) : 0}, singles ${groups.filter((g) => g === 1).length}) | sides ${sides} points ${points} | killed<1.5s after entering ${quick}/${killed.length} | killed near edge ${edge}/${killed.length} | head kills ${heads}/${killed.length}`);
  }
  return rows;
}
