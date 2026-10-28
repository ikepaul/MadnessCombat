// STB: restart from the checkpoint vs arriving in play, every room of stages 2 and 3. For each
// room R and an exit into it from room P: play P (foes cleared by the harness), take that exit,
// and snapshot R 3 s after the entry; then build R fresh the way GameScene does on a restart
// (new World, checkpoint loadout + kills) and snapshot it the same way. Prints every difference.
// `AUDIT=1 npx vitest run tests/audit/stb/checkpoint.test.ts`
import { describe, expect, it } from 'vitest';
import { IDLE_COMMAND } from '../../../src/sim/command';
import { createActor } from '../../../src/sim/actor';
import { type StageDef, stageRunner } from '../../../src/sim/stage';
import { World } from '../../../src/sim/world';
import { foes, ROOM_STAGES } from '../harness';

function snap(world: World) {
  const hero = world.player!;
  return {
    physics: world.physics,
    flags: [...world.flags].filter((f) => !/-title$/.test(f)).sort().join(','),
    inputLocked: world.inputLocked,
    gore: world.gore,
    actors: world.actors.filter((a) => a.playerIndex === undefined).map((a) => `${a.kind}/${a.variant ?? ''}/${a.state}`).sort().join(','),
    items: world.items.map((i) => i.kind).sort().join(','),
    exits: world.exits.map((x) => `${x.def.id}:${x.open}`).join(','),
    heroState: `${hero.state}/${hero.hp}/${hero.traversing?.kind ?? ''}`,
    enemyGrenades: world.enemyGrenades,
    elevator: world.elevator?.phase ?? '',
    room: `${world.roomId}/${world.room.id}/${world.room.props.length}props/void:${!!world.room.void}`,
  };
}

function step(world: World, n: number, clear: boolean): void {
  for (let i = 0; i < n; i++) {
    for (const p of world.players) p.invulnerable = true;
    if (clear) for (const a of foes(world)) if (!a.entering && !a.koed && a.kind !== 'boss' && !a.protected) world.hitActor(world.player, a, 'blast', 1, 0, { ...a.pos });
    world.command = { ...IDLE_COMMAND };
    world.step();
  }
}

function fresh(def: StageDef, room: string, entry: string, hands: World['players'][number]['hands'], grenades: number, kills: number): World {
  const world = new World(def.rooms[room].room);
  world.gore = def.gore ?? 'normal';
  const hero = createActor('hero', 0, 9.2, 1);
  world.addPlayer(hero);
  def.loadout(hero);
  hero.hands = structuredClone(hands);
  hero.grenades = grenades;
  world.kills = kills;
  world.flags.add(`s${def.stage}-title`);
  world.seq.run(stageRunner(def, room, entry), 'stage');
  return world;
}

describe.skipIf(!process.env.AUDIT)('STB checkpoint restart vs arrival', () => {
  it('every room of stages 2 and 3 looks the same after a restart as on arrival', () => {
    const diffs: string[] = [];
    for (const stage of [2, 3] as const) {
      const def = ROOM_STAGES[stage];
      for (const [pid, p] of Object.entries(def.rooms)) {
        for (const x of p.exits) {
          if (!x.to || x.warp) continue;
          // play the previous room for 4 s with its foes cleared, then take the exit
          const world = fresh(def, pid, Object.keys(p.entries)[0], [null, null], 0, 0);
          def.loadout(world.player!);
          step(world, 240, true);
          let at: { hands: World['players'][number]['hands']; grenades: number; kills: number } | undefined;
          world.events.on('roomEnter', (e) => { if (e.room === x.to) at = { hands: structuredClone(world.player!.hands), grenades: world.player!.grenades, kills: world.kills }; });
          if (!world.exitTaken) { world.exitTaken = x; world.events.emit('exitTaken', { exit: x.id, kind: x.kind, byId: 0 }); }
          for (let i = 0; i < 300 && !at; i++) step(world, 1, false);
          if (!at) { diffs.push(`s${stage} ${pid}.${x.id} -> ${x.to}: never entered`); continue; }
          step(world, 180, false);
          const a = snap(world);
          const b0 = fresh(def, x.to, x.entry, at.hands, at.grenades, at.kills);
          step(b0, 181, false);
          const b = snap(b0);
          for (const k of Object.keys(a) as (keyof typeof a)[]) if (String(a[k]) !== String(b[k])) diffs.push(`s${stage} ${pid} -> ${x.to} ${k}: arrival=${a[k]} | restart=${b[k]}`);
        }
      }
    }
    console.log(`STB checkpoint diffs (${diffs.length}):\n${diffs.join('\n')}`);
    expect(diffs).toEqual([]);
  }, 600_000);
});
