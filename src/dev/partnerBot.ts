// M18 partner bot (design/coop-moves.md 4): an AI player 2 so one person can playtest co-op.
// `?coop=bot` puts it in any stage; the co-op labs use it and hand it their move on the N key.
// It's a player (playerIndex 1): it produces a PlayerCommand every tick like the guest's laptop
// would, so every co-op rule runs exactly as with a person. Not tuned for skill: it keeps up.
import { project } from '../render/camera';
import { TUNING } from '../data/tuning';
import { isWeapon } from '../data/weapons';
import { type Actor, alive } from '../sim/actor';
import { IDLE_COMMAND, type PlayerCommand } from '../sim/command';
import { exitSpot, partnerAhead, usableExitAt, waitingInExit } from '../sim/stage';
import type { World } from '../sim/world';

export interface BotState {
  /** Seconds until the next swing / shot. */
  wait: number;
  /** A lab's move on cue (N): returns this tick's command, or undefined when done. With a task the bot stands still between cues. */
  task?: (world: World, bot: Actor, me: Actor) => PlayerCommand | undefined;
  /** N was pressed: the task runs until it returns undefined. */
  cued: boolean;
}

export const newBotState = (): BotState => ({ wait: 0, cued: false });

/** Walk toward a floor point (WASD-like, full speed). */
function walkTo(cmd: PlayerCommand, a: Actor, x: number, z: number, near = 0.15): boolean {
  const dx = x - a.pos.x, dz = z - a.pos.z;
  if (Math.abs(dx) > near) cmd.moveX = Math.sign(dx);
  if (Math.abs(dz) > 0.08) cmd.moveZ = Math.sign(dz);
  return Math.abs(dx) <= near && Math.abs(dz) <= 0.08;
}

/** This tick's command for the bot (player `bot`, partner `me`). */
export function partnerCommand(world: World, bot: Actor, state: BotState): PlayerCommand {
  const cmd: PlayerCommand = { ...IDLE_COMMAND };
  const me = world.players.find((p) => p !== bot);
  if (!me || !alive(bot) || bot.state === 'downed') return cmd;
  if (state.cued && state.task) {
    const t = state.task(world, bot, me);
    if (t) return t;
    state.cued = false;
  }
  // a lab's bot waits for its cue (it would fight the lab's dummies otherwise)
  if (state.task) return cmd;
  state.wait = Math.max(0, state.wait - world.dt);
  // a downed partner first: stand in the circle
  if (me.state === 'downed') {
    walkTo(cmd, bot, me.pos.x, me.pos.z, TUNING.coop.reviveRadius * 0.5);
    return cmd;
  }
  // co-op exits: follow the partner out (walk-in exits: stand with him; E exits: go and press E)
  const ahead = partnerAhead(world, bot);
  if (ahead) {
    const s = exitSpot(world, ahead);
    walkTo(cmd, bot, s.x, s.z);
    if (usableExitAt(world, bot)) cmd.pickup = true;
    return cmd;
  }
  if (waitingInExit(world, me)) { walkTo(cmd, bot, me.pos.x, me.pos.z, 0.3); return cmd; }

  const foes = world.actors.filter((a) => a.ai && alive(a) && !a.entering && a.kind !== 'boss' && a.state !== 'knockback' && a.grabbedBy !== bot.id && !a.invulnerable);
  const t = foes.sort((a, b) => Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z) - Math.hypot(b.pos.x - bot.pos.x, b.pos.z - bot.pos.z))[0];
  if (!t) {
    // nobody to fight: keep 1.2-1.8 H from the partner
    const d = me.pos.x - bot.pos.x;
    if (Math.abs(d) > 1.8 || Math.abs(d) < 1.2) cmd.moveX = Math.sign(d || 1) * (Math.abs(d) < 1.2 ? -1 : 1);
    if (Math.abs(me.pos.z - bot.pos.z) > 0.4) cmd.moveZ = Math.sign(me.pos.z - bot.pos.z);
    return cmd;
  }
  const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
  const head = project(t.pos.x, t.pos.y + 0.79, t.pos.z);
  cmd.aim = head;
  const gun = bot.hands.findIndex((h) => !!h && isWeapon(h.item) && h.ammo > 0);
  if (gun >= 0) {
    // shoot from where it stands, at the head, every 0.5 s
    if (state.wait <= 0 && bot.state === 'free') {
      const press: [boolean, boolean] = [gun === 0, gun === 1];
      cmd.press = press;
      cmd.hold = press;
      state.wait = 0.5;
    }
    if (Math.abs(dx) < 1.5) cmd.moveX = -Math.sign(dx);
    return cmd;
  }
  // fists: walk up, jab to stun, heavy on a stunned (or juggled, or held) one
  const held = t.grabbedBy === me.id;
  if (Math.abs(dx) > 0.5 || held) cmd.moveX = held ? Math.sign(dx - Math.sign(dx || 1) * 0.5) : Math.sign(dx);
  if (Math.abs(dz) > 0.1) cmd.moveZ = Math.sign(dz);
  if (Math.abs(dx) < 0.65 && Math.abs(dz) < 0.25 && bot.state === 'free' && state.wait <= 0) {
    const juggled = !!t.flight?.juggle && t.flight.phase === 'air';
    cmd.attack = t.state === 'stun' || juggled ? 'heavy' : 'light';
    state.wait = 0.3;
  }
  return cmd;
}
