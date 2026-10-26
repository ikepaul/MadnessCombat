// Static room layer: walls, ceiling, floor, depth shading, baseboards, doors, decor and the
// key light. Ported from design/style-frame; baked once per room/palette change.
import { INK, type Palette } from '../../data/palettes';
import { ROOM_DRAW_NEAR_Z, type RoomDef, type TableDef } from '../../sim/room';
import { project as P, SCREEN_H, SCREEN_W, scaleAt } from '../camera';
import { type Ctx, line, linear, mulberry32, poly, shade } from './draw';

export function paintRoom(ctx: Ctx, room: RoomDef, pal: Palette): void {
  const hw = room.halfWidth, zb = room.zBack, h = room.height, zn = ROOM_DRAW_NEAR_Z;
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
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

  for (const d of room.doors) {
    const x = d.wall === 'left' ? -hw : hw;
    poly(ctx, [P(x, 0, d.z0), P(x, d.height, d.z0), P(x, d.height, d.z1), P(x, 0, d.z1)]);
    ctx.fillStyle = d.open ? '#111113' : pal.door; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    if (!d.open) {
      const k = P(x, 0.95, d.z1 - 0.12);
      ctx.beginPath(); ctx.arc(k[0], k[1], 6, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    }
  }

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
