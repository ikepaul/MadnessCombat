// Co-op snapshots (PLAN.md M4b). The host runs the only real simulation; every rendered frame
// it sends player 2's laptop the state needed to draw (actors, items, doors, kill count) plus
// every sim event since the last snapshot. The guest's world is a puppet: it never steps,
// it takes the state and replays the events, so its VFX, decals, corpse baking, sound and
// feel all run from the same events as on the host. Same Wi-Fi only: no prediction.
import type { Actor, ActorKind, ActorState, MoveState, Pose } from '../sim/actor';
import { createActor } from '../sim/actor';
import type { CorpseState } from '../sim/actor';
import type { GameEvents } from '../sim/events';
import type { Item } from '../sim/items';
import type { World } from '../sim/world';
import type { PaletteId } from '../data/palettes';
import { newAiState } from '../sim/ai';

export interface ActorSnap {
  id: number;
  kind: ActorKind;
  playerIndex?: number;
  enemy: boolean;
  pos: [number, number, number];
  facing: 1 | -1;
  state: ActorState;
  stateT: number;
  hp: number;
  maxHp: number;
  revive?: number;
  entering?: boolean;
  bodyState: MoveState;
  bodyHeight: number;
  /** A flying kick under way (the pose leans into it). */
  bodyKick?: boolean;
  /** Climbing out, crawling into a vent... (the guest hides the E prompt meanwhile). */
  traversing?: Actor['traversing'];
  /** Gone ahead through a co-op exit (hidden once out of sight). */
  parked?: string;
  corpse?: CorpseState['phase'];
  gibbed?: boolean;
  pinned?: boolean;
  pose: Pose;
  hands: Actor['hands'];
  grenades: number;
  /** M17: E held with both hands full (the guest's prompt shows the hand chooser). */
  useHeldAt?: number;
  /** M18 co-op moves: who holds this one, what this one holds, carried by the partner (hints, the swung partner's aim). */
  grabbedBy?: number;
  holding?: Actor['holding'];
  carried?: Actor['carried'];
  /** M19: the rage bar (the guest's HUD and the full-rage look). */
  rage?: Actor['rage'];
  /** M7: grunt variant, and what an unaware enemy is doing (the painter draws the cigarette). */
  variant?: Actor['variant'];
  /** M8: the boombox NPC's boombox. */
  carry?: Actor['carry'];
  unaware?: 'stand' | 'smoke' | 'chat' | 'patrol' | 'dance' | 'cower';
  /** M11: hovering (the jetpack: its flames), falling into the void, stuck in the ceiling. */
  hover?: number;
  fallingAway?: number;
  ceilingStuck?: boolean;
}

export interface Snapshot {
  /** Changes when the host (re)starts the room: the guest restarts its scene too. */
  session: number;
  roomId: string;
  /** The host's palette: it decides the colours and whether this stage shows blood. */
  palette?: PaletteId;
  tick: number;
  /** Contains every actor (on join and room start); otherwise frozen corpses are left out. */
  full: boolean;
  actors: ActorSnap[];
  items: Item[];
  doors: number[];
  /** M10: the elevator (shaft scroll, the welder's cut, the cables) and the cab roof's holes. */
  elevator?: World['elevator'];
  decks?: World['room']['decks'];
  /** M11: improbability mode, the collapse (crack / void), falling tanks, the vending machine at the back. */
  physics?: World['physics'];
  gore?: World['gore'];
  /** The room's exits (the guest's E prompt). */
  exits?: World['exits'];
  stage3Room?: Pick<World['room'], 'void' | 'crack' | 'vending' | 'lockWalls' | 'outdoor'>;
  /** M12: the desert box's falling walls and the last stand (the red bars). */
  lockWalls?: World['lockWalls'];
  lastStand?: World['lastStand'];
  /** M19: a rage fatality under way (the guest dims the stopped world, draws the letterbox). */
  rage?: World['rage'];
  blocks?: World['blocks'];
  /** M7: props change in play (kicked-over tables). */
  props: World['room']['props'];
  kills: number;
  /** M8: the boss's cannon (falling, landed, firing) and the balls in flight. */
  cannons?: World['cannons'];
  balls?: World['balls'];
  lastKillKind?: ActorKind;
  /** M14b (UXS-06): the host's pause menu is open (the guest shows "Host paused"). */
  paused?: boolean;
  /** Sim events since the last snapshot, in order. */
  events: [keyof GameEvents, unknown][];
}

