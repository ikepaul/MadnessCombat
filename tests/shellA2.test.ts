// M14b slice A2 (shell, audio & net stability): one regression test per item that can run
// without a browser. Item ids refer to design/audit/{stb,cmb,uxs,vis}.md.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGE1 } from '../src/data/stages/stage1';
import { STAGE1_BEATS, stage1From } from '../src/data/stages/stage1Script';
import { bindDebugKeys, debugEnabled } from '../src/input/debugKeys';
import { CoopRelay, type RelayClient } from '../src/net/relay';
import { applySnapshot, type Snapshot, SnapshotWriter } from '../src/net/snapshot';
import { GunFx } from '../src/render/gunFx';
import { Vfx } from '../src/render/vfx';
import { createActor } from '../src/sim/actor';
import { World } from '../src/sim/world';

/** A Map-backed localStorage, so src/settings.ts and src/progress.ts load from what we put in. */
function memStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

async function loadWith(init: Record<string, string>) {
  vi.resetModules();
  vi.stubGlobal('localStorage', memStorage(init));
  const settings = await import('../src/settings');
  const progress = await import('../src/progress');
  return { settings, progress };
}

afterEach(() => vi.unstubAllGlobals());

describe('CMB-01: dive off Ctrl, caption keys from the bindings', () => {
  it('no default key is Ctrl / Alt / Meta (no Ctrl + W chord), and an old save moves dive to C', async () => {
    const { settings } = await loadWith({ 'madness-like.settings': JSON.stringify({ keys: { dive: 'CTRL', jump: 'SPACE' } }) });
    expect(Object.values(settings.DEFAULT_KEYS).filter((k) => settings.RISKY_KEYS.includes(k))).toEqual([]);
    expect(settings.SETTINGS.keys.dive).toBe('C');
    // a version 1 save that chose Ctrl keeps it (bindable, with a warning)
    const v1 = await loadWith({ 'madness-like.settings': JSON.stringify({ version: 1, keys: { dive: 'CTRL' } }) });
    expect(v1.settings.SETTINGS.keys.dive).toBe('CTRL');
  });

  it('captions fill {key:action} from SETTINGS.keys, after a rebind too', async () => {
    const { settings } = await loadWith({});
    expect(settings.fillKeys('{key:dive} into him, pick it up ({key:use})')).toBe('C into him, pick it up (E)');
    settings.SETTINGS.keys.use = 'T';
    settings.SETTINGS.keys.dive = 'CTRL';
    expect(settings.fillKeys('{key:dive} / {key:use} / {key:nope}')).toBe('Ctrl / T / {key:nope}');
    // stage 1's captions name no bare key
    const src = (await import('node:fs')).readFileSync('src/data/stages/stage1Script.ts', 'utf8');
    for (const m of src.matchAll(/card\('([^']*)', [\d.]+, 'caption'\)/g)) expect(m[1], m[1]).not.toMatch(/\b(Ctrl|E|G|F|Q|Space)\b(?![^{]*\})/);
  });
});

describe('UXS-12: saves are versioned and sanitized', () => {
  it('every corrupt field comes back as its default', async () => {
    const { settings, progress } = await loadWith({
      'madness-like.settings': JSON.stringify({ master: 'loud', music: 7, effects: 'banana', reducedMotion: 'yes', difficulty: 'god', keys: { jump: 42, use: 'not a key!' } }),
      'madness-like.progress': JSON.stringify({ unlocked: '9', checkpoint: { stage: 7, room: 42 } }),
    });
    const s = settings.SETTINGS;
    expect([s.master, s.music, s.effects, s.reducedMotion, s.difficulty, s.keys.jump, s.keys.use, s.version]).toEqual([0.8, 1, 'full', false, 'pro', 'SPACE', 'E', settings.SETTINGS_VERSION]);
    expect(progress.PROGRESS).toEqual({ unlocked: 1, checkpoint: undefined, version: progress.PROGRESS_VERSION });
    // a checkpoint in a room that doesn't exist is dropped; a real one survives
    expect(progress.sanitizeProgress({ unlocked: 3, checkpoint: { stage: 2, room: 'nowhere', entry: '' } }).checkpoint).toBeUndefined();
    expect(progress.sanitizeProgress({ unlocked: 2, checkpoint: { stage: 2, room: 'office', entry: 'hole', kills: 3.7, players: 'x' } }).checkpoint).toEqual({ stage: 2, room: 'office', entry: 'hole', kills: 3, players: [] });
    // STB-08: the room's seed survives the sanitizer, junk seeds are dropped
    expect(progress.sanitizeProgress({ unlocked: 2, checkpoint: { stage: 2, room: 'office', entry: 'hole', seed: 12345 } }).checkpoint?.seed).toBe(12345);
    expect(progress.sanitizeProgress({ unlocked: 2, checkpoint: { stage: 2, room: 'office', entry: 'hole', seed: 'x' } }).checkpoint?.seed).toBeUndefined();
  });
});

describe('UXS-03: the saved checkpoint only moves forward; restarts follow the run', () => {
  let progress: typeof import('../src/progress');
  beforeEach(async () => { ({ progress } = await loadWith({})); });

  it('replaying stage 1 and 2 after reaching stage 3 leaves Continue at stage 3', () => {
    const cp3 = { stage: 3, room: 'desert', entry: 'west', kills: 140, players: [] };
    progress.saveCheckpoint(cp3);
    progress.beginRun(false);
    progress.saveCheckpoint({ stage: 2, room: 'wall', entry: 'street', kills: 0, players: [] });
    expect(progress.PROGRESS.checkpoint?.stage).toBe(3);
    // a death in the replay restarts the replay's room, not stage 3
    expect(progress.resumePoint()).toMatchObject({ stage: 2, room: 'wall' });
    progress.stageFinished(1);
    expect(progress.PROGRESS.checkpoint).toMatchObject({ stage: 3, room: 'desert', kills: 140 });
    // the order key: stage, room index, beat index
    expect(progress.compareCheckpoints({ stage: 1, room: 'arena', entry: 'boss' }, { stage: 1, room: 'arena', entry: 'riot' })).toBe(1);
    expect(progress.compareCheckpoints({ stage: 2, room: '', entry: '' }, { stage: 2, room: 'wall', entry: 'x' })).toBe(-1);
    // Continue = the furthest point
    progress.beginRun(true);
    expect(progress.resumePoint()?.stage).toBe(3);
  });
});

describe('STB-06 / UXS-01: stage 1 beats are checkpoints', () => {
  it('each beat after the intro reports itself as it starts; a script started at boss reports from boss on, no STAGE 1 card', () => {
    const beats: string[] = [];
    const world = new World(STAGE1.rooms.arena.room);
    world.addPlayer(createActor('hero', 0, 9.2, 1));
    const cards: string[] = [];
    world.events.on('card', (e) => cards.push(e.text));
    world.seq.run(stage1From('boss', (b) => beats.push(b)));
    for (let i = 0; i < 30; i++) world.step();
    expect(beats).toEqual(['boss']);
    expect(cards).not.toContain('STAGE 1');
    expect(STAGE1_BEATS.slice(1)).toEqual(['riot', 'grenade', 'boss', 'waveB', 'ending']);
  });

  it('a stage 1 beat checkpoint is a Continue point', async () => {
    const { progress } = await loadWith({});
    progress.saveCheckpoint({ stage: 1, room: 'arena', entry: 'boss', kills: 9, players: [] });
    const cp = progress.sanitizeProgress(JSON.parse(JSON.stringify(progress.PROGRESS))).checkpoint;
    expect(cp).toMatchObject({ stage: 1, room: 'arena', entry: 'boss', kills: 9 });
  });
});

describe('CMB-02 / UXS-04: debug keys only in dev or with ?debug', () => {
  it('without debug only M is bound', () => {
    const bound: string[] = [];
    const scene = { input: { keyboard: { on: (ev: string) => bound.push(ev), addCapture: () => undefined } } } as never;
    const noop = () => undefined;
    const acts = { toggleOverlay: noop, toggleSlowMo: noop, togglePause: noop, stepFrame: noop, setPalette: noop, togglePost: noop, spawnCorpses: noop, dropGuns: noop, toggleMute: noop, raiseAll: noop };
    bindDebugKeys(scene, false, acts);
    expect(bound).toEqual(['keydown-M']);
    bound.length = 0;
    bindDebugKeys(scene, true, acts);
    expect(bound).toContain('keydown-Z');
    expect(bound).not.toContain('keydown-V');
    expect(debugEnabled(false, '?stage=2')).toBe(false);
    expect(debugEnabled(false, '?stage=2&debug')).toBe(true);
  });
});

describe('VIS-04: room flashes follow effect intensity', () => {
  /** A canvas stand-in that records additive fills. */
  function fakeCtx() {
    const big: number[] = [];
    let op = 'source-over';
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, k) {
        if (k === 'globalCompositeOperation') return op;
        if (k === 'fillRect') return (_x: number, _y: number, w: number) => { if (op === 'lighter') big.push(w); };
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
        if (k === 'measureText') return () => ({ width: 0 });
        return () => undefined;
      },
      set(_t, k, v) { if (k === 'globalCompositeOperation') op = v; return true; },
    });
    return { ctx: ctx as never, big };
  }

  it('effects off: an explosion and a shot light no room-sized area; full: they do', () => {
    const world = new World(STAGE1.rooms.arena.room);
    const vfx = new Vfx(world, () => false), gun = new GunFx(world, () => undefined);
    world.events.emit('explosion', { x: 0, y: 0.3, z: 9, radius: 1.5 } as never);
    world.events.emit('shot', { weapon: 'pistol', muzzle: [900, 500], eject: [880, 500], x: 0, y: 1, z: 9, angle: 0, actorId: 0, rays: [] } as never);
    const off = fakeCtx();
    vfx.draw(off.ctx, 0); gun.draw(off.ctx, 0);
    expect(off.big.filter((w) => w > 200)).toEqual([]);
    const full = fakeCtx();
    vfx.draw(full.ctx, 1); gun.draw(full.ctx, 1);
    expect(full.big.filter((w) => w > 200).length).toBeGreaterThan(0);
  });
});

