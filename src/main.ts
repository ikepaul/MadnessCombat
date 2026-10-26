import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from './render/camera';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { LabIndexScene } from './scenes/LabIndexScene';
import { UIScene } from './scenes/UIScene';

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene, UIScene, LabIndexScene],
});