function snapActor(a: World['actors'][number]): ActorSnap {
  return {
    id: a.id, kind: a.kind, playerIndex: a.playerIndex, enemy: !!a.ai,
    pos: [a.pos.x, a.pos.y, a.pos.z], facing: a.facing, state: a.state, stateT: a.stateT,
    hp: a.hp, maxHp: a.maxHp, revive: a.revive, entering: a.entering,
    bodyState: a.body.state, bodyHeight: a.body.height, bodyKick: a.body.kick || undefined, traversing: a.traversing, parked: a.parked,corpse: a.corpse?.phase, gibbed: a.corpse?.gibbed, pinned: a.corpse?.pinned,
    pose: a.pose, hands: a.hands, grenades: a.grenades, useHeldAt: a.useHeldAt, grabbedBy: a.grabbedBy, holding: a.holding, carried: a.carried, rage: a.rage,
    variant: a.variant, carry: a.carry, unaware: a.ai?.aware === false ? a.ai.idle ?? 'stand' : undefined,
    hover: a.hover, fallingAway: a.fallingAway, ceilingStuck: a.ceilingStuck,
  };
}

/** Host side: collects events between snapshots and builds them. */
export class SnapshotWriter {
  private events: [keyof GameEvents, unknown][] = [];
  /** Corpses that froze since the last snapshot: sent once more so the guest bakes the final pose. */
  private justFrozen = new Set<number>();
  needFull = true;
  /**
   * The next full snapshot is for a guest who just (re)joined: it skips the buffered events (they
   * belong to a world the guest never saw). A full snapshot for a room change keeps them, or the
   * guest would miss that tick's events (the ink wipe uncovering the new room, M9).
   */
  joining = true;
  /** UXS-06: the host's pause menu is open (sent with the next snapshot). */
  paused = false;

  constructor(private world: World, private session: number, private palette: () => PaletteId = () => 'neutral') {
    world.events.onAny((type, payload) => {
      if (type === 'corpseFrozen') this.justFrozen.add((payload as GameEvents['corpseFrozen']).actorId);
      this.events.push([type, payload]);
    });
  }

  /** No guest connected: forget the buffered events. */
  drop(): void {
    this.events = [];
    this.justFrozen.clear();
  }

  /** Build the next snapshot (JSON-safe) and reset the event buffer. */
  take(): Snapshot {
    const w = this.world, full = this.needFull;
    const actors = w.actors.filter((a) => full || a.corpse?.phase !== 'frozen' || this.justFrozen.has(a.id)).map(snapActor);
    const snap: Snapshot = {
      session: this.session, roomId: w.room.id, palette: this.palette(), tick: w.tick, full, actors,
      items: w.items, doors: w.doors.map((d) => d.open), props: w.room.props, cannons: w.cannons, balls: w.balls, kills: w.kills, lastKillKind: w.lastKillKind,
      elevator: w.elevator, decks: w.room.decks,
      physics: w.physics, gore: w.gore, exits: w.exits, blocks: w.blocks, stage3Room: { void: w.room.void, crack: w.room.crack, vending: w.room.vending, lockWalls: w.room.lockWalls, outdoor: w.room.outdoor },
      lockWalls: w.lockWalls, lastStand: w.lastStand, rage: w.rage, paused: this.paused || undefined,
      events: full && this.joining ? [] : this.events,
    };
    this.events = [];
    this.justFrozen.clear();
    this.needFull = false;
    this.joining = false;
    return snap;
  }
}

