// M9 outdoor scenery for stage 2 (our own designs, design/art-direction.md: rooftop/outdoor night
// variant, building exteriors): a night street under a building's wall, and flat rooftops over a
// skyline. Plus the room-graph bits that sit in any room: ladders, the breach mark, blasted holes
// in the ceiling, rooftop crates. Baked with the room layer (crates are props: drawn per frame).
import { INK, type Palette } from '../../data/palettes';
import type { CrateDef, RoomDef, Zone } from '../../sim/room';
import { project as P, SCREEN_H, SCREEN_W, scaleAt } from '../camera';
import { type Ctx, line, linear, mulberry32, poly } from './draw';

/** Night tints over the stage palette (the cool palette darkened toward blue-black). */
const NIGHT = { skyTop: '#11141a', skyLow: '#2a303b', glow: '#3b4350', far: '#1a1e25', window: '#d9d2a8', windowCool: '#9fb3c8' };

/** Darken a #rrggbb colour by `k` (0..1). */
function dim(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16), f = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function sky(ctx: Ctx, hy: number, night: boolean, pal: Palette): void {
  ctx.fillStyle = night ? linear(ctx, 0, 0, 0, hy, [[0, NIGHT.skyTop], [0.75, NIGHT.skyLow], [1, NIGHT.glow]]) : linear(ctx, 0, 0, 0, hy, [[0, pal.ceil], [1, pal.back]]);
  ctx.fillRect(0, 0, SCREEN_W, hy);
  if (!night) return;
  // a few stars and a thin moon (own design)
  const r = mulberry32(11);
  ctx.fillStyle = 'rgba(230,236,245,0.7)';
  for (let i = 0; i < 46; i++) { const x = r() * SCREEN_W, y = r() * hy * 0.55; ctx.fillRect(x, y, 2, 2); }
  ctx.beginPath(); ctx.arc(1520, 120, 34, 0, Math.PI * 2); ctx.fillStyle = '#e9edf2'; ctx.fill();
  ctx.beginPath(); ctx.arc(1534, 112, 32, 0, Math.PI * 2); ctx.fillStyle = NIGHT.skyTop; ctx.fill();
}

