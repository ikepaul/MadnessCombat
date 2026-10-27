// Stages as room graphs (PLAN.md M9): a stage is a set of fixed-screen rooms joined by one-way
// exits of type door, edge (walk off the side of the screen), ladder, vent, breach, lift, fall or
// climb (research/mechanics/move-climb-vault: climbing is a room transition, not a free system).
// The stage runner is a sequencer script: it enters a room (players placed at the entry, the
// room's exits armed, its script started), waits until an exit is taken, plays the traversal and
// the ink wipe (decided 2026-10-27), and loads the next room. Every room entry is a checkpoint.
import type { GoreLevel } from './gore';
import { aboutFeet, lyingAt, STANDING } from '../anim/skeleton';
import { TUNING } from '../data/tuning';
import type { PaletteId } from '../data/palettes';
import { type Actor, alive } from './actor';
import { enter, setClip } from './combat';
import type { PlayerCommand } from './command';
import type { Beat, Seq } from './sequencer';
import type { RoomDef } from './room';
import type { World } from './world';
import { stepHatchClimb } from './elevator';

const T = TUNING.stage;

export type ExitKind = 'door' | 'edge' | 'ladder' | 'vent' | 'breach' | 'lift' | 'fall' | 'climb' | 'blasted';

/** How an exit is taken: walking into its zone, pressing E in it, or an explosion on it (breach). */
const HOW: Record<ExitKind, 'walk' | 'use' | 'blast'> = {
  door: 'walk', edge: 'walk', fall: 'walk', ladder: 'use', vent: 'use', lift: 'use', climb: 'use', breach: 'blast',
  // M12: blasted through a wall by the boss (the script takes it)
  blasted: 'blast',
};

export interface ExitDef {
  id: string;
  kind: ExitKind;
  /** Floor zone (H) that takes the exit. */
  x0: number; x1: number; z0: number; z1: number;
  /** Next room (null = the end of what's built so far: the stage ends here). */
  to: string | null;
  /** Entry id in the next room. */
  entry: string;
  /** Shut until the room script opens it (world.openExit). */
  locked?: boolean;
  /**
   * M10: a way round inside the same room (the crate room's ceiling vent): crawl in here, drop out
   * at this entry of the same room. The room and its fight carry on.
   */
  warp?: EntryDef;
}

/** Where players appear in a room, and how they arrive. */
export interface EntryDef {
  x: number; z: number; facing: 1 | -1;
  /**
   * walk: standing at the spot; above: dropping in from the ceiling (vent, breach); vault: over a
   * ledge; sky: falling out of the sky (move-fall-transition: shadow first, a face-down landing).
   */
  from: 'walk' | 'above' | 'vault' | 'sky' | 'thrown';
  /** Enemies are caught off guard for TUNING.stage.surprise s (vent / breach entries, world-breach). */
  surprise?: boolean;
}

/** Blip on the tracker HUD (world-objective-radar): direction to the target, -1..1 each axis, (0, 0) = right below. */
export type Tracker = [number, number] | ((world: World) => [number, number]);

export interface StageRoom {
  room: RoomDef;
  exits: ExitDef[];
  entries: Record<string, EntryDef>;
  /** Runs while the players are in the room (enemies, NPCs, opening exits). */
  script?: (s: Seq, entry: string) => Beat;
  tracker?: Tracker;
}

export interface StageDef {
  stage: number;
  palette: PaletteId;
  targetBodyCount: number;
  start: { room: string; entry: string };
  rooms: Record<string, StageRoom>;
  /** What each player starts the stage with. */
  loadout(p: Actor): void;
  /** Playtest 2026-10-27: stage 3 is extreme (src/sim/gore.ts). */
  gore?: GoreLevel;
}

/** An exit armed in the current room. */
export interface ExitState { def: ExitDef; open: boolean }

const inZone = (e: ExitDef, x: number, z: number) => x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1;

/**
 * Exits for this tick (World.step, before the actors): a player walking into a walk-in exit, or
 * pressing E in a use exit, takes it. E is used up so it doesn't also pick something up.
 */
