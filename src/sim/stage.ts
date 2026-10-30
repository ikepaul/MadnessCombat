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
import { type Actor, alive, WORLD_ID_BASE } from './actor';
import { enter, setClip } from './combat';
import type { PlayerCommand } from './command';
import type { GameEvents } from './events';
import type { Beat, Seq } from './sequencer';
import type { RoomDef } from './room';
import type { World } from './world';
import { stepHatchClimb } from './elevator';
import { setImprobable } from './improbability';

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
  /**
   * M14b STB-02: rules the room owns, applied on entry (and dropped on leaving), so a restart from
   * its checkpoint plays like the arrival: the physics mode and room flags (e.g. 'axeThrows').
   */
  rules?: RoomRules;
}

export interface RoomRules { physics?: 'normal' | 'improbable'; flags?: string[] }

/** STB-02: set the entered room's rules; the last room's flags go, the physics mode follows the room. */
export function applyRoomRules(world: World, rules: RoomRules | undefined): void {
  for (const f of world.roomFlags) world.flags.delete(f);
  world.roomFlags = [...(rules?.flags ?? [])];
  for (const f of world.roomFlags) world.flags.add(f);
  setImprobable(world, (rules?.physics ?? 'normal') === 'improbable');
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
    if (world.coop) { if (coopExit(world, x.def)) return; continue; }
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

/** A vent up in the ceiling (not a grille low in the back wall). */
function ceilingVent(world: World, e: ExitDef): boolean {
  const zx = (e.x0 + e.x1) / 2;
  return e.kind === 'vent' && !world.room.wallVents?.some((v) => zx >= v.x0 && zx <= v.x1);
}

/** Co-op: this exit takes a boost (a ceiling vent, and both players still standing). */
export function needsBoost(world: World, e: ExitDef): boolean {
  return world.coop && ceilingVent(world, e) && world.activePlayers.length > 1;
}

/** Co-op: the partner braced under a ceiling vent, if `p` is close enough to be boosted off him. */
export function boostBase(world: World, p: Actor): Actor | undefined {
  const base = world.activePlayers.find((q) => q !== p && q.traversing?.kind === 'brace');
  return base && Math.hypot(base.pos.x - p.pos.x, base.pos.z - p.pos.z) <= T.boostReach ? base : undefined;
}

/**
 * Co-op exits (playtest 2026-10-27): one player no longer drags the other out of the room.
 * Walk-in exits wait until everyone still standing is in them. E at a ladder, the cable, a lift
 * or a wall vent sends that player ahead (parked: out of the fight, then out of sight) until the
 * other follows. A ceiling vent takes a boost: one cups his hands under it (E), the other steps
 * in (E) and goes up, then pulls him up after. A downed partner comes along (revived next room).
 */
function coopExit(world: World, e: ExitDef): boolean {
  const standing = world.activePlayers;
  if (HOW[e.kind] === 'walk') {
    if (!standing.length || !standing.every((p) => p.state === 'free' && !p.holding && !p.traversing && inZone(e, p.pos.x, p.pos.z))) return false;
    take(world, e, standing[0]);
    return true;
  }
  const boost = needsBoost(world, e);
  for (const p of standing) {
    const cmd: PlayerCommand | undefined = world.commands[p.playerIndex!];
    if (!cmd?.pickup || p.state !== 'free' || p.holding) continue;
    const braced = p.traversing?.kind === 'brace';
    const base = boost && !braced ? boostBase(world, p) : undefined;
    if (!braced && (p.traversing || (!base && !inZone(e, p.pos.x, p.pos.z)))) continue;
    world.commands[p.playerIndex!] = { ...cmd, pickup: false };
    if (!boost) { goAhead(world, e, p); continue; }
    if (braced) {
      // changed his mind: back up
      p.traversing = undefined;
      p.pose.root = { ...STANDING };
      emitCoop(world, p, e, 'unbrace');
    } else if (!base) {
      p.traversing = { kind: 'brace', t: 0 };
      p.pos.x = (e.x0 + e.x1) / 2;
      p.pos.z = (e.z0 + e.z1) / 2;
      setClip(p, 'idle');
      emitCoop(world, p, e, 'brace');
    } else {
      // up off his hands, then he's pulled up after
      startTraversal(world, e, p, true);
      p.pos.x = base.pos.x + base.facing * 0.2;
      emitCoop(world, p, e, 'boost');
      base.parked = e.id;
      base.traversing = { kind: 'pulled', t: 0 };
    }
  }
  // everyone still standing has gone on: the room is left (the last one's climb plays under the wipe)
  if (world.activePlayers.length || !world.players.some((p) => p.parked === e.id)) return false;
  take(world, e, world.players.find((p) => p.parked === e.id));
  return true;
}

function goAhead(world: World, e: ExitDef, p: Actor): void {
  startTraversal(world, e, p, true);
  emitCoop(world, p, e, 'ahead');
}

function emitCoop(world: World, p: Actor, e: ExitDef, phase: GameEvents['coopExit']['phase']): void {
  world.events.emit('coopExit', { actorId: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, exit: e.id, kind: e.kind, phase });
}

/** Co-op: gone ahead and out of sight (up the ladder or the vent, into the duct): not drawn. */
export function outOfSight(world: World, a: Actor): boolean {
  const tr = a.traversing;
  if (!a.parked || !tr) return false;
  if (tr.kind === 'crawlIn') return tr.t > T.crawlHide;
  // up through the ceiling vent; a climb goes on up out of the top of the frame
  if (tr.kind === 'leap' || tr.kind === 'pulled') return a.pos.y > world.room.height;
  return tr.kind === 'climb' && a.pos.y > world.room.height + 1.5;
}

/** The open exit `p` could take with E right now (the HUD shows the key over him). */
export function usableExitAt(world: World, p: Actor): ExitDef | undefined {
  if (p.state !== 'free' || p.holding || p.traversing || world.exitTaken || world.transition) return undefined;
  return world.exits.find((x) => x.open && HOW[x.def.kind] === 'use' && (inZone(x.def, p.pos.x, p.pos.z) || (needsBoost(world, x.def) && !!boostBase(world, p))))?.def;
}

/** Co-op: the exit `p`'s partner went ahead through (the HUD points `p` to it). */
export function partnerAhead(world: World, p: Actor): ExitDef | undefined {
  const q = world.players.find((o) => o !== p && o.parked);
  return q && !world.exitTaken ? world.exits.find((x) => x.def.id === q.parked)?.def : undefined;
}

/** Co-op: `p` stands in an open walk-in exit, waiting for his partner to come too. */
export function waitingInExit(world: World, p: Actor): boolean {
  if (!world.coop || world.exitTaken || world.transition || p.state !== 'free') return false;
  return world.exits.some((x) => x.open && HOW[x.def.kind] === 'walk' && inZone(x.def, p.pos.x, p.pos.z));
}

/** The middle of an exit's floor zone, clamped to the room (where the HUD points). */
export function exitSpot(world: World, e: ExitDef): { x: number; z: number } {
  const h = world.room.halfWidth - 0.3;
  return { x: Math.max(-h, Math.min(h, (e.x0 + e.x1) / 2)), z: Math.max(world.room.zFront, Math.min(world.room.zBack, (e.z0 + e.z1) / 2)) };
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

/**
 * STB-08: the RNG seed a room starts from (FNV-1a over stage, room, entry and attempt): a room is
 * the same on arrival and after a restart from its checkpoint.
 */
export function roomSeed(stage: number, room: string, entry: string, attempt = 0): number {
  let h = 0x811c9dc5;
  for (const c of `${stage}/${room}/${entry}/${attempt}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h | 0;
}

/**
 * Load a room: clear the last one's cast and items, place the players, arm the exits (a checkpoint).
 * `seed` (a checkpoint's saved `world.roomSeed`) overrides the room's own seed.
 */
export function enterRoom(world: World, def: StageDef, roomId: string, entryId: string, seed?: number): void {
  const r = def.rooms[roomId];
  if (!r) throw new Error(`unknown room ${roomId}`);
  const entry = r.entries[entryId] ?? Object.values(r.entries)[0];
  // STB-08: the room's own RNG stream and id range (players keep theirs: they come from outside)
  world.reseed(seed ?? roomSeed(def.stage, roomId, entryId, world.attempt));
  world.ids.next = WORLD_ID_BASE * (2 + Math.max(0, Object.keys(def.rooms).indexOf(roomId)));
  // the old room's bodies and items go first: setRoom announces the change, and the scene
  // re-bakes the frozen corpses right then (they used to be painted into the next room)
  world.actors.splice(0, world.actors.length, ...world.players);
  world.items = [];
  world.cannons = [];
  world.balls = [];
  world.setRoom(r.room);
  world.tokens.clear();
  world.tokenFreeAt = [];
  world.director = undefined;
  world.scripted.clear();
  world.inputLocked = false;
  world.exits = r.exits.map((e) => ({ def: e, open: !e.locked }));
  world.exitTaken = undefined;
  world.tracker = r.tracker;
  world.roomId = roomId;
  applyRoomRules(world, r.rules);
  world.players.forEach((p, i) => placeAtEntry(p, entry, i));
  world.events.emit('roomEnter', { stage: def.stage, room: roomId, entry: entryId });
}

/**
 * M14b slice B (CMB-08): clears the actor's input buffer on room entry. A no-op until that buffer
 * exists; slice B fills it in (it is also called from the pause menu's close).
 */
export function clearInputBuffer(_a: Actor): void {}

/**
 * M14b STB-03 + STB-09: everything transient an actor carries from one room into the next is
 * dropped on entry (and on an in-room warp). A grenade being cooked goes back into the pocket.
 * Kept on purpose: hp, hands, grenades, rage (saved with the checkpoint).
 */
export function resetForRoom(a: Actor): void {
  if (a.cook !== undefined || (a.attack?.kind === 'lob' && !a.attack.done)) { a.cook = undefined; a.grenades++; a.grenadeLatch = true; }
  a.pose.grenade = undefined;
  a.attack = undefined;
  a.queued = undefined;
  a.grabQueued = undefined;
  a.guard = undefined;
  a.pose.guard = undefined;
  a.pose.telegraph = undefined;
  a.pose.react = undefined;
  a.pose.handsUp = undefined;
  a.chain = undefined;
  a.catchAt = undefined;
  a.useHeldAt = undefined;
  a.primedAt = undefined;
  a.fallingAway = undefined;
  a.skyFall = undefined;
  a.hover = undefined;
  a.ceilingStuck = undefined;
  a.stunFor = 0;
  a.flight = undefined;
  a.holding = undefined;
  a.grabbedBy = undefined;
  a.grabbedBy2 = undefined;
  a.takenBy = undefined;
  a.carried = undefined;
  a.spin = undefined;
  a.tossT = undefined;
  a.traversing = undefined;
  a.parked = undefined;
  a.pose.tuck = 0;
  clearInputBuffer(a);
}

/** Players stand at the entry (co-op: player 2 just behind), dropping in or vaulting if it says so. */
function placeAtEntry(p: Actor, e: EntryDef, i: number): void {
  // STB-04: a hero killed on the way out stays dead (the scene restarts him at his checkpoint)
  if (!alive(p)) return;
  // a downed co-op player gets back up for the new room with one life
  if (p.state === 'downed') { p.hp = Math.max(1, p.hp); p.corpse = undefined; p.pose.dead = false; }
  resetForRoom(p);
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
    case 'leap':
      leap(world, a, tr.t);
      break;
    case 'brace': {
      // co-op: crouched under the ceiling vent, hands cupped low for the partner's foot; a hit
      // knocks him out of it
      if (a.state !== 'free') { a.traversing = undefined; a.pose.root = { ...STANDING }; break; }
      const k = Math.min(1, tr.t / 0.15);
      a.pose.root = aboutFeet(0.45 * k, 1 - 0.18 * k);
      a.pose.tuck = 0.7 * k;
      break;
    }
    case 'pulled': {
      // co-op: straightens up under the vent, reaches up for the partner's hand, goes up after him
      if (tr.t < T.pullDelay) {
        const k = Math.min(1, tr.t / 0.25);
        a.pose.root = aboutFeet(0.45 * (1 - k), 0.82 + 0.18 * k);
        a.pose.tuck = 0.7 * (1 - k);
        if (k >= 1 && a.pose.clip !== 'handsUp') { setClip(a, 'handsUp'); emitCoop(world, a, world.exits.find((x) => x.def.id === a.parked)!.def, 'pull'); }
      } else {
        a.pose.root = { ...STANDING };
        leap(world, a, tr.t - T.pullDelay, 1.0);
      }
      break;
    }
    case 'ride':
      // co-op: standing in the lift cab, waiting for the partner
      break;
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

/**
 * `p` starts leaving through `e` (climb, crawl in, leap up, walk out, drop). `parked` (co-op):
 * he goes ahead alone and waits for his partner; a lift ride then just stands in the cab.
 */
function startTraversal(world: World, e: ExitDef, p: Actor, parked = false): NonNullable<Actor['traversing']>['kind'] {
  const zx = (e.x0 + e.x1) / 2, zz = (e.z0 + e.z1) / 2;
  // a vent with a grille in the back wall is crawled into; any other vent is in the ceiling
  const wallVent = !ceilingVent(world, e) && e.kind === 'vent';
  let kind: NonNullable<Actor['traversing']>['kind'] = e.kind === 'ladder' || e.kind === 'climb' ? 'climb' : e.kind === 'vent' ? (wallVent ? 'crawlIn' : 'leap') : e.kind === 'breach' || e.kind === 'fall' || e.kind === 'blasted' ? 'drop' : 'out';
  if (parked && kind === 'out') kind = 'ride';
  if (kind !== 'out' && kind !== 'ride') { p.pos.x = zx; p.pos.z = zz; }
  // lying down, the body reaches ~1 H ahead of the feet: centre it on the vent's opening
  if (kind === 'crawlIn') p.pos.x = zx - p.facing * 0.45;
  else p.facing = (zx >= p.pos.x || e.x1 >= world.room.halfWidth ? 1 : -1) as 1 | -1;
  if (e.x1 >= world.room.halfWidth + 0.5) p.facing = 1;
  if (e.x0 <= -world.room.halfWidth - 0.5) p.facing = -1;
  p.traversing = { kind, t: 0 };
  if (parked) p.parked = e.id;
  setClip(p, kind === 'climb' ? 'climb' : kind === 'leap' ? 'handsUp' : 'idle');
  return kind;
}

/**
 * Up into a ceiling vent (playtest: no more climbing a bare wall): a jump up to grab the edge
 * with both hands, then pulled up through it. `climb` H/s once at the edge (slower when pulled).
 */
function leap(world: World, a: Actor, t: number, climb = 1.6): void {
  const top = world.room.height - 1.05;
  const u = Math.min(1, t / 0.28);
  a.pos.y = u < 1 ? top * (1 - (1 - u) * (1 - u)) : top + (t - 0.28) * climb;
  a.pose.tuck = u < 1 ? 0.5 * (1 - u) : 0;
  a.pose.groundY = 0;
}

/** The players leave through `e`: the traversal, then the wipe covers the screen. */
function* traverse(s: Seq, e: ExitDef): Beat {
  const world = s.world;
  s.lockInput(true);
  // co-op: whoever went ahead is already on his way
  for (const p of world.activePlayers) if (p.state === 'free') startTraversal(world, e, p);
  if (e.kind !== 'breach' && e.kind !== 'fall' && e.kind !== 'blasted') yield T.traverse;
  world.events.emit('roomTransition', { phase: 'out', kind: e.kind });
  world.transition = true;
  yield T.wipe;
}

/**
 * The stage, room by room, from `roomId` (a checkpoint). Ends with the body-count card when an
 * exit leads nowhere (the last room built). `seed` (STB-08): the checkpoint's saved room seed for
 * the first room (later rooms seed themselves).
 */
export function stageRunner(def: StageDef, roomId = def.start.room, entryId = def.start.entry, seed?: number) {
  return function* stage(s: Seq): Beat {
    const world = s.world;
    let room = roomId, entry = entryId, first: number | undefined = seed;
    for (;;) {
      s.cancelAll('stage');
      enterRoom(world, def, room, entry, first);
      first = undefined;
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
      // STB-04: everyone died on the way out: no next room (and no checkpoint there); the scene
      // restarts this one
      if (world.players.length && world.players.every((p) => !alive(p))) { yield () => false; }
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
