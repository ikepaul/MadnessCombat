// M9 acceptance tests (PLAN.md): rooms chain in order with each transition type · a breach opens
// only with an explosion on the marked tile · the mini-boss can be disarmed and killed with his own
// rifle · the mass raise only raises intact corpses. Plus checkpoints and the target staying safe.
import { describe, expect, it } from 'vitest';
import { STAGE2, STAGE2_ROOMS } from '../src/data/stages/stage2';
import { bossInterruption, corridorSquad } from '../src/data/stages/stage2Script';
import { TUNING } from '../src/data/tuning';
import { project } from '../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../src/sim/command';
import { explode } from '../src/sim/explosives';
import { enterRoom, stageRunner } from '../src/sim/stage';
import { spawnEnemy, WaveDirector } from '../src/sim/waves';
import { cableSegment as cableSegmentOf, roof, shootCables } from '../src/sim/elevator';
import { holdUps } from '../src/sim/interrogate';
import { disarm } from '../src/sim/melee';
import { World } from '../src/sim/world';

function setup(room = STAGE2.start.room, entry?: string) {
  const world = new World(STAGE2.rooms[room].room);
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  STAGE2.loadout(hero);
  world.seq.run(stageRunner(STAGE2, room, entry ?? (room === STAGE2.start.room ? STAGE2.start.entry : Object.keys(STAGE2.rooms[room].entries)[0])), 'stage');
  return { world, hero };
}

function tick(world: World, cmd: Partial<PlayerCommand> = {}, n = 1): void {
  for (let i = 0; i < n; i++) {
    world.command = { ...IDLE_COMMAND, ...cmd };
    world.step();
  }
}

/** Run until `cond` (or `seconds` pass), the hero kept alive. */
function until(world: World, cond: () => boolean, seconds = 10, cmd: Partial<PlayerCommand> = {}): boolean {
  for (let i = 0; i < seconds * 60 && !cond(); i++) {
    tick(world, cmd);
    world.player!.hp = Math.max(world.player!.hp, 2);
  }
  return cond();
}


