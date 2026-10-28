// M19 rage meter (design/rage.md section 1): every kill a hero makes has a type; kills of a type
// that isn't one of the hero's last 2 fill the bar (10%, +5% per varied kill in a row, up to 25%),
// repeats fill nothing and reset the streak. Full = a rage fatality on Tab (src/sim/rageMoves.ts).
// Numbers in TUNING.rage, invented.
import { TUNING } from '../data/tuning';
import type { Actor } from './actor';
import type { HitKind } from './events';
import type { World } from './world';

export type KillType = 'team' | 'style' | 'air' | 'stealth' | 'stomp' | 'kick' | 'fists' | 'toss' | 'blade' | 'blunt' | 'thrown' | 'gun' | 'boom' | 'env';

/** Extra context a hit carries into the kill's type. */
export interface KillCtx {
  juggled?: boolean;
  team?: boolean;
  /** `style`: an M10b fatality (head punt, over-the-shoulder); `kick`: the flying kick. */
  via?: 'style' | 'kick';
}

/** The type of a kill (design/rage.md 1.1): the first rule that applies wins. */
export function killType(kind: HitKind, ctx: KillCtx = {}): KillType {
  if (ctx.team) return 'team';
  if (ctx.via === 'style') return 'style';
  if (ctx.juggled) return 'air';
  if (ctx.via === 'kick' || kind === 'sweep') return 'kick';
  switch (kind) {
    case 'takedown': return 'stealth';
    case 'finisher': return 'stomp';
    case 'light': case 'heavy': case 'uppercut': return 'fists';
    case 'body': case 'wall': return 'toss';
    case 'stab': case 'slash': return 'blade';
    case 'smash': return 'blunt';
    case 'knife': case 'gun': case 'head': return 'thrown';
    case 'bullet': return 'gun';
    case 'blast': case 'cannon': return 'boom';
    default: return 'env';
  }
}

export interface RageMeter {
  /** 0..1; full at 1. */
  value: number;
  /** The last 2 kills' types (repeats included), oldest first. */
  recent: KillType[];
  /** Varied kills in a row. */
  streak: number;
}

export const newRage = (): RageMeter => ({ value: 0, recent: [], streak: 0 });

/** The rage meter's kill listener (installed by every World; puppets only replay). */
export function installRage(world: World): void {
  let last: { tick: number; by: number; type: KillType } | undefined;
  world.events.on('kill', (e) => {
    if (world.puppet || world.rage) return; // no rage from the kills of a rage fatality
    const victim = world.actorById(e.actorId);
    if (!victim || victim.kind === 'hero' || !e.type) return;
    for (const id of [e.byId, e.alsoId]) {
      const p = id ? world.players.find((q) => q.id === id) : undefined;
      if (!p) continue;
      // extra victims of one action (a grenade, a bowling body): a little each, no streak change
      if (last && last.tick === world.tick && last.by === p.id && last.type === e.type) { gain(world, p, TUNING.rage.multi, e.type, false); continue; }
      last = { tick: world.tick, by: p.id, type: e.type };
      addKill(world, p, e.type, victim.kind === 'boss');
    }
  });
}

/** One credited kill of `type` (design/rage.md 1.2). */
export function addKill(world: World, p: Actor, type: KillType, boss = false): void {
  const R = TUNING.rage, m = (p.rage ??= newRage());
  const repeat = m.recent.includes(type);
  let amount = 0;
  if (repeat) m.streak = 0;
  else {
    amount = R.base + R.streakStep * Math.min(m.streak, R.streakMax);
    if (type === 'style') amount += R.styleBonus;
    if (type === 'team') amount += R.teamBonus;
    m.streak++;
  }
  if (boss) amount += R.bossBonus;
  m.recent = [...m.recent, type].slice(-R.recent);
  gain(world, p, amount, type, repeat);
}

function gain(world: World, p: Actor, amount: number, type: KillType, repeat: boolean): void {
  const m = (p.rage ??= newRage());
  const was = m.value;
  m.value = Math.min(1, m.value + amount);
  world.events.emit('rageGain', { actorId: p.id, amount: m.value - was, type, repeat, value: m.value, ...p.pos });
  if (was < 1 && m.value >= 1) world.events.emit('rageReady', { actorId: p.id, ...p.pos });
}

export type RageKind = 'rampage' | 'spinShot' | 'cutLine' | 'homeRun';

/** A rage fatality under way (design/rage.md 2.4): everyone else is frozen in time. */
export interface RageRun {
  kind: RageKind;
  heroes: number[];
  victims: number[];
  /** Struck, waiting for the release (the strike-all moves). */
  pending: number[];
  phase: 'ignite' | 'run' | 'finale' | 'release';
  t: number;
}
