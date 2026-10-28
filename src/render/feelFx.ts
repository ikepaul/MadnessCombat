// Render/audio side of the feel layer (src/feel/feel.ts decides, this carries it out): screen
// shake on the game camera, chromatic split frames, the kill cam (time x0.3, red tint, audio
// low-pass) and hit-stop on the clock. Shake, flashes and chromatic follow the effect-intensity
// setting; hit-stop and the kill cam's timing don't (they're gameplay timing).
import Phaser from 'phaser';
import type { AudioEngine } from '../audio/mixer';
import { FEEL, INTENSITY_SCALE } from '../data/feel';
import type { FeelSink } from '../feel/feel';
import { effectLevel } from '../settings';
import type { FixedClock } from '../sim/clock';
import type { PostFx } from './post';
import { project, SCREEN_H, SCREEN_W } from './camera';

/** 30 fps frames -> seconds. */
const FRAME = 1 / 30;

export class FeelFx implements FeelSink {
  private shakes: { px: number; decay: number; t: number }[] = [];
  private chromaPx = 0;
  private chromaLeft = 0;
  private killCamLeft = 0;
  private slowLeft = 0;
  private slowScale = 1;
  /** Revamp C1: the kill-cam's screen point; the camera zooms in toward it. */
  private zoomAt: [number, number] = [SCREEN_W / 2, SCREEN_H / 2];

  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private clock: FixedClock, private post: PostFx, private audio?: AudioEngine) {}

  private get k(): number {
    return INTENSITY_SCALE[effectLevel()];
  }

  hitStop(seconds: number): void {
    this.clock.hitStop(seconds);
  }

  shake(px: number, decay: number): void {
    if (this.k > 0) this.shakes.push({ px: px * this.k, decay, t: 0 });
  }

  chromatic(px: number, frames: number): void {
    if (this.k <= 0) return;
    this.chromaPx = Math.max(this.chromaPx, px * this.k);
    this.chromaLeft = Math.max(this.chromaLeft, frames * FRAME);
  }

  /** M19: a rage fatality's slow-mo (real seconds; 0 ends it). */
  slowMo(scale: number, seconds: number): void {
    this.slowScale = scale;
    this.slowLeft = seconds;
  }

  killCam(at?: { x: number; y: number; z: number }): void {
    this.killCamLeft = FEEL.killCam.duration;
    this.zoomAt = at ? project(at.x, at.y, at.z) : [SCREEN_W / 2, SCREEN_H / 2];
    this.chromatic(FEEL.chromatic.killCam.px, 1); // chromatic on the first frame
    this.audio?.killCam(FEEL.killCam.duration);
  }

  get killCamActive(): boolean {
    return this.killCamLeft > 0;
  }

  /**
   * Revamp C1: during the kill cam the camera zooms in up to FEEL.killCam.zoom (in fast, out over
   * the last 40%) and leans toward the kill, never far enough to show past the room's edges.
   * Returns the scroll for it; zoom 1 / no scroll otherwise.
   */
  private punchIn(): [number, number] {
    const d = FEEL.killCam.duration, t = d - this.killCamLeft;
    const env = this.killCamLeft <= 0 ? 0 : Math.min(1, t / 0.12, this.killCamLeft / (d * 0.4));
    const z = 1 + FEEL.killCam.zoom * env * Math.min(1, this.k * 2);
    this.camera.setZoom(z);
    if (z <= 1) return [0, 0];
    const lx = (SCREEN_W / 2) * (1 - 1 / z), ly = (SCREEN_H / 2) * (1 - 1 / z);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return [lx * clamp((this.zoomAt[0] - SCREEN_W / 2) / (SCREEN_W / 2)), ly * clamp((this.zoomAt[1] - SCREEN_H / 2) / (SCREEN_H / 2))];
  }

  /** Once per rendered frame with real elapsed seconds. */
  update(realDt: number): void {
    // kill cam runs on real time: 0.6 s of slow motion, tint fading out over the last third
    if (this.killCamLeft > 0) {
      this.killCamLeft = Math.max(0, this.killCamLeft - realDt);
      this.clock.feelScale = this.killCamLeft > 0 ? FEEL.killCam.timeScale : 1;
      const fade = Math.min(1, this.killCamLeft / (FEEL.killCam.duration / 3));
      this.post.killCam(FEEL.killCam.tint * fade * Math.max(0.5, this.k));
    } else {
      this.clock.feelScale = 1;
      this.post.killCam(0);
    }

    // shakes decay linearly over their time; the strongest one wins, random direction per frame
    let px = 0;
    for (const s of this.shakes) {
      s.t += realDt;
      px = Math.max(px, s.px * Math.max(0, 1 - s.t / s.decay));
    }
    this.shakes = this.shakes.filter((s) => s.t < s.decay);
    const a = Math.random() * Math.PI * 2;
    const [zx, zy] = this.punchIn();
    this.camera.setScroll(zx + (px ? Math.cos(a) * px : 0), zy + (px ? Math.sin(a) * px : 0));

    this.post.chromatic(this.chromaLeft > 0 ? this.chromaPx : 0);
    this.chromaLeft = Math.max(0, this.chromaLeft - realDt);
    if (this.chromaLeft <= 0) this.chromaPx = 0;
    // M19: a rage fatality's slow-mo, eased back over its last 0.2 s
    if (this.slowLeft > 0) {
      this.slowLeft = Math.max(0, this.slowLeft - realDt);
      const ease = Math.min(1, this.slowLeft / 0.2);
      this.clock.feelScale = Math.min(this.clock.feelScale, 1 - (1 - this.slowScale) * ease);
    }
  }
}
