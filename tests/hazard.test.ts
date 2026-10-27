// M8: the falling cannon on its own (world-falling-hazard), its lab, and the stage-1 music cues.
import { describe, expect, it } from 'vitest';
import cues from '../assets/music/cues.json';
import { STAGE1 } from '../src/data/stages/stage1';
import { TUNING } from '../src/data/tuning';
import '../src/labs/hazardLabs';
import { getLab } from '../src/labs/registry';
import { alive, createActor } from '../src/sim/actor';
import { dropCannon, removeCannon } from '../src/sim/cannon';
import type { GameEvents } from '../src/sim/events';
import { World } from '../src/sim/world';

const CN = TUNING.boss.cannon;
const secs = (s: number) => Math.round(s * TUNING.simHz);

describe('falling cannon (world-falling-hazard)', () => {
  it('shadow first, then the drop: crushes a grunt under it, shoves the body clear, stays as solid ground', () => {
    const world = new World(STAGE1.rooms.arena.room);
    const g = createActor('grunt', 0.1, 9.4, 1);
    world.actors.push(g);
    const phases: GameEvents['cannonDrop']['phase'][] = [];
    world.events.on('cannonDrop', (e) => phases.push(e.phase));
    const c = dropCannon(world, 0, 9.4, 1);
    expect(phases).toEqual(['shadow']);
    for (let i = 0; i < secs(CN.shadow) - 1; i++) world.step();
    expect(phases).toEqual(['shadow']);
    expect(alive(g)).toBe(true);
    for (let i = 0; i < secs(CN.dropHeight / CN.fallSpeed) + 3; i++) world.step();
    expect(phases).toEqual(['shadow', 'fall', 'land']);
    expect(c.drop).toBeUndefined();
    expect(alive(g)).toBe(false);
    const prop = world.room.props.find((p) => p.kind === 'cannon')!;
    expect(g.pos.x < prop.x0 || g.pos.x > prop.x1).toBe(true);
    // a landed, unmanned cannon doesn't fire
    let fired = 0;
    world.events.on('cannonFire', () => fired++);
    for (let i = 0; i < secs(3); i++) world.step();
    expect(fired).toBe(0);
    removeCannon(world, c);
    expect(world.cannons).toHaveLength(0);
    expect(world.room.props.some((p) => p.kind === 'cannon')).toBe(false);
  });

  it('the lab drops one every few seconds and clears it again', () => {
    const lab = getLab('world-falling-hazard')!;
    expect(lab).toBeDefined();
    const world = new World(STAGE1.rooms.arena.room);
    lab.setup(world);
    let lands = 0;
    world.events.on('cannonDrop', (e) => e.phase === 'land' && lands++);
    for (let i = 0; i < secs(14); i++) { world.step(); lab.step!(world); }
    expect(lands).toBeGreaterThanOrEqual(3);
    expect(world.room.props.filter((p) => p.kind === 'cannon').length).toBeLessThanOrEqual(1);
    expect(lab.info!(world)).toMatch(/crushed \d+/);
  });
});

describe('stage 1 music cues (assets/music/cues.json)', () => {
  const room = (cues.rooms as Record<string, { cues?: Record<string, string>; diegetic?: string }>)['stage1-arena'];
  const tracks = cues.tracks as Record<string, { stems: string[] }>;

  it('every cue the stage script sends points at a track, and the boombox has its tune', () => {
    for (const cue of ['riot', 'boss']) expect(tracks[room.cues![cue]], cue).toBeDefined();
    expect(tracks[room.diegetic!]).toBeDefined();
  });

  it('stem files of the stage cue tracks follow the delivery naming s{stage}_{cue}_{stem}.wav', () => {
    for (const [id, t] of Object.entries(tracks)) {
      if (!/^s\d+_/.test(id)) continue; // tracks delivered before the naming (Music V1) keep their file names
      for (const f of t.stems) expect(f, id).toMatch(new RegExp(`^${id}_[a-z0-9]+\\.wav$`));
    }
  });

  it("the stage's room keeps the delivered combat track (cues without files fall back to it)", () => {
    const arena = (cues.rooms as Record<string, { combat: string | null }>)['stage1-arena'];
    expect(arena.combat).toBe('madness-combat-v1');
    expect(tracks['madness-combat-v1'].stems).toEqual(['MadnessCombat.V1.wav']);
  });
});