describe('stage 2 room graph', () => {
  it('the whole stage runs with a scripted bot: rooms chain in order through every exit type, to the end card', () => {
    const { world, hero } = setup();
    // the bot is about the room graph and the scripts, not the fights
    hero.invulnerable = true;
    hero.hands[0] = newHand('pistol', undefined, 99);
    const entered: string[] = [], kinds: string[] = [];
    world.events.on('roomEnter', (e) => entered.push(e.room));
    world.events.on('exitTaken', (e) => kinds.push(e.kind));
    let cleared = false;
    world.events.on('roomCleared', () => (cleared = true));
    let disarmed = false;
    for (let i = 0; i < 60 * 60 * 12 && !cleared; i++) {
      tick(world);
      hero.invulnerable = !world.flags.has('ending');
      if (world.transition || hero.traversing || world.inputLocked) continue;
      // clear the room (the target only gets disarmed), throw live grenades out
      for (const a of world.actors) if ((a.ai || a.kind === 'zombie') && alive(a) && !a.entering && !a.koed) world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos });
      for (const it of [...world.items]) if (it.kind === 'grenade' && it.live) world.items.splice(world.items.indexOf(it), 1);
      const target = world.actors.find((a) => a.variant === 'target' && a.protected);
      if (target && !disarmed && target.hands[0]) { disarm(world, hero, target, 'shot', 1); disarmed = true; }
      // the elevator: up on the roof once the doors open, then the cables
      if (world.roomId === 'elevator' && world.flags.has('ambush') && world.elevator?.phase === 'stopped') {
        if (hero.pos.y < 1) { hero.pos.y = roof(world)!.y; hero.body.groundY = roof(world)!.y; hero.pos.x = 0.5; }
        const seg = cableSegmentOf(world)!, y = (seg[0][1] + seg[1][1]) / 2;
        if (i % 10 === 0) shootCables(world, [seg[0][0] - 40, y], [seg[0][0] + 40, y]);
      }
      // an open way on (not the vent's way round): stand in it, walk on / press E / blast it
      const x = world.exits.find((e) => e.open && !e.def.warp)?.def;
      if (!x || world.exitTaken || i % 15) continue;
      if (x.kind === 'breach') { explode(world, { x: (x.x0 + x.x1) / 2, y: 0, z: (x.z0 + x.z1) / 2 }, hero.id); continue; }
      hero.pos.x = Math.max(-world.room.halfWidth + 0.21, Math.min(world.room.halfWidth - 0.21, (x.x0 + x.x1) / 2));
      hero.pos.z = Math.max(x.z0, Math.min(x.z1, 9.0));
      if (x.kind === 'ladder' || x.kind === 'lift') tick(world, { pickup: true });
      else tick(world, { moveX: x.x0 > 0 ? 1 : -1 });
    }
    expect(entered).toEqual([...STAGE2_ROOMS]);
    expect(kinds).toEqual(['edge', 'ladder', 'edge', 'breach', 'door', 'door', 'climb', 'lift', 'lift', 'door']);
    expect(cleared).toBe(true);
    expect(hero.state).toBe('dead');
  });

  it('the breach opens only with an explosion on the marked tile', () => {
    const { world, hero } = setup('roofB');
    tick(world, {}, 5);
    hero.hp = 99;
    const b = world.room.breach!;
    explode(world, { x: b.x0 - 1.5, y: 0, z: 9.4 }, hero.id);
    tick(world, {}, 30);
    expect(world.roomId).toBe('roofB');
    expect(world.exitTaken).toBeUndefined();
    explode(world, { x: (b.x0 + b.x1) / 2, y: 0, z: (b.z0 + b.z1) / 2 }, hero.id);
    expect(world.exitTaken?.kind).toBe('breach');
    until(world, () => world.roomId === 'office', 3);
    expect(world.roomId).toBe('office');
    // dropped in through the ceiling, the guards caught off guard
    expect(hero.pos.y).toBeGreaterThan(1);
    tick(world, {}, 2);
    expect(world.actors.filter((a) => a.ai).every((a) => (a.ai!.surpriseT ?? 0) > 0)).toBe(true);
  });

  it('every room entry is a checkpoint with the loadout as it was', () => {
    const { world, hero } = setup('roofA');
    const marks: { room: string }[] = [];
    world.events.on('roomEnter', (e) => marks.push(e));
    tick(world, {}, 2);
    expect(marks.at(-1)?.room).toBe('roofA');
    expect(hero.traversing?.kind).toBe('vault');
    until(world, () => !hero.traversing, 2);
    expect(hero.pos.y).toBe(0);
  });

  it('the target can\'t be hurt before his last room; his wild shot kills his own guard', () => {
    const { world, hero } = setup('office');
    hero.hp = 99;
    const kills: { actorId: number; byId: number }[] = [];
    world.events.on('kill', (e) => kills.push(e));
    tick(world, {}, 2);
    const target = world.actors.find((a) => a.variant === 'target')!;
    world.hitBullet(hero, target, 4, 'head', 1, false, { ...target.pos });
    expect(alive(target)).toBe(true);
    until(world, () => kills.some((k) => k.byId === target.id), 3);
    expect(kills.some((k) => k.byId === target.id)).toBe(true);
    until(world, () => !world.actors.includes(target), 8);
    expect(world.actors.includes(target)).toBe(false);
  });
});