/**
 * Guest side: copy a snapshot into the puppet world, then replay its events. State first, so
 * event handlers (corpse baking, VFX at an actor) see the actors as of that frame.
 */
export function applySnapshot(world: World, s: Snapshot): void {
  // M14b (UXS-08): a full snapshot lists every actor: anything else on the guest was removed on the host
  if (s.full) {
    const ids = new Set(s.actors.map((a) => a.id));
    for (let i = world.actors.length - 1; i >= 0; i--) if (!ids.has(world.actors[i].id)) world.actors.splice(i, 1);
  }
  for (const as of s.actors) {
    let a = world.actorById(as.id);
    if (!a) {
      a = createActor(as.kind, as.pos[0], as.pos[2], as.facing);
      a.id = as.id;
      world.actors.push(a);
    }
    a.pos = { x: as.pos[0], y: as.pos[1], z: as.pos[2] };
    a.facing = as.facing;
    a.state = as.state;
    a.stateT = as.stateT;
    a.hp = as.hp;
    a.maxHp = as.maxHp;
    a.revive = as.revive;
    a.entering = as.entering;
    a.body.state = as.bodyState;
    a.body.height = as.bodyHeight;
    a.body.kick = as.bodyKick;
    a.traversing = as.traversing;
    a.parked = as.parked;
    a.pose = as.pose;
    a.hands = as.hands;
    a.grenades = as.grenades ?? 0;
    a.useHeldAt = as.useHeldAt;
    a.grabbedBy = as.grabbedBy;
    a.holding = as.holding;
    a.carried = as.carried;
    a.rage = as.rage;
    if (as.corpse) a.corpse = { phase: as.corpse, t: 0, raisable: !as.gibbed, gibbed: !!as.gibbed, slumped: false, pinned: as.pinned };
    else a.corpse = undefined;
    if (as.enemy && !a.ai) a.ai = newAiState(world);
    a.kind = as.kind;
    a.variant = as.variant;
    a.hover = as.hover;
    a.fallingAway = as.fallingAway;
    a.ceilingStuck = as.ceilingStuck;
    a.carry = as.carry;
    if (a.ai) { a.ai.aware = as.unaware ? false : true; a.ai.idle = as.unaware; }
    if (as.playerIndex !== undefined) {
      a.playerIndex = as.playerIndex;
      world.players[as.playerIndex] = a;
    }
  }
  world.items = s.items;
  if (s.props) world.room.props = s.props;
  world.elevator = s.elevator;
  if (s.physics) world.physics = s.physics;
  if (s.gore) world.gore = s.gore;
  if (s.exits) world.exits = s.exits;
  if (s.blocks) world.blocks = s.blocks;
  if (s.stage3Room) {
    world.room.void = s.stage3Room.void; world.room.crack = s.stage3Room.crack; world.room.vending = s.stage3Room.vending;
    world.room.lockWalls = s.stage3Room.lockWalls; world.room.outdoor = s.stage3Room.outdoor;
  }
  if (s.lockWalls) world.lockWalls = s.lockWalls;
  world.lastStand = s.lastStand;
  world.rage = s.rage;
  if (s.decks) world.room.decks = s.decks;
  if (s.cannons) world.cannons = s.cannons;
  if (s.balls) world.balls = s.balls;
  s.doors.forEach((open, i) => { if (world.doors[i]) world.doors[i].open = open; });
  world.tick = s.tick;
  for (const [type, payload] of s.events) {
    // UXS-08: the host spliced an actor out (a script, the void, a sweep): the puppet drops it too
    if (type === 'actorRemoved') {
      const id = (payload as GameEvents['actorRemoved']).actorId;
      const i = world.actors.findIndex((a) => a.id === id);
      if (i >= 0) world.actors.splice(i, 1);
    }
    world.events.emit(type, payload as never);
  }
  // after the replay: the puppet's own kill listener would count the replayed kills again
  world.kills = s.kills;
  world.lastKillKind = s.lastKillKind;
}
