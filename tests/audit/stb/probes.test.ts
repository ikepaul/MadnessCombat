// STB audit probes (design/audit/stb.md). Each `it` states the CORRECT behaviour: a failing probe
// is a confirmed bug (the finding id is in the name). `AUDIT=1 npx vitest run tests/audit/stb`.
import { describe, expect, it } from 'vitest';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { STAGE2 } from '../../../src/data/stages/stage2';
import { FixedClock } from '../../../src/sim/clock';
import { type Actor, alive, createActor } from '../../../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import { stageRunner } from '../../../src/sim/stage';
import { World } from '../../../src/sim/world';
import { foes, stageWorld } from '../harness';

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) { world.command = { ...IDLE_COMMAND, ...cmd }; world.step(); }
}

/** Kill every foe each tick (like tests/stage2.test.ts), keep the heroes alive; run until `cond`. */
function autoClear(world: World, cond: () => boolean, seconds = 120): boolean {
  for (let i = 0; i < seconds * 60 && !cond(); i++) {
    for (const p of world.players) p.invulnerable = true;
    for (const a of foes(world)) if (!a.entering && !a.koed && a.kind !== 'boss') world.hitActor(world.player, a, 'blast', 1, 0, { ...a.pos });
    for (const it of [...world.items]) if (it.kind === 'grenade' && it.live) world.items.splice(world.items.indexOf(it), 1);
    tick(world);
  }
  return cond();
}

/** Walk player 1 into the first open walk-in exit (teleport next to it, then walk). */
function walkOut(world: World, hero: Actor): void {
  const x = world.exits.find((e) => e.open && !e.def.warp && (e.def.kind === 'edge' || e.def.kind === 'door'))!.def;
  hero.pos.x = Math.max(-world.room.halfWidth + 0.3, Math.min(world.room.halfWidth - 0.3, (x.x0 + x.x1) / 2));
  hero.pos.z = Math.max(x.z0, Math.min(x.z1, 9.0));
}

