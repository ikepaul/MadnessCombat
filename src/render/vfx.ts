// Screen-space particles and 1-2 frame effects driven by sim events (design/art-direction.md).
// Advanced on sim ticks, so slow-mo, hit-stop and pause apply to them too.
import { isMelee, MELEE } from '../data/melee';
import { BLOOD, INK } from '../data/palettes';
import type { HitKind } from '../sim/events';
import type { World } from '../sim/world';
import { project, type ScreenPoint, scaleAt } from './camera';
import { BOLT_GLOW, boltStroke, jag, mulberry } from './canvas/bossPainter';
import type { Ctx } from './canvas/draw';

interface Puff { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; max: number; z: number }
interface Drop { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; g: number }
/**
 * Revamp B1: a smear lives a few ticks and shrinks toward its leading edge. `r` = arc radius (H),
 * `inner` = inner radius as a fraction (blades thin, blunt thick), `len` = streak length for
 * punches and thrusts.
 */
interface Smear { x: number; y: number; fx: number; fy: number; s: number; facing: number; kind: HitKind; left: number; max: number; r: number; inner: number; blade: boolean; thrust: boolean; len: number }
interface Star { x: number; y: number; s: number; left: number; big: boolean }
/** M6: explosion flash, smoke and the pieces of gibbed bodies. */
interface Boom { x: number; y: number; s: number; left: number }
interface Smoke { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; max: number; shade: number }
interface Chunk { x: number; y: number; vx: number; vy: number; floor: number; r: number; angle: number; spin: number; color: string; life: number; landed: boolean }

/** Ticks at 60 Hz: 1 frame at 30 fps = 2 ticks. Revamp B1: smears trail 2-3 frames. invented */
const SMEAR_TICKS: Partial<Record<HitKind, number>> = { light: 4, heavy: 5, uppercut: 6, finisher: 4, stab: 4, slash: 6, smash: 6 };
const STAR_TICKS = 3;
/** The alert "!" stays 0.7 s. */
const MARK_TICKS = 42;
/** boss-halo: the bolt itself shows 2 frames (4 ticks), then an afterglow fades over 0.25 s. */
const BOLT_TICKS = 4;
const GLOW_TICKS = 15;
/** The sweep's ripple rolls out over this long (s): the push itself takes ~0.33 s (boss-halo). */
const RIPPLE_TIME = 0.5;

export class Vfx {
  private puffs: Puff[] = [];
  private drops: Drop[] = [];
  private smears: Smear[] = [];
  private stars: Star[] = [];
  /** Cannon muzzle blasts: screen pos + ticks left. */
  private blasts: { x: number; y: number; s: number; left: number; facing: number }[] = [];
  private booms: Boom[] = [];
  private smoke: Smoke[] = [];
  private chunks: Chunk[] = [];
  /** M10: pictogram speech bubbles (world-interrogate-knockout), seconds left. */
  private bubbles: { actorId: number; icon: string; left: number; max: number }[] = [];
  /** M7: "!" marks over enemies that just noticed something (ticks left). */
  private marks: { actorId: number; left: number }[] = [];
  /** M8: lightning bolts (screen points) and ward ricochet sparks, ticks left. */
  private bolts: { from: ScreenPoint; to: ScreenPoint; s: number; seed: number; left: number }[] = [];
  private sparks: { x: number; y: number; s: number; facing: number; seed: number; left: number }[] = [];
  /** Telekinesis ripples (seconds since the push). */
  private ripples: { x: number; y: number; s: number; dir: number; t: number }[] = [];

  /** Extreme gore (stage 3): necks still spraying, seconds left. */
  private fountains: { actorId: number; left: number }[] = [];

  /** Blood amount: 1, or 2.2 under extreme gore (src/sim/gore.ts). */
  private get gore(): number {
    return this.world.gore === 'extreme' ? 2.2 : 1;
  }

