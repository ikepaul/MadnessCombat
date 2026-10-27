// Gore levels (playtest 2026-10-27): stage 3 is "extreme". On top of the normal rules
// (melee-decapitation, grenades gib corpses): blasts gib the living too, shotguns up close gib
// (or take the head), any gun kill to the head decapitates, corpses lose hands, and the killer
// gets blood on him and on the blade or club he used. Presentation (bigger sprays, splatter,
// trails) reads `world.gore` in src/render/vfx.ts and decals.ts.
import { isWeapon } from '../data/weapons';
import type { Actor } from './actor';
import type { HitKind } from './events';
import type { World } from './world';

export type GoreLevel = 'normal' | 'extreme';

/** All invented (the episodes' gore is stylised; these only scale how often it happens). */
export const GORE = {
  /** Shotgun kills within this distance (H) gib the body (a head shot takes the head instead). */
  shotgunGib: 2.0,
  /** A corpse loses one hand at this chance, both at `bothHands` (of the kills that lose one). */
  handChance: 0.5,
  bothHands: 0.3,
  /** The killer gets this much blood on him per kill within `stainReach` (H), up to 1. */
  stainPerKill: 0.22,
  stainReach: 1.4,
};

export const extreme = (world: World) => world.gore === 'extreme';

/** What a killing blow does to the body under extreme gore (the normal decap rule still applies). */
export function goreKill(world: World, by: Actor | undefined, o: Actor, kind: HitKind, part: 'head' | 'body', pointBlank: boolean): { decap: boolean; gib: boolean } {
  const none = { decap: false, gib: false };
  if (!extreme(world) || o.kind !== 'grunt') return none;
  if (kind === 'blast') return { decap: false, gib: true };
  if (kind === 'bullet' && by) {
    const shotgun = by.hands.some((h) => h && (h.item === 'shotgun' || h.item === 'sawedoff'));
    const near = Math.hypot(by.pos.x - o.pos.x, by.pos.z - o.pos.z) <= GORE.shotgunGib;
    if (shotgun && (near || pointBlank)) return part === 'head' ? { decap: true, gib: false } : { decap: false, gib: true };
    if (part === 'head') return { decap: true, gib: false };
  }
  // thrown blades and guns to the head, axe/sword/club kills
  if ((kind === 'knife' || kind === 'smash' || kind === 'stab') && part === 'head') return { decap: true, gib: false };
  return none;
}

/** Turn a dead body into pieces (VFX) and blood; nothing is left to raise or pick up. */
export function gibCorpse(world: World, a: Actor): void {
  const c = a.corpse;
  if (!c || c.gibbed) return;
  c.gibbed = true;
  c.raisable = false;
  c.phase = 'settled';
  c.t = 0;
  a.flight = undefined;
  world.events.emit('gib', { actorId: a.id, ...a.pos });
}

/** After a kill under extreme gore: hands come off the corpse, the killer is stained. */
export function afterKill(world: World, by: Actor | undefined, o: Actor, kind: HitKind, dirX: number): void {
  if (!extreme(world) || o.kind !== 'grunt' || o.corpse?.gibbed) return;
  if (world.rng() < GORE.handChance) {
    const both = world.rng() < GORE.bothHands;
    const first: 'F' | 'B' = world.rng() < 0.5 ? 'F' : 'B';
    for (const hand of both ? (['F', 'B'] as const) : [first]) {
      o.pose.lostHands = { ...o.pose.lostHands, [hand]: true };
      world.events.emit('dismember', { actorId: o.id, hand, dirX, x: o.pos.x, y: o.pos.y + 0.45, z: o.pos.z });
    }
  }
  if (!by || by.kind === 'boss') return;
  const close = Math.hypot(by.pos.x - o.pos.x, by.pos.z - o.pos.z) <= GORE.stainReach;
  if (!close && kind !== 'blast') return;
  by.pose.stain = Math.min(1, (by.pose.stain ?? 0) + GORE.stainPerKill);
  // the blade or club that did it
  if (kind === 'stab' || kind === 'slash' || kind === 'smash' || kind === 'pin') {
    for (const h of by.hands) if (h && !isWeapon(h.item)) h.bloody = true;
  }
}
