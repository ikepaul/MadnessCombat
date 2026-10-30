// ENC audit: focused probes (AUDIT=1 npx vitest run tests/audit/enc/probes.test.ts). Each block
// prints its numbers; the `expect`s pinned the bad behaviour (ENC-01/02 are flipped: fixed in M14b A1).
import { describe, expect, it } from 'vitest';
import { STAGE1 } from '../../../src/data/stages/stage1';
import { INTRO, stage1From, waveB } from '../../../src/data/stages/stage1Script';
import { STAGE2 } from '../../../src/data/stages/stage2';
import { bossInterruption, officeWaves } from '../../../src/data/stages/stage2Script';
import { STAGE3 } from '../../../src/data/stages/stage3';
import { TUNING } from '../../../src/data/tuning';
import { project } from '../../../src/render/camera';
import { alive, createActor, newHand } from '../../../src/sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../../../src/sim/command';
import { placeCannon } from '../../../src/sim/cannon';
import { spawnBoss } from '../../../src/sim/boss';
import { stageRunner } from '../../../src/sim/stage';
import { spawnEnemy, WaveDirector } from '../../../src/sim/waves';
import { World } from '../../../src/sim/world';
import { botCommand, type BotState } from './harness';

const on = !process.env.AUDIT;
const tick = (w: World, cmd: Partial<PlayerCommand> = {}, n = 1) => { for (let i = 0; i < n; i++) { w.command = { ...IDLE_COMMAND, ...cmd }; w.step(); } };
const bot = (seed = 1): BotState => ({ wait: 0, acquiredAt: 0, lastPress: -9, seen: new Map(), err: 0, stuckRoom: 0, rngS: seed });

