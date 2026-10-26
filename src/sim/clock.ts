import { TUNING } from '../data/tuning';

/**
 * Fixed-step clock. Real time goes in, whole 60 Hz ticks come out. Slow-motion (timeScale),
 * hit-stop (ticks that pass without stepping the world), pause and single-frame stepping
 * are all handled here, so the sim never sees variable time.
 */
export class FixedClock {
  readonly dt = 1 / TUNING.simHz;
  timeScale = 1;
  paused = false;
  /** Ticks completed since start (including hit-stop ticks). */
  tick = 0;
  private acc = 0;
  private hitStopTicks = 0;
  private pendingSteps = 0;

  /** Freeze the world for `seconds` of (scaled) time. Overlapping requests keep the longest. */
  hitStop(seconds: number): void {
    this.hitStopTicks = Math.max(this.hitStopTicks, Math.round(seconds / this.dt));
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
    if (this.paused) {
      while (this.pendingSteps > 0) {
        this.pendingSteps--;
        this.tick++;
        step();
        steps++;
      }
      return steps;
    }
    // Clamp so a long hitch (tab switch) can't trigger a catch-up spiral.
    this.acc += Math.min(realSeconds, 0.25) * this.timeScale;
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
