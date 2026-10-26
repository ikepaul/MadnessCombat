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
  corpse?: CorpseState['phase'];
  gibbed?: boolean;
  pinned?: boolean;
  pose: Pose;
  hands: Actor['hands'];
  grenades: number;
  /** M7: grunt variant, and what an unaware enemy is doing (the painter draws the cigarette). */
  variant?: Actor['variant'];
  unaware?: 'stand' | 'smoke' | 'patrol';
}

export interface Snapshot {
  /** Changes when the host (re)starts the room: the guest restarts its scene too. */
  session: number;
  roomId: string;
  tick: number;
  /** Contains every actor (on join and room start); otherwise frozen corpses are left out. */
  full: boolean;
  actors: ActorSnap[];
  items: Item[];
  doors: number[];
  /** M7: props change in play (kicked-over tables). */
  props: World['room']['props'];
  kills: number;
  lastKillKind?: ActorKind;
  /** Sim events since the last snapshot, in order. */
  events: [keyof GameEvents, unknown][];
}

function snapActor(a: World['actors'][number]): ActorSnap {
  return {
    id: a.id, kind: a.kind, playerIndex: a.playerIndex, enemy: !!a.ai,
    pos: [a.pos.x, a.pos.y, a.pos.z], facing: a.facing, state: a.state, stateT: a.stateT,
    hp: a.hp, maxHp: a.maxHp, revive: a.revive, entering: a.entering,
    bodyState: a.body.state, bodyHeight: a.body.height, corpse: a.corpse?.phase, gibbed: a.corpse?.gibbed, pinned: a.corpse?.pinned,
    pose: a.pose, hands: a.hands, grenades: a.grenades,
    variant: a.variant, unaware: a.ai?.aware === false ? a.ai.idle ?? 'stand' : undefined,
  };
}

/** Host side: collects events between snapshots and builds them. */
export class SnapshotWriter {
  private events: [keyof GameEvents, unknown][] = [];
  /** Corpses that froze since the last snapshot: sent once more so the guest bakes the final pose. */
  private justFrozen = new Set<number>();
  needFull = true;

  constructor(private world: World, private session: number) {
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
      session: this.session, roomId: w.room.id, tick: w.tick, full, actors,
      items: w.items, doors: w.doors.map((d) => d.open), props: w.room.props, kills: w.kills, lastKillKind: w.lastKillKind,
      events: full ? [] : this.events,
    };
    this.events = [];
    this.justFrozen.clear();
    this.needFull = false;
    return snap;
  }
}

/**
 * Guest side: copy a snapshot into the puppet world, then replay its events. State first, so
 * event handlers (corpse baking, VFX at an actor) see the actors as of that frame.
 */
export function applySnapshot(world: World, s: Snapshot): void {
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
    a.pose = as.pose;
    a.hands = as.hands;
    a.grenades = as.grenades ?? 0;
    if (as.corpse) a.corpse = { phase: as.corpse, t: 0, raisable: !as.gibbed, gibbed: !!as.gibbed, slumped: false, pinned: as.pinned };
    else a.corpse = undefined;
    if (as.enemy && !a.ai) a.ai = newAiState(world);
    a.kind = as.kind;
    a.variant = as.variant;
    if (a.ai) { a.ai.aware = as.unaware ? false : true; a.ai.idle = as.unaware; }
    if (as.playerIndex !== undefined) {
      a.playerIndex = as.playerIndex;
      world.players[as.playerIndex] = a;
    }
  }
  world.items = s.items;
  if (s.props) world.room.props = s.props;
  s.doors.forEach((open, i) => { if (world.doors[i]) world.doors[i].open = open; });
  world.tick = s.tick;
  for (const [type, payload] of s.events) world.events.emit(type, payload as never);
  // after the replay: the puppet's own kill listener would count the replayed kills again
  world.kills = s.kills;
  world.lastKillKind = s.lastKillKind;
}