describe.skipIf(on)('ENC crashes found by the curve bots', () => {
  it('ENC-01: hitting the vending-machine brute mid-swing leaves state attack with no attack: the next step throws', () => {
    const world = new World(STAGE3.rooms.street.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    hero.hp = hero.maxHp = 99;
    const brute = spawnEnemy(world, 'grunt', null, 0.45, 9.2, { face: -1 });
    brute.variant = 'vending';
    brute.hp = brute.maxHp = TUNING.brute.hp;
    // let him start a swing, then punch him during it
    let threw = '';
    for (let i = 0; i < 600 && !threw; i++) {
      try {
        tick(world, brute.state === 'attack' && brute.attack ? { attack: 'light', face: 1 } : { face: 1 });
        if (brute.state === 'attack' && !brute.attack) { tick(world); }
      } catch (e) { threw = (e as Error).message; }
    }
    console.log(`ENC-01 brute mid-swing hit: ${threw || 'no crash'}`);
    expect(threw).toBe(''); // fixed in M14b (STB-01)
  });

  it('ENC-02: a blade stuck in a living actor that is removed from the room crashes pullable()', () => {
    const world = new World(STAGE3.rooms.camera.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    const g = spawnEnemy(world, 'grunt', null, 0.3, 9.2, { face: -1 });
    g.hp = 99;
    const knife = world.spawnItem('knife', 'grunt', { x: 0.3, y: 0.6, z: 9.2 }, { x: 0, y: 0, z: 0 }, 0);
    knife.state = 'stuck';
    (knife as unknown as { stuckTo: number }).stuckTo = g.id;
    // scripts splice actors out (the outside guard walking off, the void, the jetpack leaving)
    world.actors.splice(world.actors.indexOf(g), 1);
    let threw = '';
    try { tick(world, { pickup: true }, 3); } catch (e) { threw = (e as Error).message; }
    console.log(`ENC-02 stuck blade, owner gone: ${threw || 'no crash'}`);
    expect(threw).toBe(''); // fixed in M14b (STB-16)
  });
});

describe.skipIf(on)('ENC onboarding and lives', () => {
  it('ENC-05: the intro tutorial costs lives before the first wave', () => {
    const rows: string[] = [];
    for (const seed of [1, 2, 3]) {
      const world = new World(STAGE1.rooms.arena.room);
      (world as unknown as { seed: number }).seed = seed;
      const hero = createActor('hero', 0, 9.2, 1);
      world.addPlayer(hero);
      world.seq.run(stage1From('intro'));
      const st = bot(seed);
      let hpAtRiot = -1, hits = 0;
      world.events.on('hit', (e) => { if (e.actorId === hero.id && e.damage > 0) hits++; });
      world.events.on('waveStart', () => { if (hpAtRiot < 0) hpAtRiot = hero.hp; });
      for (let i = 0; i < 60 * 40 && hpAtRiot < 0; i++) { world.command = botCommand(world, hero, 'brawler', 0.2, st); world.step(); }
      rows.push(`seed ${seed}: hits in the intro ${hits}, hp at the first wave ${hpAtRiot}/${hero.maxHp}`);
    }
    console.log('ENC-05 intro\n' + rows.join('\n'));
  });

  it('ENC-06: a passive player in each wave room (damage pressure baseline: hits per minute, hero immortal)', () => {
    const rows: string[] = [];
    const rooms: [string, () => World][] = [
      ['s1 riot', () => { const w = new World(STAGE1.rooms.arena.room); w.director = new WaveDirector(STAGE1.rooms.arena.script); return w; }],
      ['s1 waveB', () => { const w = new World(STAGE1.rooms.arena.room); w.director = new WaveDirector(waveB(1)); return w; }],
      ['s2 office', () => { const w = new World(STAGE2.rooms.office.room); w.director = new WaveDirector(officeWaves()); return w; }],
    ];
    for (const [name, make] of rooms) {
      const world = make();
      const hero = createActor('hero', 0, 9.2, 1);
      world.addPlayer(hero);
      hero.hp = hero.maxHp = 9999;
      let hits = 0;
      const times: number[] = [];
      world.events.on('hit', (e) => { if (e.actorId === hero.id && e.damage > 0) { hits++; times.push(world.time); } });
      tick(world, {}, 60 * 60);
      const burst = Math.max(0, ...times.map((t) => times.filter((u) => u >= t && u < t + 1).length));
      rows.push(`${name.padEnd(10)} ${hits} hits in 60 s, worst 1 s window ${burst}, alive at end ${world.actors.filter((a) => a.ai && alive(a)).length}`);
    }
    console.log('ENC-06 passive pressure\n' + rows.join('\n'));
  });
});

describe.skipIf(on)('ENC telegraphs and windows', () => {
  it('ENC-08: attack tells (s) vs the 0.3 s readability bar', () => {
    const M = TUNING.melee as unknown as Record<string, { startup: number }>;
    const B = TUNING.boss;
    const rows: [string, number, string][] = [
      ['grunt light punch (visible startup)', M.light.startup, 'the 0.5 s windUp is not drawn (ai.ready has no pose)'],
      ['grunt heavy punch (visible startup)', M.heavy.startup, 'knockdown'],
      ['grunt knife throw (startup)', 3 / 30, 'from 1.8-4.5 H, no aim tell'],
      ['gun grunt aim telegraph', TUNING.ai.ranged.telegraph, 'red line'],
      ['enemy grenade cook', TUNING.ai.grenadeCook, ''],
      ['boss dash wind-up', B.dash.windup, 'then grab -> 6 slams -> 1 life'],
      ['boss strike/raise hand-up', B.castTime, ''],
      ['boss sweep wind-up', B.sweep.windup, ''],
      ['boss cannon shadow / first ball', B.cannon.shadow, `first ball ${B.cannon.firstShot}`],
      ['wave-B cannoneer first ball', TUNING.ai.cannonWindup, ''],
      ['jetpack MG aim', 0.6, '1.4 s of fire after'],
      ['sword dive rise', TUNING.duel.windup, `dive ${TUNING.duel.dive}`],
      ['target peek (stage 2 final)', TUNING.ai.ranged.telegraph, ''],
      ['arena wall shadow', TUNING.arenaLock.shadow, ''],
      ['floor crack', TUNING.collapse.crack, ''],
      ['falling tank shadow', TUNING.fallingBlock.shadow, ''],
      ['boss fling (stage 2 corridor, stage 3 desert)', B.fling.windup, 'scripted, unavoidable'],
    ];
    console.log('ENC-08 tells\n' + rows.map(([n, s, note]) => `${s < 0.3 ? 'SHORT' : 'ok   '} ${s.toFixed(2)} s  ${n}${note ? ` (${note})` : ''}`).join('\n'));
  });

  it('ENC-09: free window after an enemy appears (spawn -> first aim/swing at a hero 2 H away)', () => {
    const rows: string[] = [];
    for (const [label, held, door] of [['edge, pistol', 'pistol', false], ['door, pistol', 'pistol', true], ['edge, fists', null, false], ['door, fists', null, true]] as const) {
      const room = door ? STAGE2.rooms.office.room : STAGE1.rooms.arena.room;
      const world = new World(room);
      const hero = createActor('hero', 1.2, 9.2, 1);
      world.addPlayer(hero);
      hero.hp = hero.maxHp = 99;
      world.director = new WaveDirector({ spawns: [door ? { id: 's', kind: 'door', door: 1 } : { id: 's', kind: 'edge', side: 1, z: 9.2 }], waves: [{ id: 'x', threshold: 0, maxAlive: 1, entries: [[0, 's', 'grunt', held]] }] });
      let t0 = -1, tIn = -1, tAct = -1;
      world.events.on('spawn', () => { if (t0 < 0) t0 = world.time; });
      world.events.on('aimStart', () => { if (tAct < 0) tAct = world.time; });
      world.events.on('punch', (e) => { if (tAct < 0 && e.actorId !== hero.id) tAct = world.time; });
      for (let i = 0; i < 600 && tAct < 0; i++) {
        tick(world);
        const g = world.actors.find((a) => a.ai);
        if (g && !g.entering && tIn < 0) tIn = world.time;
        // the hero waits 2 H in front of the entrance (melee grunts walk up to him)
      }
      const onScreen = (() => { const g = world.actors.find((a) => a.ai); return g ? g.pos.x : NaN; })();
      rows.push(`${label.padEnd(13)} spawn->inside ${(tIn - t0).toFixed(2)} s, inside->first attack ${(tAct - tIn).toFixed(2)} s (x ${onScreen.toFixed(2)})`);
    }
    console.log('ENC-09 free window\n' + rows.join('\n'));
  });
});

describe.skipIf(on)('ENC bosses and set pieces', () => {
  it('ENC-10: the stage 1 boss, gunner bot from the start of the fight: time to kill, ward use, lives', () => {
    const rows: string[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const reaction of [0.1, 0.35]) {
        const world = new World(STAGE1.rooms.arena.room);
        (world as unknown as { seed: number }).seed = seed;
        const hero = createActor('hero', 0, 9.2, 1);
        world.addPlayer(hero);
        hero.hp = hero.maxHp = 99;
        world.seq.run(stage1From('boss'));
        const st = bot(seed);
        let wards = 0, blocked = 0, hits = 0, fight = -1, gun = -1, died = -1, firstWound = -1, phase2 = -1;
        world.events.on('ward', (e) => { if (e.up) wards++; });
        world.events.on('wardHit', () => blocked++);
        world.events.on('hit', (e) => {
          const a = world.actorById(e.actorId);
          if (a?.kind === 'hero' && e.damage > 0) hits++;
          if (a?.kind === 'boss' && e.damage > 0 && firstWound < 0) firstWound = world.time;
        });
        world.events.on('bossSweep', () => { if (phase2 < 0) phase2 = world.time; });
        world.events.on('bossArrive', (e) => { if (e.phase === 'land' && fight < 0) fight = world.time; });
        world.events.on('pickup', (e) => { if (e.actorId === hero.id && e.item === 'smg' && gun < 0) gun = world.time; });
        world.events.on('kill', (e) => { if (world.actorById(e.actorId)?.kind === 'boss') died = world.time; });
        for (let i = 0; i < 60 * 120 && died < 0; i++) { world.command = botCommand(world, hero, 'gunner', reaction, st); world.step(); }
        rows.push(`seed ${seed} r ${reaction}: lands ${fight.toFixed(1)}, SMG in hand ${gun.toFixed(1)}, first wound ${firstWound.toFixed(1)}, dead ${died.toFixed(1)} (gun->dead ${(died - gun).toFixed(1)} s), wards ${wards}, shots on the ward ${blocked}, hero hits ${hits}`);
      }
    }
    console.log('ENC-10 boss\n' + rows.join('\n'));
  });

  it('ENC-11: cannon depth coverage: a manned cannon at z can never hit a hero standing this far away in depth', () => {
    const C = TUNING.boss.cannon;
    const room = STAGE1.rooms.arena.room;
    const rows: string[] = [];
    for (const cz of [8.6, 9.33, 9.6, 10.2]) {
      const lo = Math.max(room.zFront, cz - C.aimBand - 0.25), hi = Math.min(room.zBack, cz + C.aimBand + 0.25);
      const safeFront = Math.max(0, lo - room.zFront), safeBack = Math.max(0, room.zBack - hi);
      rows.push(`cannon z ${cz}: balls cover z ${lo.toFixed(2)}-${hi.toFixed(2)}; safe strip front ${safeFront.toFixed(2)} H, back ${safeBack.toFixed(2)} H`);
    }
    // measured: a grunt mans a cannon at z 9.6; the hero stands still at the front edge for 20 s
    const measure = (hz: number) => {
      const world = new World(room);
      const hero = createActor('hero', -2.5, hz, 1);
      world.addPlayer(hero);
      hero.hp = hero.maxHp = 99;
      placeCannon(world, 1.2, 9.6, -1);
      world.director = new WaveDirector({ spawns: [{ id: 'R', kind: 'edge', side: 1, z: 9.6 }], waves: [{ id: 'c', threshold: 0, maxAlive: 1, entries: [[0, 'R', 'grunt', null, { role: 'cannon' }]] }] });
      let balls = 0, hits = 0;
      world.events.on('cannonFire', () => balls++);
      world.events.on('cannonHit', (e) => { if (e.actorId === hero.id) hits++; });
      for (let i = 0; i < 60 * 20; i++) { tick(world); hero.pos.z = hz; }
      return `hero at z ${hz}: ${balls} balls fired, ${hits} hit him`;
    };
    rows.push(measure(8.05), measure(9.6));
    console.log('ENC-11 cannon\n' + rows.join('\n'));
  });

  it('ENC-12: the boss fling costs lives (corridor cameo and the desert blast), unavoidably', () => {
    const world = new World(STAGE2.rooms.corridor.room);
    const hero = createActor('hero', -2.5, 9.0, 1);
    world.addPlayer(hero);
    const hp0 = hero.hp;
    world.seq.run(bossInterruption);
    for (let i = 0; i < 60 * 4; i++) tick(world);
    console.log(`ENC-12 corridor fling: hero hp ${hp0} -> ${hero.hp} (${hero.state})`);
  });

  it('ENC-13: the jetpack MG burst against a hero standing in the open', () => {
    const rows: string[] = [];
    for (const hx of [0.5, 2.6]) {
      const world = new World(STAGE3.rooms.camera.room);
      const hero = createActor('hero', hx, 9.2, -1);
      world.addPlayer(hero);
      hero.hp = hero.maxHp = 99;
      const b = createActor('grunt', -2.4, 9.2, 1, { held: 'mg' });
      b.hands[0] = newHand('mg', 100);
      b.hover = 1.3; b.pos.y = 1.3; b.protected = true; b.variant = 'riot';
      world.actors.push(b);
      let hits = 0;
      const times: number[] = [];
      world.events.on('hit', (e) => { if (e.actorId === hero.id && e.damage > 0) { hits++; times.push(world.time); } });
      for (let t = 0; t < 1.4; t += world.dt) {
        world.scripted.set(b.id, { ...IDLE_COMMAND, aim: project(hero.pos.x, hero.pos.y + 0.55, hero.pos.z), face: 1, hold: [true, false], press: [t === 0, false] });
        tick(world);
      }
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      rows.push(`hero at x ${hx} (${hx > 2 ? 'behind the crate' : 'open'}): ${hits} hits in one 1.4 s burst (min gap ${gaps.length ? Math.min(...gaps).toFixed(2) : '-'} s) vs ${TUNING.health.hero} lives`);
    }
    console.log('ENC-13 jetpack burst\n' + rows.join('\n'));
  });

  it('ENC-14: stage 2 crate room: the dug-in guards leave their crate at once', () => {
    const world = new World(STAGE2.rooms.crates.room);
    const hero = createActor('hero', 0, 9.2, 1);
    world.addPlayer(hero);
    hero.hp = hero.maxHp = 99;
    world.seq.run(stageRunner(STAGE2, 'crates', 'lift'), 'stage');
    tick(world, {}, 2);
    const dug = world.actors.filter((a) => a.ai);
    const x0 = dug.map((a) => a.pos.x);
    const keep0 = dug.map((a) => a.ai!.keep);
    tick(world, {}, 60 * 4);
    console.log(`ENC-14 dug-in guards: keep set ${keep0.map((k) => k?.toFixed(2)).join(', ')} -> ${dug.map((a) => a.ai!.keep?.toFixed(2)).join(', ')} (R.keep ${TUNING.ai.ranged.keep}); x ${x0.map((x) => x.toFixed(2)).join(', ')} -> ${dug.map((a) => a.pos.x.toFixed(2)).join(', ')} (crate x 1.2-2.0)`);
  });

  it('ENC-15: the stage 1 ending boombox vs where the boss cannon lands', () => {
    // the boss summons the cannon CN.offset from where he hovers; the boombox lies at the intro NPC's spot
    const B = TUNING.boss.cannon;
    const rows: string[] = [];
    let covered = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const world = new World(STAGE1.rooms.arena.room);
      (world as unknown as { seed: number }).seed = seed;
      const hero = createActor('hero', 0, 9.2, 1);
      world.addPlayer(hero);
      hero.hp = hero.maxHp = 99;
      world.seq.run(stage1From('boss'));
      const st = bot(seed);
      for (let i = 0; i < 60 * 60 && !world.cannons.some((c) => (c.y ?? 0) <= 0 && c.drop === undefined); i++) { world.command = botCommand(world, hero, 'gunner', 0.35, st); world.step(); }
      const c = world.cannons[0];
      if (!c) continue;
      const hit = Math.abs(c.x - INTRO.boombox.x) < 0.42 + 0.1 && Math.abs(c.z - INTRO.boombox.z) < 0.22 + 0.1;
      if (hit) covered++;
      rows.push(`seed ${seed}: cannon at (${c.x.toFixed(2)}, ${c.z.toFixed(2)})${hit ? ' COVERS the boombox spot' : ''}`);
    }
    console.log(`ENC-15 cannon vs boombox (${INTRO.boombox.x}, ${INTRO.boombox.z}); offset ${B.offset}\n${rows.join('\n')}\ncovered ${covered}/20`);
  });
});
void spawnBoss; void alive;