/** Lit and dark windows in a grid over a rectangle on screen. */
function windows(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, h: number, gap: number, seed: number, litShare: number): void {
  const r = mulberry32(seed);
  for (let y = y0 + gap; y + h < y1; y += h + gap) {
    for (let x = x0 + gap; x + w < x1; x += w + gap) {
      const lit = r() < litShare;
      ctx.fillStyle = lit ? (r() < 0.5 ? NIGHT.window : NIGHT.windowCool) : 'rgba(10,12,16,0.55)';
      ctx.globalAlpha = lit ? 0.55 + r() * 0.35 : 1;
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.globalAlpha = 1;
}

/** A night street: the building's wall across the back, pavement, a kerb, a lamp's glow. */
export function paintStreet(ctx: Ctx, room: RoomDef, pal: Palette): void {
  const zb = room.zBack, hy = P(0, 0, 1e6)[1];
  sky(ctx, hy, !!room.night, pal);
  // the wall: from the ground up past the top of the screen, at the back of the walkable ground
  const [, top] = P(0, 6, zb), [, foot] = P(0, 0, zb);
  const wall = room.night ? dim(pal.sideR, 0.45) : pal.sideR;
  ctx.fillStyle = wall;
  ctx.fillRect(0, top, SCREEN_W, foot - top);
  // brick courses and the building's ground floor band
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
  const s = scaleAt(zb);
  for (let y = foot - 0.09 * s, k = 0; y > top; y -= 0.09 * s, k++) {
    line(ctx, [0, y], [SCREEN_W, y]);
    for (let x = (k % 2) * 0.13 * s; x < SCREEN_W; x += 0.26 * s) line(ctx, [x, y], [x, y + 0.09 * s]);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, foot - 0.55 * s, SCREEN_W, 0.55 * s);
  // upper-floor windows (small, a few lit)
  windows(ctx, 0, top, SCREEN_W, foot - 1.6 * s, 0.32 * s, 0.42 * s, 0.38 * s, 4, 0.22);
  // a drainpipe and a wall lamp's warm pool on the bricks
  if (room.pipeX !== null) {
    const [px] = P(room.pipeX ?? -2.2, 0, zb);
    ctx.fillStyle = dim(pal.propShade, 0.4); ctx.fillRect(px - 6, top, 12, foot - top);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(px - 6, top - 2, 12, foot - top + 2);
  }
  const [lx, ly] = P(0.4, 2.2, zb);
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 3 * s);
  g.addColorStop(0, 'rgba(255,236,190,0.22)'); g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g; ctx.fillRect(lx - 3 * s, ly - 3 * s, 6 * s, 6 * s);
  ctx.fillStyle = '#4f5055'; ctx.fillRect(lx - 0.08 * s, ly - 0.05 * s, 0.16 * s, 0.1 * s);
  ctx.beginPath(); ctx.arc(lx, ly + 0.05 * s, 0.05 * s, 0, Math.PI); ctx.fillStyle = '#fff3d6'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; line(ctx, [0, foot], [SCREEN_W, foot]);
  // pavement slabs, then the kerb toward the camera
  const pave = room.night ? dim(pal.floor, 0.4) : pal.floor;
  ctx.fillStyle = linear(ctx, 0, foot, 0, SCREEN_H, [[0, dim(pave, 0.2)], [1, pave]]);
  ctx.fillRect(0, foot, SCREEN_W, SCREEN_H - foot);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.5;
  for (let z = room.zFront - 0.6; z < zb; z += 0.55) line(ctx, P(-12, 0, z), P(12, 0, z));
  for (let x = -12; x <= 12; x += 0.9) line(ctx, P(x, 0, room.zFront - 0.6), P(x, 0, zb));
  if (room.manhole) {
    const { x, z } = room.manhole, [mx, my] = P(x, 0, z), ms = scaleAt(z);
    ctx.beginPath(); ctx.ellipse(mx, my, 0.36 * ms, 0.09 * ms, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2f3339'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (const k of [-0.18, 0, 0.18]) line(ctx, [mx - 0.28 * ms, my + k * 0.4 * ms], [mx + 0.28 * ms, my + k * 0.4 * ms]);
  }
  for (const l of room.ladders ?? []) paintLadder(ctx, l.x, l.z, l.top);
  for (const v of room.wallVents ?? []) paintWallVent(ctx, v, room.zBack);
}

/** A vent grille in the back wall, its cover hanging open: the way in (a vent exit). */
function paintWallVent(ctx: Ctx, v: { x0: number; x1: number; y0: number; y1: number }, zb: number): void {
  const [x0, y1] = P(v.x0, v.y0, zb), [x1, y0] = P(v.x1, v.y1, zb), s = scaleAt(zb);
  // the dark duct behind
  ctx.fillStyle = '#16171a'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.2);
  // frame
  ctx.lineWidth = 0.035 * s; ctx.strokeStyle = '#8d8f95'; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(x0 - 0.018 * s, y0 - 0.018 * s, x1 - x0 + 0.036 * s, y1 - y0 + 0.036 * s);
  // the grille cover, taken off and leaning against the wall beside the opening
  const w = (x1 - x0) * 0.75, h = (y1 - y0) * 0.9, lx = x0 - w - 0.06 * s;
  ctx.save();
  ctx.translate(lx, y1);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.fillStyle = '#a9abb0'; ctx.fillRect(0, -h, w, h);
  ctx.strokeStyle = 'rgba(20,20,22,0.55)'; ctx.lineWidth = 2;
  for (let k = 1; k < 6; k++) line(ctx, [0.08 * w, -h + (k * h) / 6], [0.92 * w, -h + (k * h) / 6]);
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(0, -h, w, h);
  ctx.restore();
}

/** A flat roof at night: skyline beyond the parapet, tar floor, vents; roof B has the stairwell hut. */
export function paintRoof(ctx: Ctx, room: RoomDef, pal: Palette): void {
  const zb = room.zBack, hy = P(0, 0, 1e6)[1];
  sky(ctx, hy, !!room.night, pal);
  // the skyline: far blocks with lit windows, a nearer darker row
  const r = mulberry32(room.id.length * 7 + 3);
  for (const [k, col, lit] of [[0.6, NIGHT.far, 0.3], [1, dim(NIGHT.far, -0.25), 0.18]] as const) {
    for (let x = -40; x < SCREEN_W; ) {
      const w = (70 + r() * 140) * k, h = (90 + r() * 260) * k;
      ctx.fillStyle = col; ctx.fillRect(x, hy - h, w, h + 2);
      windows(ctx, x, hy - h, x + w, hy, 9 * k, 12 * k, 9 * k, Math.floor(r() * 1000), lit);
      x += w + r() * 18;
    }
  }
  // below the horizon, beyond the parapet: the lower roofs and streets far down, lights scattered
  const [, py] = P(0, 0, zb);
  ctx.fillStyle = linear(ctx, 0, hy, 0, py, [[0, dim(NIGHT.far, 0.1)], [1, dim(NIGHT.far, 0.5)]]);
  ctx.fillRect(0, hy, SCREEN_W, py - hy);
  for (let i = 0; i < 140; i++) {
    const y = hy + 4 + r() * (py - hy - 8), x = r() * SCREEN_W;
    ctx.fillStyle = r() < 0.5 ? NIGHT.window : NIGHT.windowCool;
    ctx.globalAlpha = 0.25 + r() * 0.4;
    ctx.fillRect(x, y, 3 + r() * 4, 2 + r() * 2);
  }
  ctx.globalAlpha = 1;
  // tar roof from the parapet to the camera
  const floor = room.night ? dim(pal.floor, 0.5) : pal.floor;
  ctx.fillStyle = linear(ctx, 0, py, 0, SCREEN_H, [[0, dim(floor, 0.25)], [1, floor]]);
  ctx.fillRect(0, py, SCREEN_W, SCREEN_H - py);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
  for (let z = room.zFront - 0.6; z < zb; z += 0.8) line(ctx, P(-12, 0, z), P(12, 0, z));
  // the parapet: a low wall along the back edge
  const ph = 0.42, wall = room.night ? dim(pal.sideL, 0.4) : pal.sideL;
  const [, t0] = P(0, ph, zb), [, t1] = P(0, ph, zb + 0.25);
  ctx.fillStyle = wall; ctx.fillRect(0, t0, SCREEN_W, py - t0);
  ctx.fillStyle = dim(wall, -0.15); ctx.fillRect(0, t1, SCREEN_W, t0 - t1);
  ctx.lineWidth = 3; ctx.strokeStyle = INK; line(ctx, [0, t1], [SCREEN_W, t1]); line(ctx, [0, t0], [SCREEN_W, t0]); line(ctx, [0, py], [SCREEN_W, py]);
  // an air vent box and a stub of pipe (decor, not solid)
  roofVent(ctx, -2.6, zb - 0.1, pal, !!room.night);
  if (room.breach) {
    // roof B: the stairwell hut with its door, back right
    hut(ctx, 2.6, zb - 0.05, pal, !!room.night);
    paintBreachMark(ctx, room.breach);
  }
}

function roofVent(ctx: Ctx, x: number, z: number, pal: Palette, night: boolean): void {
  const c = night ? dim(pal.propShade, 0.35) : pal.propShade;
  const box = (x0: number, x1: number, y0: number, y1: number, zz: number) => { const [a, b] = P(x0, y1, zz), [c2, d] = P(x1, y0, zz); return [a, b, c2 - a, d - b] as const; };
  const [bx, by, bw, bh] = box(x - 0.35, x + 0.35, 0.42, 0.95, z);
  ctx.fillStyle = c; ctx.fillRect(bx, by, bw, bh); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(bx, by, bw, bh);
  ctx.lineWidth = 1.5; for (let k = 1; k < 5; k++) line(ctx, [bx + 6, by + (bh * k) / 5], [bx + bw - 6, by + (bh * k) / 5]);
}

function hut(ctx: Ctx, x: number, z: number, pal: Palette, night: boolean): void {
  const c = night ? dim(pal.sideR, 0.35) : pal.sideR;
  const [ax, ay] = P(x - 0.8, 1.9, z), [bx, by] = P(x + 1.2, 0.42, z);
  ctx.fillStyle = c; ctx.fillRect(ax, ay, bx - ax, by - ay);
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(ax, ay, bx - ax, by - ay);
  const [dx, dy] = P(x - 0.45, 1.55, z), [ex, ey] = P(x + 0.15, 0.42, z);
  ctx.fillStyle = dim(c, 0.3); ctx.fillRect(dx, dy, ex - dx, ey - dy); ctx.strokeRect(dx, dy, ex - dx, ey - dy);
  const [kx, ky] = P(x + 0.05, 0.95, z);
  ctx.beginPath(); ctx.arc(kx, ky, 4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  // a caged bulb over the door
  const [lx, ly] = P(x - 0.15, 1.7, z);
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 120);
  g.addColorStop(0, 'rgba(255,240,200,0.25)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g; ctx.fillRect(lx - 120, ly - 120, 240, 240);
  ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff3d6'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
}

/** world-breach: the marked tile (white tape square with a cross, our own marking). */
export function paintBreachMark(ctx: Ctx, b: Zone): void {
  const corners = [P(b.x0, 0, b.z0), P(b.x1, 0, b.z0), P(b.x1, 0, b.z1), P(b.x0, 0, b.z1)];
  poly(ctx, corners);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
  ctx.setLineDash([14, 9]);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(236,238,242,0.8)'; ctx.stroke();
  ctx.setLineDash([]);
  line(ctx, corners[0], corners[2]); line(ctx, corners[1], corners[3]);
}

/** A blasted hole in the ceiling (world-breach: it stays), ragged edge and the dark roof space above. */
export function paintCeilingHole(ctx: Ctx, h: Zone, height: number): void {
  const r = mulberry32(Math.round(h.x0 * 100));
  const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, rx = (h.x1 - h.x0) / 2, rz = (h.z1 - h.z0) / 2;
  const pts = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2, k = 0.75 + r() * 0.35;
    return P(cx + Math.cos(a) * rx * k, height, cz + Math.sin(a) * rz * k);
  });
  poly(ctx, pts);
  ctx.fillStyle = '#0d0e11'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  // a night-sky glint through it, and a broken lath sticking down
  ctx.fillStyle = 'rgba(80,95,120,0.35)';
  poly(ctx, pts.map(([x, y]) => [cx === 0 ? x : x * 0.98 + P(cx, height, cz)[0] * 0.02, y + 3])); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#3a3b40';
  line(ctx, P(cx - rx * 0.6, height, cz), P(cx - rx * 0.5, height - 0.25, cz + 0.05));
}