class Client implements RelayClient {
  got: [string, unknown][] = [];
  send(event: string, data?: unknown) { this.got.push([event, data]); }
}

describe('UXS-06 / UXS-08: co-op leaving and removed actors', () => {
  it('a guest who leaves the lobby (bye) is reported to the host as gone', () => {
    const relay = new CoopRelay(), host = new Client(), guest = new Client();
    relay.hello(host, 'host');
    relay.hello(guest, 'guest');
    relay.closed(guest); // what coop:bye does
    expect(host.got.at(-1)).toEqual(['coop:peer', { connected: false }]);
    expect(relay.guest).toBeUndefined();
  });

  it('the guest drops an actor the host removed: on actorRemoved and on the next full snapshot', () => {
    const host = new World(STAGE1.rooms.arena.room);
    host.addPlayer(createActor('hero', 0, 9.2, 1));
    const a = createActor('grunt', 1, 9.2, -1), b = createActor('grunt', 2, 9.2, -1);
    host.actors.push(a, b);
    const writer = new SnapshotWriter(host, 1);
    const puppet = new World(STAGE1.rooms.arena.room);
    puppet.puppet = true;
    const send = () => applySnapshot(puppet, JSON.parse(JSON.stringify(writer.take())) as Snapshot);
    send();
    expect(puppet.actors.length).toBe(3);
    host.actors.splice(host.actors.indexOf(a), 1);
    host.events.emit('actorRemoved', { actorId: a.id });
    send();
    expect(puppet.actorById(a.id)).toBeUndefined();
    // spliced without the event (old code paths): the next full snapshot prunes it
    host.actors.splice(host.actors.indexOf(b), 1);
    writer.needFull = true;
    send();
    expect(puppet.actors.map((x) => x.id)).toEqual(host.actors.map((x) => x.id));
  });

  it('the host pause reaches the guest in the snapshot', () => {
    const host = new World(STAGE1.rooms.arena.room);
    const writer = new SnapshotWriter(host, 1);
    writer.paused = true;
    expect(writer.take().paused).toBe(true);
    writer.paused = false;
    expect(writer.take().paused).toBeUndefined();
  });
});
