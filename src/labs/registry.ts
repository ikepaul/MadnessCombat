import clips from '../../research/clips.json';
import type { World } from '../sim/world';

/**
 * Replica labs: `/?lab=<slug>` loads a small scene recreating a reference clip
 * (research/mechanics/<slug>/). Milestones register their labs here.
 */
export interface Lab {
  slug: string;
  title: string;
  /** Populate the world (room, actors) for this lab. */
  setup(world: World): void;
  /** Called after every world tick (respawning dummies, healing the player...). */
  step?(world: World): void;
  /** Extra live readout for the lab bar. */
  info?(world: World): string;
  /** Tool labs with their own Phaser scene instead of a world (pose editor). */
  scene?: string;
}

const labs = new Map<string, Lab>();

export function registerLab(lab: Lab): void {
  labs.set(lab.slug, lab);
}

export function getLab(slug: string): Lab | undefined {
  return labs.get(slug);
}

/** Every lab slug the plan expects: the catalogued mechanics plus tool labs. */
export function allLabSlugs(): string[] {
  return [...Object.keys(clips.mechanics), 'pose-editor'];
}
