// Gun effects (PLAN.md M5 look, design/art-direction.md effects table), from `shot` and
// `reload` events, advanced on sim ticks (slow-mo and hit-stop apply):
// - muzzle flash: 1 frame, white star + warm glow (measured 1 frame in ep1)
// - room light flash: same frame, additive radial light at the muzzle, 520 px, 22%
// - tracer: 1 frame, 2.5 px white core + 9 px soft glow, one per pellet
// - impact puffs where a shot hits a wall, the floor or a prop
// - casings and dropped magazines: fly, bounce once, then stay (baked into the decal layer)
import { FLASH_GLOW, INK } from '../data/palettes';
import { WEAPONS } from '../data/weapons';
import type { World } from '../sim/world';
import { project, type ScreenPoint, scaleAt } from './camera';
import type { Ctx } from './canvas/draw';

/** 1 frame at 30 fps = 2 ticks at 60 Hz. */
const FRAME_TICKS = 2;

interface Flash { x: number; y: number; angle: number; size: number; light: boolean; left: number }
interface Tracer { from: ScreenPoint; to: ScreenPoint; left: number }
interface Puff { x: number; y: number; r: number; life: number; max: number }
/** A falling casing or magazine (screen space), until it settles on the floor line. */
interface Debris { kind: 'casing' | 'mag' | 'pin'; x: number; y: number; vx: number; vy: number; spin: number; angle: number; floor: number; s: number; bounced: boolean }

export interface SettledDebris { kind: 'casing' | 'mag' | 'pin'; x: number; y: number; angle: number; s: number }

export class GunFx {
  private flashes: Flash[] = [];
  private tracers: Tracer[] = [];
  private puffs: Puff[] = [];
  private debris: Debris[] = [];

  /** `onSettle` bakes a landed casing or magazine into the decal layer. */
  constructor(world: World, private onSettle: (d: SettledDebris) => void) {
    world.events.on('shot', (e) => {
      const w = WEAPONS[e.weapon], s = scaleAt(e.z);
      const shooter = world.actorById(e.actorId);
      const facing = shooter?.facing ?? 1;
      this.flashes.push({ x: e.muzzle[0], y: e.muzzle[1], angle: e.angle, size: s * (w.pellets > 1 ? 1.5 : w.id === 'deagle' ? 1.25 : 1), light: !w.suppressed, left: FRAME_TICKS });
      for (const r of e.rays) {
        this.tracers.push({ from: e.muzzle, to: r.end, left: FRAME_TICKS });
        if (r.surface && r.surface !== 'flesh' && r.surface !== 'sky') this.puffs.push({ x: r.end[0], y: r.end[1], r: 0.03 * s, life: 0, max: 0.25 });
      }
      // ejected casing: up and back out of the port, lands near the shooter's feet
      const floor = project(e.x, 0, e.z)[1] + (Math.random() - 0.5) * 0.08 * s;
      this.debris.push({
        kind: 'casing', x: e.eject[0], y: e.eject[1], vx: -facing * (0.6 + Math.random() * 0.8) * s, vy: -(1.6 + Math.random() * 1.2) * s,
        spin: (Math.random() - 0.5) * 30, angle: 0, floor, s, bounced: false,
      });
    });
    world.events.on('reload', (e) => {
      if (e.phase !== 'start') return;
      const s = scaleAt(e.z), [x, y] = project(e.x, e.y + 0.4, e.z);
      this.debris.push({ kind: 'mag', x, y, vx: 0, vy: 0.5 * s, spin: (Math.random() - 0.5) * 6, angle: 0, floor: project(e.x, 0, e.z)[1], s, bounced: false });
    });
    // throw-grenade: the pin drops and stays on the floor (ep1 f1360)
    world.events.on('grenadePin', (e) => {
      const s = scaleAt(e.z), [x, y] = project(e.x, e.y, e.z);
      this.debris.push({ kind: 'pin', x, y, vx: (Math.random() - 0.5) * 0.6 * s, vy: -0.8 * s, spin: (Math.random() - 0.5) * 20, angle: 0, floor: project(e.x, 0, e.z)[1], s, bounced: false });
    });
    world.events.on('tick', () => this.step(world.dt));
  }

