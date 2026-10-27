// M5 acceptance tests (PLAN.md): screen-space hitscan across depth, cover, SMG rate, one-bullet
// kills, empty -> click -> throw, dual wield, split aim, plus reload, pick-up and thrown guns.
import { describe, expect, it } from 'vitest';
import { TEST_ROOM } from '../src/data/rooms/testRoom';
import { WEAPONS } from '../src/data/weapons';
import { project } from '../src/render/camera';
import { type Actor, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import type { GameEvents } from '../src/sim/events';
import { splitTarget } from '../src/sim/guns';
import { castRay } from '../src/sim/hitscan';
import type { RoomDef } from '../src/sim/room';
import { World } from '../src/sim/world';

const EMPTY: RoomDef = { ...TEST_ROOM, props: [] };
const Z = 9.2;

function setup(room: RoomDef = EMPTY, x = -2.5): { world: World; hero: Actor } {
  const world = new World(room);
  const hero = createActor('hero', x, Z, 1);
  world.addPlayer(hero);
  return { world, hero };
}

function grunt(world: World, x: number, z = Z): Actor {
  const g = createActor('grunt', x, z, -1);
  g.ai = { cooldown: 0, ring: 2, waitZ: z, driftT: 99, ready: 0 };
  world.actors.push(g);
  return g;
}

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) {
    world.command = { ...IDLE_COMMAND, ...cmd };
    world.step();
  }
}

function record<K extends keyof GameEvents>(world: World, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  world.events.on(type, (e) => out.push(e));
  return out;
}

/** Screen point of an actor's chest / head. */
const chest = (a: Actor) => project(a.pos.x, a.pos.y + 0.4, a.pos.z);
const head = (a: Actor) => project(a.pos.x, a.pos.y + 0.79, a.pos.z);

describe('screen-space hitscan across depth (ground rules)', () => {
  const right: [number, number] = [1, 0];
  const none = () => false;

  it('case 1: same depth, the nearer body along the ray is hit', () => {
    const { world } = setup();
    const a = grunt(world, 0), b = grunt(world, 1.5);
    const r = castRay(world, [chest(a)[0] - 300, chest(a)[1]], right, Z, none);
    expect(r.hit?.actor).toBe(a);
    expect(b).toBeDefined();
  });

  it('case 2: a deeper target is hit when it is crossed first on screen', () => {
    const { world } = setup();
    const far = grunt(world, -0.5, 10.4), near = grunt(world, 1.5, 8.3);
    const r = castRay(world, [chest(far)[0] - 200, chest(far)[1]], right, Z, none);
    expect(r.hit?.actor).toBe(far);
    expect(near).toBeDefined();
  });

  it("case 3: a nearer target's head blocks a deeper target's chest behind it on screen", () => {
    const { world } = setup();
    const far = grunt(world, 1.0, 10.4);
    // a near grunt whose head covers the far one's chest line, closer to the muzzle on screen
    const near = grunt(world, 0.0, 8.3);
    const y = chest(far)[1];
    const r = castRay(world, [project(-2, 0.5, 8.3)[0], y], right, Z, none);
    expect(r.hit?.actor).toBe(near);
    expect(r.hit?.part).toBe('head');
  });

  it('cover in front of the target blocks, cover behind it does not', () => {
    const { world } = setup(TEST_ROOM);
    const table = TEST_ROOM.props[0]; // x 1.25..2.55, z 9.25..9.95, top 0.52
    const behind = grunt(world, 1.9, 10.4);
    const low: [number, number] = [project(-2, 0.3, 10.4)[0], project(1.9, 0.3, 10.4)[1]];
    const blocked = castRay(world, low, [1, 0], Z, () => false);
    expect(blocked.hit).toBeUndefined();
    expect(blocked.surface).toBe('prop');
    // a target in front of the table: the table's screen box is behind it in depth
    behind.pos.z = 8.6;
    const y = project(1.9, 0.3, 8.6)[1];
    const clear = castRay(world, [project(-2, 0.3, 8.6)[0], y], [1, 0], Z, () => false);
    expect(clear.hit?.actor).toBe(behind);
    expect(table).toBeDefined();
  });

  it('a miss at the shooter depth ends on the side wall', () => {
    const { world, hero } = setup();
    const r = castRay(world, chest(hero), [1, 0], Z, (o) => o === hero);
    expect(r.surface).toBe('wall');
    expect(r.world!.x).toBeCloseTo(EMPTY.halfWidth, 3);
  });
});

