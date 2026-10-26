import Phaser from 'phaser';
import { coopLink } from '../net/link';
import type { CoopRole } from '../net/relay';
import type { GameSceneData } from './GameScene';

/**
 * Co-op lobby (PLAN.md M4b). Host (`/?coop=host`): shows the link for the other laptop and
 * starts the room as soon as player 2 connects (Enter plays alone). Guest (`/?coop=join`):
 * connects to the host and starts as player 2.
 */
export class CoopLobbyScene extends Phaser.Scene {
  private role!: CoopRole;
  private status!: Phaser.GameObjects.Text;
  private links!: Phaser.GameObjects.Text;
  private started = false;
  private game_: Omit<GameSceneData, 'coop'> = {};

  constructor() {
    super('coop-lobby');
  }

  create(data: { role: CoopRole } & Omit<GameSceneData, 'coop'>): void {
    this.role = data.role;
    this.game_ = { stage: data.stage, room: data.room, wave: data.wave, palette: data.palette };
    this.started = false;
    this.cameras.main.setBackgroundColor('#141416');
    const title = this.role === 'host' ? 'CO-OP · HOSTING' : 'CO-OP · JOINING';
    this.add.text(960, 300, title, { fontFamily: 'Anton', fontSize: '84px', color: '#ffffff' }).setOrigin(0.5);
    this.status = this.add.text(960, 430, '', { fontFamily: 'Inter', fontSize: '30px', color: '#d9d9dc', align: 'center' }).setOrigin(0.5);
    this.links = this.add.text(960, 560, '', { fontFamily: 'Inter', fontSize: '34px', color: '#ffffff', align: 'center', lineSpacing: 12 }).setOrigin(0.5, 0);
    this.add.text(960, 980, 'Both laptops on the same Wi-Fi · the host runs `npm run dev:lan`', {
      fontFamily: 'Inter', fontSize: '22px', color: '#8e8f94',
    }).setOrigin(0.5);
    if (this.role === 'host') this.input.keyboard?.on('keydown-ENTER', () => this.start(false));
    coopLink(this.role);
  }

  private start(coop: boolean): void {
    if (this.started) return;
    this.started = true;
    const data: GameSceneData = { ...this.game_, coop: coop ? this.role : undefined };
    this.scene.start('game', data);
  }

  update(): void {
    const link = coopLink(this.role);
    const w = link.welcome;
    if (this.role === 'host') {
      if (!w) this.status.setText('Connecting to the dev server…');
      else if (!w.ok) this.status.setText(w.reason ?? 'Could not host.');
      else {
        this.status.setText('Waiting for player 2…\nOn the other laptop, open this in Chrome or Safari:');
        const urls = w.joinUrls?.length ? w.joinUrls.join('\n') : '(no network address found: is Wi-Fi on?)';
        this.links.setText(`${urls}\n\n(Enter: play alone)`);
        if (link.peer) this.start(true);
      }
      return;
    }
    if (!w) this.status.setText('Connecting…');
    else if (!w.ok) this.status.setText(`${w.reason ?? 'Could not join.'}\nRetrying…`);
    else this.start(true);
  }
}
