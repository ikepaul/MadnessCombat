// One palette per stage (design/art-direction.md). Red is reserved for blood and aim
// telegraphs, green for zombies.

export const INK = '#141416';
export const BLOOD = '#c70f1b';
export const BLOOD_DARK = '#860812';
export const ZOMBIE = '#63d06b';
export const ZOMBIE_HI = '#a6f0aa';
export const FLASH_GLOW = '255,236,200';

export interface Palette {
  ceil: string; back: string; sideL: string; sideR: string; floor: string; board: string;
  suit: string; suitShade: string; hero: string; heroShade: string; skin: string; skinHi: string;
  hand: string; shoe: string; prop: string; propShade: string; door: string;
}

export type PaletteId = 'neutral' | 'cool' | 'warm';

export const PALETTES: Record<PaletteId, Palette> = {
  neutral: {
    ceil: '#86878b', back: '#a9aaae', sideL: '#9d9ea2', sideR: '#98999d', floor: '#8f9094', board: '#c2c3c6',
    suit: '#8e8f94', suitShade: '#707176', hero: '#36373c', heroShade: '#25262a', skin: '#d2d2d5', skinHi: '#f1f1f2',
    hand: '#e6e6e8', shoe: '#4a4b50', prop: '#c3c4c8', propShade: '#8b8c91', door: '#d8d9dc',
  },
  cool: {
    ceil: '#7c838e', back: '#a1a8b3', sideL: '#949ba6', sideR: '#8f96a1', floor: '#858c97', board: '#bcc2cb',
    suit: '#878e99', suitShade: '#68707b', hero: '#2f343c', heroShade: '#1f232a', skin: '#ced3da', skinHi: '#eff2f6',
    hand: '#e2e6eb', shoe: '#454b54', prop: '#bcc2cb', propShade: '#838a95', door: '#d3d8df',
  },
  warm: {
    ceil: '#8b8780', back: '#afa9a0', sideL: '#a39d94', sideR: '#9e988f', floor: '#948e85', board: '#c9c2b8',
    suit: '#938d84', suitShade: '#756f67', hero: '#3d3934', heroShade: '#2b2824', skin: '#d6d1ca', skinHi: '#f4f0ea',
    hand: '#e8e4dd', shoe: '#4f4a44', prop: '#c9c3b9', propShade: '#908a81', door: '#dcd7cf',
  },
};

/** Stage -> palette (decided: stage 1 neutral, stage 2 cool, stage 3 warm). */
export const STAGE_PALETTE: Record<1 | 2 | 3, PaletteId> = { 1: 'neutral', 2: 'cool', 3: 'warm' };
