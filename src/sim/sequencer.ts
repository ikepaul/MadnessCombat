// Sequencer for scripted beats (PLAN.md M8): intros, cutscenes and set-piece events as coroutine
// scripts that run inside the sim, stepped by the World at 60 Hz. A script is a generator: it
// yields how long to wait (seconds, or a condition checked every tick) and calls the commands
// below in between. Scripts only touch the sim and emit events, so they run headless in tests and
// the co-op guest sees their effects through the replayed events. Reused by every later stage.
import { isWeapon, WEAPONS } from '../data/weapons';
import { type Actor, type ActorKind, createActor, type HeldItem, newHand } from './actor';
import { IDLE_COMMAND, type PlayerCommand } from './command';
import type { GameEvents } from './events';
import type { Item, ItemKind } from './items';
import { type RoomScript, type SpawnOpts, spawnEnemy, WaveDirector } from './waves';
import type { World } from './world';

/** What a script yields: seconds to wait, a condition to wait for, or nothing (= the next tick). */
export type Wait = number | (() => boolean) | void;
export type Beat<R = void> = Generator<Wait, R, void>;
export type Script = (s: Seq) => Beat;

/** A running script. */
export interface Task {
  readonly name: string;
  done: boolean;
  cancel(): void;
}

interface TaskState extends Task {
  gen: Beat;
  wait: number | (() => boolean);
}

/** Arrival distance for moveTo (H). invented */
const ARRIVE = 0.08;
/** moveTo gives up after this long by default (s), so a blocked walk can't stall a stage. invented */
const MOVE_TIMEOUT = 6;

/** The commands a script can use. One per World (`world.seq`). */
export class Seq {
  private tasks: TaskState[] = [];

  constructor(readonly world: World) {}

  /** Start a script; it runs alongside the others from the next tick. */
  run(script: Script, name = script.name || 'script'): Task {
    const t: TaskState = {
      name, done: false, gen: script(this), wait: 0,
      cancel: () => { if (!t.done) { t.done = true; t.gen.return(); } },
    };
    this.tasks.push(t);
    return t;
  }

  /** Scripts still running. */
  get busy(): boolean {
    return this.tasks.some((t) => !t.done);
  }

  /** Called by World.step before the actors move: resumes every task whose wait is over. */
  step(dt: number): void {
    for (const t of this.tasks) {
      if (t.done) continue;
      if (typeof t.wait === 'number') {
        t.wait -= dt;
        if (t.wait > 1e-9) continue;
      } else if (!t.wait()) continue;
      const r = t.gen.next();
      if (r.done) t.done = true;
      else t.wait = r.value ?? 0;
    }
    this.tasks = this.tasks.filter((t) => !t.done);
  }

  // ---- waiting ----

  /** Wait `seconds` of world time. */
  *wait(seconds: number): Beat {
    yield seconds;
  }

  /** Wait until `cond` holds; true if it did, false if `timeout` seconds ran out first. */
  *until(cond: () => boolean, timeout = Infinity): Beat<boolean> {
    const end = this.world.time + timeout;
    yield () => cond() || this.world.time >= end;
    return cond();
  }

  /** Wait until every task in `tasks` has finished. */
  *join(...tasks: Task[]): Beat {
    yield () => tasks.every((t) => t.done);
  }

  // ---- actors ----

  /**
   * Walk `a` to (x, z) by steering its command (a player's input is ignored meanwhile).
   * True on arrival, false if it timed out or the actor stopped being able to walk.
   */
  *moveTo(a: Actor, x: number, z: number, timeout = MOVE_TIMEOUT): Beat<boolean> {
    const end = this.world.time + timeout;
    try {
      for (;;) {
        const dx = x - a.pos.x, dz = z - a.pos.z, d = Math.hypot(dx, dz);
        if (d <= ARRIVE) return true;
        if (a.state === 'dead' || this.world.time >= end) return false;
        // full speed until close, then ease in so it doesn't overshoot
        const k = Math.min(1, d / 0.3) / d;
        this.steer(a, { moveX: dx * k, moveZ: dz * k, face: dx === 0 ? a.facing : (Math.sign(dx) as 1 | -1) });
        yield;
      }
    } finally {
      this.release(a);
    }
  }

