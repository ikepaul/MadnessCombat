// Stage 1 (research/stages.md): one outdoor arena. Our own design: open flat ground under a
// pale sky with a single leaning utility pole as the landmark (not the episode's tree).
// Enemies walk in from both screen edges.
import type { RoomDef } from '../../sim/room';
import type { RoomScript, WaveEntry } from '../../sim/waves';

export const ARENA: RoomDef = {
  id: 'stage1-arena',
  outdoor: true,
  // the walkable ground spans the screen at the front edge (x = +-3.6 H at z = 8)
  halfWidth: 3.5,
  height: 3.8,
  zFront: 8,
  zBack: 10.67,
  doors: [],
  props: [{ kind: 'pole', x0: 1.84, x1: 1.98, z0: 10.15, z1: 10.29, top: 4.2, lean: 0.06 }],
  lamps: [],
  vents: [],
  boards: [],
};

/** Edge entries at three depths on each side. */
const SPAWNS: RoomScript['spawns'] = [
  { id: 'L-front', kind: 'edge', side: -1, z: 8.4 },
  { id: 'L-mid', kind: 'edge', side: -1, z: 9.3 },
  { id: 'L-back', kind: 'edge', side: -1, z: 10.2 },
  { id: 'R-front', kind: 'edge', side: 1, z: 8.4 },
  { id: 'R-mid', kind: 'edge', side: 1, z: 9.3 },
  { id: 'R-back', kind: 'edge', side: 1, z: 10.2 },
];

/**
 * Wave A, the unarmed riot (research/stages.md beat 2, ep1 0:21-0:44): ~18 unarmed grunts
 * trickling in from both edges, 1-2 at a time. Delays are invented within enemy-spawning's
 * 0.5-1.5 s; pairs arrive together from opposite sides now and then.
 */
function waveA(count: number): WaveEntry[] {
  const order = ['L-mid', 'R-mid', 'R-front', 'L-back', 'L-front', 'R-back'];
  const delays = [1.0, 0.6, 1.4, 0.5, 1.2, 0.8];
  return Array.from({ length: count }, (_, i) => [i === 0 ? 1.0 : delays[i % delays.length], order[i % order.length], 'grunt', null] as WaveEntry);
}

export const STAGE1 = {
  stage: 1 as const,
  /** Episode 1's body count: the end card's target (world-kill-counter). */
  targetBodyCount: 32,
  rooms: {
    arena: {
      room: ARENA,
      script: {
        spawns: SPAWNS,
        // maxAlive 4: at most 2 fight (attack tokens), 2 more wait on the ring
        // co-op: 27 grunts (the episode's whole grunt budget), 6 alive at once. invented
        waves: [{ id: 'A', threshold: 0, maxAlive: 4, entries: waveA(18), coop: { maxAlive: 6, entries: waveA(27) } }],
      } satisfies RoomScript,
    },
  },
};

export type StageRoomId = keyof typeof STAGE1.rooms;
