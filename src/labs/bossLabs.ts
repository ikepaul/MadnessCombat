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
  title: 'Stage-1 boss: floats down in 0.67 s, raises a corpse with lightning (hand up + crackle 0.8 s, bolt 2 frames, rise 1.0 s, at most 2 zombies), ward blocks shots from his front ~1 s then a 1.5 s window; 3 head shots kill. You have an SMG (R reloads, life refills). The 4 corpses respawn when gone.',
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
    // a new boss once he's dead and his zombies are down
    if (!world.actors.some(isBoss) && !world.actors.some((a) => a.kind === 'zombie' && alive(a))) spawnBoss(world, -2.2, 9.6, 1);
  },
  info(world) {
    const b = world.actors.find(isBoss);
    if (!b) return 'boss down';
    const s = b.boss;
    const ward = s.ward > 0 ? `UP ${s.ward.toFixed(1)} s` : s.window > 0 ? `window ${s.window.toFixed(1)} s` : 'ready';
    const zombies = world.actors.filter((a) => a.kind === 'zombie' && alive(a)).length;
    return `${s.phase}  ·  hp ${b.hp}/${TUNING.boss.hp}  ·  ward ${ward}  ·  ${s.cast ? `casting ${s.cast.t.toFixed(2)} s` : `next raise ${Math.max(0, s.raiseIn).toFixed(1)} s`}  ·  zombies ${zombies}/${TUNING.boss.maxZombies}`;
  },
});
