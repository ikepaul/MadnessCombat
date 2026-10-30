// M14b soak invariants (design/audit/README.md §2a, rules 1-9): checked every tick by the soak
// (tests/soak.test.ts, tests/soakHarness.ts) and callable from dev builds. Plain TS, no Phaser.
import { alive } from './actor';
import type { World } from './world';

const STUCK_STATES = new Set(['stun', 'knockback', 'grabbed', 'getUp', 'down']);

/**
 * Report every broken invariant of `world` right now (ids, finite positions, bounds, stuck states,
 * grab and item ownership, item cap, cooking through a room change). `stuck` carries per-actor
 * tick counts from one call to the next.
 */
export function checkInvariants(world: World, stuck: Map<number, number>, report: (rule: string, detail: string) => void): void {
  const r = world.room;
  const fin = (v: { x: number; y: number; z: number }) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const ids = new Set<number>();
  for (const a of world.actors) {
    if (ids.has(a.id)) report('ids', `duplicate actor id ${a.id}`);
    ids.add(a.id);
    if (!fin(a.pos) || !fin(a.body.vel)) report('finite', `actor ${a.id} ${a.kind} pos ${JSON.stringify(a.pos)} vel ${JSON.stringify(a.body.vel)}`);
    const exempt = a.entering || a.traversing || a.flight || a.hover !== undefined || a.fallingAway !== undefined || a.swept || a.kind === 'boss' || a.holding || a.grabbedBy !== undefined || a.ceilingStuck || (r.void && a.state === 'dead');
    if (!exempt && (Math.abs(a.pos.x) > r.halfWidth + 0.5 || a.pos.z < r.zFront - 0.5 || a.pos.z > r.zBack + 0.5 || a.pos.y < -0.5)) {
      report('bounds', `actor ${a.id} ${a.kind}/${a.variant ?? ''} ${a.state} at ${a.pos.x.toFixed(2)},${a.pos.y.toFixed(2)},${a.pos.z.toFixed(2)} (room hw ${r.halfWidth} z ${r.zFront}..${r.zBack})`);
    }
    if (alive(a) && STUCK_STATES.has(a.state) && !a.koed && !a.parked) {
      const n = (stuck.get(a.id) ?? 0) + 1;
      stuck.set(a.id, n);
      if (n === 15 * 60) report('stuck', `actor ${a.id} ${a.kind}/${a.variant ?? ''} in ${a.state} for 15 s (pos ${a.pos.x.toFixed(2)},${a.pos.y.toFixed(2)})`);
    } else stuck.delete(a.id);
    // grabs symmetric
    if (a.holding?.kind === 'actor') {
      const o = world.actorById(a.holding.id);
      if (!o) report('grab', `actor ${a.id} holds missing actor ${a.holding.id}`);
      else if (alive(o) && o.grabbedBy !== a.id) report('grab', `actor ${a.id} holds ${o.id} (${o.state}) whose grabbedBy=${o.grabbedBy}`);
    }
    if (a.holding?.kind === 'item' && !world.items.some((i) => i.id === a.holding!.id)) report('grab', `actor ${a.id} holds missing item ${a.holding.id}`);
    if (a.grabbedBy !== undefined && alive(a)) {
      const h = world.actorById(a.grabbedBy);
      if (h?.kind !== 'boss' && (!h || h.holding?.id !== a.id)) report('grab', `actor ${a.id} (${a.state}) grabbedBy ${a.grabbedBy} who holds ${JSON.stringify(h?.holding)}${h ? '' : ' (gone)'}`);
    }
    if (a.state === 'grabbed' && a.grabbedBy === undefined) report('grab', `actor ${a.id} in state grabbed with no holder`);
  }
  for (const it of world.items) {
    if (ids.has(it.id)) report('ids', `duplicate id ${it.id} (item ${it.kind})`);
    ids.add(it.id);
    if (!fin(it.pos) || !fin(it.vel)) report('finite', `item ${it.id} ${it.kind} pos ${JSON.stringify(it.pos)}`);
    if (it.state === 'held') {
      const h = it.heldBy !== undefined ? world.actorById(it.heldBy) : undefined;
      if (!h || h.holding?.id !== it.id) report('item', `item ${it.id} ${it.kind} held by ${it.heldBy} who holds ${JSON.stringify(h?.holding)}`);
    }
    if (it.state === 'stuck' && it.stuckTo !== undefined && !world.actorById(it.stuckTo)) report('item', `item ${it.id} ${it.kind} stuck to missing actor ${it.stuckTo}`);
    if (it.state !== 'held' && it.state !== 'stuck' && (Math.abs(it.pos.x) > r.halfWidth + 0.5 || it.pos.y < -1 && !r.void)) report('itemBounds', `item ${it.id} ${it.kind} ${it.state} at ${it.pos.x.toFixed(2)},${it.pos.y.toFixed(2)},${it.pos.z.toFixed(2)}`);
  }
  if (world.items.length > 150) report('caps', `${world.items.length} items`);
  for (const p of world.players) {
    if (p.cook !== undefined && (p.traversing || world.transition)) report('cook', `player ${p.id} cooking (${p.cook.toFixed(2)} s) during a room transition`);
  }
}