/** A ladder up the back wall (the ladder exit's picture). */
export function paintLadder(ctx: Ctx, x: number, z: number, top: number): void {
  const s = scaleAt(z), w = 0.18;
  ctx.lineWidth = Math.max(3, 0.02 * s); ctx.strokeStyle = INK;
  const [l0, l1] = [P(x - w, 0, z), P(x - w, top, z)], [r0, r1] = [P(x + w, 0, z), P(x + w, top, z)];
  ctx.strokeStyle = '#6b7079'; ctx.lineWidth = Math.max(4, 0.03 * s);
  for (let y = 0.25; y < top; y += 0.28) line(ctx, P(x - w, y, z), P(x + w, y, z));
  ctx.strokeStyle = '#8a909a'; ctx.lineWidth = Math.max(5, 0.04 * s);
  line(ctx, l0, l1); line(ctx, r0, r1);
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  line(ctx, l0, l1); line(ctx, r0, r1);
}

/** A rooftop crate (combat-cover): planked box, our own design. */
export function paintCrate(ctx: Ctx, c: CrateDef, pal: Palette): void {
  const front = [P(c.x0, 0, c.z0), P(c.x1, 0, c.z0), P(c.x1, c.top, c.z0), P(c.x0, c.top, c.z0)];
  const topF = [P(c.x0, c.top, c.z0), P(c.x1, c.top, c.z0), P(c.x1, c.top, c.z1), P(c.x0, c.top, c.z1)];
  const fill = dim(pal.prop, 0.42), shadeC = dim(pal.prop, 0.55);
  ctx.lineJoin = 'round';
  poly(ctx, topF); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  poly(ctx, front); ctx.fillStyle = shadeC; ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let k = 1; k < 4; k++) { const y = (c.top * k) / 4; line(ctx, P(c.x0, y, c.z0), P(c.x1, y, c.z0)); }
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  line(ctx, P(c.x0 + 0.05, 0.05, c.z0), P(c.x1 - 0.05, c.top - 0.05, c.z0));
}

