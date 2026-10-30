// Sound ids -> source, variants, bus, voice limit (design/audio-direction.md). Sounds with
// `files` play CC0 recordings from assets/audio/ (logged in assets/audio/LICENSES.md); the
// rest, and every sound until its files are decoded, use the generated recipe (src/audio/synth.ts).
import type { Recipe } from '../audio/synth';

export type Bus = 'music' | 'weapons' | 'impacts' | 'foley' | 'voices' | 'world' | 'ui';

export interface SoundDef {
  recipe: Recipe;
  bus: Bus;
  /** 3-6 variants for frequent sounds (spec). */
  variants: number;
  /** Max simultaneous voices of this sound: 4 by default, casings 6, footsteps 3 (spec). */
  limit: number;
  /** Linear gain. */
  gain: number;
  /** Share sent to the room reverb (weapon tails and impacts go through it). */
  reverb: number;
  loop?: boolean;
  /** Recorded variants in assets/audio/ (replace the recipe once decoded). */
  files?: string[];
}

/** `kenney/<prefix><index>.ogg` for each index. */
const kenney = (prefix: string, ids: (string | number)[]) => ids.map((i) => `kenney/${prefix}${i}.ogg`);
const FIVE = ['000', '001', '002', '003', '004'];
/** `gunshots/<name>_<n>.wav` for n = 1..count. */
const shots = (name: string, count: number) => Array.from({ length: count }, (_, i) => `gunshots/${name}_${i + 1}.wav`);

const def = (recipe: Recipe, bus: Bus, gain = 1, o: Partial<SoundDef> = {}): SoundDef => ({ recipe, bus, variants: 4, limit: 4, gain, reverb: 0.15, ...o });

