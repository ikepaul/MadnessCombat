import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from './camera';

/**
 * A full-screen Canvas 2D surface shown as a Phaser image. The vector painters draw into
 * `ctx`; `upload()` pushes the pixels to the GPU. Static layers (room, decals, corpses) mark
 * themselves dirty and upload at most once per frame (`flush()`), dynamic layers (actors)
 * upload every rendered frame.
 */
export class CanvasLayer {
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly image: Phaser.GameObjects.Image;
  private dirty = false;

  constructor(scene: Phaser.Scene, key: string, depth: number) {
    // a restart (every death) reuses the layer's canvas: making four new full-screen canvases
    // each time stalled the restart for up to ~1.6 s while the old ones were torn down (M13)
    const old = scene.textures.exists(key) ? scene.textures.get(key) : undefined;
    if (old instanceof Phaser.Textures.CanvasTexture && old.width === SCREEN_W && old.height === SCREEN_H) {
      this.texture = old;
      // drop any drawing state (alpha, filters, clip) the last scene left on the context
      this.ctx.reset?.();
      this.clear();
      this.texture.refresh();
      this.image = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
      return;
    }
    if (old) scene.textures.remove(key);
    // Create the 2D context ourselves first: Phaser's own canvas textures ask for
    // willReadFrequently, which keeps the canvas in CPU memory and makes every upload of a
    // 1920x1080 layer cost ~30 ms. Without it the browser keeps the canvas on the GPU.
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    canvas.getContext('2d', { willReadFrequently: false });
    const tex = scene.textures.addCanvas(key, canvas);
    if (!tex) throw new Error(`could not create canvas texture ${key}`);
    this.texture = tex;
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
  }

  get ctx(): CanvasRenderingContext2D {
    return this.texture.context;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
  }

  upload(): void {
    this.dirty = false;
    this.texture.refresh();
  }

  /** Upload on the next flush() (several changes in one frame cost one upload). */
  markDirty(): void {
    this.dirty = true;
  }

  flush(): void {
    if (this.dirty) this.upload();
  }
}
