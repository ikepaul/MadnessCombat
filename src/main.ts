import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from './render/camera';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { CoopLobbyScene } from './scenes/CoopLobbyScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: '#000000',
  // our own Web Audio engine (src/audio) owns the AudioContext
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // UXS-21: the lab scenes are added by BootScene behind `?lab` (their own chunk)
  scene: [BootScene, TitleScene, GameScene, UIScene, CoopLobbyScene],
});

// dev only: lets a debugging session drive the sim from the console (window.__game)
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
