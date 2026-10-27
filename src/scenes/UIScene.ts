import Phaser from 'phaser';
import { rootToWorld } from '../anim/skeleton';
import { INK } from '../data/palettes';
import { project } from '../render/camera';
import { drawDebugGrid, rulerLabels } from '../render/debugOverlay';
import { type Actor, stateLabel } from '../sim/actor';
import { BODY, HEAD } from '../sim/hurtbox';
import { SETTINGS } from '../settings';
import type { GameScene } from './GameScene';
import { StageHud } from '../render/stageHud';
import { Menu, type MenuItem } from '../ui/menu';
import { controlsItems, settingsItems } from '../ui/settingsMenu';
import { InkHud } from '../ui/hud';
import { inkWipe, takeStageCard } from '../ui/transition';

/** HUD + debug overlay. A separate scene/camera so post FX never touch it. */
export class UIScene extends Phaser.Scene {
  private grid!: Phaser.GameObjects.Graphics;
  private hurt!: Phaser.GameObjects.Graphics;
  private pips!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private labText!: Phaser.GameObjects.Text;
  private rulers: Phaser.GameObjects.Text[] = [];
  /** Per player row: last hp seen, seconds of pop left after losing / regaining a life. */
  private pipRows: { lastHp: number; lost: number; healed: number }[] = [];
  /** Co-op row labels ("P1 · you", "P2"). */
  private pipLabels: Phaser.GameObjects.Text[] = [];
  private counter!: Phaser.GameObjects.Text;
  private lastKills = 0;
  /** Kill counter pop: frames left of the 1.3 -> 1.0 scale (design/art-direction.md). */
  private counterPop = 0;
  private card!: Phaser.GameObjects.Container;
  /** M8 script cards: title on black / caption line, shown until this world time. */
  private titleCard!: Phaser.GameObjects.Container;
  private caption!: Phaser.GameObjects.Text;
  private scriptCardUntil = 0;
  /** M13: the pause menu (Esc). */
  private pause?: { bg: Phaser.GameObjects.Rectangle; title: Phaser.GameObjects.Text; menu: Menu };
  /** M9: the ink wipe between rooms and the tracker. */
  private stageHud!: StageHud;
  /** Revamp: weapons, prompts, crosshair, hurt edges, stage card (src/ui/hud.ts). */
  private inkHud!: InkHud;

  constructor() {
    super('ui');
  }

