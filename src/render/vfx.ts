// Screen-space particles driven by sim events (design/art-direction.md). Advanced on sim ticks,
// so slow-mo, hit-stop and pause apply to them too.
import type { World } from '../sim/world';
import { project, scaleAt } from './camera';
import type { Ctx } from './canvas/draw';

interface Puff { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; max: number; z: number }

export class Vfx {
  private puffs: Puff[] = [];
  /** Cannon muzzle blasts: screen pos + ticks left. */
  private blasts: { x: number; y: number; s: number; left: number; facing: number }[] = [];

  constructor(world: World) {
    world.events.on('land', (e) => this.dust(e.x, e.y, e.z, 6 + Math.min(6, e.fallSpeed)));
    world.events.on('dive', (e) => this.dust(e.x, e.y, e.z, 8));
    world.events.on('standUp', (e) => this.dust(e.x, e.y, e.z, 4));
    world.events.on('cannonFire', (e) => {
      const c = world.cannons.find((k) => k.x === e.x && k.z === e.z);
      const f = c?.facing ?? 1;
      const [x, y] = project(e.x + f * 0.45, 0.6, e.z);
      this.blasts.push({ x, y, s: scaleAt(e.z), left: 2, facing: f });
    });
    world.events.on('cannonHit', (e) => {
      const a = world.actors.find((k) => k.id === e.actorId);
      if (!a) return;
      const [x, y] = project(a.pos.x, a.pos.y + 0.6, a.pos.z);
      this.blasts.push({ x, y, s: scaleAt(a.pos.z) * 0.7, left: 3, facing: 1 });
      this.dust(a.pos.x, a.pos.y, a.pos.z, 6);
    });
    world.events.on('tick', () => this.step(world.dt));
  }

  /** Grey dust puffs kicked up at a floor point. */
  private dust(x: number, y: number, z: number, n: number): void {
    const [sx, sy] = project(x, y, z), s = scaleAt(z);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      const v = (0.4 + Math.random() * 0.8) * s;
      this.puffs.push({
        x: sx + dir * Math.random() * 0.1 * s, y: sy - Math.random() * 0.02 * s,
        vx: dir * v, vy: -Math.random() * 0.25 * s,
        r: (0.025 + Math.random() * 0.03) * s, grow: 0.12 * s, life: 0, max: 0.35 + Math.random() * 0.2, z,
      });
    }
  }

  private step(dt: number): void {
    for (const p of this.puffs) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.r += p.grow * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);
    for (const b of this.blasts) b.left--;
    this.blasts = this.blasts.filter((b) => b.left > 0);
  }

  draw(ctx: Ctx): void {
    for (const p of this.puffs) {
      ctx.globalAlpha = 0.45 * (1 - p.life / p.max);
      ctx.fillStyle = '#b9babd';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const b of this.blasts) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.s * b.facing, b.s);
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2, r = i % 2 ? 0.1 : 0.28;
        ctx.lineTo(Math.cos(a) * r * (Math.cos(a) > 0 ? 1.3 : 0.7), Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#e8e8ea';
      ctx.fill();
      ctx.restore();
    }
  }
}
