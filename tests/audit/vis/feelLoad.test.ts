// VIS audit probe (design/audit/vis.md): feel load in the five busiest fights. A bot (invulnerable
// hero) fights each one twice, once with dual SMGs on full auto and once with fists, through the
// real FixedClock (hit-stop freezes the world, the kill cam slows it), the real FeelDirector and
// the real audio hooks (a fake engine counting plays and voice steals). Prints a table per fight.
// Run: AUDIT=1 npx vitest run tests/audit/vis/feelLoad.test.ts
import { describe, expect, it } from 'vitest';
import { SOUNDS, type SoundId } from '../../../src/data/audio';
import { FEEL } from '../../../src/data/feel';
import { STAGE1 } from '../../../src/data/stages/stage1';
import { stage1From } from '../../../src/data/stages/stage1Script';
import { STAGE2 } from '../../../src/data/stages/stage2';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { WEAPONS } from '../../../src/data/weapons';
import { hookWorldAudio } from '../../../src/audio/hooks';
import type { AudioEngine, PlayOptions } from '../../../src/audio/mixer';
import { render } from '../../../src/audio/synth';
import { VoicePool } from '../../../src/audio/voices';
import { FeelDirector, type FeelSink } from '../../../src/feel/feel';
import { project } from '../../../src/render/camera';
import { type Actor, alive, createActor, newHand } from '../../../src/sim/actor';
import { FixedClock } from '../../../src/sim/clock';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import { stageRunner } from '../../../src/sim/stage';
import { World } from '../../../src/sim/world';

const REAL_DT = 1 / 60;

/** Sound lengths (s) from the generated recipes (recordings are similar one-shots). */
const LEN = new Map<SoundId, number>();
function soundLen(id: SoundId): number {
  let l = LEN.get(id);
  if (l === undefined) { l = render(SOUNDS[id].recipe, 4000, 1).length / 4000; LEN.set(id, l); }
  return l;
}

interface Second {
  frozenTicks: number; slowTicks: number; shakes: number; maxShake: number; chroma: number; killCams: number;
  overlapKillCams: number; hitStopAsked: number; hitStopGranted: number; plays: number; steals: number; maxVoices: number;
  kills: number; hits: number; shots: number;
}
const blank = (): Second => ({ frozenTicks: 0, slowTicks: 0, shakes: 0, maxShake: 0, chroma: 0, killCams: 0, overlapKillCams: 0, hitStopAsked: 0, hitStopGranted: 0, plays: 0, steals: 0, maxVoices: 0, kills: 0, hits: 0, shots: 0 });

type Style = 'smg' | 'fists';

function nearestFoe(world: World, hero: Actor): Actor | undefined {
  return world.actors
    .filter((a) => (a.ai || a.kind === 'boss') && alive(a) && !a.entering)
    .sort((a, b) => Math.hypot(a.pos.x - hero.pos.x, a.pos.z - hero.pos.z) - Math.hypot(b.pos.x - hero.pos.x, b.pos.z - hero.pos.z))[0];
}

function bot(world: World, hero: Actor, style: Style, st: { wait: number }): PlayerCommand {
  const cmd: PlayerCommand = { ...IDLE_COMMAND };
  const t = nearestFoe(world, hero);
  if (!t) return cmd;
  const dx = t.pos.x - hero.pos.x, dz = t.pos.z - hero.pos.z;
  cmd.face = dx >= 0 ? 1 : -1;
  if (style === 'smg') {
    for (const h of hero.hands) if (h?.item === 'smg') h.ammo = WEAPONS.smg.mag;
    cmd.aim = project(t.pos.x, t.pos.y + 0.75, t.pos.z);
    cmd.hold = [true, true];
    cmd.press = [world.tick % 6 === 0, world.tick % 6 === 3];
    if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
    if (Math.abs(dx) > 3) cmd.moveX = Math.sign(dx);
    return cmd;
  }
  if (Math.abs(dx) > 0.5) cmd.moveX = Math.sign(dx);
  if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
  if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.15 && hero.state === 'free') {
    st.wait -= world.dt;
    if (st.wait <= 0) { cmd.attack = t.state === 'stun' ? 'heavy' : 'light'; st.wait = 0.12; }
  }
  return cmd;
}

interface Fight { name: string; make: () => { world: World; hero: Actor } }

function hero0(world: World, x = 0, z = 9.2): Actor {
  const h = createActor('hero', x, z, 1);
  world.addPlayer(h);
  return h;
}

const FIGHTS: Fight[] = [
  { name: 's1 wave B', make: () => { const w = new World(STAGE1.rooms.arena.room); const h = hero0(w, 0, 9.4); w.seq.run(stage1From('waveB')); return { world: w, hero: h }; } },
  { name: 's1 boss', make: () => { const w = new World(STAGE1.rooms.arena.room); const h = hero0(w, 0, 9.4); w.seq.run(stage1From('boss')); return { world: w, hero: h }; } },
  { name: 's2 office', make: () => {
    const w = new World(STAGE2.rooms.office.room); const h = hero0(w); STAGE2.loadout(h);
    w.seq.run(stageRunner(STAGE2, 'office', Object.keys(STAGE2.rooms.office.entries)[0]), 'stage'); return { world: w, hero: h };
  } },
  { name: 's3 street', make: () => {
    const w = new World(STAGE3.rooms.street.room); const h = hero0(w); STAGE3.loadout(h);
    w.seq.run(stageRunner(STAGE3, 'street', Object.keys(STAGE3.rooms.street.entries)[0]), 'stage'); return { world: w, hero: h };
  } },
  { name: 's3 desert', make: () => {
    const w = new World(STAGE3.rooms.desert.room); const h = hero0(w); STAGE3.loadout(h);
    w.seq.run(stageRunner(STAGE3, 'desert', Object.keys(STAGE3.rooms.desert.entries)[0]), 'stage'); return { world: w, hero: h };
  } },
];

