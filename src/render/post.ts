import Phaser from 'phaser';
import { FEEL } from '../data/feel';
import { SCREEN_H, SCREEN_W } from './camera';

/**
 * Post-processing on the game camera (design/art-direction.md, "Post"): a soft radial vignette
 * overlay (Phaser's Vignette filter has a hard edge, so we bake the style frame's gradient)
 * and animated film grain as a tiling overlay. Chromatic split = red and cyan copies of the
 * actor layer added on top, offset sideways; the kill-cam tint is a red wash over the room.
 * Timing lives in src/render/feelFx.ts. The HUD is in UIScene so none of this touches it.
 */
export class PostFx {
  private grain: Phaser.GameObjects.TileSprite;
  private vignette: Phaser.GameObjects.Image;
  private split: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private tint: Phaser.GameObjects.Rectangle;
  enabled = true;

  /** `actorKey` = the texture of the per-frame actor layer (what the split copies). */
  constructor(scene: Phaser.Scene, actorKey: string) {
    const copy = (color: number) =>
      scene.add.image(0, 0, actorKey).setOrigin(0, 0).setDepth(11).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45).setVisible(false);
    this.split = [copy(0xff2020), copy(0x20ffff)];
    this.tint = scene.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0xc70f1b, 1).setOrigin(0, 0).setDepth(998).setAlpha(0);

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

  /** RGB split of `px` pixels this frame (0 = off). */
  chromatic(px: number): void {
    const on = px > 0;
    this.split[0].setVisible(on).setX(-px);
    this.split[1].setVisible(on).setX(px);
  }

  /** Kill-cam red tint, alpha 0..1 (the art direction asks for 5-15%). */
  killCam(alpha: number): void {
    this.tint.setAlpha(alpha);
  }
}