describe.skipIf(on)('ENC automatic fire vs 3 lives', () => {
  it('ENC-13b: one burst from a grunt SMG / the jetpack MG, hero standing or prone, in the open or behind the camera-room crate', () => {
    const rows: string[] = [];
    const run = (gun: 'smg' | 'mg', hx: number, hz: number, prone: boolean, seeds = 10) => {
      let total = 0, kills = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const world = new World(STAGE3.rooms.camera.room);
        (world as unknown as { seed: number }).seed = seed;
        const hero = createActor('hero', hx, hz, -1);
        world.addPlayer(hero);
        if (prone) { tick(world, { dive: true }); tick(world, {}, 40); }
        hero.hp = hero.maxHp = 99;
        let hits = 0;
        world.events.on('hit', (e) => { if (e.actorId === hero.id && e.damage > 0) hits++; });
        if (gun === 'mg') {
          const b = createActor('grunt', -2.4, 9.2, 1, { held: 'mg' });
          b.hands[0] = newHand('mg', 100); b.hover = 1.3; b.pos.y = 1.3; b.protected = true; b.variant = 'riot';
          world.actors.push(b);
          for (let t = 0; t < 1.4; t += world.dt) { world.scripted.set(b.id, { ...IDLE_COMMAND, aim: project(hero.pos.x, hero.pos.y + 0.55, hero.pos.z), face: 1, hold: [true, false], press: [t === 0, false] }); tick(world); }
        } else {
          const g = spawnEnemy(world, 'grunt', 'smg', -1.0, 9.2, { face: 1 });
          g.ai!.cooldown = 0;
          let bursts = 0;
          world.events.on('aimStart', () => bursts++);
          for (let i = 0; i < 600 && bursts < 2; i++) tick(world);
          // count only the first burst
        }
        total += hits;
        if (hits >= TUNING.health.hero) kills++;
      }
      return `${gun} hero (${hx}, ${hz}) ${prone ? 'prone' : 'standing'}: ${(total / seeds).toFixed(1)} hits per burst, ${kills}/${seeds} bursts take all ${TUNING.health.hero} lives`;
    };
    rows.push(run('smg', 2.0, 9.2, false), run('smg', 2.0, 9.2, true), run('mg', 0.5, 9.2, false), run('mg', 1.75, 10.25, false), run('mg', 1.75, 10.25, true), run('mg', 0.5, 9.2, true));
    console.log('ENC-13b bursts\n' + rows.join('\n'));
  });
});
