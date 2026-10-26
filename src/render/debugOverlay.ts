import Phaser from 'phaser';
import type { RoomDef } from '../sim/room';
import { project, SCREEN_H, scaleAt } from './camera';

/** F1 overlay: H grid on the floor, depth lines, 1 H rulers at the front and back. */
export function drawDebugGrid(g: Phaser.GameObjects.Graphics, room: RoomDef): void {
  g.clear();
  g.lineStyle(1, 0x00aaff, 0.5);
  for (let x = -room.halfWidth; x <= room.halfWidth + 1e-6; x += 0.5) {
    const a = project(x, 0, room.zFront), b = project(x, 0, room.zBack);
    g.lineBetween(a[0], a[1], b[0], b[1]);
  }
  for (let z = room.zFront; z <= room.zBack + 1e-6; z += 0.5) {
    const a = project(-room.halfWidth, 0, z), b = project(room.halfWidth, 0, z);
    g.lineBetween(a[0], a[1], b[0], b[1]);
  }
  g.lineStyle(3, 0xff8c00, 0.9);
  for (const z of [room.zFront, room.zBack]) {
    const a = project(-room.halfWidth + 0.3, 0, z), b = project(-room.halfWidth + 0.3, 1, z);
    g.lineBetween(a[0], a[1], b[0], b[1]);
  }
}

export function rulerLabels(room: RoomDef): { x: number; y: number; text: string }[] {
  return [room.zFront, room.zBack].map((z) => {
    const b = project(-room.halfWidth + 0.3, 1, z);
    return { x: b[0] + 8, y: b[1], text: `1 H = ${(scaleAt(z) / SCREEN_H).toFixed(3)} screen` };
  });
}