export function checkExits(world: World): void {
  if (world.exitTaken || world.transition) return;
  for (const x of world.exits) {
    if (!x.open || HOW[x.def.kind] === 'blast') continue;
    for (const p of world.activePlayers) {
      if (!inZone(x.def, p.pos.x, p.pos.z) || p.state !== 'free' || p.holding) continue;
      const cmd: PlayerCommand | undefined = world.commands[p.playerIndex!];
      if (HOW[x.def.kind] === 'use' && !cmd?.pickup) continue;
      if (HOW[x.def.kind] === 'use') world.commands[p.playerIndex!] = { ...cmd!, pickup: false };
      take(world, x.def, p);
      return;
    }
  }
}

/** The open exit `p` could take with E right now (the HUD shows the key over him). */
export function usableExitAt(world: World, p: Actor): ExitDef | undefined {
  if (p.state !== 'free' || p.holding || p.traversing || world.exitTaken || world.transition) return undefined;
  return world.exits.find((x) => x.open && HOW[x.def.kind] === 'use' && inZone(x.def, p.pos.x, p.pos.z))?.def;
}

/** world-breach: an explosion on an open breach tile blows the hole and takes the exit. */
export function blastExit(world: World, at: { x: number; z: number }): void {
  if (world.exitTaken || world.transition) return;
  for (const x of world.exits) if (x.open && x.def.kind === 'breach' && inZone(x.def, at.x, at.z)) { take(world, x.def); return; }
}

function take(world: World, e: ExitDef, by?: Actor): void {
  world.exitTaken = e;
  world.events.emit('exitTaken', { exit: e.id, kind: e.kind, byId: by?.id ?? 0 });
}

/** A script takes an exit of the current room (locked or not): the elevator's cable. */
export function takeExit(world: World, id: string): void {
  const x = world.exits.find((e) => e.def.id === id);
  if (x && !world.exitTaken) take(world, x.def);
}

/** move-fall-transition: a player dropping in from the sky lands face down (no damage) and gets up. */
export function skyLanding(world: World, actorId: number): void {
  const a = world.actorById(actorId);
  if (!a?.skyFall) return;
  a.skyFall = false;
  a.state = 'down';
  a.stateT = 0;
  a.pose.root = lyingAt(Math.PI / 2);
  setClip(a, 'lying');
  world.events.emit('bodyFall', { actorId: a.id, ...a.pos, speed: 6 });
}

/** Open (or shut) an exit of the current room. */
export function openExit(world: World, id: string, open = true): void {
  const x = world.exits.find((e) => e.def.id === id);
  if (!x || x.open === open) return;
  x.open = open;
  if (open) world.events.emit('exitOpen', { exit: id, kind: x.def.kind });
}

/** Load a room: clear the last one's cast and items, place the players, arm the exits (a checkpoint). */
export function enterRoom(world: World, def: StageDef, roomId: string, entryId: string): void {
  const r = def.rooms[roomId];
  if (!r) throw new Error(`unknown room ${roomId}`);
  const entry = r.entries[entryId] ?? Object.values(r.entries)[0];
  world.setRoom(r.room);
  world.actors.splice(0, world.actors.length, ...world.players);
  world.items = [];
  world.cannons = [];
  world.balls = [];
  world.tokens.clear();
  world.tokenFreeAt = [];
  world.director = undefined;
  world.scripted.clear();
  world.inputLocked = false;
  world.exits = r.exits.map((e) => ({ def: e, open: !e.locked }));
  world.exitTaken = undefined;
  world.tracker = r.tracker;
  world.roomId = roomId;
  world.players.forEach((p, i) => placeAtEntry(p, entry, i));
  world.events.emit('roomEnter', { stage: def.stage, room: roomId, entry: entryId });
}