  /** Drive `a` with this command (merged over idle) until release(); edges fire once. */
  steer(a: Actor, cmd: Partial<PlayerCommand>): void {
    const prev = this.world.scripted.get(a.id);
    this.world.scripted.set(a.id, { ...IDLE_COMMAND, ...prev, ...cmd });
  }

  /** One-tick command for `a` (a punch, a jump): its edges fire on the next tick, then it lets go. */
  *act(a: Actor, cmd: Partial<PlayerCommand>): Beat {
    this.steer(a, cmd);
    yield;
    this.release(a);
  }

  /** Hand `a` back to its brain or its player. */
  release(a: Actor): void {
    this.world.scripted.delete(a.id);
  }

  /** Players' input is ignored (cutscenes). Scripted commands still drive them. */
  lockInput(on: boolean): void {
    this.world.inputLocked = on;
  }

  /** An enemy with the grunt AI, standing at (x, z) or walking in if x is off-screen. */
  spawn(kind: ActorKind, held: HeldItem, x: number, z: number, opts?: SpawnOpts): Actor {
    return spawnEnemy(this.world, kind, held, x, z, opts);
  }

  /** A scripted character without AI (NPCs, the boss's puppet moves): only scripts drive it. */
  place(kind: ActorKind, x: number, z: number, facing: 1 | -1, held: HeldItem = null): Actor {
    const a = createActor(kind, x, z, facing, { held });
    this.world.actors.push(a);
    this.world.events.emit('spawn', { actorId: a.id, x, y: 0, z });
    return a;
  }

  /** Put `item` straight into a hand (loaded guns come with a spare magazine), or add a grenade. */
  giveItem(a: Actor, item: Exclude<HeldItem, null> | 'grenade', hand: 0 | 1 = 0): void {
    if (item === 'grenade') { a.grenades++; return; }
    a.hands[hand] = newHand(item);
  }

  /** Drop an item at (x, z) for a scripted pickup, falling from height `y`; guns come loaded. */
  drop(kind: Exclude<ItemKind, 'head'>, x: number, z: number, y = 0.6): Item {
    const it = this.world.spawnItem(kind, 'grunt', { x, y, z }, { x: 0, y: 1, z: 0 }, 6);
    if (isWeapon(kind)) { it.ammo = WEAPONS[kind].mag; it.spare = 1; }
    return it;
  }

  // ---- presentation (events only; the HUD, camera and music system carry them out) ----

  /** A text card: `title` = full screen on black, `caption` = a line at the bottom. Waits while it shows. */
  *card(text: string, seconds: number, style: GameEvents['card']['style'] = 'title'): Beat {
    this.world.events.emit('card', { text, seconds, style });
    yield seconds;
  }

  cameraShake(px: number, seconds: number): void {
    this.world.events.emit('cameraShake', { px, seconds });
  }

  /** Switch the music to a cue in assets/music/cues.json (null = ambience only). */
  music(cue: string | null): void {
    this.world.events.emit('music', { cue });
  }

  // ---- waves ----

  /**
   * Run a wave script in the room and wait until all of it is dead. Unlike a room's own script it
   * doesn't announce `roomCleared`: the stage script decides when the stage is over.
   */
  *waves(script: RoomScript, startWave = 0): Beat {
    const d = new WaveDirector(script, startWave, false);
    this.world.director = d;
    yield () => d.state === 'done';
  }

  /** The stage is over: the HUD shows the body-count card. */
  clear(): void {
    this.world.events.emit('roomCleared', { kills: this.world.kills });
  }
}