  /** `blood()` = the current stage shows blood (off for stage 1). */
  constructor(private world: World, private blood: () => boolean) {
    // M9: a new room starts without the last one's smoke and sparks
    world.events.on('roomChanged', () => {
      this.puffs = []; this.drops = []; this.smears = []; this.stars = []; this.blasts = []; this.booms = [];
      this.smoke = []; this.chunks = []; this.fountains = []; this.marks = []; this.bolts = []; this.sparks = []; this.ripples = []; this.bubbles = [];
    });
    // M10: sparks off the cables, dust as the cab hits the bottom
    world.events.on('cableHit', (e) => {
      const [x, y] = project(e.x, e.y, e.z);
      this.stars.push({ x, y, s: scaleAt(e.z), left: STAR_TICKS, big: e.broke });
    });
    world.events.on('elevator', (e) => { if (e.phase === 'crash') for (const x of [-1, 0, 1]) this.dust(x, 0, 8.8, 14); });
    // M12: the boss's teleport (an implosion), the wall blast's rubble, glass from the vending machine
    world.events.on('teleport', (e) => {
      const [x, y] = project(e.x, e.y + 0.7, e.z), s = scaleAt(e.z);
      this.ripples.push({ x, y, s, dir: 1, t: 0 }, { x, y, s, dir: -1, t: 0 });
      this.booms.push({ x, y, s: s * 0.6, left: 2 });
    });
    world.events.on('wallBlast', (e) => { for (let k = 0; k < 3; k++) this.dust(e.x, e.y - 0.5 + k * 0.4, e.z, 12); });
    world.events.on('vendingSmash', (e) => {
      const [x, y] = project(e.x, e.y + 0.9, e.z), s = scaleAt(e.z);
      this.stars.push({ x, y, s, left: STAR_TICKS, big: true });
      this.dust(e.x, e.y + 0.6, e.z, 8);
    });
    world.events.on('stab', (e) => { const [x, y] = project(e.x, e.y + 0.6, e.z); this.stars.push({ x, y, s: scaleAt(e.z), left: STAR_TICKS + 2, big: true }); });
    world.events.on('speech', (e) => {
      this.bubbles = this.bubbles.filter((b) => b.actorId !== e.actorId);
      this.bubbles.push({ actorId: e.actorId, icon: e.icon, left: e.seconds, max: e.seconds });
    });
    world.events.on('alert', (e) => { this.marks = this.marks.filter((m) => m.actorId !== e.actorId); this.marks.push({ actorId: e.actorId, left: MARK_TICKS }); });
    world.events.on('land', (e) => this.dust(e.x, e.y, e.z, 6 + Math.min(6, e.fallSpeed)));
    world.events.on('dive', (e) => this.dust(e.x, e.y, e.z, 8));
    world.events.on('standUp', (e) => this.dust(e.x, e.y, e.z, 4));
    world.events.on('bodyFall', (e) => this.dust(e.x, e.y, e.z, 6 + Math.min(8, e.speed)));
    world.events.on('cannonFire', (e) => {
      const c = world.cannons.find((k) => k.x === e.x && k.z === e.z);
      const f = c?.facing ?? 1;
      const [x, y] = project(e.x + f * 0.45, 0.6, e.z);
      this.blasts.push({ x, y, s: scaleAt(e.z), left: 2, facing: f });
    });
    world.events.on('cannonHit', (e) => {
      const a = world.actorById(e.actorId);
      if (!a) return;
      const [x, y] = project(a.pos.x, a.pos.y + 0.6, a.pos.z);
      this.blasts.push({ x, y, s: scaleAt(a.pos.z) * 0.7, left: 3, facing: 1 });
      this.dust(a.pos.x, a.pos.y, a.pos.z, 6);
    });
    world.events.on('punch', (e) => {
      const a = world.actorById(e.actorId);
      if (!a) return;
      const [x, y] = project(a.pos.x, a.pos.y + 0.55, a.pos.z);
      const [fx, fy] = project(e.x, e.y, e.z);
      // per weapon: the arc's radius follows the weapon's length, blades cut a thin bright arc
      const w = a.attack?.weapon && isMelee(a.attack.weapon) ? MELEE[a.attack.weapon] : undefined;
      const max = SMEAR_TICKS[e.kind] ?? 4;
      this.smears.push({
        x, y, fx, fy, s: scaleAt(a.pos.z), facing: e.facing, kind: e.kind, left: max, max,
        r: w ? Math.min(0.85, 0.3 + w.length * 0.5) : e.kind === 'uppercut' ? 0.36 : 0.42,
        inner: w?.edge === 'blade' ? 0.86 : 0.7, blade: w?.edge === 'blade', thrust: a.attack?.kind === 'thrust' || e.kind === 'stab',
        len: w ? w.reach * 0.7 : e.kind === 'heavy' ? 0.45 : 0.3,
      });
    });
    world.events.on('hit', (e) => {
      const [x, y] = project(e.x, e.y, e.z);
      const s = scaleAt(e.z);
      this.stars.push({ x, y, s, left: STAR_TICKS, big: e.damage >= 2 || e.killed });
      if (this.blood() && e.damage > 0) this.mist(x, y, s, e.dirX, Math.round((e.killed ? 18 : 10) * this.gore), this.gore > 1 ? -0.9 : -0.6);
    });
    world.events.on('kill', (e) => {
      if (!this.blood()) return;
      const [x, y] = project(e.x, e.y + 0.6, e.z), s = scaleAt(e.z);
      if (e.decap) {
        this.mist(x, y, s, 0, Math.round(16 * this.gore), -1.6);
        // extreme: a fountain from the neck for a moment
        if (this.gore > 1) this.fountains.push({ actorId: e.actorId, left: 0.9 });
      }
      // extreme gore: every heavy kill bursts
      else if (this.gore > 1 && (e.kind === 'heavy' || e.kind === 'uppercut' || e.kind === 'finisher' || e.kind === 'slash' || e.kind === 'smash' || e.kind === 'bullet')) {
        this.mist(x, y, s, 0, 34, -1.2);
        this.mist(x, y, s, 1, 10, -0.4);
        this.mist(x, y, s, -1, 10, -0.4);
      }
    });
    // extreme gore: a hand flies off, spraying
    world.events.on('dismember', (e) => {
      if (!this.blood()) return;
      const [x, y] = project(e.x, e.y, e.z), s = scaleAt(e.z), floor = project(e.x, 0, e.z)[1];
      const ang = -Math.PI / 2 + e.dirX * (0.5 + Math.random() * 0.6), v = (2.5 + Math.random() * 1.5) * s;
      this.chunks.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, floor: floor + (Math.random() - 0.5) * 0.1 * s, r: 0.06 * s, angle: 0, spin: e.dirX * 14, color: '#c9cacd', life: 0, landed: false });
      this.mist(x, y, s, e.dirX, 14, -0.8);
    });
    world.events.on('wallHit', (e) => {
      if (e.speed > 2) this.dust(e.x, e.y + 0.3, e.z, 6);
    });
    // M6: explosions, gibs, blades sticking, guns shot out of hands, catches
    world.events.on('explosion', (e) => {
      const [x, y] = project(e.x, Math.max(0.3, e.y), e.z), s = scaleAt(e.z);
      this.booms.push({ x, y, s, left: 4 });
      // white starburst -> grey smoke puffs rising (design/art-direction.md effects table)
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.6 + Math.random() * 1.6) * s;
        this.smoke.push({ x: x + Math.cos(a) * 0.2 * s, y: y + Math.sin(a) * 0.12 * s, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 0.5 * s,
          r: (0.08 + Math.random() * 0.1) * s, grow: (0.35 + Math.random() * 0.3) * s, life: 0, max: 0.8 + Math.random() * 0.7, shade: 120 + Math.floor(Math.random() * 70) });
      }
      this.dust(e.x, 0, e.z, 14);
    });
    world.events.on('gib', (e) => {
      const a = world.actorById(e.actorId);
      const [x, y] = project(e.x, e.y + 0.4, e.z), s = scaleAt(e.z), floor = project(e.x, 0, e.z)[1];
      const colors = a?.kind === 'zombie' ? ['#63d06b', '#8e8f94', '#4a4b50'] : ['#8e8f94', '#d2d2d5', '#4a4b50', '#707176'];
      const pieces = this.gore > 1 ? 24 : 12;
      for (let i = 0; i < pieces; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = (1.5 + Math.random() * 3) * s;
        this.chunks.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, floor: floor + (Math.random() - 0.5) * 0.25 * s, r: (0.03 + Math.random() * 0.05) * s,
          angle: Math.random() * 6, spin: (Math.random() - 0.5) * 20, color: colors[i % colors.length], life: 0, landed: false });
      }
      if (this.blood()) this.mist(x, y, s, 0, Math.round(24 * this.gore * 1.2), -1.4);
    });
    world.events.on('stick', (e) => {
      const [x, y] = project(e.x, e.y, e.z), s = scaleAt(e.z);
      if (e.surface === 'flesh') { if (this.blood()) this.mist(x, y, s, 0, Math.round(6 * this.gore), -0.4); }
      else this.dust(e.x, e.y, e.z, 4);
    });
    world.events.on('disarm', (e) => {
      if (e.how !== 'shot') return;
      const a = world.actorById(e.actorId);
      if (!a) return;
      const [x, y] = project(a.pos.x + a.facing * 0.35, a.pos.y + 0.55, a.pos.z);
      this.stars.push({ x, y, s: scaleAt(a.pos.z) * 0.6, left: STAR_TICKS, big: false });
    });
    world.events.on('catch', (e) => {
      const [x, y] = project(e.x, e.y, e.z);
      this.stars.push({ x, y, s: scaleAt(e.z) * 0.5, left: STAR_TICKS, big: false });
    });
    // M8 boss: lightning (2 bright frames + afterglow), ricochet sparks off the ward, landing dust
    world.events.on('lightning', (e) => {
      const from = project(e.from.x, e.from.y, e.from.z), to = project(e.to.x, e.to.y, e.to.z);
      this.bolts.push({ from, to, s: scaleAt(e.to.z), seed: Math.floor(Math.random() * 1e9), left: BOLT_TICKS + GLOW_TICKS });
    });
    world.events.on('wardHit', (e) => {
      const a = world.actorById(e.actorId);
      this.sparks.push({ x: e.at[0], y: e.at[1], s: a ? scaleAt(a.pos.z) : 200, facing: a?.facing ?? 1, seed: Math.floor(Math.random() * 1e9), left: 4 });
    });
    world.events.on('bossArrive', (e) => { if (e.phase === 'land') this.dust(e.x, 0, e.z, 10); });
    // the hover dash kicks up the ground under him; each slam throws up dust and an impact star
    world.events.on('bossDash', (e) => { if (e.phase === 'go') this.dust(e.x, 0, e.z, 8); });
    // M9: the fling rolls the same ripple at the player; the mass raise flashes over every body;
    // dropping in through a vent or a blasted hole brings dust and bits of ceiling with it
    world.events.on('bossFling', (e) => {
      const a = world.actorById(e.actorId);
      if (!a) return;
      const [x, y] = project(a.pos.x + e.dir * 0.4, a.pos.y + 0.7, a.pos.z);
      this.ripples.push({ x, y, s: scaleAt(a.pos.z), dir: e.dir, t: 0 });
    });
    world.events.on('zombieRise', (e) => { if (e.phase === 'start') this.dust(e.x, 0, e.z, 5); });
    world.events.on('roomEnter', () => {
      for (const p of world.players) {
        if (p.pos.y < 1) continue;
        const [x, y] = project(p.pos.x, world.room.height - 0.05, p.pos.z), s = scaleAt(p.pos.z);
        for (let i = 0; i < 16; i++) {
          this.smoke.push({ x: x + (Math.random() - 0.5) * 0.6 * s, y, vx: (Math.random() - 0.5) * 0.4 * s, vy: (0.3 + Math.random() * 0.6) * s, r: (0.05 + Math.random() * 0.06) * s, grow: 0.15 * s, life: 0, max: 0.8 + Math.random() * 0.6, shade: 150 + Math.floor(Math.random() * 40) });
        }
      }
    });
    // the sweep: a distortion ripple rolling out of his palm; the cannon landing: a dust burst
    world.events.on('bossSweep', (e) => {
      if (e.phase !== 'push') return;
      const [x, y] = project(e.x + e.dir * 0.55, e.y + 0.7, e.z);
      this.ripples.push({ x, y, s: scaleAt(e.z), dir: e.dir, t: 0 });
      this.dust(e.x + e.dir * 1.5, 0, e.z, 10);
    });
    world.events.on('cannonDrop', (e) => { if (e.phase === 'land') this.dust(e.x, 0, e.z, 18); });
    world.events.on('bossSlam', (e) => {
      const [x, y] = project(e.x, e.y + 0.2, e.z);
      this.stars.push({ x, y, s: scaleAt(e.z), left: STAR_TICKS, big: true });
      this.dust(e.x, 0, e.z, 10);
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

  /** Blood mist: ~14 droplets, 0.25-0.45 s, gravity (design/art-direction.md). */
  private mist(x: number, y: number, s: number, dirX: number, n: number, up = -0.6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(up, dirX || (Math.random() - 0.5)) + (Math.random() - 0.5) * 1.6;
      const v = (1.2 + Math.random() * 2.2) * s;
      this.drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: (0.008 + Math.random() * 0.016) * s, life: 0, max: 0.25 + Math.random() * 0.2, g: 9 * s });
    }
  }

  private step(dt: number): void {
    // extreme gore: the neck keeps spurting in pulses while the body stands and falls
    for (const f of this.fountains) {
      f.left -= dt;
      const a = this.world.actorById(f.actorId);
      if (!a || !this.blood() || Math.sin(f.left * 26) < 0.3) continue;
      const [hx, hy] = [a.pos.x + a.facing * 0.01, a.pos.y + 0.66];
      const [x, y] = project(hx, hy, a.pos.z);
      this.mist(x, y, scaleAt(a.pos.z), (Math.random() - 0.5) * 0.6, 2, -2.2);
    }
    this.fountains = this.fountains.filter((f) => f.left > 0);
    for (const b of this.bubbles) b.left -= dt;
    this.bubbles = this.bubbles.filter((b) => b.left > 0);
    for (const m of this.marks) m.left--;
    this.marks = this.marks.filter((m) => m.left > 0);
    for (const b of this.bolts) b.left--;
    this.bolts = this.bolts.filter((b) => b.left > 0);
    for (const sp of this.sparks) sp.left--;
    this.sparks = this.sparks.filter((sp) => sp.left > 0);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < RIPPLE_TIME);
    for (const p of this.puffs) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.r += p.grow * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);
    for (const d of this.drops) {
      d.life += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += d.g * dt;
    }
    this.drops = this.drops.filter((d) => d.life < d.max);
    for (const b of this.blasts) b.left--;
    this.blasts = this.blasts.filter((b) => b.left > 0);
    for (const m of this.smears) m.left--;
    this.smears = this.smears.filter((m) => m.left > 0);
    for (const st of this.stars) st.left--;
    this.stars = this.stars.filter((st) => st.left > 0);
    for (const b of this.booms) b.left--;
    this.booms = this.booms.filter((b) => b.left > 0);
    for (const p of this.smoke) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy = p.vy * 0.92 - 0.4 * p.r * dt * 10;
      p.r += p.grow * dt;
    }
    this.smoke = this.smoke.filter((p) => p.life < p.max);
    for (const c of this.chunks) {
      c.life += dt;
      if (c.landed) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 9 * (c.r / 0.05) * dt * 60;
      c.angle += c.spin * dt;
      if (c.y >= c.floor && c.vy > 0) { c.y = c.floor; c.landed = true; }
    }
    // the pieces stay a while, then fade
    this.chunks = this.chunks.filter((c) => c.life < 6);
  }

  draw(ctx: Ctx): void {
    for (const c of this.chunks) {
      ctx.globalAlpha = c.life > 5 ? 6 - c.life : 1;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.beginPath(); ctx.ellipse(0, 0, c.r, c.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.color; ctx.fill();
      ctx.lineWidth = Math.max(1, c.r * 0.25); ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const p of this.puffs) {
      ctx.globalAlpha = 0.45 * (1 - p.life / p.max);
      ctx.fillStyle = '#b9babd';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = BLOOD;
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 - 0.5 * (d.life / d.max)), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const m of this.smears) this.drawSmear(ctx, m);
    for (const st of this.stars) this.drawStar(ctx, st);
    for (const p of this.smoke) {
      ctx.globalAlpha = 0.55 * (1 - p.life / p.max);
      ctx.fillStyle = `rgb(${p.shade},${p.shade},${p.shade + 3})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const b of this.booms) this.drawBoom(ctx, b);
    for (const b of this.bolts) this.drawBolt(ctx, b);
    for (const sp of this.sparks) this.drawSparks(ctx, sp);
    for (const r of this.ripples) this.drawRipple(ctx, r);
    for (const m of this.marks) this.drawMark(ctx, m);
    this.drawTrails(ctx);
    for (const b of this.bubbles) this.drawBubble(ctx, b);
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

  /**
   * Smear along the strike's path (revamp B1): a tapered streak for punches, stabs and thrusts,
   * an arc for swings and uppercuts. Over its 2-3 frames the tail pulls in toward the leading
   * edge and fades; blades add a thin bright edge line.
   */
  private drawSmear(ctx: Ctx, m: Smear): void {
    const u = m.left / m.max; // 1 on the first tick -> 0
    if (m.kind === 'light' || m.kind === 'heavy' || m.thrust) {
      // from behind the fist (thin) to the fist (wide), no outline
      const len = m.len * m.s * (0.35 + 0.65 * u), w = (m.kind === 'heavy' ? 0.07 : 0.05) * m.s * (0.6 + 0.4 * u);
      const bx = m.fx - m.facing * len, by = m.fy + 0.05 * m.s * u;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(m.fx, m.fy - w);
      ctx.lineTo(m.fx, m.fy + w);
      ctx.closePath();
      ctx.fillStyle = `rgba(240,240,242,${0.65 * u})`;
      ctx.fill();
      return;
    }
    // arc angles in local space (+x forward, -y up): where the strike came from -> where it went
    const [from, a1] = m.kind === 'uppercut' ? [1.1, -1.2] : [-1.0, 1.1];
    const a0 = a1 + (from - a1) * (0.25 + 0.75 * u);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.s * m.facing, m.s);
    ctx.beginPath();
    ctx.arc(0, 0, m.r, a0, a1, a1 < a0);
    ctx.arc(0, 0, m.r * m.inner, a1, a0, a1 >= a0);
    ctx.closePath();
    ctx.fillStyle = `rgba(240,240,242,${0.6 * u})`;
    ctx.fill();
    if (m.blade) {
      ctx.beginPath();
      ctx.arc(0, 0, m.r, a0 + (a1 - a0) * 0.4, a1, a1 < a0);
      ctx.lineWidth = 0.012;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * u})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Explosion: additive flash lighting the room, then a big white starburst (2 frames). */
  private drawBoom(ctx: Ctx, b: Boom): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 700);
    g.addColorStop(0, `rgba(255,236,200,${0.12 * b.left})`);
    g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 700, b.y - 700, 1400, 1400);
    ctx.restore();
    const r = b.s * (0.55 + 0.2 * (4 - b.left));
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r * (0.8 + 0.2 * Math.sin(i * 7.3));
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, b.s * 0.012);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Lightning (design/art-direction.md M8: jagged, cyan-white, 2 frames + afterglow): a room flash
   * and the full bolt with forks while it's live, then only a fading cyan trace.
   */
  private drawBolt(ctx: Ctx, b: { from: ScreenPoint; to: ScreenPoint; s: number; seed: number; left: number }): void {
    const live = b.left > GLOW_TICKS, k = live ? 1 : b.left / GLOW_TICKS;
    const len = Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]);
    const n = Math.max(6, Math.round(len / (0.12 * b.s))), amp = 0.06 * b.s;
    if (live) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(b.to[0], b.to[1], 0, b.to[0], b.to[1], 900);
      g.addColorStop(0, 'rgba(170,230,255,0.22)'); g.addColorStop(1, 'rgba(170,230,255,0)');
      ctx.fillStyle = g; ctx.fillRect(b.to[0] - 900, b.to[1] - 900, 1800, 1800);
      ctx.restore();
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the same shape every frame of this bolt (seeded), redrawn thinner as it fades
    const rnd = mulberry(b.seed);
    jag(ctx, b.from[0], b.from[1], b.to[0], b.to[1], n, amp, rnd);
    boltStroke(ctx, Math.max(2, 0.018 * b.s) * (live ? 1 : 0.6), live ? 1 : k * 0.7);
    if (live) for (let f = 0; f < 3; f++) {
      const u = 0.25 + rnd() * 0.5, px = b.from[0] + (b.to[0] - b.from[0]) * u, py = b.from[1] + (b.to[1] - b.from[1]) * u;
      const ang = Math.atan2(b.to[1] - b.from[1], b.to[0] - b.from[0]) + (rnd() - 0.5) * 1.6, l = (0.15 + rnd() * 0.25) * b.s;
      jag(ctx, px, py, px + Math.cos(ang) * l, py + Math.sin(ang) * l, 4, amp * 0.5, rnd);
      boltStroke(ctx, Math.max(1, 0.008 * b.s));
    }
    // impact glow on the corpse
    const g = ctx.createRadialGradient(b.to[0], b.to[1], 0, b.to[0], b.to[1], 0.35 * b.s);
    g.addColorStop(0, `${BOLT_GLOW}${(0.6 * k).toFixed(3)})`); g.addColorStop(1, `${BOLT_GLOW}0)`);
    ctx.fillStyle = g; ctx.fillRect(b.to[0] - 0.35 * b.s, b.to[1] - 0.35 * b.s, 0.7 * b.s, 0.7 * b.s);
    ctx.restore();
  }

  /**
   * Telekinesis (design/art-direction.md M8: distortion ripple): three arcs rolling out across the
   * floor in the push direction, widening and fading, a faint cyan edge on a pale wash.
   */
  private drawRipple(ctx: Ctx, r: { x: number; y: number; s: number; dir: number; t: number }): void {
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const u = r.t / RIPPLE_TIME - i * 0.15;
      if (u <= 0 || u >= 1) continue;
      const cx = r.x + r.dir * u * 3.2 * r.s, rad = (0.3 + u * 0.9) * r.s, a = (1 - u) * 0.6;
      const a0 = r.dir > 0 ? -1.1 : Math.PI - 1.1;
      ctx.beginPath(); ctx.arc(cx - r.dir * rad * 0.6, r.y, rad, a0, a0 + 2.2);
      ctx.strokeStyle = `rgba(240,248,255,${(a * 0.5).toFixed(3)})`; ctx.lineWidth = Math.max(4, 0.08 * r.s); ctx.stroke();
      ctx.strokeStyle = `${BOLT_GLOW}${a.toFixed(3)})`; ctx.lineWidth = Math.max(1.5, 0.012 * r.s); ctx.stroke();
    }
    ctx.restore();
  }

  /** A bullet stopped on the ward: white sparks fanning back toward the shooter. */
  private drawSparks(ctx: Ctx, sp: { x: number; y: number; s: number; facing: number; seed: number; left: number }): void {
    const rnd = mulberry(sp.seed), k = sp.left / 4;
    ctx.save(); ctx.lineCap = 'round';
    const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 0.12 * sp.s);
    g.addColorStop(0, `${BOLT_GLOW}${(0.7 * k).toFixed(3)})`); g.addColorStop(1, `${BOLT_GLOW}0)`);
    ctx.fillStyle = g; ctx.fillRect(sp.x - 0.12 * sp.s, sp.y - 0.12 * sp.s, 0.24 * sp.s, 0.24 * sp.s);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, 0.008 * sp.s); ctx.globalAlpha = k;
    for (let i = 0; i < 6; i++) {
      // back out of the ward's face, toward whoever fired
      const a = (sp.facing > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 1.8, l = (0.05 + rnd() * 0.12) * sp.s * (1.6 - k * 0.6);
      ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(a) * l * 0.4, sp.y + Math.sin(a) * l * 0.4); ctx.lineTo(sp.x + Math.cos(a) * l, sp.y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.restore();
  }

  /** M11 improbability mode: ghost trails behind bodies flying fast. */
  private drawTrails(ctx: Ctx): void {
    if (this.world.physics !== 'improbable') return;
    for (const a of this.world.actors) {
      const f = a.flight;
      if (!f || f.phase !== 'air' || Math.hypot(f.vx, f.vy) < 6) continue;
      const s = scaleAt(a.pos.z);
      for (let k = 1; k <= 4; k++) {
        const [x, y] = project(a.pos.x - f.vx * 0.03 * k, a.pos.y + 0.45 - f.vy * 0.03 * k, a.pos.z);
        ctx.beginPath(); ctx.ellipse(x, y, 0.22 * s, 0.3 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,236,228,${0.22 - k * 0.045})`; ctx.fill();
      }
    }
  }

  /**
   * A pictogram speech bubble over the head (own design, no words): a photo of the target, a
   * question mark, a shrug ("?!"). Pops in, sits, fades.
   */
  private drawBubble(ctx: Ctx, b: { actorId: number; icon: string; left: number; max: number }): void {
    const a = this.world.actorById(b.actorId);
    if (!a) return;
    const [x, y] = project(a.pos.x + a.facing * 0.25, a.pos.y + 1.45, a.pos.z), s = scaleAt(a.pos.z);
    const age = b.max - b.left, pop = Math.min(1, age / 0.12);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (0.8 + 0.2 * pop), s * (0.8 + 0.2 * pop));
    ctx.globalAlpha = Math.min(1, b.left / 0.2);
    // the bubble with its tail toward the speaker
    ctx.beginPath(); ctx.roundRect(-0.28, -0.22, 0.56, 0.4, 0.1);
    ctx.moveTo(-a.facing * 0.04, 0.18); ctx.lineTo(-a.facing * 0.14, 0.32); ctx.lineTo(-a.facing * 0.14 + a.facing * 0.02, 0.18);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 0.025; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK;
    if (b.icon === 'photo') {
      // a little framed photo: the target (glasses, side part)
      ctx.save(); ctx.rotate(-0.08);
      ctx.fillStyle = '#e6e7ea'; ctx.fillRect(-0.15, -0.15, 0.3, 0.27); ctx.lineWidth = 0.015; ctx.strokeRect(-0.15, -0.15, 0.3, 0.27);
      ctx.beginPath(); ctx.arc(0, -0.02, 0.075, 0, Math.PI * 2); ctx.fillStyle = '#c9cbd0'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -0.04, 0.075, Math.PI, 0); ctx.fillStyle = '#5a5c62'; ctx.fill();
      ctx.lineWidth = 0.012; ctx.strokeRect(-0.045, -0.025, 0.035, 0.025); ctx.strokeRect(0.01, -0.025, 0.035, 0.025);
      ctx.restore();
    } else {
      ctx.font = `0.3px Anton`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.icon === 'shrug' ? '?!' : '?', 0, 0);
    }
    ctx.restore();
  }

  /** The alert mark (own design): a white "!" with an ink rim that pops in over the head, then fades. */
  private drawMark(ctx: Ctx, m: { actorId: number; left: number }): void {
    const a = this.world.actorById(m.actorId);
    if (!a || a.state === 'dead') return;
    const [x, y] = project(a.pos.x, a.pos.y + 1.22, a.pos.z), s = scaleAt(a.pos.z);
    const age = MARK_TICKS - m.left;
    const pop = age < 4 ? 0.6 + age * 0.17 : age < 8 ? 1.28 - (age - 4) * 0.07 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * pop, s * pop);
    ctx.globalAlpha = Math.min(1, m.left / 10);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.045, -0.2); ctx.lineTo(0.045, -0.2); ctx.lineTo(0.022, 0.02); ctx.lineTo(-0.022, 0.02); ctx.closePath();
    ctx.moveTo(0.032, 0.075); ctx.arc(0, 0.075, 0.032, 0, Math.PI * 2);
    ctx.lineWidth = 0.035; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }

  /** 1-2 frame impact star at the contact point: white with an ink rim. */
  private drawStar(ctx: Ctx, st: Star): void {
    const r = (st.big ? 0.13 : 0.09) * st.s * (st.left === STAR_TICKS ? 1 : 0.8);
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2, rr = i % 2 ? r * 0.42 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, st.s * 0.01);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }
}