/** Players stand at the entry (co-op: player 2 just behind), dropping in or vaulting if it says so. */
function placeAtEntry(p: Actor, e: EntryDef, i: number): void {
  // a downed co-op player gets back up for the new room with one life
  if (p.state === 'downed' || !alive(p)) { p.hp = Math.max(1, p.hp); p.corpse = undefined; p.pose.dead = false; }
  p.flight = undefined;
  p.holding = undefined;
  p.traversing = undefined;
  enter(p, 'free');
  p.pose.root = { ...STANDING };
  setClip(p, 'idle');
  p.facing = e.facing;
  p.pos = { x: e.x - e.facing * i * 0.55, y: 0, z: e.z + i * 0.3 };
  p.body.vel = { x: 0, y: 0, z: 0 };
  p.body.groundY = 0;
  p.pose.groundY = 0;
  if (e.from === 'above') {
    // dropped through a vent or a blasted hole: falls from just under the ceiling
    p.pos.y = T.dropHeight;
    p.body.state = 'air';
    p.body.stateTime = 0;
  } else if (e.from === 'thrown') {
    // M12: blasted through the wall: you come to on your back on the other side
    p.state = 'down';
    p.stateT = 0;
    p.pose.root = lyingAt(-Math.PI / 2);
    setClip(p, 'lying');
  } else if (e.from === 'sky') {
    p.pos.y = T.skyHeight;
    p.body.state = 'air';
    p.body.stateTime = 0;
    p.skyFall = true;
  } else if (e.from === 'vault') {
    p.traversing = { kind: 'vault', t: 0 };
    p.pos.x = e.x - e.facing * (T.vaultDistance + i * 0.55);
    p.pos.y = T.vaultHeight;
    setClip(p, 'vault');
  }
}

/** Advance traversal animations (vault entry, ladder climb out): the actor is moved, not stepped. */
export function stepTraversal(world: World, a: Actor, dt: number): void {
  const tr = a.traversing!;
  tr.t += dt;
  a.stateT += dt;
  a.pose.clipT += dt;
  switch (tr.kind) {
    case 'vault': {
      // move-climb-vault: a ~1 s dive over the parapet, landing on the roof
      const u = Math.min(1, tr.t / T.vaultTime);
      a.pos.x += (a.facing * T.vaultDistance / T.vaultTime) * dt;
      a.pos.y = T.vaultHeight * (1 - u) + Math.sin(u * Math.PI) * 0.25;
      if (u >= 1) { a.pos.y = 0; a.traversing = undefined; setClip(a, 'idle'); world.events.emit('land', { actorId: a.id, ...a.pos, fallSpeed: 2 }); }
      break;
    }
    case 'climb':
      // move-climb-vault: ladder 1.1 H/s, gun still in hand
      a.pos.y += T.climbSpeed * dt;
      break;
    case 'crawl':
      a.pos.y += T.climbSpeed * 1.5 * dt;
      break;
    case 'crawlIn': {
      // a vent low in the back wall (playtest): down on the belly, then into the duct, the body
      // foreshortening as it goes in (the wipe covers the rest)
      const down = Math.min(1, tr.t / 0.15), inn = Math.max(0, Math.min(1, (tr.t - 0.15) / 0.3));
      a.pos.z += (world.room.zBack - 0.02 - a.pos.z) * Math.min(1, dt * 10);
      const root = aboutFeet((Math.PI / 2) * down, 1 - 0.08 * down);
      root.sx *= 1 - 0.85 * inn;
      a.pose.root = root;
      a.pose.groundY = 0;
      break;
    }
    case 'leap': {
      // a vent in the ceiling (playtest: no more climbing a bare wall): a jump up to grab the
      // edge with both hands, then pulled up through it
      const top = world.room.height - 1.05;
      const u = Math.min(1, tr.t / 0.28);
      a.pos.y = u < 1 ? top * (1 - (1 - u) * (1 - u)) : top + (tr.t - 0.28) * 1.6;
      a.pose.tuck = u < 1 ? 0.5 * (1 - u) : 0;
      a.pose.groundY = 0;
      break;
    }
    case 'out':
      a.pos.x += a.facing * TUNING.move.walkSpeed * dt;
      a.pose.walkPhase = (a.pose.walkPhase ?? 0) + dt * 9;
      break;
    case 'drop':
      a.pos.y -= 4 * dt;
      break;
    case 'hatch':
      stepHatchClimb(world, a, dt);
      break;
    case 'shoved': {
      // M11: shoved off the edge into the void: across, then down
      const side = world.room.void?.side ?? -1;
      a.pos.x += side * T.shoveSpeed * dt;
      if (world.room.void && (a.pos.x - world.room.void.x) * side > 0) a.pos.y -= (2 + tr.t * 10) * dt;
      a.pose.root = lyingAt(-side * a.facing * Math.min(1, tr.t * 2) * Math.PI / 2);
      break;
    }
  }
}

