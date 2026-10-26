import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from './camera';

/**
 * A full-screen Canvas 2D surface shown as a Phaser image. The vector painters draw into
 * `ctx`; `upload()` pushes the pixels to the GPU. Static layers (room) upload once per
 * change, dynamic layers (actors) once per rendered frame.
 */
export class CanvasLayer {
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, key: string, depth: number) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, SCREEN_W, SCREEN_H);
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
    this.texture.refresh();
  }
}
