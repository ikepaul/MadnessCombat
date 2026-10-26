// Feel layer (PLAN.md M4, design/art-direction.md effects table): turns sim events into
// hit-stop, screen shake, chromatic split and kill-cam requests. Plain TS so the numbers can
// be asserted in tests; the render side (src/render/feelFx.ts) and the audio engine carry them out.
import { FEEL } from '../data/feel';
import type { HitKind } from '../sim/events';
import type { World } from '../sim/world';

export interface FeelSink {
  /** Freeze the world for `seconds` (already clamped to the per-second budget). */
  hitStop(seconds: number): void;
  shake(px: number, decay: number): void;
  chromatic(px: number, frames: number): void;
  killCam(): void;
}

const HEAVY_KINDS: HitKind[] = ['heavy', 'uppercut', 'finisher', 'sweep', 'body', 'wall'];

export class FeelDirector {
  /** Hit-stop granted in the last second: [time, seconds]. */
  private stops: [number, number][] = [];
  private kills: number[] = [];

  /** `now` = seconds of clock time including frozen ticks (the hit-stop budget is per second of that). */
  constructor(world: World, private sink: FeelSink, private now: () => number) {
    world.events.on('hit', (e) => {
      if (e.killed || e.damage <= 0) return; // kills are handled on `kill`
      const target = world.actorById(e.actorId);
      if (target?.kind === 'hero') {
        this.stop(FEEL.hitStop.light);
        this.sink.shake(FEEL.shake.hurt, FEEL.shake.decayMin + 0.1);
        return;
      }
      const heavy = HEAVY_KINDS.includes(e.kind) || e.damage >= 2;
      this.stop(heavy ? FEEL.hitStop.heavy : FEEL.hitStop.light);
      // a combo hit lands harder
      const combo = e.combo ? 1.5 : 1;
      this.sink.shake((heavy ? FEEL.shake.heavyHit : FEEL.shake.lightHit) * combo, FEEL.shake.decayMin);
    });
    world.events.on('kill', (e) => {
      if (world.actorById(e.actorId)?.kind === 'hero') {
        this.sink.shake(FEEL.shake.kill, FEEL.shake.decayMax);
        return;
      }
      this.stop(FEEL.hitStop.kill);
      this.sink.shake(FEEL.shake.kill, FEEL.shake.decayMax);
      this.sink.chromatic(FEEL.chromatic.kill.px, FEEL.chromatic.kill.frames);
      const t = this.now();
      this.kills = this.kills.filter((k) => t - k < FEEL.killCam.comboWindow);
      this.kills.push(t);
      const multi = this.kills.length >= FEEL.killCam.comboKills;
      const lastOfWave = world.director?.waveFinished(world) ?? false;
      if (multi || lastOfWave) {
        this.kills = [];
        this.sink.killCam();
      }
    });
    world.events.on('wallHit', (e) => {
      if (e.speed > 2) this.sink.shake(FEEL.shake.wall, FEEL.shake.decayMin + 0.1);
    });
  }

  /** Hit-stop within the budget: never more than FEEL.hitStop.maxPerSecond in any second. */
  stop(seconds: number): void {
    const t = this.now();
    this.stops = this.stops.filter(([at]) => t - at < 1);
    const used = this.stops.reduce((n, [, s]) => n + s, 0);
    const grant = Math.min(seconds, FEEL.hitStop.maxPerSecond - used);
    if (grant < 1 / 60) return;
    this.stops.push([t, grant]);
    this.sink.hitStop(grant);
  }
}
