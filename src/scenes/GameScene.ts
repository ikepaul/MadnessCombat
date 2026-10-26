import Phaser from 'phaser';
import { PALETTES, type PaletteId, STAGE_PALETTE } from '../data/palettes';
import { TEST_ROOM } from '../data/rooms/testRoom';
import { bindDebugKeys } from '../input/debugKeys';
import { getLab } from '../labs/registry';
import { CanvasLayer } from '../render/canvasLayer';
import { paintCharacter } from '../render/canvas/characterPainter';
import { paintRoom, paintTable } from '../render/canvas/roomPainter';
import { PostFx } from '../render/post';
import { createActor } from '../sim/actor';
import { FixedClock } from '../sim/clock';
import type { PropDef } from '../sim/room';
import { World } from '../sim/world';

export interface GameSceneData {
  lab?: string;
  palette?: PaletteId;
}

/** Runs the fixed-step world and draws it: baked room layer, dynamic actor layer, post FX. */
export class GameScene extends Phaser.Scene {
  world!: World;
  clock!: FixedClock;
  paletteId: PaletteId = 'neutral';
  overlay = false;
  private roomLayer!: CanvasLayer;
  private actorLayer!: CanvasLayer;
  private post!: PostFx;

  constructor() {
    super('game');
  }

  create(data: GameSceneData): void {
    this.clock = new FixedClock();
    this.world = new World(TEST_ROOM);
    this.paletteId = data.palette ?? 'neutral';

    const lab = data.lab ? getLab(data.lab) : undefined;
    if (lab) lab.setup(this.world);
    else this.setupTestPose();

    this.roomLayer = new CanvasLayer(this, 'layer-room', 0);
    this.actorLayer = new CanvasLayer(this, 'layer-actors', 10);
    this.post = new PostFx(this);
    this.world.events.on('roomChanged', () => this.bakeRoom());
    this.bakeRoom();

    bindDebugKeys(this, {
      toggleOverlay: () => (this.overlay = !this.overlay),
      toggleSlowMo: () => (this.clock.timeScale = this.clock.timeScale === 1 ? 0.25 : 1),
      togglePause: () => (this.clock.paused = !this.clock.paused),
      stepFrame: () => this.clock.stepOnce(),
      setPalette: (i) => this.setPalette(STAGE_PALETTE[i]),
      togglePost: () => this.post.setEnabled(!this.post.enabled),
    });
    this.scene.launch('ui');
  }

  setPalette(id: PaletteId): void {
    this.paletteId = id;
    this.bakeRoom();
  }

  /** M0 still life: the style-frame cast in their static poses. */
  private setupTestPose(): void {
    const zombie = createActor('zombie', 2.95, 9.85, -1);
    const hero = createActor('hero', -0.7, 8.75, 1, { held: 'pistol', aimAt: { x: 2.95, y: 0.8, z: 9.85 } });
    const shooter = createActor('grunt', 1.85, 10.3, -1, { held: 'pistol', aimAt: { x: -0.7, y: 0.55, z: 8.75 } });
    const baton = createActor('grunt', -2.9, 8.95, 1, { held: 'baton' });
    const corpse = createActor('grunt', 0.15, 8.25, 1, { lying: true, dead: true });
    this.world.actors.push(shooter, zombie, baton, corpse, hero);
  }

  private bakeRoom(): void {
    this.roomLayer.clear();
    paintRoom(this.roomLayer.ctx, this.world.room, PALETTES[this.paletteId]);
    this.roomLayer.upload();
  }

  update(_time: number, delta: number): void {
    this.clock.advance(delta / 1000, () => this.world.step());
    this.render();
    this.post.update();
  }

  /** Draw actors and props far-to-near. */
  private render(): void {
    const pal = PALETTES[this.paletteId];
    const ctx = this.actorLayer.ctx;
    this.actorLayer.clear();
    type Drawable = { z: number; draw: () => void };
    const list: Drawable[] = [];
    for (const a of this.world.actors) list.push({ z: a.pos.z, draw: () => paintCharacter(ctx, a, pal, this.world.time) });
    for (const p of this.world.room.props) list.push({ z: propDepth(p), draw: () => paintTable(ctx, p, pal) });
    list.sort((a, b) => b.z - a.z);
    for (const d of list) d.draw();
    this.actorLayer.upload();
  }
}

function propDepth(p: PropDef): number {
  return p.z0;
}
