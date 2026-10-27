// M18 co-op move labs (design/coop-moves.md): you are player 1, the partner bot (src/dev/partnerBot.ts)
// is player 2 and fights on its own; N hands it its half of the lab's move.
import { project } from '../render/camera';
import { type Actor, createActor, type HeldItem, newHand } from '../sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../sim/command';
import { spawnEnemy } from '../sim/waves';
import type { World } from '../sim/world';
import { registerLab } from './registry';

function heroes(world: World, x1: number, x2: number, held2: HeldItem = null): [Actor, Actor] {
  world.room = { ...world.room, props: [] };
  const p1 = createActor('hero', x1, 9.2, 1);
  const p2 = createActor('hero', x2, 9.2, -1);
  if (held2) p2.hands[0] = newHand(held2);
  world.addPlayer(p1);
  world.addPlayer(p2);
  return [p1, p2];
}

/** A grunt standing still (no brain), so the move can be lined up. */
function dummy(world: World, x: number, z = 9.2): Actor {
  const g = spawnEnemy(world, 'grunt', null, x, z, { face: -1 });
  g.brain = undefined;
  return g;
}

/** A task that sends one command once (the next tick it hands back to the bot's own fighting). */
function once(make: (world: World, bot: Actor, me: Actor) => PlayerCommand | undefined) {
  let sent = false;
  return (world: World, bot: Actor, me: Actor): PlayerCommand | undefined => {
    if (sent) { sent = false; return undefined; }
    sent = true;
    return make(world, bot, me);
  };
}

const headOf = (a: Actor): [number, number] => project(a.pos.x, a.pos.y + 0.79, a.pos.z);
const nearest = (world: World, a: Actor) => world.actors.filter((o) => o.ai && o.state !== 'dead').sort((p, q) => Math.abs(p.pos.x - a.pos.x) - Math.abs(q.pos.x - a.pos.x))[0];
const N = 'N: the partner bot does its half';

registerLab({
  slug: 'coop-hold-hit',
  title: `Hold & hit: grab a grunt (F). Your partner's hits land on him for real: the 3rd jab or any heavy blow, blade or bullet kills him (a team kill); you keep the body. Hit twice, then thrown, he dies on whatever he hits. ${N} (a heavy).`,
  setup(world) { heroes(world, -1.6, 0.6); dummy(world, -0.9); dummy(world, 1.8); },
  partnerTask: once((_w, bot) => ({ ...IDLE_COMMAND, attack: 'heavy', face: bot.facing })),
});

registerLab({
  slug: 'coop-chain',
  title: `Shared chains: either player's hits on one grunt keep one chain. Launch him (LMB, then RMB with the cursor high) and let your partner juggle or spike him. ${N} (a jab).`,
  setup(world) { heroes(world, -1.2, 0.4); dummy(world, -0.4); },
  partnerTask: once((_w, bot) => ({ ...IDLE_COMMAND, attack: 'light', face: bot.facing })),
});

registerLab({
  slug: 'coop-ping-pong',
  title: `Ping-pong: knock a grunt (RMB) into your partner: he bounces back airborne. Bat him back with a heavy and he dies at the next wall or partner. ${N} (a heavy at whoever is in front of it).`,
  setup(world) { heroes(world, -1.6, 0.6); dummy(world, -1.05); },
  partnerTask: once((w, bot) => ({ ...IDLE_COMMAND, attack: 'heavy', face: (Math.sign((nearest(w, bot)?.pos.x ?? 0) - bot.pos.x) || -1) as 1 | -1 })),
});

registerLab({
  slug: 'coop-wishbone',
  title: `Wishbone: grab a grunt (F) facing your partner; their F on him tears him in two (stage 1: his head pops). Or press F on the grunt your partner holds. ${N} (F).`,
  setup(world) { heroes(world, -1.4, -0.1); dummy(world, -0.75); },
  partnerTask: once(() => ({ ...IDLE_COMMAND, grab: true })),
});

registerLab({
  slug: 'coop-pass',
  title: `Weapon pass: Q with the cursor on your partner lobs your weapon to them; it's caught into a free hand without F (both hands full: at their feet). ${N} (passes you its knife).`,
  setup(world) { const [p1] = heroes(world, -1.8, 1.4, 'knife'); p1.hands[0] = newHand('pistol', 6, 0); dummy(world, 0); },
  partnerTask: once((_w, _bot, me) => ({ ...IDLE_COMMAND, throwGun: true, aim: headOf(me) })),
});

registerLab({
  slug: 'coop-bat',
  title: `Body bat: when your partner throws a body at you, a heavy (or a swing) sends it on at 1.5x toward your cursor; it flies through whoever it hits and dies at the wall. ${N} (grabs the grunt next to it, then throws it at you).`,
  setup(world) { heroes(world, -2.2, 1.6); dummy(world, 1.15); dummy(world, -0.6, 9.4); },
  partnerTask: (() => {
    let step = 0;
    return (_w: World, bot: Actor, me: Actor): PlayerCommand | undefined => {
      step++;
      if (step === 1) return { ...IDLE_COMMAND, grab: true };
      if (step < 4) return { ...IDLE_COMMAND };
      step = 0;
      return { ...IDLE_COMMAND, grab: true, aim: project(me.pos.x, 0, me.pos.z), face: bot.facing };
    };
  })(),
});

registerLab({
  slug: 'coop-double',
  title: `Double-team: both of you hit the same grunt within 0.25 s (punch, shot, thrown weapon, any mix): he dies at once. ${N} (a jab), time yours with it.`,
  setup(world) { heroes(world, -0.85, 0.45); dummy(world, -0.4); },
  partnerTask: once((_w, bot) => ({ ...IDLE_COMMAND, attack: 'light', face: bot.facing })),
});

registerLab({
  slug: 'coop-toss',
  title: `Hero toss: F with the cursor on your partner (your hands empty) lifts them; F or LMB throws them as a kick-missile through the line of grunts. Carried, Space hops off. ${N} (lifts you; N again throws you right).`,
  setup(world) { heroes(world, -2.6, -2.0); for (const x of [-0.6, 0.4, 1.4]) dummy(world, x); },
  partnerTask: once((_w, bot, me) => (bot.holding ? { ...IDLE_COMMAND, grab: true, aim: project(3, 0, 9.2) } : { ...IDLE_COMMAND, grab: true, aim: headOf(me) })),
});

registerLab({
  slug: 'coop-spin',
  title: `Carry-spin: lift your partner (F, cursor on them), then their F starts the spin: swung round by the ankles. Armed, they fire only out to the side they're on; unarmed, they floor grunts in the circle. Your F throws them out along the swing. ${N} (lifts you: press F yourself to spin, with the pistol).`,
  setup(world) { const [p1] = heroes(world, -0.4, 0.2); p1.hands[0] = newHand('pistol'); for (const x of [-2.2, 1.0, 2.4]) dummy(world, x, 9.0 + (x > 0 ? 0.6 : 0)); },
  partnerTask: once((_w, bot, me) => (bot.holding ? { ...IDLE_COMMAND, grab: true } : { ...IDLE_COMMAND, grab: true, aim: headOf(me) })),
  info: (world) => `spin ${world.players[1]?.spin ? (((world.players[1].spin.angle * 180) / Math.PI) % 360).toFixed(0) + '°' : '-'}`,
});
