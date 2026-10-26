// Gun drawings (PLAN.md M5 look; own designs on the style frame's pistol template: dark flat
// fills, a lighter top strip, ink outline). Hand space: grip at the origin under the mitten,
// barrel along +x, -y up. Every barrel ends at its WeaponDef.muzzle, so the tracer and the
// flash start at the drawn muzzle. Pistol 0.25 H, long guns ~0.55 H (design/art-direction.md).
import { INK } from '../../data/palettes';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import type { Ctx } from './draw';

const BODY = '#3b3c41', DARK = '#2a2b2f', LIGHT = '#6c6d72', WOOD = '#5a4f45';

function shape(ctx: Ctx, pts: [number, number][], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

/** Draw `id` in hand space. */
export function paintGun(ctx: Ctx, id: WeaponId): void {
  ctx.lineWidth = 0.011;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const m = WEAPONS[id].muzzle;
  switch (id) {
    case 'pistol':
    case 'pistolSuppressed':
      // the style frame's pistol: slide + grip
      shape(ctx, [[-0.05, -0.1], [0.2, -0.1], [0.2, -0.055], [0.035, -0.055], [0.03, 0.045], [-0.035, 0.045], [-0.05, -0.055]], BODY);
      ctx.fillStyle = LIGHT; ctx.fillRect(-0.03, -0.094, 0.21, 0.013);
      if (id === 'pistolSuppressed') rect(ctx, 0.19, m[1] - 0.022, m[0] - 0.19, 0.044, DARK);
      return;
    case 'deagle':
      // big blocky slide with a ported top
      shape(ctx, [[-0.06, -0.125], [m[0], -0.125], [m[0], -0.05], [0.04, -0.05], [0.035, 0.05], [-0.04, 0.05], [-0.06, -0.05]], BODY);
      ctx.fillStyle = LIGHT; ctx.fillRect(-0.04, -0.118, m[0] - 0.02, 0.016);
      ctx.fillStyle = DARK; for (const x of [0.12, 0.17]) ctx.fillRect(x, -0.1, 0.025, 0.012);
      return;
    case 'smg':
      // compact receiver, straight magazine forward of the grip, stub barrel
      rect(ctx, 0.05, -0.05, 0.035, 0.15, DARK);
      shape(ctx, [[-0.07, -0.11], [0.23, -0.11], [0.23, -0.045], [0.035, -0.045], [0.03, 0.05], [-0.035, 0.05], [-0.045, -0.045], [-0.07, -0.06]], BODY);
      rect(ctx, 0.23, m[1] - 0.015, m[0] - 0.23, 0.03, DARK);
      ctx.fillStyle = LIGHT; ctx.fillRect(-0.05, -0.104, 0.26, 0.012);
      return;
    case 'rifle':
      // stock, receiver, curved magazine, long barrel with a front sight
      shape(ctx, [[-0.27, -0.07], [-0.06, -0.09], [-0.06, -0.03], [-0.27, 0.0]], WOOD);
      shape(ctx, [[0.07, -0.04], [0.12, -0.04], [0.16, 0.1], [0.11, 0.11]], DARK);
      shape(ctx, [[-0.07, -0.11], [0.3, -0.11], [0.3, -0.04], [0.035, -0.04], [0.03, 0.05], [-0.035, 0.05], [-0.07, -0.03]], BODY);
      rect(ctx, 0.3, m[1] - 0.014, m[0] - 0.3, 0.028, DARK);
      rect(ctx, m[0] - 0.05, m[1] - 0.05, 0.012, 0.036, DARK);
      ctx.fillStyle = LIGHT; ctx.fillRect(-0.05, -0.104, 0.33, 0.012);
      return;
    case 'mg':
      // heavy receiver, box magazine, perforated barrel shroud
      shape(ctx, [[-0.28, -0.08], [-0.07, -0.1], [-0.07, -0.03], [-0.28, 0.01]], DARK);
      rect(ctx, 0.06, -0.04, 0.11, 0.13, DARK);
      shape(ctx, [[-0.08, -0.125], [0.3, -0.125], [0.3, -0.035], [0.035, -0.035], [0.03, 0.05], [-0.035, 0.05], [-0.08, -0.03]], BODY);
      rect(ctx, 0.3, m[1] - 0.03, 0.17, 0.06, BODY);
      ctx.fillStyle = DARK; for (let x = 0.32; x < 0.46; x += 0.035) ctx.fillRect(x, m[1] - 0.012, 0.018, 0.024);
      rect(ctx, 0.47, m[1] - 0.014, m[0] - 0.47, 0.028, DARK);
      return;
    case 'shotgun':
      // stock, receiver, barrel over the magazine tube, pump grip
      shape(ctx, [[-0.27, -0.065], [-0.06, -0.09], [-0.06, -0.03], [-0.27, 0.005]], WOOD);
      shape(ctx, [[-0.07, -0.1], [0.14, -0.1], [0.14, -0.035], [0.035, -0.035], [0.03, 0.05], [-0.035, 0.05], [-0.07, -0.03]], BODY);
      rect(ctx, 0.14, m[1] - 0.02, m[0] - 0.14, 0.03, DARK);
      rect(ctx, 0.14, m[1] + 0.012, m[0] - 0.18, 0.024, DARK);
      rect(ctx, 0.26, m[1] + 0.004, 0.12, 0.044, WOOD);
      return;
    case 'sawedoff':
      // short double barrel and a cut-down grip
      shape(ctx, [[-0.09, -0.05], [-0.03, -0.09], [0.03, -0.09], [0.03, -0.035], [0.025, 0.05], [-0.04, 0.05], [-0.06, -0.01]], WOOD);
      rect(ctx, 0.02, m[1] - 0.032, m[0] - 0.02, 0.03, DARK);
      rect(ctx, 0.02, m[1] - 0.002, m[0] - 0.02, 0.03, DARK);
      return;
  }
}