/** The players leave through `e`: the traversal, then the wipe covers the screen. */
function* traverse(s: Seq, e: ExitDef): Beat {
  const world = s.world;
  s.lockInput(true);
  const zx = (e.x0 + e.x1) / 2, zz = (e.z0 + e.z1) / 2;
  // a vent with a grille in the back wall is crawled into; any other vent is in the ceiling
  const wallVent = world.room.wallVents?.some((v) => zx >= v.x0 && zx <= v.x1);
  const kind: NonNullable<Actor['traversing']>['kind'] = e.kind === 'ladder' || e.kind === 'climb' ? 'climb' : e.kind === 'vent' ? (wallVent ? 'crawlIn' : 'leap') : e.kind === 'breach' || e.kind === 'fall' || e.kind === 'blasted' ? 'drop' : 'out';
  for (const p of world.activePlayers) {
    if (p.state !== 'free') continue;
    if (kind !== 'out') { p.pos.x = zx; p.pos.z = zz; }
    // lying down, the body reaches ~1 H ahead of the feet: centre it on the vent's opening
    if (kind === 'crawlIn') p.pos.x = zx - p.facing * 0.45;
    else p.facing = (zx >= p.pos.x || e.x1 >= world.room.halfWidth ? 1 : -1) as 1 | -1;
    if (e.x1 >= world.room.halfWidth + 0.5) p.facing = 1;
    if (e.x0 <= -world.room.halfWidth - 0.5) p.facing = -1;
    p.traversing = { kind, t: 0 };
    setClip(p, kind === 'climb' ? 'climb' : kind === 'leap' ? 'handsUp' : 'idle');
  }
  if (kind !== 'drop') yield T.traverse;
  world.events.emit('roomTransition', { phase: 'out', kind: e.kind });
  world.transition = true;
  yield T.wipe;
}

/**
 * The stage, room by room, from `roomId` (a checkpoint). Ends with the body-count card when an
 * exit leads nowhere (the last room built).
 */
export function stageRunner(def: StageDef, roomId = def.start.room, entryId = def.start.entry) {
  return function* stage(s: Seq): Beat {
    const world = s.world;
    let room = roomId, entry = entryId;
    for (;;) {
      s.cancelAll('stage');
      enterRoom(world, def, room, entry);
      const r = def.rooms[room];
      // the wipe uncovers the new room
      if (world.transition) { world.transition = false; world.events.emit('roomTransition', { phase: 'in', kind: 'door' }); }
      const at = entry;
      if (r.script) s.run((q) => r.script!(q, at), `room:${room}`);
      // vent / breach entries catch the room off guard
      if (r.entries[entry]?.from === 'above' && r.entries[entry]?.surprise) {
        yield;
        for (const a of world.actors) {
          if (!a.ai) continue;
          a.ai.surpriseT = T.surprise;
          // nobody gets a shot off in that first moment
          a.ai.aimT = undefined;
          a.pose.telegraph = undefined;
        }
      }
      let e: ExitDef;
      for (;;) {
        yield () => !!world.exitTaken;
        e = world.exitTaken!;
        if (!e.warp) break;
        // the same room from another spot: crawl in, the wipe, drop out over there
        yield* traverse(s, e);
        world.players.forEach((p, i) => placeAtEntry(p, e.warp!, i));
        for (const x of world.exits) if (x.def.id === e.id) x.open = false;
        world.exitTaken = undefined;
        world.transition = false;
        s.lockInput(false);
        world.events.emit('roomTransition', { phase: 'in', kind: e.kind });
        world.events.emit('warp', { exit: e.id });
      }
      yield* traverse(s, e);
      for (const p of world.players) p.traversing = undefined;
      if (!e.to) {
        world.transition = false;
        world.events.emit('roomTransition', { phase: 'in', kind: e.kind });
        s.cancelAll('stage');
        s.clear();
        return;
      }
      room = e.to;
      entry = e.entry;
    }
  };
}