describe('firing (gun-*)', () => {
  it('SMG fires every 0.1 s while held', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('smg');
    const shots = record(world, 'shot');
    tick(world, { hold: [true, false], press: [true, false] });
    tick(world, { hold: [true, false] }, 59);
    expect(shots.length).toBeGreaterThanOrEqual(10);
    expect(shots.length).toBeLessThanOrEqual(11);
    expect(hero.hands[0]!.ammo).toBe(WEAPONS.smg.mag - shots.length);
  });

  it('a grunt dies from 1 bullet to the head, or 2 to the body', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol');
    const g = grunt(world, 0);
    tick(world, { press: [true, false], aim: head(g) });
    expect(g.state).toBe('dead');
    const g2 = grunt(world, 0.5, 9.2);
    tick(world, {}, 30);
    tick(world, { press: [true, false], aim: chest(g2) });
    expect(g2.state).not.toBe('dead');
    expect(g2.hp).toBe(2);
    tick(world, {}, 20);
    tick(world, { press: [true, false], aim: chest(g2) });
    expect(g2.state).toBe('dead');
  });

  it('the player loses exactly one life per bullet', () => {
    const { world, hero } = setup();
    world.hitBullet(hero, hero, WEAPONS.deagle.damageBody, 'body', 1, false, hero.pos);
    expect(hero.hp).toBe(2);
  });

  it('empty gun: trigger -> dry click -> the next press throws it', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol', 1, 0);
    const shots = record(world, 'shot'), clicks = record(world, 'dryFire'), throws = record(world, 'throw');
    tick(world, { press: [true, false] });
    tick(world, {}, 20);
    tick(world, { press: [true, false] });
    tick(world, {}, 5);
    expect([shots.length, clicks.length, throws.length]).toEqual([1, 1, 0]);
    tick(world, { press: [true, false] });
    expect(throws).toHaveLength(1);
    expect(hero.hands[0]).toBeNull();
    const thrown = world.items.find((i) => i.id === throws[0].itemId)!;
    expect(thrown.kind).toBe('pistol');
    expect(thrown.ammo).toBe(0); // dropped empty guns stay empty
  });

  it('dual wield: each hand fires independently', () => {
    const { world, hero } = setup();
    hero.hands = [newHand('pistol'), newHand('pistol')];
    const shots = record(world, 'shot');
    tick(world, { press: [true, false] });
    tick(world, {}, 20);
    tick(world, { press: [false, true] });
    expect(shots.map((s) => s.hand)).toEqual([0, 1]);
    expect(hero.hands[0]!.ammo).toBe(7);
    expect(hero.hands[1]!.ammo).toBe(7);
  });

  it('split aim locks the back hand onto the nearest enemy on the other side', () => {
    const { world, hero } = setup(EMPTY, 0);
    hero.facing = 1;
    const farLeft = grunt(world, -2.5), nearLeft = grunt(world, -1.2), right = grunt(world, 1.0);
    expect(splitTarget(world, hero)).toBe(nearLeft);
    hero.hands = [newHand('pistol'), newHand('pistol')];
    tick(world, { split: true, aim: chest(right) });
    expect(hero.pose.aimB).toEqual(project(nearLeft.pos.x, nearLeft.pos.y + 0.75, nearLeft.pos.z));
    expect(farLeft).toBeDefined();
  });

  it('teammates are never hit (no friendly fire)', () => {
    const { world, hero } = setup();
    const p2 = createActor('hero', 0, Z, -1);
    world.addPlayer(p2);
    hero.hands[0] = newHand('pistol');
    tick(world, { press: [true, false], aim: chest(p2) });
    expect(p2.hp).toBe(p2.maxHp);
  });
});

describe('ammo, reload, pick-up, thrown guns', () => {
  it('reload: 0.6 s for a pistol, uses the one spare; not while dual-wielding', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol', 2, 1);
    tick(world, { reload: true });
    tick(world, {}, Math.round(WEAPONS.pistol.reload * 60));
    expect(hero.hands[0]!.ammo).toBe(WEAPONS.pistol.mag);
    expect(hero.hands[0]!.spare).toBe(0);
    hero.hands = [newHand('pistol', 2, 1), newHand('pistol', 2, 1)];
    tick(world, { reload: true });
    tick(world, {}, 60);
    expect(hero.hands[0]!.ammo).toBe(2);
  });

  it('E picks up a gun with its ammo; empty hands pick one up just by walking over it', () => {
    const { world, hero } = setup(EMPTY, 0);
    const it = world.spawnItem('smg', 'grunt', { x: 0.2, y: 0, z: Z }, { x: 0, y: 0, z: 0 }, 0);
    it.state = 'floor';
    it.ammo = 5;
    it.spare = 0;
    tick(world);
    expect(hero.hands[0]).toMatchObject({ item: 'smg', ammo: 5, spare: 0 });
    const it2 = world.spawnItem('shotgun', 'grunt', { x: 0.2, y: 0, z: Z }, { x: 0, y: 0, z: 0 }, 0);
    it2.state = 'floor';
    tick(world);
    // M17: a loaded gun is walked into the empty second hand too
    expect(hero.hands[1]?.item).toBe('shotgun');
  });

  it('a thrown gun to the head stuns a grunt (M10b: a heavy then kills); to the body it knocks him down', () => {
    const { world, hero } = setup(EMPTY, -1.5);
    hero.hands[0] = newHand('pistol', 0, 0);
    hero.hands[0].clicked = true;
    const g = grunt(world, 0.5);
    let headHit = false;
    world.events.on('hit', (e) => { if (e.actorId === g.id && e.kind === 'gun' && e.part === 'head') headHit = true; });
    tick(world, { press: [true, false], aim: head(g) });
    for (let i = 0; i < 30 && !headHit; i++) tick(world);
    tick(world);
    expect(headHit).toBe(true);
    expect(g.state).toBe('stun');
    expect(g.hp).toBe(g.maxHp - 1);
    // (he's still standing now: out of the way for the body throw)
    world.actors.splice(world.actors.indexOf(g), 1);
    hero.hands[0] = newHand('deagle', 0, 0);
    hero.hands[0].clicked = true;
    const g2 = grunt(world, 0.5, Z);
    tick(world, {}, 60);
    tick(world, { press: [true, false], aim: project(0.5, 0.3, Z) });
    tick(world, {}, 20);
    expect(['knockback', 'down']).toContain(g2.state);
  });

  it('a grunt killed while holding a gun drops it, ammo and all', () => {
    const { world, hero } = setup();
    hero.hands[0] = newHand('pistol');
    const g = grunt(world, 0);
    g.hands[0] = newHand('rifle', 12, 0);
    tick(world, { press: [true, false], aim: head(g) });
    tick(world, {}, 60);
    const rifle = world.items.find((i) => i.kind === 'rifle')!;
    expect(rifle.ammo).toBe(12);
    expect(rifle.state).toBe('floor');
  });
});
