// Explosions (throw-grenade, PLAN.md M6): blast radius 2 H kills the living and throws them
// ~1.5 H up and outward; corpses close by are gibbed (they can't be raised as zombies any
// more), farther ones are thrown about; loose items scatter. The `explosion` event carries the
// floor point for the scorch decal and for breakable floor tiles (M9).
import { gibCorpse } from './gore';
import { lyingAt } from '../anim/skeleton';
import { GRENADE } from '../data/melee';
import { GRAVITY } from '../data/tuning';
import { alive, type Vec3 } from './actor';
import { applyHit } from './combat';
import { unstick } from './items';
import type { World } from './world';

/** Flight that peaks at GRENADE.launchHeight and drifts GRENADE.launchDistance outward. */
export function blastFlight(dirX: number, dirZ: number) {
  const n = Math.hypot(dirX, dirZ) || 1;
  const vy = Math.sqrt(2 * GRAVITY * GRENADE.launchHeight);
  const airtime = (2 * vy) / GRAVITY;
  const v = GRENADE.launchDistance / airtime;
  return { vx: (dirX / n) * v, vz: (dirZ / n) * v, vy, airtime };
}

export function explode(world: World, at: Vec3, byId?: number): void {
  const by = byId !== undefined ? world.actorById(byId) : undefined;
  world.events.emit('explosion', { x: at.x, y: at.y, z: at.z, radius: GRENADE.radius, byId: byId ?? 0 });
  for (const a of [...world.actors]) {
    // distance to the body's middle; depth counts fully (the blast is a sphere on the floor plane)
    const dx = a.pos.x - at.x, dz = a.pos.z - at.z, dy = a.pos.y + 0.4 - Math.max(at.y, 0.2);
    const d = Math.hypot(dx, dz, dy);
    if (d > GRENADE.radius) continue;
    const dirX = Math.abs(dx) < 0.05 ? (world.rng() < 0.5 ? -1 : 1) : dx, dirZ = dz;
    if (alive(a)) {
      if (a.state === 'downed') continue;
      // the living: one life off the player (like any hit), enemies die and fly
      applyHit(world, by, a, 'blast', dirX, dirZ, { x: a.pos.x, y: a.pos.y + 0.4, z: a.pos.z }, 'body', false, { damage: 99, pointBlank: false });
      continue;
    }
    const c = a.corpse;
    if (!c || c.gibbed || a.grabbedBy !== undefined) continue;
    if (c.phase === 'frozen') world.events.emit('corpseThawed', { actorId: a.id });
    if (d <= GRENADE.gibRadius) {
      // gibbed: the body is gone, only pieces (VFX) and blood remain
      gibCorpse(world, a);
      continue;
    }
    // farther corpses are thrown about
    const f = blastFlight(dirX, dirZ);
    const r = a.pose.root.r || -Math.PI / 2;
    a.flight = { ...f, r, r0: r, rTo: r > 0 ? Math.PI / 2 : -Math.PI / 2, spin: 0, phase: 'air', t: 0, hit: [] };
    a.pose.root = lyingAt(r);
    c.phase = 'tumble';
    c.t = 0;
    c.slumped = false;
    c.pinned = false;
  }
  for (const it of world.items) {
    const dx = it.pos.x - at.x, dz = it.pos.z - at.z, d = Math.hypot(dx, dz, it.pos.y - at.y);
    if (d > GRENADE.radius || it.state === 'held' || it.state === 'planted') continue;
    if (it.state === 'stuck') { if (it.stuckTo === undefined) continue; unstick(it); }
    // other live grenades go off a moment later (chain)
    if (it.kind === 'grenade' && it.live && it.fuse !== undefined) { it.fuse = Math.min(it.fuse, 0.08); continue; }
    const n = Math.hypot(dx, dz) || 1, k = 1 - d / GRENADE.radius;
    it.state = 'air';
    it.vel = { x: (dx / n) * 3 * k, y: 2 + 3 * k, z: (dz / n) * 1.5 * k };
    it.spin = (dx >= 0 ? 1 : -1) * 15;
  }
}