  private step(dt: number): void {
    for (const f of this.flashes) f.left--;
    this.flashes = this.flashes.filter((f) => f.left > 0);
    for (const t of this.tracers) t.left--;
    this.tracers = this.tracers.filter((t) => t.left > 0);
    for (const p of this.puffs) { p.life += dt; p.r += 0.15 * dt * (p.r / 0.03); }
    this.puffs = this.puffs.filter((p) => p.life < p.max);
    const settled: Debris[] = [];
    for (const d of this.debris) {
      d.vy += 9 * d.s * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.spin * dt;
      if (d.y >= d.floor && d.vy > 0) {
        d.y = d.floor;
        if (!d.bounced && d.vy > 0.8 * d.s) { d.bounced = true; d.vy *= -0.3; d.vx *= 0.5; d.spin *= 0.5; }
        else settled.push(d);
      }
    }
    if (settled.length) {
      this.debris = this.debris.filter((d) => !settled.includes(d));
      for (const d of settled) this.onSettle({ kind: d.kind, x: d.x, y: d.y, angle: d.angle, s: d.s });
    }
  }

  draw(ctx: Ctx): void {
    for (const d of this.debris) paintDebris(ctx, d.kind, d.x, d.y, d.angle, d.s);
    for (const p of this.puffs) {
      ctx.globalAlpha = 0.5 * (1 - p.life / p.max);
      ctx.fillStyle = '#c9cacd';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // room light flash first (additive), then tracers, then the flash stars on top
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      if (!f.light) continue;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 520);
      g.addColorStop(0, `rgba(${FLASH_GLOW},0.22)`);
      g.addColorStop(1, `rgba(${FLASH_GLOW},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(f.x - 520, f.y - 520, 1040, 1040);
    }
    ctx.restore();
    ctx.lineCap = 'round';
    for (const t of this.tracers) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(t.from[0], t.from[1]); ctx.lineTo(t.to[0], t.to[1]); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(t.from[0], t.from[1]); ctx.lineTo(t.to[0], t.to[1]); ctx.stroke();
    }
    for (const f of this.flashes) muzzleFlash(ctx, f);
  }
}

/** White star + warm radial glow, pointing along the barrel (ported from the style frame). */
function muzzleFlash(ctx: Ctx, f: Flash): void {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);
  ctx.scale(f.size, f.size);
  const g = ctx.createRadialGradient(0.05, 0, 0, 0.05, 0, 0.3);
  g.addColorStop(0, `rgba(${FLASH_GLOW},0.85)`);
  g.addColorStop(1, `rgba(${FLASH_GLOW},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0.05, 0, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0.07, 0);
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2, rr = i % 2 ? 0.04 : i % 4 === 0 ? 0.15 : 0.1;
    ctx.lineTo(Math.cos(ang) * rr * (Math.cos(ang) > 0 ? 1.4 : 0.8), Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** A casing (small light cylinder) or a magazine (dark block), in screen px at scale `s` (px per H). */
export function paintDebris(ctx: Ctx, kind: 'casing' | 'mag' | 'pin', x: number, y: number, angle: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.lineWidth = 0.006;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  if (kind === 'pin') {
    // ring + short split pin
    ctx.arc(0, 0, 0.018, 0, Math.PI * 2);
    ctx.moveTo(0.018, 0); ctx.lineTo(0.05, 0.004);
    ctx.lineWidth = 0.007; ctx.strokeStyle = '#8d8e93'; ctx.stroke();
    ctx.restore();
    return;
  }
  if (kind === 'casing') { ctx.roundRect(-0.016, -0.007, 0.032, 0.014, 0.004); ctx.fillStyle = '#c9c7bf'; }
  else { ctx.roundRect(-0.02, -0.05, 0.04, 0.1, 0.006); ctx.fillStyle = '#2f3034'; }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