/**
 * M10 world-elevator-fight: the cab in its shaft (our own design). The shaft's concrete, guide
 * rails and passing landings scroll with `offset` (H) while the cab moves; the cab is an open box
 * (back panel, side walls, floor), its ceiling with the hatch and any cut slot, the slab's front
 * edge, and the cables rising from the roof. `cut` 0..1 = the welder's glowing cut line.
 */
export function paintElevator(ctx: Ctx, room: RoomDef, pal: Palette, st?: { offset: number; cut?: number; phase: string; cableLocked?: boolean }): void {
  const hw = room.halfWidth, h = room.height, zf = room.zFront, zb = room.zBack, el = room.elevator!;
  const off = st?.offset ?? 0, zs = zb + 0.9;
  ctx.lineJoin = 'round';
  // the shaft: dark concrete, seams and landings sliding past
  ctx.fillStyle = '#25282e';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const seam = 1.1, landing = 6;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  for (let k = -6; k < 12; k++) {
    const y = k * seam - (off % seam);
    line(ctx, P(-12, y, zs), P(12, y, zs));
  }
  for (let k = -2; k < 3; k++) {
    // a floor landing going by: a lit band with a closed door
    const y = k * landing - (off % landing);
    const [, a] = P(0, y + 0.4, zs), [, b] = P(0, y, zs);
    ctx.fillStyle = '#3a3e46'; ctx.fillRect(0, a, SCREEN_W, b - a);
    const [dx0, dy0] = P(-0.6, y + 2.4, zs), [dx1, dy1] = P(0.6, y + 0.4, zs);
    ctx.fillStyle = '#4b5059'; ctx.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
    line(ctx, [(dx0 + dx1) / 2, dy0], [(dx0 + dx1) / 2, dy1]);
  }
  // guide rails on both sides
  for (const sx of [-1, 1]) {
    ctx.lineWidth = 10; ctx.strokeStyle = '#4a4e57';
    line(ctx, P(sx * (hw + 0.35), -4, zs - 0.3), P(sx * (hw + 0.35), 12, zs - 0.3));
    ctx.lineWidth = 2; ctx.strokeStyle = INK;
    line(ctx, P(sx * (hw + 0.35), -4, zs - 0.3), P(sx * (hw + 0.35), 12, zs - 0.3));
  }
  // the cables, up from the roof (cut ones drawn by the fall: they whip off)
  if (st?.phase !== 'falling' && st?.phase !== 'crashed') {
    const c = el.cable;
    for (const dx of [-0.05, 0.05]) {
      ctx.lineWidth = 7; ctx.strokeStyle = INK;
      line(ctx, P(c.x + dx, h + 0.05, c.z), P(c.x + dx * 0.3, h + 8, c.z));
      ctx.lineWidth = 4; ctx.strokeStyle = '#9aa0a9';
      line(ctx, P(c.x + dx, h + 0.05, c.z), P(c.x + dx * 0.3, h + 8, c.z));
    }
    // the clamp on the roof
    const [kx, ky] = P(c.x, h + 0.08, c.z);
    ctx.fillStyle = '#4a4e57'; ctx.fillRect(kx - 16, ky - 10, 32, 14); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(kx - 16, ky - 10, 32, 14);
  }
  // the cab: back panel, walls, floor, ceiling
  const panel = dim(pal.back, 0.12), wall = dim(pal.sideL, 0.16), floor = dim(pal.floor, 0.2), ceil = dim(pal.ceil, 0.25);
  const zn = zf - 0.4;
  poly(ctx, [P(-hw, h, zn), P(hw, h, zn), P(hw, h, zb), P(-hw, h, zb)]); ctx.fillStyle = ceil; ctx.fill();
  poly(ctx, [P(-hw, h, zn), P(-hw, h, zb), P(-hw, 0, zb), P(-hw, 0, zn)]); ctx.fillStyle = wall; ctx.fill();
  poly(ctx, [P(hw, h, zn), P(hw, h, zb), P(hw, 0, zb), P(hw, 0, zn)]); ctx.fillStyle = dim(wall, 0.06); ctx.fill();
  poly(ctx, [P(-hw, 0, zn), P(hw, 0, zn), P(hw, 0, zb), P(-hw, 0, zb)]); ctx.fillStyle = floor; ctx.fill();
  const [bx0, by0] = P(-hw, h, zb), [bx1, by1] = P(hw, 0, zb);
  ctx.fillStyle = panel; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  // brushed panel seams and a handrail
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  for (let x = -hw + 0.6; x < hw; x += 0.6) line(ctx, P(x, 0, zb), P(x, h, zb));
  ctx.lineWidth = 4; ctx.strokeStyle = '#b9bdc4'; line(ctx, P(-hw, 0.95, zb), P(hw, 0.95, zb));
  // floor plate pattern
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let z = zf; z < zb; z += 0.35) line(ctx, P(-hw, 0, z), P(hw, 0, z));
  // holes in the ceiling: the hatch (a frame) and the welder's slot (ragged)
  const deck = room.decks?.[0];
  for (const hole of deck?.holes ?? []) {
    const isHatch = hole.x0 === el.hatch.x0;
    const q = [P(hole.x0, h, hole.z0), P(hole.x1, h, hole.z0), P(hole.x1, h, hole.z1), P(hole.x0, h, hole.z1)];
    poly(ctx, q); ctx.fillStyle = '#121316'; ctx.fill();
    ctx.lineWidth = isHatch ? 4 : 3; ctx.strokeStyle = isHatch ? '#3d4048' : '#ff9a3c'; ctx.stroke();
  }
  if (!deck?.holes.some((x) => x.x0 === el.hatch.x0)) {
    // the hatch shut (it's always open here, but keep the frame readable)
    poly(ctx, [P(el.hatch.x0, h, el.hatch.z0), P(el.hatch.x1, h, el.hatch.z0), P(el.hatch.x1, h, el.hatch.z1), P(el.hatch.x0, h, el.hatch.z1)]);
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  }
  // the welder's cut, glowing as it goes round the slot
  if (st?.cut !== undefined) {
    const sl = el.slot, pts = [P(sl.x0, h, sl.z0), P(sl.x1, h, sl.z0), P(sl.x1, h, sl.z1), P(sl.x0, h, sl.z1), P(sl.x0, h, sl.z0)];
    const lens = pts.slice(1).map((p2, i) => Math.hypot(p2[0] - pts[i][0], p2[1] - pts[i][1]));
    let left = st.cut * lens.reduce((a, b) => a + b, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < lens.length && left > 0; i++) {
      const k = Math.min(1, left / lens[i]);
      ctx.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k);
      left -= lens[i];
    }
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,140,40,0.35)'; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff2c8'; ctx.stroke();
    ctx.restore();
  }
  // the doors are open: a marker on the floor right under the hatch (stand here, E)
  if (st && st.phase === 'stopped' && !st.cableLocked) {
    const hc = { x: (el.hatch.x0 + el.hatch.x1) / 2, z: (el.hatch.z0 + el.hatch.z1) / 2 };
    const [mx, my] = P(hc.x, 0, hc.z), ms = scaleAt(hc.z);
    ctx.save();
    ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.ellipse(mx, my, 0.42 * ms, 0.1 * ms, 0, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.stroke();
    ctx.setLineDash([]);
    // an arrow up to the hatch
    const [ax, ay] = P(hc.x, 0.25, hc.z), [, ty] = P(hc.x, h - 0.15, hc.z);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,240,200,0.85)';
    line(ctx, [ax, ay], [ax, ty + 14]);
    ctx.beginPath(); ctx.moveTo(ax - 14, ty + 22); ctx.lineTo(ax, ty); ctx.lineTo(ax + 14, ty + 22); ctx.stroke();
    ctx.font = `bold ${Math.round(0.16 * ms)}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff3d6'; ctx.strokeStyle = INK; ctx.lineWidth = 6;
    ctx.strokeText('E', ax + 0.22 * ms, (ay + ty) / 2); ctx.fillText('E', ax + 0.22 * ms, (ay + ty) / 2);
    ctx.restore();
  }
  // the roof slab's front edge, and the cab's outline
  const [ex0, ey0] = P(-hw, h + 0.14, zn), [ex1, ey1] = P(hw, h, zn);
  ctx.fillStyle = '#3f434a'; ctx.fillRect(ex0, ey0, ex1 - ex0, ey1 - ey0);
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  ctx.strokeRect(ex0, ey0, ex1 - ex0, ey1 - ey0);
  for (const [x, y] of [[-hw, h], [hw, h], [-hw, 0], [hw, 0]] as const) line(ctx, P(x, y, zn), P(x, y, zb));
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  // a caged lamp in the ceiling
  const [lx, ly] = P(-0.8, h - 0.02, (zf + zb) / 2);
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 260);
  g.addColorStop(0, 'rgba(255,246,225,0.22)'); g.addColorStop(1, 'rgba(255,246,225,0)');
  ctx.fillStyle = g; ctx.fillRect(lx - 260, ly - 260, 520, 520);
  ctx.beginPath(); ctx.ellipse(lx, ly + 4, 22, 8, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff6dc'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
}

// ---------- M11: stage 3 (style frame "Stage 3 cast", signed off 2026-10-27) ----------

/** The clock sky: a warm haze with clock faces drifting in it (baked: the hands sit still). */
function clockSky(ctx: Ctx, hy: number): void {
  ctx.fillStyle = linear(ctx, 0, 0, 0, hy, [[0, '#cbbca3'], [1, '#e6dccb']]);
  ctx.fillRect(0, 0, SCREEN_W, hy);
  const r = mulberry32(31);
  for (let i = 0; i < 9; i++) {
    const cx = 80 + r() * (SCREEN_W - 160), cy = 40 + r() * (hy - 120), rad = 26 + r() * 46;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fillStyle = '#f5efe6'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; line(ctx, [cx + Math.cos(a) * rad * 0.82, cy + Math.sin(a) * rad * 0.82], [cx + Math.cos(a) * rad * 0.92, cy + Math.sin(a) * rad * 0.92]); }
    const h1 = r() * Math.PI * 2, h2 = r() * Math.PI * 2;
    ctx.lineWidth = 4; line(ctx, [cx, cy], [cx + Math.cos(h1) * rad * 0.5, cy + Math.sin(h1) * rad * 0.5]);
    ctx.lineWidth = 3; line(ctx, [cx, cy], [cx + Math.cos(h2) * rad * 0.75, cy + Math.sin(h2) * rad * 0.75]);
  }
}

/** The toy-shop street: shopfronts with toys in the windows under the clock sky. */
export function paintToyStreet(ctx: Ctx, room: RoomDef, pal: Palette): void {
  const zb = room.zBack, hy = P(0, 0, 1e6)[1];
  clockSky(ctx, hy);
  const s = scaleAt(zb), [, foot] = P(0, 0, zb), [, top] = P(0, 3.2, zb);
  // the row of shops: each a front with an awning and a window of toys
  const r = mulberry32(7);
  for (let x = -6; x < 6; x += 2.2) {
    const [x0] = P(x, 0, zb), [x1] = P(x + 2.1, 0, zb);
    const col = r() < 0.5 ? pal.sideL : pal.sideR;
    ctx.fillStyle = col; ctx.fillRect(x0, top, x1 - x0, foot - top);
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(x0, top, x1 - x0, foot - top);
    // awning stripes (the red accent on every other one)
    const [, ay] = P(0, 2.3, zb), [, by2] = P(0, 2.05, zb);
    for (let k = 0; k < 6; k++) {
      const sx = x0 + ((x1 - x0) * k) / 6;
      ctx.fillStyle = k % 2 ? '#f2ede4' : r() < 0.5 ? '#a3141c' : '#8b8378';
      ctx.fillRect(sx, ay, (x1 - x0) / 6, by2 - ay);
    }
    ctx.strokeRect(x0, ay, x1 - x0, by2 - ay);
    // the window and its toys: a block stack, a ball, a little bear
    const [wx0, wy0] = P(x + 0.2, 1.8, zb), [wx1, wy1] = P(x + 1.3, 0.55, zb);
    ctx.fillStyle = '#3a3631'; ctx.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    const ts = s * 0.18;
    ctx.fillStyle = '#d9cbb3'; ctx.fillRect(wx0 + 8, wy1 - ts, ts, ts); ctx.fillStyle = '#a3141c'; ctx.fillRect(wx0 + 8 + ts * 0.15, wy1 - ts * 2, ts * 0.8, ts);
    ctx.beginPath(); ctx.arc(wx0 + (wx1 - wx0) * 0.55, wy1 - ts * 0.6, ts * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#efe6d8'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    const bx = wx1 - ts * 1.4;
    ctx.beginPath(); ctx.arc(bx, wy1 - ts * 1.6, ts * 0.45, 0, Math.PI * 2); ctx.arc(bx, wy1 - ts * 0.6, ts * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#b8a58a'; ctx.fill();
    // the door
    const [dx0, dy0] = P(x + 1.5, 1.95, zb), [dx1, dy1] = P(x + 1.95, 0, zb);
    ctx.fillStyle = dim(col, 0.25); ctx.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0); ctx.lineWidth = 3; ctx.strokeRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
  }
  ctx.lineWidth = 3; ctx.strokeStyle = INK; line(ctx, [0, foot], [SCREEN_W, foot]);
  // pavement and kerb
  ctx.fillStyle = linear(ctx, 0, foot, 0, SCREEN_H, [[0, dim(pal.floor, 0.12)], [1, pal.floor]]);
  ctx.fillRect(0, foot, SCREEN_W, SCREEN_H - foot);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5;
  for (let z = room.zFront - 0.6; z < zb; z += 0.55) line(ctx, P(-12, 0, z), P(12, 0, z));
  for (let x = -12; x <= 12; x += 0.9) line(ctx, P(x, 0, room.zFront - 0.6), P(x, 0, zb));
  if (room.vending) paintVendingDecor(ctx, room.vending.x, room.vending.z);
}

/** The vending machine standing at the back, still asleep (it wakes as the brute). */
export function paintVendingDecor(ctx: Ctx, x: number, z: number): void {
  const s = scaleAt(z), [fx, fy] = P(x, 0, z);
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(s, s);
  paintVendingBody(ctx, 0, false);
  ctx.restore();
}

/**
 * The vending machine's body in H units, base at the origin (the brute and its decor share it).
 * `chomp` opens the dispenser flap; `awake` lights the buttons that are its eyes.
 */
export function paintVendingBody(ctx: Ctx, chomp: number, awake: boolean): void {
  const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const ink = (fill: string, lw = 0.016) => { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); };
  ctx.beginPath(); ctx.ellipse(0, 0, 0.5, 0.07, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
  rr(-0.44, -1.55, 0.88, 1.5, 0.05); ink('#b8b0a3', 0.022);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-0.44, -1.55, 0.14, 1.5);
  rr(-0.34, -1.45, 0.5, 0.95, 0.03); ink('#2e3236');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    rr(-0.29 + c * 0.11, -1.38 + r * 0.22, 0.07, 0.15, 0.015);
    ctx.fillStyle = (r * 4 + c) % 5 === 1 ? '#a3141c' : '#c9c3b9'; ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(-0.3, -1.45); ctx.lineTo(-0.18, -1.45); ctx.lineTo(-0.34, -0.9); ctx.lineTo(-0.34, -1.1); ctx.closePath(); ctx.fill();
  rr(0.2, -1.45, 0.18, 0.6, 0.02); ink('#8f887d', 0.012);
  for (const y of [-1.35, -1.2]) {
    ctx.beginPath(); ctx.arc(0.29, y, 0.045, 0, Math.PI * 2); ctx.fillStyle = awake ? '#fff3c4' : '#8a8478'; ctx.fill(); ctx.lineWidth = 0.01; ctx.strokeStyle = INK; ctx.stroke();
    if (awake) { ctx.beginPath(); ctx.arc(0.3, y, 0.018, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); }
  }
  ctx.fillStyle = INK; ctx.fillRect(0.27, -1.0, 0.04, 0.08);
  rr(-0.3, -0.4 - chomp, 0.6, 0.18 + chomp, 0.03); ink('#1b1c20');
  if (awake) { ctx.fillStyle = '#c9c3b9'; for (let k = 0; k < 4; k++) ctx.fillRect(-0.26 + k * 0.14, -0.4 - chomp, 0.06, 0.05); }
}

/** The tank (the user's idea): treads, hull, turret, barrel. Base at the origin, H units, facing +x. */
export function paintTankBody(ctx: Ctx): void {
  const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const ink = (fill: string, lw = 0.025) => { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); };
  rr(-1.15, -0.42, 2.3, 0.42, 0.21); ink('#3a3631');
  for (let x = -0.95; x <= 0.95; x += 0.27) { ctx.beginPath(); ctx.arc(x, -0.21, 0.12, 0, Math.PI * 2); ink('#6b655d', 0.016); }
  ctx.beginPath(); ctx.moveTo(-1.1, -0.42); ctx.lineTo(-0.95, -0.82); ctx.lineTo(0.95, -0.82); ctx.lineTo(1.15, -0.42); ctx.closePath(); ink('#7b7366');
  rr(-0.55, -1.2, 0.95, 0.4, 0.12); ink('#857c6e');
  rr(0.35, -1.06, 1.25, 0.12, 0.04); ink('#6b655d', 0.02);
  ctx.beginPath(); ctx.arc(-0.12, -1.22, 0.1, Math.PI, 0); ink('#6b655d', 0.016);
  ctx.fillStyle = '#a3141c'; ctx.fillRect(-0.45, -1.05, 0.18, 0.06);
}

/** A landed tank prop (solid block), or one falling (`y` above the ground) with its growing shadow. */
export function paintTank(ctx: Ctx, x: number, z: number, facing: 1 | -1, y = 0, shadowOnly = false, k = 1): void {
  const s = scaleAt(z), [gx, gy] = P(x, 0, z);
  ctx.beginPath(); ctx.ellipse(gx, gy, 1.2 * s * (0.4 + 0.6 * k), 0.12 * s * (0.4 + 0.6 * k), 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.2 * k})`; ctx.fill();
  if (shadowOnly) return;
  const [tx, ty] = P(x, y, z);
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(s * facing, s);
  ctx.lineJoin = 'round';
  paintTankBody(ctx);
  ctx.restore();
}