export function runFight(f: Fight, style: Style, seconds = 60) {
  const { world, hero } = f.make();
  hero.invulnerable = true;
  if (style === 'smg') hero.hands = [newHand('smg'), newHand('smg')];
  else hero.hands = [0, 1].map(() => ({ item: null, ammo: 0, spare: 0, cooldown: 0, reload: 0, clicked: false })) as unknown as Actor['hands'];
  const clock = new FixedClock();
  let realT = 0, killCamLeft = 0, lastKillCamAt = -9;
  const secs: Second[] = [];
  const cur = () => (secs[Math.floor(realT)] ??= blank());
  const sink: FeelSink = {
    hitStop: (s) => { cur().hitStopGranted += s; clock.hitStop(s); },
    shake: (px) => { const c = cur(); c.shakes++; c.maxShake = Math.max(c.maxShake, px); },
    chromatic: () => { cur().chroma++; },
    killCam: () => { const c = cur(); c.killCams++; if (realT - lastKillCamAt < FEEL.killCam.duration) c.overlapKillCams++; lastKillCamAt = realT; killCamLeft = FEEL.killCam.duration; },
  };
  const feel = new FeelDirector(world, sink, () => clock.tick * clock.dt);
  const origStop = feel.stop.bind(feel);
  feel.stop = (s: number) => { cur().hitStopAsked += s; origStop(s); };
  // fake engine: voice pool with the real limits, live-voice count per real time
  const pool = new VoicePool();
  const stealsBy: Record<string, number> = {}, playsBy: Record<string, number> = {};
  const ends: number[] = [];
  const engine = {
    play: (id: SoundId, o: PlayOptions = {}) => {
      const d = SOUNDS[id], c = cur();
      const v = pool.start(id, d.variants, d.limit, realT, ('loop' in d && d.loop) ? 1e9 : soundLen(id) / (o.rate ?? 1));
      c.plays++;
      if (v.steal !== undefined) { c.steals++; stealsBy[id] = (stealsBy[id] ?? 0) + 1; }
      playsBy[id] = (playsBy[id] ?? 0) + 1;
      ends.push(realT + soundLen(id));
      return v.voiceId;
    },
    stop: () => undefined, duck: () => undefined, setWobble: () => undefined, killCam: () => undefined,
  } as unknown as AudioEngine;
  hookWorldAudio(world, engine);
  world.events.on('kill', () => cur().kills++);
  world.events.on('hit', (e) => { if (e.damage > 0) cur().hits++; });
  world.events.on('shot', () => cur().shots++);
  let cleared = false;
  world.events.on('roomCleared', () => (cleared = true));
  const st = { wait: 0 };
  while (realT < seconds && !cleared) {
    killCamLeft = Math.max(0, killCamLeft - REAL_DT);
    clock.feelScale = killCamLeft > 0 ? FEEL.killCam.timeScale : 1;
    const c = cur();
    if (killCamLeft > 0) c.slowTicks++;
    const frozenBefore = clock.frozen;
    const steps = clock.advance(REAL_DT, () => {
      world.command = bot(world, hero, style, st);
      world.step();
    });
    if (steps === 0 && frozenBefore) c.frozenTicks++;
    const live = ends.filter((e) => e > realT).length;
    c.maxVoices = Math.max(c.maxVoices, live);
    realT += REAL_DT;
  }
  return { secs, cleared, kills: world.kills, gameSeconds: world.time, stealsBy, playsBy };
}

function summary(name: string, style: Style, r: ReturnType<typeof runFight>) {
  const s = r.secs.filter(Boolean);
  const sum = (k: keyof Second) => s.reduce((n, x) => n + x[k], 0);
  const max = (k: keyof Second) => s.reduce((n, x) => Math.max(n, x[k]), 0);
  const capped = s.filter((x) => x.hitStopGranted >= FEEL.hitStop.maxPerSecond - 1e-6).length;
  const denied = sum('hitStopAsked') - sum('hitStopGranted');
  return {
    fight: name, style, realS: s.length, cleared: r.cleared, kills: r.kills,
    'shots/s max': max('shots'), 'hits/s max': max('hits'),
    'frozen ticks/s max': max('frozenTicks'), 'frozen % avg': +((sum('frozenTicks') / (s.length * 60)) * 100).toFixed(1),
    'slow-mo % avg': +((sum('slowTicks') / (s.length * 60)) * 100).toFixed(1),
    'secs at hit-stop cap': capped, 'hit-stop denied s': +denied.toFixed(2),
    'shakes/s max': max('shakes'), 'shake px max': max('maxShake'),
    'chroma/s max': max('chroma'), killCams: sum('killCams'), 'killCams overlapping': sum('overlapKillCams'),
    'plays/s max': max('plays'), 'steals total': sum('steals'), 'voices max': max('maxVoices'),
    stealsBy: Object.entries(r.stealsBy).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v + '/' + r.playsBy[k]).join(', '),
  };
}

describe.skipIf(!process.env.AUDIT)('VIS feel load (five busiest fights)', () => {
  it('prints the per-fight feel load', () => {
    const rows: ReturnType<typeof summary>[] = [];
    for (const f of FIGHTS) for (const style of ['smg', 'fists'] as Style[]) rows.push(summary(f.name, style, runFight(f, style)));
    console.log(JSON.stringify(rows, null, 1));
    if (process.env.AUDIT_OUT) require("node:fs").writeFileSync(process.env.AUDIT_OUT, JSON.stringify(rows, null, 1));
    for (const r of rows) expect(r['frozen ticks/s max']).toBeLessThanOrEqual(60);
  }, 300_000);
});
