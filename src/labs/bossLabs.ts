// M8 boss lab (research/mechanics/boss-halo, clips 1-2 so far: descend, lightning raise, shield).
// Compared against the note's numbers (the reference clips are local-only).
import { STAGE1 } from '../data/stages/stage1';
import { TUNING } from '../data/tuning';
import { alive, createActor, newHand } from '../sim/actor';
import { isBoss, spawnBoss } from '../sim/boss';
import type { World } from '../sim/world';
import { registerLab } from './registry';

registerLab({
  slug: 'boss-halo',
  title: 'Stage-1 boss: floats down in 0.67 s; lightning (hand up + crackle 0.8 s) raises a corpse (at most 2 zombies) or strikes where you stood (move to dodge; knockdown + your gun flies off); up close he dashes (2.3 H in 0.27 s), grabs and slams you 6 times (mash any button to cut it short), then throws you; the ward blocks shots from his front ~1 s, then a 1.5 s window. Phase 2 (first head wound or 30 s): he sweeps the corpses off the screen and drops a cannon (watch the shadow), then fires 4-ball volleys from behind it (jump or go prone; his ward stays down meanwhile). 3 head shots kill. You have an SMG (R reloads, life refills). The 4 corpses respawn when gone.',
  setup(world) {
    world.setRoom(STAGE1.rooms.arena.room);
    const hero = createActor('hero', 2, 9.4, -1);
    hero.hands[0] = newHand('smg');
    world.actors.push(hero);
    world.player = hero;
    world.spawnCorpses(4);
    spawnBoss(world, -2.2, 9.6, 1);
  },
  step(world: World) {
    const p = world.player;
    if (p) p.hp = p.maxHp;
    // keep something to raise
    if (!world.actors.some((a) => a.kind === 'grunt' && a.state === 'dead' && !a.corpse?.gibbed)) world.spawnCorpses(4);
    // a new boss once he's dead and his zombies are down (his cannon goes with him)
    if (!world.actors.some(isBoss) && !world.actors.some((a) => a.kind === 'zombie' && alive(a))) {
      world.cannons = [];
      world.balls = [];
      world.room.props = world.room.props.filter((p) => p.kind !== 'cannon');
      spawnBoss(world, -2.2, 9.6, 1);
    }
  },
  info(world) {
    const b = world.actors.find(isBoss);
    if (!b) return 'boss down';
    const s = b.boss;
    const ward = s.ward > 0 ? `UP ${s.ward.toFixed(1)} s` : s.window > 0 ? `window ${s.window.toFixed(1)} s` : 'ready';
    const zombies = world.actors.filter((a) => a.kind === 'zombie' && alive(a)).length;
    const act = s.act ? (s.act.kind === 'cast' ? `${s.act.spell} ${s.act.t.toFixed(2)} s` : s.act.kind === 'grab' ? `slam ${s.act.done}/${s.act.slams} (mash!)` : s.act.kind === 'volley' ? `volley ${s.cannon?.shots ?? 0} left` : s.act.kind) : 'hovering';
    const next = `raise ${Math.max(0, s.raiseIn).toFixed(1)} · strike ${Math.max(0, s.strikeIn).toFixed(1)} · dash ${Math.max(0, s.dashIn).toFixed(1)}${s.cannon ? ` · volley ${Math.max(0, s.cannonIn).toFixed(1)}` : ''}`;
    const stage = s.stage === 1 ? `phase 1 (phase 2 at a wound or in ${Math.max(0, TUNING.boss.sweep.after - s.t).toFixed(0)} s)` : 'phase 2';
    return `${s.phase} ${stage}  ·  hp ${b.hp}/${TUNING.boss.hp}  ·  ward ${ward}  ·  ${act}  ·  next ${next}  ·  zombies ${zombies}/${TUNING.boss.maxZombies}`;
  },
});
