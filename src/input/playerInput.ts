import Phaser from 'phaser';
import type { PlayerCommand } from '../sim/command';

/**
 * Keyboard + mouse -> PlayerCommand (PLAN.md controls): WASD move (W/S = depth), Space jump,
 * Ctrl (or C) dive/prone and get up, mouse aim, LMB light punch, RMB heavy punch (uppercut
 * when aimed steeply up), F grab / throw. Edges are latched until the sim consumes them, so a
 * press between ticks is never lost.
 */
export class PlayerInput {
  private keys: Record<'W' | 'A' | 'S' | 'D' | 'SPACE' | 'CTRL' | 'C' | 'F', Phaser.Input.Keyboard.Key>;
  private jumpLatch = false;
  private diveLatch = false;
  private grabLatch = false;
  private attackLatch: PlayerCommand['attack'] = null;
  /** Aim only counts once the mouse has moved over the game (the pointer starts at 0,0). */
  private aimActive = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    kb.addCapture(['SPACE', 'CTRL']);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      W: kb.addKey(K.W), A: kb.addKey(K.A), S: kb.addKey(K.S), D: kb.addKey(K.D),
      SPACE: kb.addKey(K.SPACE), CTRL: kb.addKey(K.CTRL), C: kb.addKey(K.C), F: kb.addKey(K.F),
    };
    this.keys.SPACE.on('down', () => (this.jumpLatch = true));
    this.keys.CTRL.on('down', () => (this.diveLatch = true));
    this.keys.C.on('down', () => (this.diveLatch = true));
    this.keys.F.on('down', () => (this.grabLatch = true));
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', () => (this.aimActive = true));
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.aimActive = true;
      if (p.button === 0) this.attackLatch = 'light';
      else if (p.button === 2) this.attackLatch = 'heavy';
    });
  }

  /** Build this frame's command; latched edges are handed over once. */
  read(): PlayerCommand {
    const k = this.keys;
    const p = this.scene.input.activePointer;
    return {
      moveX: (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
      moveZ: (k.W.isDown ? 1 : 0) - (k.S.isDown ? 1 : 0),
      jump: this.jumpLatch,
      dive: this.diveLatch,
      attack: this.attackLatch,
      grab: this.grabLatch,
      aim: this.aimActive ? [p.x, p.y] : undefined,
    };
  }

  /** Call after the sim consumed a tick's edges. */
  consumeEdges(): void {
    this.jumpLatch = false;
    this.diveLatch = false;
    this.grabLatch = false;
    this.attackLatch = null;
  }
}
