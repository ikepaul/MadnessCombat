// UXS/TEC audit probes (opt-in: AUDIT=1 npx vitest run tests/audit/uxs): death -> control timing,
// the stage 1 timeline a death throws away, co-op snapshot size, sim cost per tick, determinism.
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../../../src/data/stages/stage1';
import { stage1From } from '../../../src/data/stages/stage1Script';
import { STAGE2 } from '../../../src/data/stages/stage2';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { type Actor, alive, createActor, newHand } from '../../../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import { type StageDef, stageRunner } from '../../../src/sim/stage';
import { SnapshotWriter } from '../../../src/net/snapshot';
import { World } from '../../../src/sim/world';

/** The world GameScene.setupRoomStage builds for a checkpoint restart (1 or 2 heroes). */
function roomWorld(def: StageDef, room: string, players = 1) {
  const entry = room === def.start.room ? def.start.entry : Object.keys(def.rooms[room].entries)[0];
  const world = new World(def.rooms[room].room);
  world.gore = def.gore ?? 'normal';
  world.addPlayer(createActor('hero', 0, 9.2, 1));
  if (players > 1) world.addPlayer(createActor('hero', 0.6, 9.2, 1));
  world.players.forEach((p) => def.loadout(p));
  world.flags.add(`s${def.stage}-title`);
  world.seq.run(stageRunner(def, room, entry), 'stage');
  return world;
}

const controllable = (w: World, p: Actor) => !w.inputLocked && !w.transition && !p.traversing && !p.entering && !w.scripted.has(p.id) && p.state === 'free';

/** Ticks until the player can act, after the world is built (the scene's 2 s death delay and wipe come on top). */
function ticksToControl(w: World, max = 60 * 20): number {
  w.command = { ...IDLE_COMMAND };
  w.step();
  for (let i = 1; i < max; i++) {
    if (controllable(w, w.player!)) return i;
    w.command = { ...IDLE_COMMAND };
    w.step();
    w.player!.hp = w.player!.maxHp;
  }
  return -1;
}

describe.skipIf(!process.env.AUDIT)('UXS death -> restart', () => {
  it('seconds from the restarted room to control, per room (stage 2, 3)', () => {
    const rows: string[] = [];
    for (const def of [STAGE2, STAGE3]) {
      for (const room of Object.keys(def.rooms)) {
        const w = roomWorld(def, room);
        const t = ticksToControl(w);
        rows.push(`s${def.stage} ${room.padEnd(9)} ${t < 0 ? 'never (20 s)' : `${(t / 60).toFixed(2)} s`}  (+2.00 s death delay +0.35 s wipe)`);
      }
    }
    console.log(`[UXS-02] time to control after a room restart\n${rows.join('\n')}`);
  });

  it('stage 1: a death anywhere replays from the intro; when does each beat start (god-mode bot)', () => {
    const world = new World(STAGE1.rooms.arena.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    hero.invulnerable = true;
    hero.hands[0] = newHand('pistol', undefined, 99);
    world.seq.run(stage1From('intro'));
    const marks: string[] = [];
    let firstControl = -1;
    world.step();
    world.events.on('music', (e) => marks.push(`music ${e.cue} @ ${world.time.toFixed(1)} s`));
    world.events.on('card', (e) => marks.push(`card "${e.text.slice(0, 32)}" @ ${world.time.toFixed(1)} s`));
    let cleared = -1;
    world.events.on('roomCleared', () => (cleared = world.time));
    for (let i = 0; i < 60 * 600 && cleared < 0; i++) {
      if (firstControl < 0 && controllable(world, hero)) firstControl = world.time;
      // the boombox delivery at the end: walk it to the pole like the stage test does is overkill;
      // the 60 s timeout ends the stage anyway
      world.command = { ...IDLE_COMMAND };
      world.step();
      if (world.inputLocked) continue;
      for (const a of world.actors) if ((a.ai || a.variant === 'boombox' || a.kind === 'boss' || a.kind === 'zombie') && a.playerIndex === undefined && alive(a) && !a.entering && a.variant !== 'dancer') world.hitActor(hero, a, 'blast', 1, 0, { ...a.pos });
      for (const it of [...world.items]) if (it.kind === 'grenade' && it.live) world.items.splice(world.items.indexOf(it), 1);
    }
    console.log(`[UXS-01] stage 1 timeline with instant kills (a floor on what a death costs)\nfirst control @ ${firstControl.toFixed(1)} s\n${marks.join('\n')}\nroomCleared @ ${cleared.toFixed(1)} s`);
  });
});

/** A crude fight: enemies keep coming at an invulnerable hero who punches the nearest. */
function brawl(world: World, p: Actor): PlayerCommand {
  const cmd: PlayerCommand = { ...IDLE_COMMAND };
  const t = world.actors.filter((a) => a.ai && alive(a) && !a.entering).sort((a, b) => Math.abs(a.pos.x - p.pos.x) - Math.abs(b.pos.x - p.pos.x))[0];
  if (!t) return cmd;
  const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
  cmd.face = dx >= 0 ? 1 : -1;
  if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
  if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
  if (Math.abs(dx) < 0.6 && world.tick % 9 === 0) cmd.attack = t.state === 'stun' ? 'heavy' : 'light';
  return cmd;
}

function busy(def: StageDef, room: string, corpses: number, seconds: number, players = 2) {
  const w = roomWorld(def, room, players);
  w.spawnCorpses(corpses);
  for (const p of w.players) p.invulnerable = true;
  const snaps = new SnapshotWriter(w, 1);
  const full = JSON.stringify(snaps.take()).length;
  const bytes: number[] = [], ms: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    w.commands = w.players.map((p) => brawl(w, p));
    const t0 = performance.now();
    w.step();
    ms.push(performance.now() - t0);
    bytes.push(JSON.stringify(snaps.take()).length);
  }
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  const q = (a: number[], f: number) => sorted(a)[Math.floor((a.length - 1) * f)];
  const mean = bytes.reduce((s, b) => s + b, 0) / bytes.length;
  return { room: `s${def.stage} ${room}`, actors: w.actors.length, items: w.items.length, fullKB: (full / 1024).toFixed(1), snapKB_p50: (q(bytes, 0.5) / 1024).toFixed(1), snapKB_max: (Math.max(...bytes) / 1024).toFixed(1), KBps: ((mean * 60) / 1024).toFixed(0), msTick_p50: q(ms, 0.5).toFixed(3), msTick_p95: q(ms, 0.95).toFixed(3), msTick_max: Math.max(...ms).toFixed(2) };
}