export const SOUNDS = {
  stepDirt: def('stepDirt', 'foley', 0.45, { variants: 5, limit: 3, reverb: 0, files: kenney('footstep_grass_', FIVE) }),
  stepConcrete: def('stepConcrete', 'foley', 0.45, { variants: 5, limit: 3, reverb: 0.1, files: kenney('footstep_concrete_', FIVE) }),
  land: def('land', 'foley', 0.7, { variants: 5, files: kenney('impactSoft_medium_', FIVE) }),
  dive: def('dive', 'foley', 0.8, { variants: 3 }),
  cloth: def('cloth', 'foley', 0.6, { files: kenney('cloth', [1, 2, 3, 4]) }),
  grab: def('cloth', 'foley', 0.9, { files: kenney('cloth', [1, 2, 3, 4]) }),
  whooshLight: def('whooshLight', 'foley', 0.6, { variants: 5, reverb: 0 }),
  whooshHeavy: def('whooshHeavy', 'foley', 0.8, { variants: 4, reverb: 0 }),
  whooshThrow: def('whooshThrow', 'foley', 0.9, { variants: 3, reverb: 0 }),
  impact: def('impact', 'impacts', 1, { variants: 5, reverb: 0.25, files: kenney('impactPunch_medium_', FIVE) }),
  /** Heavy hits: a heavier punch recording, plus the generated bone crack layer. */
  impactHeavy: def('impact', 'impacts', 1, { variants: 5, reverb: 0.25, files: kenney('impactPunch_heavy_', FIVE) }),
  crack: def('crack', 'impacts', 0.6, { variants: 4 }),
  thump: def('thump', 'impacts', 0.9),
  bodyFall: def('bodyFall', 'impacts', 0.9, { variants: 5, reverb: 0.25, files: kenney('impactSoft_heavy_', FIVE) }),
  wall: def('wall', 'impacts', 1, { variants: 5, reverb: 0.35, files: kenney('impactWood_heavy_', FIVE) }),
  door: def('door', 'world', 0.8, { variants: 2, reverb: 0.3, files: kenney('doorOpen_', [1, 2]) }),
  voxEffort: def('voxEffort', 'voices', 0.5, { variants: 5, limit: 2 }),
  voxHurt: def('voxHurt', 'voices', 0.6, { variants: 5, limit: 2 }),
  voxDeath: def('voxDeath', 'voices', 0.7, { variants: 5, limit: 3 }),
  tick: def('tick', 'ui', 0.6, { variants: 3, limit: 4, reverb: 0, files: kenney('tick_', ['001', '002', '004']) }),
  heal: def('heal', 'ui', 0.6, { variants: 4, reverb: 0, files: kenney('confirmation_', ['001', '002', '003', '004']) }),
  tapeStop: def('tapeStop', 'ui', 0.8, { variants: 1, limit: 1, reverb: 0 }),
  // guns (M5): range recordings (CC-BY 3.0, see LICENSES.md) cut into single shots by
  // tools/audio/slice-gunshots.mjs; the suppressed shot and the slide rack stay generated
  shotPistol: def('gunPistol', 'weapons', 0.9, { variants: 5, reverb: 0.35, files: shots('cz', 5) }),
  shotDeagle: def('gunHeavy', 'weapons', 1, { variants: 4, reverb: 0.45, files: shots('mosin', 4) }),
  shotSmg: def('gunSmg', 'weapons', 0.6, { variants: 5, limit: 3, reverb: 0.25, files: shots('cz', 5) }),
  shotRifle: def('gunRifle', 'weapons', 0.85, { variants: 5, limit: 3, reverb: 0.35, files: shots('sks', 5) }),
  shotMg: def('gunRifle', 'weapons', 0.8, { variants: 5, limit: 3, reverb: 0.35, files: shots('sks', 5) }),
  /** M14b VIS-13: 1 -> 0.7, its RMS sat 6-7 dB over every other gun (invented). */
  shotShotgun: def('gunShotgun', 'weapons', 0.7, { variants: 1, reverb: 0.5, files: shots('shotty', 1) }),
  shotSuppressed: def('gunSuppressed', 'weapons', 0.7, { variants: 4, reverb: 0.1 }),
  dryFire: def('tick', 'weapons', 0.7, { variants: 1, reverb: 0, files: ['kenney/metalClick.ogg'] }),
  magOut: def('tick', 'foley', 0.6, { variants: 1, reverb: 0.05, files: ['kenney/metalLatch.ogg'] }),
  slideRack: def('slideRack', 'foley', 0.7, { variants: 3, reverb: 0.05 }),
  /** Casings: 6 voices at most (spec). */
  casing: def('tick', 'weapons', 0.25, { variants: 5, limit: 6, reverb: 0, files: kenney('impactMetal_light_', FIVE) }),
  hitMetal: def('impact', 'impacts', 0.5, { variants: 5, reverb: 0.2, files: kenney('impactMetal_medium_', FIVE) }),
  hitWood: def('impact', 'impacts', 0.6, { variants: 5, reverb: 0.2, files: kenney('impactWood_light_', FIVE) }),
  /** M14b VIS-13: outdoor bullet hits on the floor (was the grass footstep, near silent). invented */
  hitDirt: def('hitDirt', 'impacts', 0.9, { variants: 4, reverb: 0.05 }),
  hitConcrete: def('impact', 'impacts', 0.5, { variants: 5, reverb: 0.2, files: kenney('impactMining_', FIVE) }),
  // M6: throwing, explosives, melee weapons (generated, src/audio/synth.ts)
  explosion: def('explosion', 'impacts', 1, { variants: 3, limit: 3, reverb: 0.5 }),
  slash: def('slash', 'impacts', 0.9, { variants: 4, reverb: 0.2 }),
  knifeFlesh: def('thunk', 'impacts', 0.9, { variants: 4, reverb: 0.15 }),
  knifeWall: def('twang', 'impacts', 0.8, { variants: 3, reverb: 0.25 }),
  pullOut: def('squelch', 'foley', 0.7, { variants: 3, reverb: 0.05 }),
  pin: def('ping', 'weapons', 0.6, { variants: 3, reverb: 0.1 }),
  bounce: def('clink', 'foley', 0.6, { variants: 4, reverb: 0.15 }),
  fuse: def('hiss', 'weapons', 0.35, { variants: 2, limit: 2, reverb: 0 }),
  catchSlap: def('slap', 'foley', 0.8, { variants: 3, reverb: 0.05 }),
  clang: def('clang', 'impacts', 0.7, { variants: 3, reverb: 0.3 }),
  // M7: armed enemies, stealth, zombies (generated)
  telegraph: def('telegraph', 'weapons', 0.7, { variants: 2, limit: 3, reverb: 0 }),
  /** M14b VIS-13: 0.6 -> 1.0, a gameplay telegraph was the quietest UI cue (invented). */
  alert: def('alert', 'ui', 1.0, { variants: 1, limit: 2, reverb: 0 }),
  wireStrain: def('strain', 'foley', 0.7, { variants: 2, limit: 1, reverb: 0.05 }),
  moan: def('moan', 'voices', 0.5, { variants: 4, limit: 3, reverb: 0.3 }),
  woodCrash: def('woodCrash', 'impacts', 0.9, { variants: 2, limit: 2, reverb: 0.3 }),
  whistle: def('whistle', 'voices', 0.5, { variants: 1, limit: 1, reverb: 0.2 }),
  // M8: the stage-1 boss (generated)
  crackle: def('crackle', 'weapons', 0.8, { variants: 3, limit: 2, reverb: 0.2 }),
  thunder: def('thunder', 'impacts', 1, { variants: 3, limit: 2, reverb: 0.5 }),
  rumble: def('rumble', 'world', 0.8, { variants: 1, limit: 1, reverb: 0.4 }),
  wardHum: def('wardHum', 'weapons', 0.6, { variants: 2, limit: 2, reverb: 0.3 }),
  ricochet: def('ricochet', 'impacts', 0.55, { variants: 4, limit: 3, reverb: 0.2 }),
  // M14 (generated): the rifle's selector flipping, the agent's forearm block, a parry's bright ring,
  // a hollow step on stairs, a body sliding down them
  selector: def('slideRack', 'weapons', 0.45, { variants: 2, limit: 1, reverb: 0 }),
  /** M14b VIS-13: 0.75 -> 0.45, a blocked jab sounded bigger than a landed heavy (invented). */
  block: def('thump', 'impacts', 0.45, { variants: 3, reverb: 0.1 }),
  parry: def('ping', 'impacts', 0.8, { variants: 2, limit: 2, reverb: 0.3 }),
  stairStep: def('thunk', 'foley', 0.4, { variants: 4, limit: 3, reverb: 0.15 }),
  stairSlide: def('bodyFall', 'foley', 0.6, { variants: 2, limit: 2, reverb: 0.2 }),
  cannonBoom: def('cannonBoom', 'weapons', 1, { variants: 3, limit: 2, reverb: 0.5 }),
  fallWhistle: def('fallWhistle', 'world', 0.6, { variants: 1, limit: 1, reverb: 0.2 }),
  heavyLand: def('heavyLand', 'impacts', 1, { variants: 2, limit: 1, reverb: 0.5 }),
  telekinesis: def('telekinesis', 'weapons', 0.8, { variants: 2, limit: 1, reverb: 0.3 }),
  // M12: the last stand, the vending machine, the teleport (generated)
  heartbeat: def('heartbeatLoop', 'music', 0.9, { variants: 1, limit: 1, reverb: 0.1, loop: true }),
  glass: def('glass', 'impacts', 0.8, { variants: 2, limit: 2, reverb: 0.3 }),
  implode: def('implode', 'weapons', 0.8, { variants: 1, limit: 1, reverb: 0.3 }),
  // M11: improbability, the jetpack (generated)
  boing: def('boing', 'impacts', 0.6, { variants: 4, limit: 3, reverb: 0.2 }),
  burner: def('burnerLoop', 'weapons', 0.5, { variants: 1, limit: 1, reverb: 0.1, loop: true }),
  // M10: the elevator, the welder, the ending (generated)
  motor: def('motorLoop', 'world', 0.45, { variants: 1, limit: 1, reverb: 0.1, loop: true }),
  cutter: def('cutterLoop', 'weapons', 0.5, { variants: 1, limit: 1, reverb: 0.1, loop: true }),
  ding: def('ding', 'world', 0.6, { variants: 1, limit: 1, reverb: 0.3 }),
  cableSnap: def('cableSnap', 'impacts', 1, { variants: 2, limit: 1, reverb: 0.4 }),
  stinger: def('stinger', 'music', 1, { variants: 1, limit: 1, reverb: 0.4 }),
  // M9: stage 2 (generated)
  ambCity: def('cityLoop', 'world', 0.3, { variants: 1, limit: 1, reverb: 0, loop: true }),
  wipe: def('wipe', 'ui', 0.5, { variants: 1, limit: 1, reverb: 0 }),
  rungs: def('rungs', 'foley', 0.6, { variants: 2, limit: 2, reverb: 0.1 }),
  /** Outdoor wind bed: turned down ~8 dB (user: the rain-like hiss was too loud, 2026-10-26). */
  ambWind: def('windLoop', 'world', 0.2, { variants: 1, limit: 1, reverb: 0, loop: true }),
  /** Indoor room tone: turned down ~4 dB with the wind. */
  ambRoom: def('roomToneLoop', 'world', 0.3, { variants: 1, limit: 1, reverb: 0, loop: true }),
  // M14b slice D (VIS-08, ENC-03/CMB-15): generated recipes, no files
  /** A hit that did nothing (mercy window, get-up, shield): a soft, dry thud. invented */
  absorb: def('thump', 'impacts', 0.4, { variants: 3, limit: 2, reverb: 0.05 }),
  /** Co-op: a teammate is down (under the hurt voice); low and short so it reads over a fight. invented */
  downCue: def('ding', 'ui', 0.5, { variants: 1, limit: 1, reverb: 0.2 }),
  /** Extreme gore: a hand coming off. invented */
  dismember: def('squelch', 'impacts', 0.8, { variants: 3, limit: 2, reverb: 0.1 }),
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

/** Bus levels (linear) before the user's volume settings. */
export const BUS_GAIN: Record<Bus, number> = { music: 0.8, weapons: 1, impacts: 1, foley: 0.8, voices: 0.8, world: 0.6, ui: 0.6 };

export const AUDIO = {
  /** Variation: random pitch +-4%, volume +-2 dB. */
  pitchJitter: 0.04,
  gainJitterDb: 2,
  /** Pan by screen x (+-0.8), -3 dB from the front to the back wall. */
  panRange: 0.8,
  depthDb: -3,
  /** Ducking: music -4 dB under explosions, boss attacks and kill cams, 300 ms release. */
  duckDb: -4,
  duckRelease: 0.3,
  /** Kill cam / slow-mo: low-pass ~1.2 kHz + playback rate 0.6. */
  killCamLowpass: 1200,
  killCamRate: 0.6,
  /** Room reverb size classes: impulse length (s) and wet level. Outdoor is nearly dry. */
  reverb: {
    small: { length: 0.5, wet: 0.25 },
    medium: { length: 0.9, wet: 0.3 },
    large: { length: 1.8, wet: 0.35 },
    outdoor: { length: 0.25, wet: 0.08 },
  },
} as const;

export type ReverbSize = keyof typeof AUDIO.reverb;
