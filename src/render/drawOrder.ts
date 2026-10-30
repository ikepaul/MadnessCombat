// Depth sort key for actors (the draw list in GameScene sorts far -> near, larger z first).
// At equal depth the attacker draws in front, so the punching fist is visible; a grabbed body
// behind its holder; M14b VIS-17: players in front of everyone else at their own depth (but behind
// an attacking grunt's fist), so the hero never vanishes into a row of grunts on the spawn lane.
import { FEEL } from '../data/feel';
import type { Actor } from '../sim/actor';

export function actorDrawZ(a: Actor): number {
  const bias = a.state === 'attack' ? 0.002 : a.state === 'grabbed' ? -0.001 : 0;
  const player = a.kind === 'hero' && a.state !== 'grabbed' ? FEEL.drawOrder.playerBias : 0;
  return a.pos.z - bias - player;
}
