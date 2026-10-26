import Phaser from 'phaser';
import { FEEL } from '../data/feel';
import { SCREEN_H, SCREEN_W } from './camera';

/**
 * Post-processing on the game camera (design/art-direction.md, "Post"): a soft radial vignette
 * overlay (Phaser's Vignette filter has a hard edge, so we bake the style frame's gradient)
 * and animated film grain as a tiling overlay. Chromatic split and the kill-cam tint are
 * stubs here and get their shaders/timing in M4. The HUD lives in UIScene so none of this
 * touches it.
 */
export class PostFx {
  private grain: Phaser.GameObjects.TileSprite;
  private vignette: Phaser.GameObjects.Image;
  private killCamTint: Phaser.Filters.ColorMatrix;
  enabled = true;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.killCamTint = cam.filters.external.addColorMatrix();
    this.killCamTint.setActive(false);

    const key = 'fx-grain';
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(key, 256, 256)!;
      const ctx = tex.context;
      const img = ctx.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    const vKey = 'fx-vignette';
    if (!scene.textures.exists(vKey)) {
      const tex = scene.textures.createCanvas(vKey, SCREEN_W, SCREEN_H)!;
      const ctx = tex.context, cy = SCREEN_H * 0.52;
      const g = ctx.createRadialGradient(SCREEN_W / 2, cy, SCREEN_H * FEEL.post.vignetteInner, SCREEN_W / 2, cy, SCREEN_H * FEEL.post.vignetteOuter);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${FEEL.post.vignetteStrength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      tex.refresh();
    }
    this.vignette = scene.add.image(0, 0, vKey).setOrigin(0, 0).setDepth(999);
    this.grain = scene.add.tileSprite(0, 0, SCREEN_W, SCREEN_H, key).setOrigin(0, 0).setDepth(1000).setAlpha(FEEL.post.grainAlpha);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.grain.setVisible(on);
    this.vignette.setVisible(on);
  }

  /** Called once per rendered frame: re-rolls the grain offset. */
  update(): void {
    if (!this.enabled) return;
    this.grain.setTilePosition(Math.random() * 256, Math.random() * 256);
  }

  /** M4: RGB split of `px` pixels for the current frame. */
  chromatic(_px: number): void {}

  /** M4: kill-cam red tint, strength 0..1. */
  killCam(strength: number): void {
    this.killCamTint.setActive(strength > 0);
  }
}