describe('stage 2 characters', () => {
  it('the mini-boss can be disarmed (steal) and killed with his own rifle', () => {
    const world = new World(STAGE2.rooms.corridor.room);
    const hero = createActor('hero', -0.4, 8.8, 1);
    world.addPlayer(hero);
    hero.hp = 99;
    world.director = new WaveDirector(corridorSquad());
    until(world, () => world.actors.some((a) => a.variant === 'riot' && !a.entering), 5);
    const riot = world.actors.find((a) => a.variant === 'riot')!;
    expect(riot.hands[0]?.item).toBe('rifle');
    // walk up and steal it (F with empty hands on an armed enemy)
    for (let i = 0; i < 60 * 6 && riot.hands[0]?.item === 'rifle'; i++) {
      const dx = riot.pos.x - hero.pos.x, dz = riot.pos.z - hero.pos.z;
      const close = Math.abs(dx) < 0.55 && Math.abs(dz) < 0.12;
      tick(world, close ? { grab: i % 4 === 0, face: dx > 0 ? 1 : -1 } : { moveX: Math.sign(dx) * (Math.abs(dx) > 0.4 ? 1 : 0), moveZ: Math.abs(dz) > 0.05 ? Math.sign(dz) : 0, face: dx > 0 ? 1 : -1 });
      for (const a of world.actors) if (a.ai && a !== riot) a.pos.x = 3.3; // keep the squad out of it
    }
    expect(riot.hands[0]).toBeNull();
    until(world, () => hero.hands.some((h) => h?.item === 'rifle') && hero.state === 'free', 2);
    expect(hero.hands[0]?.item).toBe('rifle');
    const kills: { actorId: number; byId: number }[] = [];
    world.events.on('kill', (e) => kills.push(e));
        for (let i = 0; i < 60 * 4 && alive(riot); i++) {
      for (const a of world.actors) if (a.ai && a !== riot && alive(a)) a.pos.x = 3.3;
      tick(world, { hold: [true, false], press: [i % 6 === 0, false], aim: project(riot.pos.x, riot.pos.y + 0.79, riot.pos.z) });
    }
    expect(alive(riot)).toBe(false);
    expect(kills.find((k) => k.actorId === riot.id)?.byId).toBe(hero.id);
  });

  it('the mass raise only raises intact corpses (at most 8), then the boss leaves', () => {
    const world = new World(STAGE2.rooms.corridor.room);
    const hero = createActor('hero', -2.5, 9.0, 1);
    world.addPlayer(hero);
    hero.hp = 99;
    const corpses: Actor[] = [];
    for (let i = 0; i < 11; i++) {
      const c = createActor('grunt', -1.5 + i * 0.35, 8.6 + (i % 3) * 0.4, -1, { dead: true });
      world.actors.push(c);
      corpses.push(c);
    }
    corpses[0].corpse!.gibbed = true;
    corpses[0].corpse!.raisable = false;
    corpses[1].pose.headless = true;
    const flings: unknown[] = [];
    world.events.on('bossFling', (e) => flings.push(e));
    world.seq.run(bossInterruption);
    tick(world, {}, 2);
    until(world, () => !world.actors.some((a) => a.kind === 'boss'), 10);
    expect(flings.length).toBe(1);
    const raised = corpses.filter((c) => c.kind === 'zombie');
    expect(raised.length).toBe(TUNING.boss.massRaise.max);
    expect(raised).not.toContain(corpses[0]);
    expect(raised).not.toContain(corpses[1]);
    expect(world.actors.some((a) => a.kind === 'boss')).toBe(false);
  });

  it('the fling throws the player ~3.6 H across the room', () => {
    const world = new World(STAGE2.rooms.office.room);
    const hero = createActor('hero', -2.0, 9.0, 1);
    world.addPlayer(hero);
    hero.hp = 99;
    enterRoom; // (room graph not needed here)
    const x0 = hero.pos.x;
    world.hitActor(undefined, hero, 'fling', 1, 0, { ...hero.pos });
    until(world, () => hero.state !== 'knockback', 2);
    expect(hero.pos.x - x0).toBeGreaterThan(3.0);
    expect(hero.pos.x - x0).toBeLessThan(4.2);
  });
});

void newHand;

