import { TUNING } from '../data/tuning';

/**
 * Fixed-step clock. Real time goes in, whole 60 Hz ticks come out. Slow-motion (timeScale),
 * hit-stop (ticks that pass without stepping the world), pause and single-frame stepping
 * are all handled here, so the sim never sees variable time.
 *
 * M14b (VIS-10 / STB-10 / STB-11 / STB-07 / UXS-05, one clock change): two pauses, the debug one
 * (F3, `paused`, F4 steps through it) and the pause menu (`pausedByMenu`, nothing runs); either
 * one halts the feel FX and the death timer too (`halted`). Hit-stop is asked for in real
 * seconds: inside a feel slow-mo (the kill cam, a rage fatality) it is divided by the slow-mo, so
 * a freeze never lasts longer than asked (and a short one inside slow-mo is skipped).
 */
export class FixedClock {
  readonly dt = 1 / TUNING.simHz;
  /** Debug slow-motion (F2). */
  timeScale = 1;
  /** Feel slow-motion (kill cam, rage fatality), multiplied with timeScale. */
  feelScale = 1;
  /** Debug pause (F3): F4 steps one tick at a time. */
  paused = false;
  /** The pause menu is open: nothing advances, F4 included. */
  pausedByMenu = false;
  /** Ticks completed since start (including hit-stop ticks). */
  tick = 0;
  /** Real seconds that passed while not halted (the hit-stop budget counts these). */
  realTime = 0;
  private acc = 0;
  private hitStopTicks = 0;
  private pendingSteps = 0;

  /** Either pause is on: the sim, feel FX, kill-cam filter and death timer all wait. */
  get halted(): boolean {
    return this.paused || this.pausedByMenu;
  }

  /**
   * Freeze the world for `seconds` of real time. Overlapping requests keep the longest. Inside a
   * feel slow-mo the ticks are scaled down by it (a 2-frame stop in the kill cam is not 3.3x longer).
   */
  hitStop(seconds: number): void {
    const ticks = Math.round((seconds * Math.min(1, this.feelScale)) / this.dt);
    this.hitStopTicks = Math.max(this.hitStopTicks, ticks);
  }

  get frozen(): boolean {
    return this.hitStopTicks > 0;
  }

  /** While paused, run exactly one world step on the next advance(). */
  stepOnce(): void {
    this.pendingSteps++;
  }

  /** Feed real elapsed seconds; calls `step` once per world tick. Returns world steps run. */
  advance(realSeconds: number, step: () => void): number {
    let steps = 0;
    if (this.pausedByMenu) return 0;
    if (this.paused) {
      // F4: one tick per press; a tick inside a hit-stop is a frozen tick, like a real one
      while (this.pendingSteps > 0) {
        this.pendingSteps--;
        this.tick++;
        if (this.hitStopTicks > 0) { this.hitStopTicks--; continue; }
        step();
        steps++;
      }
      return steps;
    }
    // Clamp so a long hitch (tab switch) can't trigger a catch-up spiral.
    const real = Math.min(realSeconds, 0.25);
    this.realTime += real;
    this.acc += real * this.timeScale * this.feelScale;
    while (this.acc >= this.dt) {
      this.acc -= this.dt;
      this.tick++;
      if (this.hitStopTicks > 0) {
        this.hitStopTicks--;
        continue;
      }
      step();
      steps++;
    }
    return steps;
  }

  /** Fraction of a tick accumulated, for render interpolation. */
  get alpha(): number {
    return this.acc / this.dt;
  }
}

/**
 * The death -> restart wait (PLAN.md M3: 2 s, then the room restarts). M14b (STB-07 / UXS-14): it
 * holds while the clock is halted, starts over whenever someone is standing again, and after
 * `skipAfter` s dead any action key restarts at once. Pure, so it can be tested without Phaser.
 */
export class DeathTimer {
  t = 0;
  constructor(readonly delay = 2, readonly skipAfter = 0.8 /* invented */) {}

  /** One rendered frame. `dead` = nobody left standing (and no ending / end card). Returns true: restart now. */
  update(dt: number, o: { dead: boolean; halted: boolean; anyKey: boolean; timeScale?: number }): boolean {
    if (!o.dead) { this.t = 0; return false; }
    if (o.halted) return false;
    this.t += dt * (o.timeScale ?? 1);
    return this.t >= this.delay || (o.anyKey && this.t >= this.skipAfter);
  }
}
