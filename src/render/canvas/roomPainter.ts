// Static room layer: walls, ceiling, floor, depth shading, baseboards, doors, decor and the
// key light. Ported from design/style-frame; baked once per room/palette change.
import { INK, type Palette } from '../../data/palettes';
import { type DoorDef, type PoleDef, type PropDef, ROOM_DRAW_NEAR_Z, type RoomDef, type TableDef } from '../../sim/room';
import { project as P, SCREEN_H, SCREEN_W, scaleAt } from '../camera';
import { type Ctx, line, linear, mulberry32, poly, shade } from './draw';

export function paintRoom(ctx: Ctx, room: RoomDef, pal: Palette): void {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
  if (room.outdoor) {
    paintOutdoor(ctx, room, pal);
    return;
  }
  const hw = room.halfWidth, zb = room.zBack, h = room.height, zn = ROOM_DRAW_NEAR_Z;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const ceil = [P(-hw, h, zn), P(hw, h, zn), P(hw, h, zb), P(-hw, h, zb)];
  const left = [P(-hw, h, zn), P(-hw, h, zb), P(-hw, 0, zb), P(-hw, 0, zn)];
  const right = [P(hw, h, zn), P(hw, h, zb), P(hw, 0, zb), P(hw, 0, zn)];
  const floor = [P(-hw, 0, zn), P(hw, 0, zn), P(hw, 0, zb), P(-hw, 0, zb)];
  const [bx0, by0] = P(-hw, h, zb);
  const [bx1, by1] = P(hw, 0, zb);

  poly(ctx, ceil); ctx.fillStyle = pal.ceil; ctx.fill();
  poly(ctx, left); ctx.fillStyle = pal.sideL; ctx.fill();
  poly(ctx, right); ctx.fillStyle = pal.sideR; ctx.fill();
  poly(ctx, floor); ctx.fillStyle = pal.floor; ctx.fill();
  ctx.fillStyle = pal.back;
  ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

  // depth shading: walls and ceiling darken toward the camera, contact shadow on the back wall
  shade(ctx, ceil, linear(ctx, 0, by0, 0, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.22)']]));
  shade(ctx, left, linear(ctx, bx0, 0, 0, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.16)']]));
  shade(ctx, right, linear(ctx, bx1, 0, SCREEN_W, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.2)']]));
  shade(ctx, floor, linear(ctx, 0, by1, 0, SCREEN_H, [[0, 'rgba(0,0,0,0.16)'], [0.25, 'rgba(0,0,0,0.02)'], [1, 'rgba(0,0,0,0.14)']]));
  ctx.fillStyle = linear(ctx, 0, by1 - 70, 0, by1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.10)']]);
  ctx.fillRect(bx0, by1 - 70, bx1 - bx0, 70);

  // baseboards
  const bb = 0.12;
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  poly(ctx, [P(-hw, bb, zn), P(-hw, bb, zb), P(-hw, 0, zb), P(-hw, 0, zn)]); ctx.fill();
  poly(ctx, [P(hw, bb, zn), P(hw, bb, zb), P(hw, 0, zb), P(hw, 0, zn)]); ctx.fill();
  const bbTop = P(-hw, bb, zb)[1];
  ctx.fillRect(bx0, bbTop, bx1 - bx0, by1 - bbTop);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(20,20,22,0.55)';
  line(ctx, [bx0, bbTop], [bx1, bbTop]);
  for (const sx of [-hw, hw]) line(ctx, P(sx, bb, zn), P(sx, bb, zb));

  for (const v of room.vents) {
    poly(ctx, [P(v.x0, h, v.z0), P(v.x1, h, v.z0), P(v.x1, h, v.z1), P(v.x0, h, v.z1)]);
    ctx.fillStyle = '#5c5d62'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 2;
    const slats = 5, inset = 0.05;
    for (let i = 1; i <= slats; i++) {
      const z = v.z0 + ((v.z1 - v.z0) * i) / (slats + 1);
      line(ctx, P(v.x0 + inset, h, z), P(v.x1 - inset, h, z));
    }
  }

  for (const b of room.boards) paintBoard(ctx, b.x0, b.x1, b.y0, b.y1, zb, pal);

  // room edges
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  for (const [x, y] of [[-hw, h], [hw, h], [-hw, 0], [hw, 0]] as const) line(ctx, P(x, y, zn), P(x, y, zb));
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);

  for (const l of room.lamps) paintLamp(ctx, room, l.x, l.z, l.shadeY, l.poolR);
}

function paintBoard(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, z: number, pal: Palette): void {
  const [nx0, ny0] = P(x0, y1, z);
  const [nx1, ny1] = P(x1, y0, z);
  ctx.fillStyle = pal.board;
  ctx.fillRect(nx0, ny0, nx1 - nx0, ny1 - ny0);
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  ctx.strokeRect(nx0, ny0, nx1 - nx0, ny1 - ny0);
  const rnd = mulberry32(7);
  const papers = Math.max(1, Math.floor((nx1 - nx0 - 20) / 52));
  for (let i = 0; i < papers; i++) {
    ctx.save();
    ctx.translate(nx0 + 30 + i * 52, ny0 + 22 + rnd() * 40);
    ctx.rotate((rnd() - 0.5) * 0.25);
    ctx.fillStyle = '#ececee'; ctx.fillRect(0, 0, 40, 52);
    ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, 40, 52);
    ctx.fillStyle = 'rgba(20,20,22,0.35)';
    for (let l = 0; l < 4; l++) ctx.fillRect(6, 10 + l * 9, 28 - (l % 2) * 8, 2.5);
    ctx.restore();
  }
}

function paintLamp(ctx: Ctx, room: RoomDef, lx: number, lz: number, shadeY: number, poolR: number): void {
  const top = P(lx, room.height, lz), sh = P(lx, shadeY, lz), s = scaleAt(lz);
  const pool = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pool.push(P(lx + Math.cos(a) * poolR, 0, lz + Math.sin(a) * poolR * 0.4));
  }
  const l = P(lx - poolR, 0, lz), r = P(lx + poolR, 0, lz);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(14px)';
  poly(ctx, [[sh[0] - 0.12 * s, sh[1]], [sh[0] + 0.12 * s, sh[1]], r, l]);
  ctx.fillStyle = linear(ctx, 0, sh[1], 0, l[1], [[0, 'rgba(255,246,225,0.13)'], [0.7, 'rgba(255,246,225,0.03)'], [1, 'rgba(255,246,225,0)']]);
  ctx.fill();
  poly(ctx, pool);
  ctx.fillStyle = 'rgba(255,246,228,0.10)';
  ctx.fill();
  ctx.filter = 'none';
  const glow = ctx.createRadialGradient(sh[0], sh[1] + 6, 0, sh[0], sh[1] + 6, 90);
  glow.addColorStop(0, 'rgba(255,246,220,0.35)');
  glow.addColorStop(1, 'rgba(255,246,220,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sh[0] - 90, sh[1] - 84, 180, 180);
  ctx.restore();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
  line(ctx, top, [sh[0], sh[1] - 0.06 * s]);
  ctx.beginPath(); ctx.ellipse(sh[0], sh[1], 0.2 * s, 0.07 * s, 0, Math.PI, 0); ctx.closePath();
  ctx.fillStyle = '#4f5055'; ctx.fill();
  ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(sh[0], sh[1] + 0.025 * s, 0.035 * s, 0, Math.PI);
  ctx.fillStyle = '#fffbe8'; ctx.fill();
  ctx.lineWidth = 2; ctx.stroke();
}

/**
 * Doors animate (spawn telegraph, enemy-spawning), so they're drawn per frame, before the
 * actors. `open` 0..1: the panel swings into the room on its hinge at z0, showing the dark
 * doorway behind it.
 */
export function paintDoor(ctx: Ctx, room: RoomDef, d: DoorDef, open: number, pal: Palette): void {
  const side = d.wall === 'left' ? -1 : 1, x = side * room.halfWidth;
  const frame = [P(x, 0, d.z0), P(x, d.height, d.z0), P(x, d.height, d.z1), P(x, 0, d.z1)];
  poly(ctx, frame);
  ctx.fillStyle = open > 0 ? '#111113' : pal.door; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  if (open <= 0) {
    const k = P(x, 0.95, d.z1 - 0.12);
    ctx.beginPath(); ctx.arc(k[0], k[1], 6, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    return;
  }
  if (open >= 1) return;
  // the panel, rotated about the hinge: its free edge moves from the wall into the room
  const w = d.z1 - d.z0, a = (open * Math.PI) / 2;
  const fx = x - side * w * Math.sin(a), fz = d.z0 + w * Math.cos(a);
  poly(ctx, [P(x, 0, d.z0), P(x, d.height, d.z0), P(fx, d.height, fz), P(fx, 0, fz)]);
  ctx.fillStyle = pal.door; ctx.fill();
  ctx.stroke();
}

export function paintProp(ctx: Ctx, p: PropDef, pal: Palette): void {
  if (p.kind === 'table') paintTable(ctx, p, pal);
  else paintPole(ctx, p, pal);
}

/** Stage 1 landmark (own design): leaning wooden pole, crossbar, two insulators, sagging wire. */
function paintPole(ctx: Ctx, p: PoleDef, pal: Palette): void {
  const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, s = scaleAt(cz);
  const lean = (y: number) => cx + Math.sin(p.lean) * y;
  const [bx, by] = P(cx, 0, cz);
  ctx.beginPath(); ctx.ellipse(bx + 0.25 * s, by, 0.45 * s, 0.06 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
  const w = (p.x1 - p.x0) / 2;
  const base = [P(cx - w, 0, cz), P(cx + w, 0, cz)], top = [P(lean(p.top) + w * 0.7, p.top, cz), P(lean(p.top) - w * 0.7, p.top, cz)];
  poly(ctx, [base[0], base[1], top[0], top[1]]);
  ctx.fillStyle = pal.propShade; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  // grain line + a small tag nailed at eye level
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(20,20,22,0.35)';
  line(ctx, P(cx + w * 0.2, 0.1, cz), P(lean(p.top - 0.3) + w * 0.15, p.top - 0.3, cz));
  const t = P(lean(1.35), 1.35, cz);
  ctx.fillStyle = pal.prop; ctx.lineWidth = 2; ctx.strokeStyle = INK;
  ctx.fillRect(t[0] - 0.06 * s, t[1] - 0.05 * s, 0.12 * s, 0.1 * s); ctx.strokeRect(t[0] - 0.06 * s, t[1] - 0.05 * s, 0.12 * s, 0.1 * s);
  // crossbar with insulators
  const yb = p.top - 0.35, l = P(lean(yb) - 0.55, yb, cz), r = P(lean(yb) + 0.55, yb, cz);
  ctx.lineWidth = 0.06 * s; ctx.strokeStyle = INK; line(ctx, l, r);
  ctx.lineWidth = 0.035 * s; ctx.strokeStyle = pal.propShade; line(ctx, l, r);
  for (const ix of [-0.42, 0.42]) {
    const q = P(lean(yb) + ix, yb + 0.08, cz);
    ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.03 * s, 0.05 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.prop; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  }
  // wires sag off to both sides of the screen
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,20,22,0.7)';
  for (const ix of [-0.42, 0.42]) {
    const q = P(lean(yb) + ix, yb + 0.12, cz), far = P(ix < 0 ? -9 : 9, yb + 0.5, cz + 2.5);
    ctx.beginPath(); ctx.moveTo(q[0], q[1]);
    ctx.quadraticCurveTo((q[0] + far[0]) / 2, Math.max(q[1], far[1]) + 0.35 * s, far[0], far[1]);
    ctx.stroke();
  }
}

/**
 * Outdoor room (PLAN.md M3, own design): pale sky gradient to a hazy horizon, a low far ridge,
 * the ground plane with depth shading, a horizon line and a few scattered pebbles and tufts.
 */
function paintOutdoor(ctx: Ctx, room: RoomDef, pal: Palette): void {
  const hy = P(0, 0, 1e6)[1];
  ctx.fillStyle = linear(ctx, 0, 0, 0, hy, [[0, pal.ceil], [0.7, pal.back], [1, pal.board]]);
  ctx.fillRect(0, 0, SCREEN_W, hy);
  // a low far ridge, slightly darker than the haze
  const rnd = mulberry32(3);
  ctx.beginPath(); ctx.moveTo(0, hy);
  for (let x = 0; x <= SCREEN_W; x += 60) ctx.lineTo(x, hy - 14 - 22 * Math.abs(Math.sin(x / 410 + 1.3)) - rnd() * 6);
  ctx.lineTo(SCREEN_W, hy); ctx.closePath();
  ctx.fillStyle = pal.sideR; ctx.fill();
  // ground: far haze to darker near the camera
  ctx.fillStyle = linear(ctx, 0, hy, 0, SCREEN_H, [[0, pal.board], [0.12, pal.floor], [1, pal.suitShade]]);
  ctx.fillRect(0, hy, SCREEN_W, SCREEN_H - hy);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,20,22,0.45)';
  line(ctx, [0, hy], [SCREEN_W, hy]);
  // soft band marking the back of the walkable ground
  const yb = P(0, 0, room.zBack)[1];
  ctx.fillStyle = linear(ctx, 0, yb - 30, 0, yb + 10, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.06)']]);
  ctx.fillRect(0, yb - 30, SCREEN_W, 40);
  // pebbles and grass tufts on the ground
  for (let i = 0; i < 70; i++) {
    const z = room.zFront - 0.6 + rnd() * (room.zBack - room.zFront + 4), x = (rnd() * 2 - 1) * z * 0.5;
    const [px, py] = P(x, 0, z), s = scaleAt(z);
    if (rnd() < 0.55) {
      ctx.beginPath(); ctx.ellipse(px, py, (0.02 + rnd() * 0.03) * s, (0.01 + rnd() * 0.01) * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,20,22,0.25)'; ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1, 0.006 * s); ctx.strokeStyle = 'rgba(20,20,22,0.35)';
      for (const dx of [-0.02, 0, 0.02]) line(ctx, [px + dx * s, py], [px + dx * 1.8 * s, py - (0.04 + rnd() * 0.03) * s]);
    }
  }
}

/** Props are depth-sorted with actors, so they're drawn in the dynamic layer, not baked. */
export function paintTable(ctx: Ctx, t: TableDef, pal: Palette): void {
  const th = 0.06;
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineCap = 'round';
  const legs: [number, number][] = [[t.x0 + 0.08, t.z1 - 0.05], [t.x1 - 0.08, t.z1 - 0.05], [t.x0 + 0.08, t.z0 + 0.05], [t.x1 - 0.08, t.z0 + 0.05]];
  for (const [x, z] of legs) line(ctx, P(x, t.top - th, z), P(x, 0, z));
  ctx.lineWidth = 3;
  poly(ctx, [P(t.x0, t.top, t.z0), P(t.x1, t.top, t.z0), P(t.x1, t.top - th, t.z0), P(t.x0, t.top - th, t.z0)]);
  ctx.fillStyle = pal.propShade; ctx.fill(); ctx.stroke();
  poly(ctx, [P(t.x0, t.top, t.z0), P(t.x1, t.top, t.z0), P(t.x1, t.top, t.z1), P(t.x0, t.top, t.z1)]);
  ctx.fillStyle = pal.prop; ctx.fill(); ctx.stroke();
}