describe('stage 2, second half (M10)', () => {
  it('the elevator: events fire in order, and the cables only break after the door ambush', () => {
    const { world, hero } = setup('elevator');
    hero.invulnerable = true;
    hero.hands[0] = newHand('pistol', undefined, 9);
    const order: string[] = [];
    world.events.on('elevator', (e) => order.push(`elevator:${e.phase}`));
    world.events.on('roofLanding', () => order.push('landing'));
    world.events.on('weld', (e) => order.push(`weld:${e.phase}`));
    world.events.on('grenadePin', () => order.push('grenade'));
    world.events.on('cableHit', (e) => { if (e.broke) order.push('cables'); });
    world.events.on('roomEnter', (e) => order.push(`enter:${e.room}`));
    tick(world);
    const cut = () => {
      // try to break the cables (fails while locked): from the roof, straight at them
      const seg = cableSegmentOf(world);
      if (seg) shootCables(world, [seg[0][0] - 40, (seg[0][1] + seg[1][1]) / 2], [seg[0][0] + 40, (seg[0][1] + seg[1][1]) / 2]);
    };
    for (let i = 0; i < 60 * 90 && !order.includes('enter:swords'); i++) {
      tick(world);
      // the grenade: thrown away up through the hole (out of the cab)
      for (const it of world.items) if (it.kind === 'grenade' && it.live) world.items.splice(world.items.indexOf(it), 1);
      // drop-ins and the ambush die when they land; the roof pair once the welder is done
      for (const a of world.actors) if (a.ai && alive(a) && !a.entering && (a.pos.y < 0.1 || world.flags.has('slotOpen'))) world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos });
      // up on the roof once the doors open, then shoot the cables
      if (world.flags.has('ambush') && hero.pos.y < 1 && !hero.traversing) { hero.pos.y = roof(world)!.y; hero.body.groundY = roof(world)!.y; hero.pos.x = 0.5; }
      if (i % 20 === 0) cut();
    }
    const at = (k: string) => order.indexOf(k);
    expect(order.filter((k) => !k.startsWith('enter')).slice(0, 2)).toEqual(['elevator:start', 'landing']);
    expect(at('weld:start')).toBeGreaterThan(at('landing'));
    expect(at('weld:done')).toBeGreaterThan(at('weld:start'));
    expect(at('grenade')).toBeGreaterThan(at('weld:done'));
    expect(at('elevator:stop')).toBeGreaterThan(at('grenade'));
    // the cables were shot at the whole time, but they only part after the doors open
    expect(at('cables')).toBeGreaterThan(at('elevator:stop'));
    expect(at('elevator:fall')).toBeGreaterThan(at('cables') - 1);
    expect(at('elevator:crash')).toBeGreaterThan(at('elevator:fall'));
    expect(order.at(-1)).toBe('enter:swords');
  });

  it('killing the welder before he finishes stops the cut (no slot)', () => {
    const { world, hero } = setup('elevator');
    hero.invulnerable = true;
    const welds: string[] = [];
    world.events.on('weld', (e) => welds.push(e.phase));
    for (let i = 0; i < 60 * 8 && !welds.includes('start'); i++) tick(world);
    tick(world, {}, 30);
    const welder = world.actors.find((a) => a.variant === 'welder')!;
    world.hitActor(hero, welder, 'blast', 1, 0, { ...welder.pos });
    tick(world, {}, 5);
    expect(welds).toEqual(['start', 'stop']);
    expect(roof(world)!.holes.length).toBe(1); // only the hatch
  });

  it('the hold-up only triggers on the last enemy, and only if he is unarmed', () => {
    const world = new World(STAGE2.rooms.lobby.room);
    const hero = createActor('hero', 0, 9.2, 1);
    hero.hands[0] = newHand('pistol');
    world.addPlayer(hero);
    const ups: unknown[] = [];
    world.events.on('holdUp', (e) => ups.push(e));
    world.seq.run(holdUps);
    // two left, the near one unarmed: nothing
    const a = spawnEnemy(world, 'grunt', null, 1.2, 9.2, { face: -1 });
    const b = spawnEnemy(world, 'grunt', 'pistol', 3.0, 10.0, { face: -1 });
    tick(world, {}, 10);
    expect(ups.length).toBe(0);
    // one left but armed: nothing
    world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos });
    b.pos.x = 1.2; b.pos.z = 9.2;
    tick(world, {}, 10);
    expect(ups.length).toBe(0);
    // the last one, unarmed: hands up
    world.hitActor(hero, b, 'blast', 1, 0, { ...b.pos });
    const c = spawnEnemy(world, 'grunt', null, 1.3, 9.2, { face: -1 });
    tick(world, {}, 3);
    expect(ups.length).toBe(1);
    expect(c.surrendered).toBe(true);
    // E next to him: the interrogation, then he's knocked out (alive, out of the fight)
    hero.pos.x = c.pos.x - 0.8;
    const speech: string[] = [];
    world.events.on('speech', (e) => speech.push(e.icon));
    tick(world, { pickup: true });
    tick(world, {}, 60 * 5);
    expect(speech).toEqual(['photo', 'shrug', 'question']);
    expect(c.koed).toBe(true);
    expect(alive(c)).toBe(true);
    expect(c.ai).toBeUndefined();
  });

  it('the target only flinches; shot out of his hand he gives up; the ending kills the hero and ends the stage', () => {
    const { world, hero } = setup('final');
    tick(world, {}, 5);
    const target = world.actors.find((a) => a.variant === 'target')!;
    for (const g of world.actors) if (g.variant === 'bodyguard') world.hitActor(hero, g, 'blast', 1, 0, { ...g.pos });
    world.hitBullet(hero, target, 4, 'head', 1, false, { ...target.pos });
    expect(alive(target)).toBe(true);
    let cleared = false, surrendered = false;
    world.events.on('surrender', () => (surrendered = true));
    world.events.on('roomCleared', () => (cleared = true));
    disarm(world, hero, target, 'shot', 1);
    until(world, () => cleared, 15);
    expect(surrendered).toBe(true);
    expect(hero.state).toBe('dead');
    expect(alive(target)).toBe(true);
    expect(cleared).toBe(true);
  });
});

describe('the elevator hatch', () => {
  it('E under the hatch climbs you onto the roof (a real key press, roughly under it)', () => {
    const { world, hero } = setup('elevator');
    hero.invulnerable = true;
    tick(world, {}, 2);
    const h = world.room.elevator!.hatch;
    // near the hole, not exactly in it
    hero.pos.x = h.x0 - 0.2;
    hero.pos.z = (h.z0 + h.z1) / 2 + 0.2;
    tick(world, { pickup: true });
    expect(hero.traversing?.kind).toBe('hatch');
    tick(world, {}, 90);
    expect(hero.traversing).toBeUndefined();
    expect(hero.pos.y).toBeCloseTo(roof(world)!.y, 5);
    expect(hero.body.state).toBe('ground');
    // and walking over the hole drops you back in
    hero.pos.x = (h.x0 + h.x1) / 2;
    tick(world, {}, 60);
    expect(hero.pos.y).toBeLessThan(0.1);
  });
});
