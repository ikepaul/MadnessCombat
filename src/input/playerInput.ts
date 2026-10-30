import Phaser from 'phaser';
import type { PlayerCommand } from '../sim/command';
import { type Action, SETTINGS } from '../settings';

/**
 * Keyboard + mouse -> PlayerCommand (PLAN.md controls): WASD move (W/S = depth), Space jump,
 * C dive/prone (M14b: the default moved off Ctrl; bound to Ctrl, C stays a second key) and get up, mouse aim, LMB / RMB use the front / back hand (fire,
 * or punch when empty: light / heavy, uppercut when aimed steeply up), F grab / throw,
 * E pick up / pull out, R reload, Q throw the held weapon, G (hold) cook a grenade and release
 * to lob it, Shift (hold) split aim. Edges are latched until
 * the sim consumes them, so a press between ticks is never lost. M13: the keys come from the
 * settings (rebindable); C stays a second dive key while dive is on its default.
 */
export class PlayerInput {
  private keys: Record<Action, Phaser.Input.Keyboard.Key>;
  private jumpLatch = false;
  private diveLatch = false;
  private grabLatch = false;
  private pickupLatch = false;
  private reloadLatch = false;
  private throwLatch = false;
  private modeLatch = false;
  private rageLatch = false;
  private pressLatch: [boolean, boolean] = [false, false];
  private attackLatch: PlayerCommand['attack'] = null;
  /** Aim only counts once the mouse has moved over the game (the pointer starts at 0,0). */
  private aimActive = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    kb.addCapture(['SPACE', 'CTRL', 'SHIFT', 'TAB']);
    const K = Phaser.Input.Keyboard.KeyCodes as Record<string, number>;
    const key = (a: Action) => kb.addKey(K[SETTINGS.keys[a]] ?? K.SPACE);
    this.keys = Object.fromEntries((Object.keys(SETTINGS.keys) as Action[]).map((a) => [a, key(a)])) as Record<Action, Phaser.Input.Keyboard.Key>;
    this.keys.jump.on('down', () => (this.jumpLatch = true));
    this.keys.dive.on('down', () => (this.diveLatch = true));
    if (SETTINGS.keys.dive === 'CTRL') kb.addKey(K.C).on('down', () => (this.diveLatch = true));
    this.keys.grab.on('down', () => (this.grabLatch = true));
    this.keys.use.on('down', () => (this.pickupLatch = true));
    this.keys.reload.on('down', () => (this.reloadLatch = true));
    this.keys.throw.on('down', () => (this.throwLatch = true));
    this.keys.fireMode.on('down', () => (this.modeLatch = true));
    this.keys.rage.on('down', () => (this.rageLatch = true));
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', () => (this.aimActive = true));
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.aimActive = true;
      if (p.button === 0) { this.attackLatch = 'light'; this.pressLatch[0] = true; }
      else if (p.button === 2) { this.attackLatch = 'heavy'; this.pressLatch[1] = true; }
    });
  }

  /** Build this frame's command; latched edges are handed over once. */
  read(): PlayerCommand {
    const k = this.keys;
    const p = this.scene.input.activePointer;
    return {
      moveX: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
      moveZ: (k.up.isDown ? 1 : 0) - (k.down.isDown ? 1 : 0),
      jump: this.jumpLatch,
      dive: this.diveLatch,
      attack: this.attackLatch,
      grab: this.grabLatch,
      aim: this.aimActive ? [p.x, p.y] : undefined,
      press: [...this.pressLatch],
      hold: [p.leftButtonDown(), p.rightButtonDown()],
      pickup: this.pickupLatch,
      reload: this.reloadLatch,
      throwGun: this.throwLatch,
      fireMode: this.modeLatch,
      rage: this.rageLatch,
      useHeld: k.use.isDown,
      split: k.split.isDown,
      grenade: k.grenade.isDown,
    };
  }

  /** Call after the sim consumed a tick's edges. */
  consumeEdges(): void {
    this.jumpLatch = false;
    this.diveLatch = false;
    this.grabLatch = false;
    this.pickupLatch = false;
    this.reloadLatch = false;
    this.throwLatch = false;
    this.modeLatch = false;
    this.rageLatch = false;
    this.pressLatch = [false, false];
    this.attackLatch = null;
  }
}