/** The security camera high on the back wall (the camera room). */
export function paintSecurityCamera(ctx: Ctx, x: number, y: number, z: number): void {
  const s = scaleAt(z), [cx, cy] = P(x, y, z);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#5f5850'; ctx.fillRect(-0.03, -0.2, 0.06, 0.2);
  ctx.save(); ctx.rotate(0.35);
  ctx.beginPath(); ctx.roundRect(-0.05, -0.08, 0.32, 0.14, 0.03); ctx.fillStyle = '#d6d0c6'; ctx.fill(); ctx.lineWidth = 0.014; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(0.28, -0.01, 0.045, 0, Math.PI * 2); ctx.fillStyle = '#1b1c20'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.0, -0.05, 0.015, 0, Math.PI * 2); ctx.fillStyle = '#e0302a'; ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** world-arena-collapse: the floor, wall and ceiling beyond the edge are gone (or cracking). */
export function paintVoid(ctx: Ctx, room: RoomDef): void {
  const v = room.void, c = room.crack;
  const hw = room.halfWidth, h = room.height, zb = room.zBack, zn = room.zFront - 1;
  if (c && !v) {
    // the crack: a jagged line down the back wall and across the floor
    const r = mulberry32(5);
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.beginPath();
    let pt = P(c.x, h, zb); ctx.moveTo(pt[0], pt[1]);
    for (let y = h; y > 0; y -= 0.25) { pt = P(c.x + (r() - 0.5) * 0.18, y, zb); ctx.lineTo(pt[0], pt[1]); }
    for (let z = zb; z > zn; z -= 0.3) { pt = P(c.x + (r() - 0.5) * 0.2, 0, z); ctx.lineTo(pt[0], pt[1]); }
    ctx.stroke();
    return;
  }
  if (!v) return;
  const x0 = v.side < 0 ? -hw - 2 : v.x, x1 = v.side < 0 ? v.x : hw + 2;
  ctx.fillStyle = '#0b0b0d';
  // everything past the edge: back wall, ceiling and floor
  poly(ctx, [P(x0, h + 2, zb), P(x1, h + 2, zb), P(x1, -6, zb), P(x0, -6, zb)]); ctx.fill();
  poly(ctx, [P(x0, h, zn), P(x1, h, zn), P(x1, h, zb), P(x0, h, zb)]); ctx.fill();
  poly(ctx, [P(x0, 0, zn), P(x1, 0, zn), P(x1, 0, zb), P(x0, 0, zb)]); ctx.fill();
  ctx.fillRect(v.side < 0 ? 0 : P(x0, 0, zn)[0], 0, v.side < 0 ? P(x1, 0, zn)[0] : SCREEN_W, SCREEN_H);
  // the broken edge: a jagged lip of floor and wall
  const r = mulberry32(9);
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.beginPath();
  let pt = P(v.x, h, zb); ctx.moveTo(pt[0], pt[1]);
  for (let y = h; y > 0; y -= 0.3) { pt = P(v.x + (r() - 0.5) * 0.15, y, zb); ctx.lineTo(pt[0], pt[1]); }
  for (let z = zb; z > zn; z -= 0.3) { pt = P(v.x + (r() - 0.5) * 0.15, 0, z); ctx.lineTo(pt[0], pt[1]); }
  ctx.stroke();
}

