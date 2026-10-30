// M14b audit labs (PLAN.md M14b "Labs"): the hero's mercy window, the stomp on a prone hero, the
// weapon finisher and the throw/slump blends. Each names its F6 switch so old and new can be flipped.
import { TUNING } from '../data/tuning';
import { alive, newHand } from '../sim/actor';
import { spawnEnemy } from '../sim/waves';
import type { World } from '../sim/world';
import { hero, respawner } from './meleeLabs';
import { registerLab } from './registry';

/** Hits the hero shrugged off (mercy, get-up i-frames, shields) since the lab opened. */
let absorbed = 0;
const countAbsorbed = (world: World) => { absorbed = 0; world.events.on('hitAbsorbed', () => absorbed++); };

registerLab({
  slug: 'audit-mercy',
  title: `Mercy window (ENC-03): an SMG grunt fires a burst at you. After you lose a life you ignore hits for TUNING.health.mercy = ${TUNING.health.mercy} s (Pro; Noob longer, Notch shorter), drawn as a flash and a soft thud. One burst should cost one life. F6: health.mercy 0 = the old behaviour (a burst takes them all). Your lives refill when you stand free with none lost for 2 s.`,
  setup(world) {
    countAbsorbed(world);
    hero(world, -2.4, 9.2);
    const g = spawnEnemy(world, 'grunt', 'smg', 1.8, 9.2, { face: -1 });
    g.hp = g.maxHp = 99;
  },
  step(world) {
    const p = world.player;
    if (p && p.state === 'free' && world.time - (p.mercyAt ?? -9) > 2) p.hp = p.maxHp;
  },
  info: (world) => `hp ${world.player?.hp ?? 0} · absorbed ${absorbed}`,
});

registerLab({
  slug: 'audit-stomp',
  title: `Stomp (CMB-07): lie prone (C) next to the three unarmed grunts. One raises his foot (the drawn tell, ${TUNING.enc.stomp.tell} s) and stamps; roll or get up in time. Prone still dodges the pistol grunt's shots. F6: enc.stomp.on off = no stomps; FEEL.pose.stompPose 0 = no drawn wind-up.`,
  setup(world) {
    hero(world, -0.4, 9.2);
    for (const [x, z] of [[0.5, 9.2], [-1.3, 9.4], [0.3, 8.7]] as const) spawnEnemy(world, 'grunt', null, x, z);
    spawnEnemy(world, 'grunt', 'pistol', 3.0, 9.6, { face: -1 });
  },
  step(world) {
    const p = world.player;
    if (p && alive(p)) p.hp = Math.max(p.hp, 2);
  },
  info: (world) => world.actors.filter((a) => a.ai?.stompT !== undefined).map((a) => `tell ${a.ai!.stompT!.toFixed(2)} s`).join(' | ') || 'no stomp under way',
});

{
  const r = respawner([{ x: 0.4, z: 9.2, hp: TUNING.health.tough }, { x: 1.8, z: 9.5, hp: TUNING.health.tough }], 2);
  registerLab({
    slug: 'audit-weapon-finisher',
    title: 'Weapon finisher (CMB-13/14): knock a dummy down (RMB heavy, or a dive sweep), then swing the knife at him on the floor: a down-stab (swing damage); the knife is not tossed with a downed body in reach. An uppercut at a downed body is a heavy finisher. A bat lies on the floor (E). F6: melee.weaponFinisher off = the old swing that passed over him.',
    setup(world) {
      const h = hero(world, -1.4, 9.2);
      h.hands[0] = newHand('knife');
      const bat = world.spawnItem('bat', 'grunt', { x: -2.4, y: 0, z: 9.3 }, { x: 0, y: 0, z: 0 }, 0);
      bat.state = 'floor';
      r.setup(world);
    },
    step: r.step,
    info: (world) => world.actors.filter((a) => a.kind === 'grunt').map((a) => `${a.state} hp ${a.hp}`).join(' | '),
  });
}

{
  const r = respawner([{ x: -2.2, z: 9.2 }, { x: -1.2, z: 9.6 }, { x: 1.6, z: 9.2 }, { x: 2.4, z: 8.8 }], 2);
  registerLab({
    slug: 'audit-slump',
    title: 'Throw and slump (VIS-06/07): grab (F) and throw bodies into the walls. The drawn body blends into its slump and eases its landing angle; a grabbed body slides to the hold instead of snapping; the thrown body leaves from where it was drawn. F6: FEEL.pose.slumpBlend / snapEase / grabEase 0 = the old snaps (F2 slow-mo helps).',
    setup(world) {
      hero(world, 0, 9.2);
      r.setup(world);
      world.spawnCorpses(2);
    },
    step: r.step,
  });
}
