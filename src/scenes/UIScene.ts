import Phaser from 'phaser';
import { drawDebugGrid, rulerLabels } from '../render/debugOverlay';
import type { GameScene } from './GameScene';

/** HUD + debug overlay. A separate scene/camera so post FX never touch it. */
export class UIScene extends Phaser.Scene {
  private grid!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private rulers: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('ui');
  }

  create(): void {
    const game = this.scene.get('game') as GameScene;
    this.grid = this.add.graphics();
    drawDebugGrid(this.grid, game.world.room);
    this.rulers = rulerLabels(game.world.room).map((l) =>
      this.add.text(l.x, l.y, l.text, { fontFamily: 'Inter', fontSize: '18px', color: '#ff8c00' }),
    );
    this.info = this.add.text(16, 12, '', { fontFamily: 'Inter', fontSize: '18px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 8, y: 4 } });
  }

  update(): void {
    const game = this.scene.get('game') as GameScene;
    const on = game.overlay;
    this.grid.setVisible(on);
    for (const r of this.rulers) r.setVisible(on);
    this.info.setVisible(on);
    if (!on) return;
    const c = game.clock;
    this.info.setText(
      `tick ${game.world.tick}  ·  ${this.game.loop.actualFps.toFixed(0)} fps  ·  ${c.paused ? 'PAUSED (F4 step)' : `${c.timeScale}×`}  ·  palette ${game.paletteId}`,
    );
  }
}
