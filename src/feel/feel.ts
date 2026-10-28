// Feel layer (PLAN.md M4, design/art-direction.md effects table): turns sim events into
// hit-stop, screen shake, chromatic split and kill-cam requests. Plain TS so the numbers can
// be asserted in tests; the render side (src/render/feelFx.ts) and the audio engine carry them out.
import { FEEL } from '../data/feel';
import { WEAPONS } from '../data/weapons';
import type { HitKind } from '../sim/events';
import type { World } from '../sim/world';

export interface FeelSink {
  /** Freeze the world for `seconds` (already clamped to the per-second budget). */
  hitStop(seconds: number): void;
  shake(px: number, decay: number): void;
  chromatic(px: number, frames: number): void;
  /** `at` = the kill's world point (revamp C1: the camera leans in toward it). */
  killCam(at?: { x: number; y: number; z: number }): void;
  /** M19: hold time at `scale` for `seconds` of real time (a rage fatality's slow-mo); 0 seconds ends it. */
  slowMo?(scale: number, seconds: number): void;
}

const HEAVY_KINDS: HitKind[] = ['heavy', 'uppercut', 'finisher', 'sweep', 'body', 'wall', 'slash', 'smash', 'stab', 'knife', 'blast', 'pin'];

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
    // M19 rage fatalities (design/rage.md 2.4): their own slow-mo and hits, outside the hit-stop budget
    world.events.on('rageStart', () => this.sink.slowMo?.(FEEL.rage.runScale, 60));
    world.events.on('rageBeat', (e) => {
      if (e.beat === 'ignite') { this.sink.shake(FEEL.shake.heavyHit, FEEL.shake.decayMax); this.sink.chromatic(FEEL.chromatic.kill.px, 2); }
      if (e.beat === 'strike') { this.sink.hitStop(FEEL.rage.strikeStop); this.sink.shake(FEEL.rage.strikeShake, FEEL.shake.decayMin); this.sink.chromatic(4, 2); }
      if (e.beat === 'shot') this.sink.hitStop(FEEL.hitStop.light);
      if (e.beat === 'release') { this.sink.shake(FEEL.rage.releaseShake, FEEL.shake.decayMax); this.sink.chromatic(FEEL.chromatic.killCam.px, 3); }
    });
    world.events.on('rageEnd', () => this.sink.slowMo?.(FEEL.rage.releaseScale, FEEL.rage.releaseSlow));
    world.events.on('kill', (e) => {
      if (e.rage) return; // a rage fatality's kills: its own feel, no kill cam
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
      // art direction: a boss phase ending gets the kill cam too
      const boss = world.actorById(e.actorId)?.kind === 'boss';
      if (multi || lastOfWave || boss) {
        this.kills = [];
        this.sink.killCam({ x: e.x, y: e.y + 0.6, z: e.z });
      }
    });
    // M10b: every fatality gets the kill cam (the reward is feel only); launches and bounces thump the screen
    world.events.on('fatality', () => {
      this.stop(FEEL.hitStop.kill);
      this.sink.killCam();
    });
    world.events.on('juggle', (e) => { if (e.phase === 'launch' || e.phase === 'bounce') this.sink.shake(FEEL.shake.heavyHit, FEEL.shake.decayMin); });
    world.events.on('wallBounce', () => this.sink.shake(FEEL.shake.lightHit, FEEL.shake.decayMin));
    // M18: bats and spin sweeps land hard; a ping-pong bounce is a light thump
    world.events.on('coopMove', (e) => {
      if (e.kind === 'bat' || (e.kind === 'spin' && e.phase === 'hit')) { this.stop(FEEL.hitStop.heavy); this.sink.shake(FEEL.shake.heavyHit * 1.5, FEEL.shake.decayMin); }
      else if (e.kind === 'pingpong') this.sink.shake(FEEL.shake.lightHit * 2, FEEL.shake.decayMin);
    });
    // shake per weapon (design/art-direction.md: pistol 2 px, SMG 1, shotgun 6)
    world.events.on('shot', (e) => this.sink.shake(WEAPONS[e.weapon].shake, FEEL.shake.decayMin));
    // throw-grenade: explosion shake 14 px, chromatic, a short freeze
    world.events.on('explosion', () => {
      this.stop(FEEL.hitStop.kill);
      this.sink.shake(FEEL.shake.explosion, FEEL.shake.decayMax);
      this.sink.chromatic(FEEL.chromatic.kill.px, FEEL.chromatic.kill.frames);
    });
    // M8: scripted shakes (a landing boss, a falling cannon); the boss's lightning cracks the screen
    world.events.on('cameraShake', (e) => this.sink.shake(e.px, e.seconds));
    // art direction: boss slam 10 px, with a short freeze on each impact
    world.events.on('bossSlam', () => {
      this.stop(FEEL.hitStop.light);
      this.sink.shake(FEEL.shake.bossSlam, FEEL.shake.decayMin + 0.1);
    });
    world.events.on('lightning', () => {
      this.sink.shake(FEEL.shake.lightning, FEEL.shake.decayMin + 0.1);
      this.sink.chromatic(FEEL.chromatic.kill.px, FEEL.chromatic.kill.frames);
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
