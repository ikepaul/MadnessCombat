// M5 replica labs (research/mechanics/gun-*). The reference clips are local-only; compare
// against research/mechanics/<slug>/frames-N.jpg when they are on this machine. Dummies count
// as enemies (split aim locks onto them) and stand still; waves respawn when all are dead.
import { WEAPONS, type WeaponId } from '../data/weapons';
import { type Actor, newHand } from '../sim/actor';
import { newAiState } from '../sim/ai';
import type { World } from '../sim/world';
import { type DummySpec, hero, respawner } from './meleeLabs';
import { registerLab } from './registry';

const CONTROLS = 'LMB / RMB fire each hand · E pick up · R reload · Q throw gun · Shift split aim · L drop a gun · 2/3 blood on';

/** Dummies that count as enemies. */
function enemies(specs: DummySpec[], delay = 1.5) {
  const r = respawner(specs, delay);
  const mark = (world: World) => { for (const a of world.actors) if (a.kind === 'grunt' && !a.ai) a.ai = newAiState(world); };
  return {
    setup(world: World) { r.setup(world); mark(world); },
    step(world: World) { r.step(world); mark(world); },
  };
}

/** A gun lying on the floor. */
function floorGun(world: World, kind: WeaponId, x: number, z: number, ammo = WEAPONS[kind].mag, spare = 1): void {
  const it = world.spawnItem(kind, 'grunt', { x, y: 0, z }, { x: 0, y: 0, z: 0 }, 0);
  it.state = 'floor';
  it.ammo = ammo;
  it.spare = spare;
}

function armed(world: World, x: number, z: number, hand0: WeaponId | null, hand1: WeaponId | null = null): Actor {
  const h = hero(world, x, z, true);
  h.hands = [hand0 ? newHand(hand0) : null, hand1 ? newHand(hand1) : null];
  return h;
}

const SPREAD: DummySpec[] = [{ x: 0.6, z: 8.5 }, { x: 1.4, z: 9.3 }, { x: 2.3, z: 10.2 }, { x: 2.9, z: 8.8 }];

{
  const e = enemies(SPREAD);
  registerLab({
    slug: 'gun-hitscan-smg',
    title: `SMG, 0.1 s full auto (ep1 f1612-f1621): 1-frame flash + 1-frame tracer; the shot hits the first body it crosses on screen at any depth; the table is cover only for what's behind it. ${CONTROLS}`,
    setup(world) { armed(world, -2.4, 9.2, 'smg'); e.setup(world); },
    step: e.step,
  });
}

{
  const e = enemies(SPREAD);
  registerLab({
    slug: 'gun-pistol-suppressed',
    title: `Pistol (semi, 0.15 s), suppressed pistol (dull thump, no room flash) and Desert Eagle (one-shots on the body) on the floor: E to swap. Double-tap ~0.3 s (ep2 f950). ${CONTROLS}`,
    setup(world) {
      armed(world, -2.4, 9.2, 'pistolSuppressed');
      floorGun(world, 'pistol', -1.9, 8.6);
      floorGun(world, 'deagle', -1.6, 9.8);
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies([{ x: -0.6, z: 9.2 }, { x: -0.3, z: 9.4 }, { x: 1.8, z: 9.0 }, { x: 2.6, z: 9.7 }]);
  registerLab({
    slug: 'gun-shotgun',
    title: `Pump shotgun (6 near-parallel pellets +-4 deg, 0.6 s) and sawed-off (2 shots): point blank knocks bodies flying and bursts heads (ep1, ep2). ${CONTROLS}`,
    setup(world) {
      world.room = { ...world.room, props: [] };
      armed(world, -1.6, 9.2, 'shotgun');
      floorGun(world, 'sawedoff', -2.2, 8.7);
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies([...SPREAD, { x: 0.2, z: 10.3 }, { x: 3.1, z: 10.0 }]);
  registerLab({
    slug: 'gun-auto-rifle',
    title: `Rifle (0.1 s, 30) and machine gun (0.07 s, 100, you walk at half speed while firing) (ep3). ${CONTROLS}`,
    setup(world) {
      armed(world, -2.4, 9.2, 'rifle');
      floorGun(world, 'mg', -1.8, 8.6);
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies([{ x: -2.4, z: 9.0 }, { x: -1.6, z: 10.0 }, { x: 1.6, z: 9.0 }, { x: 2.5, z: 9.9 }]);
  registerLab({
    slug: 'gun-dual-wield',
    title: `Two guns, one per hand: LMB fires the front hand, RMB the back hand. Hold Shift to split aim: the back hand locks onto the nearest enemy on the other side (ep1 finale). ${CONTROLS}`,
    setup(world) {
      world.room = { ...world.room, props: [] };
      armed(world, 0, 9.2, 'pistol', 'smg');
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies(SPREAD);
  registerLab({
    slug: 'gun-reload',
    title: `Reload (R): 0.6 s for a pistol, 1.0 s others, only with the one spare magazine, never while dual-wielding; the magazine drops and stays (ep2 f1649-f1667). ${CONTROLS}`,
    setup(world) {
      const h = armed(world, -2.4, 9.2, 'pistol');
      h.hands[0]!.ammo = 2;
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies([{ x: 0.4, z: 9.2 }, { x: 1.6, z: 9.2 }, { x: 2.4, z: 9.6 }]);
  registerLab({
    slug: 'gun-empty-throw',
    title: `Empty gun: trigger -> dry click -> the next press throws it, spinning straight at the cursor; a head hit kills, a body hit knocks down. Thrown guns stay empty (ep3). ${CONTROLS}`,
    setup(world) {
      world.room = { ...world.room, props: [] };
      const h = armed(world, -2.2, 9.2, 'pistol');
      h.hands[0]!.ammo = 1;
      h.hands[0]!.spare = 0;
      floorGun(world, 'smg', -1.6, 8.6, 4, 0);
      e.setup(world);
    },
    step: e.step,
  });
}

{
  const e = enemies([{ x: 0.2, z: 9.2, held: 'pistol' }, { x: 1.4, z: 8.8, held: 'shotgun' }, { x: 2.4, z: 9.8, held: 'smg', ammo: 7 }], 2.5);
  registerLab({
    slug: 'gun-pickup-drop',
    title: `Every weapon a grunt dies with drops and stays, ammo and all. Walk over a gun with empty hands to take it; E takes another into the free hand or swaps (ep1-3). ${CONTROLS}`,
    setup(world) {
      world.room = { ...world.room, props: [] };
      hero(world, -2.2, 9.2);
      floorGun(world, 'pistol', -1.5, 9.2);
      e.setup(world);
    },
    step: e.step,
  });
}
