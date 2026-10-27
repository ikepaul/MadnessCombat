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
  const [px] = P(-2.2, 0, zb);
  ctx.fillStyle = dim(pal.propShade, 0.4); ctx.fillRect(px - 6, top, 12, foot - top);
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(px - 6, top - 2, 12, foot - top + 2);
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
export function paintElevator(ctx: Ctx, room: RoomDef, pal: Palette, st?: { offset: number; cut?: number; phase: string }): void {
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