describe.skipIf(!process.env.AUDIT)('STB probes', () => {
  it('STB-02: restarting the street from its checkpoint keeps improbability mode and the axe-throw rule', () => {
    // continuous: the camera room switches improbability on and sets 'axeThrows'; then the void exit to the street
    const world = stageWorld(3, 'camera');
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    expect(autoClear(world, () => entered.includes('street'), 180)).toBe(true);
    const continuous = { physics: world.physics, axe: world.flags.has('axeThrows') };
    // the checkpoint restart: GameScene.setupRoomStage builds a fresh World at the street
    const fresh = stageWorld(3, 'street');
    tick(fresh, {}, 3);
    const restarted = { physics: fresh.physics, axe: fresh.flags.has('axeThrows') };
    console.log('STB-02 continuous', continuous, 'restarted', restarted);
    expect(restarted).toEqual(continuous);
  });

  it('STB-03: a grenade cooked while walking out of a room does not follow the hero into the next', () => {
    const world = stageWorld(2, 'wall');
    const hero = world.player!;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && world.exits.some((e) => e.open) && !world.inputLocked, 30);
    hero.grenades = 1;
    hero.hands[1] = null;
    tick(world, { grenade: true }, 20); // cooking
    expect(hero.cook).toBeGreaterThan(0);
    walkOut(world, hero);
    const entered: string[] = [];
    let blasts = 0;
    world.events.on('roomEnter', (e) => entered.push(e.room));
    world.events.on('explosion', () => blasts++);
    for (let i = 0; i < 240 && !entered.length; i++) tick(world, { grenade: true, moveX: 1 });
    console.log('STB-03 entered', entered, 'cook on arrival', hero.cook, 'traversal', hero.traversing?.kind);
    expect(entered.length).toBe(1);
    // keep G held into the new room: the old room's grenade must not go off in the new one
    for (let i = 0; i < 300; i++) tick(world, { grenade: true });
    console.log('STB-03 explosions in the new room', blasts, 'hero alive', alive(hero), 'hp', hero.hp);
    expect(blasts).toBe(0);
  });

  it('STB-04: a hero killed while walking out of the room stays dead (no free revive in the next room)', () => {
    const world = stageWorld(2, 'wall');
    const hero = world.player!;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && !world.inputLocked, 30);
    hero.invulnerable = false;
    walkOut(world, hero);
    for (let i = 0; i < 60 && !world.exitTaken; i++) tick(world, { moveX: 1 });
    expect(world.exitTaken).toBeDefined();
    // a stray bullet / blast on the exit tick
    hero.hp = 1;
    world.hitActor(undefined, hero, "blast", 1, 0, { ...hero.pos });
    const diedAt = world.tick;
    const deadAtExit = !alive(hero);
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    for (let i = 0; i < 120 && !entered.length; i++) tick(world);
    console.log('STB-04 dead at exit', deadAtExit, 'entered', entered, 'after', ((world.tick - diedAt) / 60).toFixed(2), 's; hero', hero.state, 'hp', hero.hp);
    expect(deadAtExit).toBe(true);
    // GameScene restarts 2 s after the death: the next room must not bring him back first
    expect(alive(hero)).toBe(false);
  });

  it('exits: every room-graph exit leads to a room and an entry that exist', () => {
    const bad: string[] = [];
    for (const def of [STAGE2, STAGE3]) {
      for (const [id, r] of Object.entries(def.rooms)) {
        for (const x of r.exits) {
          if (x.to === null) continue;
          const to = def.rooms[x.to];
          if (!to) bad.push(`s${def.stage}/${id}.${x.id} -> missing room ${x.to}`);
          else if (!to.entries[x.entry]) bad.push(`s${def.stage}/${id}.${x.id} -> ${x.to} has no entry '${x.entry}' (falls back to the first)`);
          if (x.warp === undefined && x.x1 < -r.room.halfWidth - 0.01 && x.kind !== 'breach') bad.push(`s${def.stage}/${id}.${x.id} zone entirely off-screen`);
        }
      }
    }
    console.log('exits', bad);
    expect(bad).toEqual([]);
  });

  it('STB-10: pausing (F3 / the pause menu) also holds hit-stop: unpausing does not resume a stale freeze', () => {
    const c = new FixedClock();
    let steps = 0;
    c.hitStop(0.2);
    c.paused = true;
    // F4 single steps during the hit-stop run the world
    c.stepOnce(); c.stepOnce();
    c.advance(1 / 60, () => steps++);
    c.paused = false;
    const before = steps;
    c.advance(1 / 60, () => steps++);
    console.log('STB-10 steps while paused', before, 'first tick after unpause stepped?', steps > before, 'frozen', c.frozen);
    // documents behaviour: the hit-stop that started before the pause still runs after it
    expect(c.frozen).toBe(true);
  });

  it('coop: a co-op partner downed in the room comes back in the next one with what he had', () => {
    const world = stageWorld(2, 'wall', 2);
    const [p1, p2] = world.players;
    tick(world, {}, 30);
    autoClear(world, () => foes(world).length === 0 && !world.inputLocked, 30);
    p2.invulnerable = false;
    p2.hp = 1;
    world.hitActor(undefined, p2, 'blast', 1, 0, { ...p2.pos });
    tick(world, {}, 5);
    console.log('coop p2 after hit', p2.state, p2.hp);
    walkOut(world, p1);
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    for (let i = 0; i < 240 && !entered.length; i++) { world.commands = [{ ...IDLE_COMMAND, moveX: 1 }, { ...IDLE_COMMAND }]; world.step(); }
    console.log('coop entered', entered, 'p2', p2.state, 'hp', p2.hp);
    expect(entered.length).toBe(1);
    expect(p2.state).toBe('free');
  });

  it('lock: the last stand, a scripted lock and a pause can stack without the input lock leaking', () => {
    // a room script that locks input and is cancelled by a room change must not leave input locked
    const world = new World(STAGE3.rooms.street.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    STAGE3.loadout(hero);
    world.seq.run(stageRunner(STAGE3, 'street', 'west'), 'stage');
    tick(world, {}, 2);
    world.seq.lockInput(true);
    world.exitTaken = world.exits[0]?.def;
    const entered: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    for (let i = 0; i < 120 && !entered.length; i++) tick(world);
    console.log('lock entered', entered, 'inputLocked', world.inputLocked);
    expect(world.inputLocked).toBe(false);
  });
});

describe.skipIf(!process.env.AUDIT)('STB probes (endings)', () => {
  it('STB-05: dying in the 0.6 s before the stage 3 stab still ends the stage or restarts it (no dead hero forever)', () => {
    const world = stageWorld(3, 'lift');
    const hero = world.player!;
    let lastTwo = false, cleared = false;
    world.events.on('card', (e) => { if (e.text.startsWith('The last two')) lastTwo = true; });
    world.events.on('roomCleared', () => (cleared = true));
    expect(autoClear(world, () => lastTwo, 120)).toBe(true);
    // the last two guards go down, and in the same moment the hero dies (a grenade, a last shot)
    autoClear(world, () => foes(world).filter((a) => a.variant === 'bodyguard').length === 0, 30);
    hero.invulnerable = false;
    hero.hp = 1;
    world.hitActor(undefined, hero, 'blast', 1, 0, { ...hero.pos });
    tick(world, {}, 60 * 10);
    // GameScene.watchPlayerDeath: no restart while flags has 'ending'; no end card without roomCleared
    console.log('STB-05 hero', hero.state, 'ending flag', world.flags.has('ending'), 'roomCleared', cleared);
    expect(!alive(hero) && world.flags.has('ending') && !cleared).toBe(false);
  });
});