  create(): void {
    this.events.once('shutdown', () => { this.pause?.menu.destroy(); this.pause = undefined; });
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
    this.pipRows = [];
    this.pipLabels = [0, 1].map(() => this.add.text(0, 0, '', { fontFamily: 'Inter', fontSize: '20px', color: '#ffffff', stroke: INK, strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0, 0.5));
    // world-kill-counter: big number bottom-right, appears at the first kill
    this.counter = this.add.text(1920 - 48, 1080 - 36, '', {
      fontFamily: 'Anton', fontSize: '96px', color: '#ffffff', stroke: INK, strokeThickness: 10,
    }).setOrigin(1, 1).setVisible(false);
    this.lastKills = 0;
    this.counterPop = 0;
    this.card = this.buildCard().setVisible(false);
    this.buildScriptCards();
    this.stageHud = new StageHud(this, game.world);
    // revamp F2: the screen comes in from under the ink, with the stage card on a fresh start
    const card = takeStageCard() || game.freshStart;
    this.inkHud = new InkHud(this, game, card);
    inkWipe(this, 'in');
    // a new room: the last room's caption goes with it
    game.world.events.on('roomEnter', () => { this.scriptCardUntil = 0; });
    game.world.events.on('card', (e) => {
      this.scriptCardUntil = game.world.time + e.seconds;
      this.titleCard.setVisible(e.style === 'title');
      this.caption.setVisible(e.style === 'caption');
      (e.style === 'title' ? (this.titleCard.getByName('text') as Phaser.GameObjects.Text) : this.caption).setText(e.text);
    });
  }

  /** M8 script cards (sequencer `card`): a title on black, or a caption line at the bottom. */
  private buildScriptCards(): void {
    const bg = this.add.rectangle(0, 0, 1920, 1080, 0x000000, 1).setOrigin(0, 0);
    const text = this.add.text(960, 540, '', { fontFamily: 'Anton', fontSize: '72px', color: '#ffffff', align: 'center', wordWrap: { width: 1500 } }).setOrigin(0.5).setName('text');
    this.titleCard = this.add.container(0, 0, [bg, text]).setDepth(90).setVisible(false);
    // top of the screen, over the sky / back wall, so it never covers the fight
    this.caption = this.add.text(960, 120, '', {
      fontFamily: 'Inter', fontSize: '30px', color: '#ffffff', backgroundColor: '#000000cc', padding: { x: 18, y: 10 }, align: 'center', wordWrap: { width: 1400 },
    }).setOrigin(0.5, 0).setDepth(90).setVisible(false);
    this.scriptCardUntil = 0;
  }

  /** End-of-room card: plain text on black, like an episode title card (own wording). */
  private buildCard(): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 1920, 1080, 0x000000, 0.88).setOrigin(0, 0);
    const title = this.add.text(960, 400, 'BODY COUNT', { fontFamily: 'Anton', fontSize: '72px', color: '#ffffff' }).setOrigin(0.5);
    const n = this.add.text(960, 540, '0', { fontFamily: 'Anton', fontSize: '200px', color: '#ffffff' }).setOrigin(0.5).setName('n');
    const sub = this.add.text(960, 700, '', { fontFamily: 'Inter', fontSize: '26px', color: '#b9babd', align: 'center' }).setOrigin(0.5).setName('sub');
    return this.add.container(0, 0, [bg, title, n, sub]).setDepth(100);
  }

  /** When the pause menu last closed: the same Esc press must not open it again. */
  private pauseClosedAt = -1;

  /** The game's Esc: open the pause menu (the menu's own Esc handles closing it). */
  openPause(e?: KeyboardEvent): void {
    if (!this.pause && !(e && e.timeStamp < this.pauseClosedAt)) this.togglePause();
  }

  /** M13: Esc opens / closes the pause menu: Resume, Restart room, Settings, Controls, Quit to title. */
  togglePause(): void {
    const game = this.scene.get('game') as GameScene;
    if (this.pause) { this.closePause(); return; }
    const host = game.coop !== 'guest';
    if (host) game.clock.paused = true;
    const bg = this.add.rectangle(0, 0, 1920, 1080, 0x000000, 0.72).setOrigin(0, 0).setDepth(190);
    const title = this.add.text(200, 220, 'PAUSED', { fontFamily: 'Anton', fontSize: '96px', color: '#f2f2f3' }).setDepth(200);
    const show = (view: 'main' | 'settings' | 'controls') => {
      this.pause?.menu.destroy();
      const back = () => (view === 'controls' ? show('settings') : view === 'settings' ? show('main') : this.closePause());
      const items: MenuItem[] = view === 'main'
        ? [
            { label: 'Resume', action: () => this.closePause() },
            { label: 'Restart room', disabled: !host, action: () => { this.closePause(); game.restart(); } },
            { label: 'Settings', action: () => show('settings') },
            { label: 'Quit to title', action: () => { this.closePause(); game.toTitle(); } },
          ]
        : view === 'settings' ? settingsItems(() => show('controls'), () => show('main'))
          : controlsItems(this, (on) => { if (this.pause) this.pause.menu.hold = on; }, () => show('settings'));
      const size = view === 'main' ? 48 : view === 'settings' ? 34 : 26, gap = view === 'main' ? 70 : view === 'settings' ? 50 : 36;
      const menu = new Menu(this, items, 260, 400, back, size, gap);
      this.pause = { bg, title, menu };
    };
    show('main');
  }

  private closePause(): void {
    const game = this.scene.get('game') as GameScene;
    if (!this.pause) return;
    this.pause.menu.destroy();
    this.pause.bg.destroy();
    this.pause.title.destroy();
    this.pause = undefined;
    this.pauseClosedAt = performance.now();
    if (game.coop !== 'guest') game.clock.paused = false;
  }

  update(_time: number, delta: number): void {
    const game = this.scene.get('game') as GameScene;
    const p = game.world.player;
    this.drawPips(game, delta / 1000);
    this.drawCounter(game);
    this.stageHud.update();
    this.inkHud.update(delta / 1000);
    if (game.world.time >= this.scriptCardUntil) { this.titleCard.setVisible(false); this.caption.setVisible(false); }
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
      `tick ${game.world.tick}  ·  ${this.game.loop.actualFps.toFixed(0)} fps  ·  ${c.paused ? 'PAUSED (F4 step)' : `${c.timeScale}×`}  ·  palette ${game.paletteId}${game.blood ? ' (blood)' : ''}  ·  effects ${SETTINGS.effects} (V)  ·  ${SETTINGS.master > 0 ? 'sound on' : 'muted'} (M)  ·  actors ${game.world.actors.length}`,
    );
  }

  private drawCounter(game: GameScene): void {
    const kills = game.world.kills;
    if (kills > this.lastKills) this.counterPop = 8;
    this.lastKills = kills;
    // world-kill-counter: green while zombies are being killed, white otherwise
    this.counter.setVisible(kills > 0).setText(String(kills)).setColor(game.world.lastKillKind === 'zombie' ? '#63d06b' : '#ffffff');
    // 1.3 -> 1.0 over 8 frames at 30 fps, eased
    const u = this.counterPop / 8;
    this.counter.setScale(1 + 0.3 * u * u);
    if (this.counterPop > 0) this.counterPop = Math.max(0, this.counterPop - this.game.loop.delta / (1000 / 30));
    if (game.cleared && !this.card.visible) {
      (this.card.getByName('n') as Phaser.GameObjects.Text).setText(String(kills));
      const target = game.stageInfo?.targetBodyCount;
      // the stage's count against the episode's (world-kill-counter: stage 1 = 32)
      const vs = !target ? '' : kills > target ? `${kills - target} more than` : kills === target ? 'exactly' : `${target - kills} short of`;
      const episode = target ? `${vs} the episode's ${target}\n` : '';
      // co-op: only the host restarts the room
      const next = game.nextStage;
      const again = game.coop === 'guest' ? 'waiting for the host'
        : next ? `Enter: on to Stage ${next}  ·  R: Stage ${game.stageInfo!.stage} again  ·  Esc: title`
          : game.stageInfo?.stage === 3 && !game.coop ? 'Enter: credits  ·  R: Stage 3 again  ·  Esc: title' : 'Enter: fight again  ·  Esc: title';
      (this.card.getByName('sub') as Phaser.GameObjects.Text).setText(`${episode}${again}`);
      this.card.setVisible(true);
    }
  }

  /** One row of life pips per player, bottom-left (P1 lowest). Co-op rows are labelled. */
  private drawPips(game: GameScene, dt: number): void {
    const g = this.pips;
    g.clear();
    const players = game.world.players;
    const coop = players.length > 1;
    this.pipLabels.forEach((t, i) => t.setVisible(coop && i < players.length));
    players.forEach((p, row) => {
      const y = 1080 - 120 - row * 56;
      this.drawPipRow(g, row, p, coop ? 190 : 48, y, dt);
      if (!coop) return;
      const you = row === game.localPlayer ? ' · you' : '';
      // a downed player's row turns grey (their pips are empty anyway)
      this.pipLabels[row].setPosition(28, y).setText(`P${row + 1}${you}`).setColor(p.state === 'downed' ? '#8e8f94' : '#ffffff');
    });
  }

  private drawPipRow(g: Phaser.GameObjects.Graphics, row: number, p: Actor, x0: number, y: number, dt: number): void {
    const s = (this.pipRows[row] ??= { lastHp: -1, lost: 0, healed: 0 });
    if (s.lastHp >= 0 && p.hp < s.lastHp) s.lost = 0.25;
    if (s.lastHp >= 0 && p.hp > s.lastHp) s.healed = 0.3;
    s.lastHp = p.hp;
    s.lost = Math.max(0, s.lost - dt);
    s.healed = Math.max(0, s.healed - dt);
    const ink = Phaser.Display.Color.HexStringToColor(INK).color;
    for (let i = 0; i < p.maxHp; i++) {
      const lost = i >= p.hp;
      // the pip just lost pops out (and shakes); the pip just regained (a kill) pops in
      const pop = lost && i === p.hp ? 1 + s.lost * 1.6 : !lost && i === p.hp - 1 ? 1 + s.healed * 1.4 : 1;
      const shake = lost && i === p.hp ? Math.sin(s.lost * 90) * s.lost * 24 : 0;
      const x = x0 + i * 52 + shake;
      // revamp E1: each life is one of our heads; a lost one is the dead face (one wide X), greyed
      const r = 19 * pop;
      g.fillStyle(ink, 1).fillEllipse(x, y, (r + 4) * 2 * 0.9, (r + 4) * 2);
      g.fillStyle(lost ? 0x5b5c61 : 0xe9e9eb, 1).fillEllipse(x, y, r * 2 * 0.9, r * 2);
      if (!lost) g.fillStyle(0xffffff, 0.7).fillEllipse(x + r * 0.3, y - r * 0.5, r * 0.5, r * 0.28);
      g.lineStyle(Math.max(2, 3.5 * pop), ink, 1);
      if (lost) {
        g.lineBetween(x - r * 0.35, y - r * 0.45, x + r * 0.65, y + 0.25 * r);
        g.lineBetween(x + r * 0.65, y - r * 0.45, x - r * 0.35, y + 0.25 * r);
      } else g.lineBetween(x + r * 0.05, y - r * 0.15, x + r * 0.7, y - r * 0.15);
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
      // green = i-frames, grey = dead, orange-red = holds an attack token
      const color = a.state === 'getUp' ? 0x55ff55 : a.state === 'dead' ? 0x777777 : game.world.tokens.has(a.id) ? 0xff5a1f : 0xffd400;
      g.lineStyle(2, color, 0.9);
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
