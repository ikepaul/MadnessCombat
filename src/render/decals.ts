// Persistent blood decals (world-persistence-decals, style-frame code): wall splatter where a
// body slams into a wall and pools growing under corpses. Baked into a layer that only grows
// during a room; capped at 500 (invented). Stages without blood (stage 1) make none.
import { BLOOD, BLOOD_DARK } from '../data/palettes';
import type { World } from '../sim/world';
import { project, scaleAt } from './camera';
import { type Ctx, mulberry32 } from './canvas/draw';
import type { CanvasLayer } from './canvasLayer';

const MAX_DECALS = 500;
/** Pool growth time; shorter than the corpse freeze delay so it bakes first. invented */
const POOL_GROW = 1.2;

type Decal =
  | { kind: 'splat'; x: number; y: number; dx: number; dy: number; seed: number; scale: number }
  | { kind: 'pool'; x: number; z: number; rx: number; rz: number; seed: number };

interface Growing { x: number; z: number; rx: number; rz: number; seed: number; t: number }

export class Decals {
  private baked: Decal[] = [];
  private growing: Growing[] = [];
  private seed = 1;

  constructor(world: World, private layer: CanvasLayer, private blood: () => boolean) {
    world.events.on('wallHit', (e) => {
      if (!this.blood() || e.speed < 2.5) return;
      const room = world.room;
      const wx = e.wall === 'left' ? -room.halfWidth : e.wall === 'right' ? room.halfWidth : e.x;
      const wz = e.wall === 'back' ? room.zBack : e.z;
      const [x, y] = project(wx, e.y + 0.55, wz);
      // spray spreads along the wall, away from the impact
      const dx = e.wall === 'back' ? (Math.random() - 0.5) * 2 : e.wall === 'left' ? -0.4 : 0.4;
      this.add({ kind: 'splat', x, y, dx, dy: -0.6 - Math.random() * 0.4, seed: this.seed++ * 13, scale: 0.6 * (scaleAt(wz) / 230) * Math.min(1.4, e.speed / 5) });
    });
    world.events.on('corpseSettled', (e) => {
      if (!this.blood()) return;
      const r = mulberry32(this.seed++ * 7);
      this.growing.push({ x: e.x, z: e.z, rx: 0.45 + r() * 0.3, rz: 0.13 + r() * 0.07, seed: this.seed * 11, t: 0 });
    });
    world.events.on('tick', () => this.step(world.dt));
  }

  private add(d: Decal): void {
    if (this.baked.length >= MAX_DECALS) return;
    this.baked.push(d);
    paintDecal(this.layer.ctx, d);
    this.layer.markDirty();
  }

  private step(dt: number): void {
    for (const g of this.growing) g.t += dt;
    const done = this.growing.filter((g) => g.t >= POOL_GROW);
    if (done.length === 0) return;
    this.growing = this.growing.filter((g) => g.t < POOL_GROW);
    for (const g of done) this.add({ kind: 'pool', x: g.x, z: g.z, rx: g.rx, rz: g.rz, seed: g.seed });
  }

  /** Pools still growing: drawn per frame under the actors (their corpse isn't baked yet). */
  drawGrowing(ctx: Ctx): void {
    if (!this.blood()) return;
    for (const g of this.growing) {
      const k = Math.sqrt(Math.min(1, g.t / POOL_GROW));
      bloodPool(ctx, g.x, g.z, g.rx * k, g.rz * k, g.seed);
    }
  }

  /** Re-bake everything (room or blood toggle changed). */
  rebake(): void {
    this.layer.clear();
    if (this.blood()) for (const d of this.baked) paintDecal(this.layer.ctx, d);
    this.layer.upload();
  }

  get count(): number {
    return this.baked.length;
  }
}

function paintDecal(ctx: Ctx, d: Decal): void {
  if (d.kind === 'splat') splatter(ctx, d.x, d.y, d.dx, d.dy, d.seed, d.scale);
  else bloodPool(ctx, d.x, d.z, d.rx, d.rz, d.seed);
}

/** Ported from the style frame: blob + droplets in the spray direction + drips. */
function splatter(ctx: Ctx, x: number, y: number, dx: number, dy: number, seed: number, scale: number): void {
  const r = mulberry32(seed), d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  ctx.fillStyle = BLOOD;
  ctx.beginPath(); ctx.ellipse(x, y, 14 * scale, 11 * scale, Math.atan2(uy, ux), 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 26; i++) {
    const t = r() * 70 * scale, sp = (r() - 0.5) * 0.9, ang = Math.atan2(uy, ux) + sp;
    ctx.beginPath(); ctx.arc(x + Math.cos(ang) * t, y + Math.sin(ang) * t, Math.max(0.5, (1 + r() * 4.5) * scale * (1 - t / (90 * scale))), 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = BLOOD; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const sx = x + (r() - 0.5) * 22 * scale, len = (14 + r() * 40) * scale;
    ctx.lineWidth = (2 + r() * 2.5) * scale;
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + len); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, y + len, ctx.lineWidth * 0.7, 0, Math.PI * 2); ctx.fill();
  }
}

/** Ported from the style frame: irregular dark pool with one glossy highlight. */
function bloodPool(ctx: Ctx, x: number, z: number, rx: number, rz: number, seed: number): void {
  if (rx <= 0.01) return;
  const r = mulberry32(seed);
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, k = 0.8 + r() * 0.35;
    const [px, py] = project(x + Math.cos(a) * rx * k, 0, z + Math.sin(a) * rz * k);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = BLOOD_DARK; ctx.fill();
  const [cx, cy] = project(x - rx * 0.25, 0, z - rz * 0.3);
  ctx.fillStyle = 'rgba(255,120,120,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * scaleAt(z) * 0.22, 5 * (scaleAt(z) / 230), 0, 0, Math.PI * 2); ctx.fill();
}