describe.skipIf(!process.env.AUDIT)('TEC co-op snapshots and sim cost', () => {
  it('snapshot bytes and sim ms/tick in busy rooms (2 players, 30 s, JSON as sent)', () => {
    const rows = [
      busy(STAGE2, 'office', 0, 30),
      busy(STAGE2, 'office', 60, 30),
      busy(STAGE2, 'lobby', 0, 30),
      busy(STAGE3, 'street', 0, 30),
      busy(STAGE3, 'desert', 0, 30),
      busy(STAGE3, 'street', 60, 30),
    ];
    console.log('[TEC] snapshots / sim cost\n' + rows.map((r) => JSON.stringify(r)).join('\n'));
  });

  it('what the snapshot spends its bytes on (one frame, stage 3 street after 20 s)', () => {
    const w = roomWorld(STAGE3, 'street', 2);
    for (const p of w.players) p.invulnerable = true;
    for (let i = 0; i < 60 * 20; i++) { w.commands = w.players.map((p) => brawl(w, p)); w.step(); }
    const s = new SnapshotWriter(w, 1);
    s.take();
    w.commands = w.players.map((p) => brawl(w, p));
    w.step();
    const snap = s.take() as unknown as Record<string, unknown>;
    const total = JSON.stringify(snap).length;
    const parts = Object.entries(snap).map(([k, v]) => [k, JSON.stringify(v ?? null).length] as const).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const actors = snap.actors as { pose: unknown }[];
    const poseBytes = actors.reduce((n, a) => n + JSON.stringify(a.pose).length, 0);
    console.log(`[TEC] one snapshot = ${total} B; biggest fields ${parts.map(([k, n]) => `${k} ${n}`).join(', ')}; poses ${poseBytes} B over ${actors.length} actors`);
  });
});

/** Positions, hp and states of everyone, ids left out (they come from a module counter). */
function hash(w: World): string {
  return JSON.stringify(w.actors.map((a) => [a.kind, a.pos.x.toFixed(5), a.pos.z.toFixed(5), a.pos.y.toFixed(5), a.hp, a.state]));
}

describe.skipIf(!process.env.AUDIT)('TEC determinism (invariant 10)', () => {
  it('same room, same commands, same seed: same state after 600 ticks', () => {
    const run = () => {
      const w = roomWorld(STAGE2, 'office', 1);
      w.player!.invulnerable = true;
      for (let i = 0; i < 600; i++) { w.command = brawl(w, w.player!); w.step(); }
      return hash(w);
    };
    const a = run(), b = run(), c = run();
    console.log(`[TEC] determinism office: run1==run2 ${a === b}, run2==run3 ${b === c}`);
    expect(a).toBe(b);
  });

  it('stage 3 street (gore extreme, idles): same check', () => {
    const run = () => {
      const w = roomWorld(STAGE3, 'street', 1);
      w.player!.invulnerable = true;
      for (let i = 0; i < 600; i++) { w.command = brawl(w, w.player!); w.step(); }
      return hash(w);
    };
    const a = run(), b = run();
    console.log(`[TEC] determinism street: ${a === b}`);
    expect(a).toBe(b);
  });
});
