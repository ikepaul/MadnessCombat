import Phaser from 'phaser';
import { rootToWorld } from '../anim/skeleton';
import { INK } from '../data/palettes';
import { project } from '../render/camera';
import { drawDebugGrid, rulerLabels } from '../render/debugOverlay';
import { type Actor, stateLabel } from '../sim/actor';
import { BODY, HEAD } from '../sim/hurtbox';
import type { GameScene } from './GameScene';

/** HUD + debug overlay. A separate scene/camera so post FX never touch it. */
export class UIScene extends Phaser.Scene {
  private grid!: Phaser.GameObjects.Graphics;
  private hurt!: Phaser.GameObjects.Graphics;
  private pips!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private labText!: Phaser.GameObjects.Text;
  private rulers: Phaser.GameObjects.Text[] = [];
  private lastHp = -1;
  /** Seconds left of the pip pop after losing a hit. */
  private pipPop = 0;
  /** Seconds left of the pip pop after a kill healed a life. */
  private healPop = 0;

  constructor() {
    super('ui');
  }

  create(): void {
    const game = this.scene.get('game') as GameScene;
    this.grid = this.add.graphics();
    this.hurt = this.add.graphics();
    this.pips = this.add.graphics();
    drawDebugGrid(this.grid, game.world.room);
    this.rulers = rulerLabels(game.world.room).map((l) =>
      this.add.text(l.x, l.y, l.text, { fontFamily: 'Inter', fontSize: '18px', color: '#ff8c00' }),
    );
    const box = { fontFamily: 'Inter', fontSize: '18px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 8, y: 4 } };
    this.info = this.add.text(16, 12, '', box);
    this.labText = this.add.text(16, 1080 - 48, '', { ...box, wordWrap: { width: 1880 } }).setVisible(!!game.lab).setOrigin(0, 1).setY(1080 - 16);
    this.lastHp = -1;
  }

  update(_time: number, delta: number): void {
    const game = this.scene.get('game') as GameScene;
    const p = game.world.player;
    this.drawPips(p, delta / 1000);
    if (game.lab) {
      const b = p?.body;
      const speed = b ? Math.hypot(b.vel.x, b.vel.z).toFixed(2) : '-';
      const extra = game.lab.info?.(game.world);
      this.labText.setText(
        `${game.lab.slug}: ${game.lab.title}\n${p ? stateLabel(p) : '-'}  speed ${speed} H/s  feet ${p?.pos.y.toFixed(2) ?? '-'} H  hurtbox ${b?.height.toFixed(2) ?? '-'} H  ·  cannon hits ${game.cannonHits}  ·  corpses baked ${game.frozenCorpses}${extra ? `  ·  ${extra}` : ''}`,
      );
    }
    const on = game.overlay;
    this.grid.setVisible(on);
    this.hurt.setVisible(on);
    for (const r of this.rulers) r.setVisible(on);
    this.info.setVisible(on);
    if (!on) return;
    this.drawHurtboxes(game);
    const c = game.clock;
    this.info.setText(
      `tick ${game.world.tick}  ·  ${this.game.loop.actualFps.toFixed(0)} fps  ·  ${c.paused ? 'PAUSED (F4 step)' : `${c.timeScale}×`}  ·  palette ${game.paletteId}${game.blood ? ' (blood)' : ''}  ·  actors ${game.world.actors.length}`,
    );
  }

  /** Hit pips for the player's 3 hits (design/art-direction.md, UI), bottom-left. */
  private drawPips(p: Actor | undefined, dt: number): void {
    const g = this.pips;
    g.clear();
    if (!p) return;
    if (this.lastHp >= 0 && p.hp < this.lastHp) this.pipPop = 0.25;
    if (this.lastHp >= 0 && p.hp > this.lastHp) this.healPop = 0.3;
    this.lastHp = p.hp;
    this.pipPop = Math.max(0, this.pipPop - dt);
    this.healPop = Math.max(0, this.healPop - dt);
    const ink = Phaser.Display.Color.HexStringToColor(INK).color;
    for (let i = 0; i < p.maxHp; i++) {
      const lost = i >= p.hp;
      // the pip just lost pops out; the pip just regained (a kill) pops in
      const pop = lost && i === p.hp ? 1 + this.pipPop * 1.6 : !lost && i === p.hp - 1 ? 1 + this.healPop * 1.4 : 1;
      const x = 48 + i * 46, y = 1080 - 120;
      g.fillStyle(ink, 1).fillCircle(x, y, 17 * pop);
      g.fillStyle(lost ? 0x5b5c61 : 0xffffff, 1).fillCircle(x, y, 12 * pop);
    }
  }

  /** F1: head ellipse + body capsule of every actor, through the same root transform as the sim. */
  private drawHurtboxes(game: GameScene): void {
    const g = this.hurt;
    g.clear();
    for (const a of game.world.actors) {
      if (a.corpse?.phase === 'frozen') continue;
      const toScreen = (lx: number, ly: number) => {
        const [dx, dy] = rootToWorld(a.pose.root, a.facing, lx, ly);
        return project(a.pos.x + dx, a.pos.y + dy, a.pos.z);
      };
      g.lineStyle(2, a.state === 'getUp' ? 0x55ff55 : a.state === 'dead' ? 0x777777 : 0xffd400, 0.9);
      if (!a.pose.headless) {
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= 24; i++) {
          const t = (i / 24) * Math.PI * 2;
          const [x, y] = toScreen(HEAD.x + Math.cos(t) * HEAD.rx, HEAD.y + Math.sin(t) * HEAD.ry);
          pts.push(new Phaser.Math.Vector2(x, y));
        }
        g.strokePoints(pts, true);
      }
      // capsule: two half circles joined by straight sides
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = Math.PI + (i / 12) * Math.PI;
        const [x, y] = toScreen(Math.cos(t) * BODY.r, BODY.y1 + Math.sin(t) * BODY.r);
        pts.push(new Phaser.Math.Vector2(x, y));
      }
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * Math.PI;
        const [x, y] = toScreen(Math.cos(t) * BODY.r, BODY.y0 + Math.sin(t) * BODY.r);
        pts.push(new Phaser.Math.Vector2(x, y));
      }
      g.strokePoints(pts, true);
    }
  }
}