// ---------- M12: the desert box, the vending room ----------

/** The desert (our own design): a hot haze, low dunes, rippled sand, a few rocks. */
export function paintDesert(ctx: Ctx, room: RoomDef, _pal: Palette): void {
  const hy = P(0, 0, 1e6)[1], zb = room.zBack;
  ctx.fillStyle = linear(ctx, 0, 0, 0, hy, [[0, '#d8c4a2'], [0.7, '#ecdcc0'], [1, '#f3e7d2']]);
  ctx.fillRect(0, 0, SCREEN_W, hy);
  // a white sun disc (not alive here)
  ctx.beginPath(); ctx.arc(1460, 150, 46, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,250,236,0.9)'; ctx.fill();
  const r = mulberry32(17);
  for (const [k, col] of [[0.5, '#cdb38a'], [1, '#c2a578']] as const) {
    ctx.beginPath(); ctx.moveTo(0, hy);
    for (let x = 0; x <= SCREEN_W; x += 40) ctx.lineTo(x, hy - (20 + 40 * Math.abs(Math.sin(x / (300 * k) + k * 3))) * k - r() * 4);
    ctx.lineTo(SCREEN_W, hy); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  ctx.fillStyle = linear(ctx, 0, hy, 0, SCREEN_H, [[0, '#d2b98e'], [1, '#bda079']]);
  ctx.fillRect(0, hy, SCREEN_W, SCREEN_H - hy);
  ctx.strokeStyle = 'rgba(80,60,30,0.18)'; ctx.lineWidth = 2;
  for (let z = room.zFront - 0.6; z < zb + 4; z += 0.45) {
    ctx.beginPath();
    for (let x = -10; x <= 10; x += 0.5) { const [px, py] = P(x, 0.02 * Math.sin(x * 2 + z * 3), z); if (x === -10) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = (r() * 2 - 1) * 4, z = room.zFront + r() * (zb - room.zFront + 2), [px, py] = P(x, 0, z), s = scaleAt(z);
    ctx.beginPath(); ctx.ellipse(px, py - 0.03 * s, (0.08 + r() * 0.1) * s, (0.04 + r() * 0.05) * s, 0, Math.PI, 0); ctx.fillStyle = '#9c8463'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  }
  for (const side of room.lockWalls ?? []) paintLockWall(ctx, room, side, 0);
}

/** A concrete slab wall of the desert box (landed, or `y` H above the ground while it falls). */
export function paintLockWall(ctx: Ctx, room: RoomDef, side: 'right' | 'back' | 'left', y: number): void {
  const hw = room.halfWidth, h = room.height, zb = room.zBack, zn = room.zFront - 1;
  const col = side === 'back' ? '#a9a194' : side === 'left' ? '#958d80' : '#8c8478';
  let q: [number, number][];
  if (side === 'back') q = [P(-hw - 3, h + y, zb), P(hw + 3, h + y, zb), P(hw + 3, y, zb), P(-hw - 3, y, zb)];
  else { const x = side === 'right' ? hw : -hw; q = [P(x, h + y, zn), P(x, h + y, zb), P(x, y, zb), P(x, y, zn)]; }
  poly(ctx, q); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  // slab seams
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  if (side === 'back') for (let x = -hw - 3; x < hw + 3; x += 1.2) line(ctx, P(x, y, zb), P(x, h + y, zb));
  else { const x = side === 'right' ? hw : -hw; for (let z = zn; z < zb; z += 0.6) line(ctx, P(x, y, z), P(x, h + y, z)); }
}

/** Where a wall will land: a shadow band that darkens as it falls. */
export function paintLockShadow(ctx: Ctx, room: RoomDef, side: 'right' | 'back' | 'left', k: number): void {
  const hw = room.halfWidth, zb = room.zBack, zn = room.zFront - 0.6, w = 0.45;
  const q = side === 'back' ? [P(-hw - 3, 0, zb - w), P(hw + 3, 0, zb - w), P(hw + 3, 0, zb), P(-hw - 3, 0, zb)]
    : side === 'right' ? [P(hw - w, 0, zn), P(hw, 0, zn), P(hw, 0, zb), P(hw - w, 0, zb)] : [P(-hw, 0, zn), P(-hw + w, 0, zn), P(-hw + w, 0, zb), P(-hw, 0, zb)];
  poly(ctx, q); ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.3 * k})`; ctx.fill();
}

/** The vending room's machine: the brute's twin, asleep; smashed = glass gone, cans spilled. */
export function paintVendingProp(ctx: Ctx, x: number, z: number, smashed: boolean, fallen?: 1 | -1): void {
  const s = scaleAt(z), [fx, fy] = P(x, 0, z);
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  // M14: knocked flat, pivoting over its bottom edge on the side it fell to
  if (fallen) { ctx.translate(fallen * 0.35, -0.2); ctx.rotate(fallen * Math.PI / 2); ctx.translate(-fallen * 0.35, 0); }
  paintVendingBody(ctx, 0, false);
  if (smashed) {
    ctx.fillStyle = '#121316'; ctx.fillRect(-0.32, -1.43, 0.46, 0.91);
    ctx.lineWidth = 0.012; ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (const [x0, y0, x1, y1] of [[-0.32, -1.3, -0.15, -1.1], [-0.15, -1.1, 0.12, -1.25], [-0.2, -0.8, 0.1, -0.95]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    for (const [cx, rot] of [[-0.6, 0.4], [-0.45, -0.8], [0.55, 1.2]]) {
      ctx.save(); ctx.translate(cx, -0.04); ctx.rotate(rot); ctx.beginPath(); ctx.roundRect(-0.035, -0.07, 0.07, 0.14, 0.015);
      ctx.fillStyle = rot > 0 ? '#a3141c' : '#c9c3b9'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.01; ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}

/** The hole the boss blasted you through (the vending room's left wall): rubble edge, desert light beyond. */
export function paintWallHole(ctx: Ctx, room: RoomDef, side: 'left' | 'right'): void {
  const x = side === 'left' ? -room.halfWidth : room.halfWidth, r = mulberry32(23);
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(P(x, 1.0 + Math.sin(a) * (0.75 + r() * 0.2), 9.25 + Math.cos(a) * (0.55 + r() * 0.15)));
  }
  poly(ctx, pts);
  ctx.fillStyle = '#e8d7b6'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
}
