// Placeholder sound effects generated in code (no downloaded files yet; CC0 packs replace
// them once the user approves the downloads, see assets/audio/LICENSES.md). Each recipe
// renders a mono Float32Array; variants differ by seed. Layering follows the recipes in
// design/audio-direction.md (punch = whoosh + flesh impact + low thump, etc.).

export type Recipe =
  | 'whooshLight' | 'whooshHeavy' | 'whooshThrow' | 'impact' | 'crack' | 'thump' | 'bodyFall' | 'wall'
  | 'stepDirt' | 'stepConcrete' | 'land' | 'cloth' | 'dive' | 'door' | 'tick' | 'heal'
  | 'voxEffort' | 'voxHurt' | 'voxDeath' | 'tapeStop' | 'windLoop' | 'roomToneLoop'
  | 'gunPistol' | 'gunHeavy' | 'gunSmg' | 'gunRifle' | 'gunShotgun' | 'gunSuppressed' | 'slideRack'
  // M6
  | 'explosion' | 'slash' | 'thunk' | 'twang' | 'squelch' | 'ping' | 'clink' | 'slap' | 'clang' | 'hiss';

/** Seeded RNG (mulberry32) so variants are stable between runs. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Buf {
  readonly d: Float32Array;
  constructor(readonly sr: number, seconds: number) {
    this.d = new Float32Array(Math.max(1, Math.round(sr * seconds)));
  }
  get n(): number { return this.d.length; }
}

/** White noise through a one-pole low-pass whose cutoff follows `cut(t)` (Hz), shaped by `env(t)`. */
function noise(b: Buf, r: () => number, cut: (t: number) => number, env: (t: number) => number, gain = 1, hp = 0): void {
  let lp = 0, hpState = 0, prev = 0, k = 0, e = 0;
  const a = Math.exp((-2 * Math.PI * hp) / b.sr);
  for (let i = 0; i < b.n; i++) {
    // cutoff and envelope move slowly: update them every 32 samples (keeps rendering fast)
    if ((i & 31) === 0) {
      const t = i / b.sr;
      k = 1 - Math.exp((-2 * Math.PI * cut(t)) / b.sr);
      e = env(t);
    }
    lp += k * (r() * 2 - 1 - lp);
    let s = lp;
    if (hp > 0) {
      hpState = a * (hpState + s - prev);
      prev = s;
      s = hpState;
    }
    b.d[i] += s * e * gain;
  }
}

/** Sine with a frequency sweep f(t), shaped by env(t). */
function tone(b: Buf, f: (t: number) => number, env: (t: number) => number, gain = 1, shape: 'sine' | 'saw' = 'sine'): void {
  let ph = 0;
  for (let i = 0; i < b.n; i++) {
    const t = i / b.sr;
    ph += f(t) / b.sr;
    const x = shape === 'sine' ? Math.sin(2 * Math.PI * ph) : 2 * (ph - Math.floor(ph + 0.5));
    b.d[i] += x * env(t) * gain;
  }
}

/** Two-pole resonant band-pass (vowel formants for the vocalisations). */
function bandpass(src: Float32Array, sr: number, f: number, q: number): Float32Array {
  const w = (2 * Math.PI * f) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  const out = new Float32Array(src.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i], y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

/** Attack/decay envelope: linear rise over `a` s, exponential fall with time constant `d`. */
const ad = (a: number, d: number) => (t: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** Swell: rises to `peak` s, then falls off by `len`. */
const swell = (peak: number, len: number) => (t: number) => (t < peak ? Math.sin((t / peak) * Math.PI * 0.5) ** 2 : Math.max(0, 1 - (t - peak) / (len - peak)) ** 2);

/** Peak-normalise to `peak` (the spec's -1 dBTP is applied by the master limiter). */
function normalise(d: Float32Array, peak = 0.89): Float32Array {
  let m = 0;
  for (const s of d) m = Math.max(m, Math.abs(s));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

/** Fade the ends of a loop into each other so it repeats without a click. */
function loopable(d: Float32Array, sr: number, fade = 0.5): Float32Array {
  const n = Math.min(Math.floor(sr * fade), Math.floor(d.length / 2));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    d[i] = d[i] * k + d[d.length - n + i] * (1 - k);
  }
  return d.slice(0, d.length - n);
}

export function render(recipe: Recipe, sr: number, seed: number): Float32Array {
  const r = rng(seed * 7919 + recipe.length * 131);
  const jitter = (x: number, amt = 0.15) => x * (1 + (r() * 2 - 1) * amt);
  switch (recipe) {
    case 'whooshLight': case 'whooshHeavy': case 'whooshThrow': {
      const len = recipe === 'whooshLight' ? 0.14 : recipe === 'whooshHeavy' ? 0.22 : 0.34;
      const b = new Buf(sr, len), peak = len * 0.55, hi = jitter(recipe === 'whooshThrow' ? 1800 : 2600);
      noise(b, r, (t) => 300 + hi * Math.sin((Math.min(t, len) / len) * Math.PI), swell(peak, len), 1, 150);
      return normalise(b.d, recipe === 'whooshLight' ? 0.35 : 0.6);
    }
    case 'impact': {
      // flesh slap + low thump (<= 120 Hz)
      const b = new Buf(sr, 0.22);
      noise(b, r, () => jitter(1700), ad(0.002, 0.03), 1);
      tone(b, (t) => jitter(115, 0.1) * Math.exp(-t * 9) + 45, ad(0.003, 0.07), 1.1);
      return normalise(b.d);
    }
    case 'crack': {
      // bone crack layer for heavy hits: bright clicks
      const b = new Buf(sr, 0.12);
      for (let k = 0; k < 3; k++) {
        const t0 = k * jitter(0.012, 0.4);
        noise(b, r, () => 6000, (t) => (t < t0 ? 0 : Math.exp(-(t - t0) / 0.006)), 1 - k * 0.25, 1200);
      }
      return normalise(b.d, 0.7);
    }
    case 'thump': case 'land': {
      const b = new Buf(sr, 0.25);
      tone(b, (t) => jitter(90, 0.1) * Math.exp(-t * 6) + 35, ad(0.004, 0.08), 1);
      noise(b, r, () => 500, ad(0.002, 0.04), recipe === 'land' ? 0.5 : 0.3);
      return normalise(b.d, recipe === 'land' ? 0.55 : 0.8);
    }
    case 'bodyFall': {
      // thud + cloth + small debris
      const b = new Buf(sr, 0.45);
      tone(b, (t) => jitter(75, 0.1) * Math.exp(-t * 5) + 32, ad(0.005, 0.12), 1);
      noise(b, r, () => 900, swell(0.03, 0.3), 0.35, 200);
      for (let k = 0; k < 4; k++) {
        const t0 = 0.05 + r() * 0.25;
        noise(b, r, () => 4000, (t) => (t < t0 ? 0 : Math.exp(-(t - t0) / 0.008)), 0.15, 1500);
      }
      return normalise(b.d);
    }
    case 'wall': {
      // heavy thud + wall rattle
      const b = new Buf(sr, 0.5);
      tone(b, (t) => 60 * Math.exp(-t * 4) + 30, ad(0.003, 0.15), 1);
      noise(b, r, () => 2200, (t) => Math.exp(-t / 0.12) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 38)), 0.45, 300);
      return normalise(b.d);
    }
    case 'stepDirt': case 'stepConcrete': {
      const b = new Buf(sr, 0.09);
      const dirt = recipe === 'stepDirt';
      noise(b, r, () => jitter(dirt ? 900 : 2500), ad(0.002, dirt ? 0.025 : 0.012), 1, dirt ? 80 : 400);
      tone(b, () => jitter(dirt ? 70 : 110, 0.1), ad(0.002, 0.02), 0.4);
      return normalise(b.d, 0.3);
    }
    case 'cloth': case 'dive': {
      const len = recipe === 'dive' ? 0.3 : 0.16;
      const b = new Buf(sr, len);
      noise(b, r, (t) => 1200 + 800 * Math.sin(t * 60), swell(len * 0.3, len), 0.6, 300);
      if (recipe === 'dive') tone(b, (t) => 70 * Math.exp(-t * 4) + 30, (t) => (t < 0.15 ? 0 : Math.exp(-(t - 0.15) / 0.06)), 0.8);
      return normalise(b.d, 0.45);
    }
    case 'door': {
      // creak (buzzy low tone with wobble) + latch click
      const b = new Buf(sr, 0.45);
      const base = jitter(140, 0.1);
      tone(b, (t) => base - 40 * t + 8 * Math.sin(t * 45), swell(0.12, 0.42), 1, 'saw');
      b.d.set(bandpass(b.d, sr, 900, 3).map((s) => s * 0.8));
      noise(b, r, () => 5000, (t) => Math.exp(-t / 0.004), 0.6, 1500);
      return normalise(b.d, 0.5);
    }
    case 'tick': case 'heal': {
      const b = new Buf(sr, recipe === 'tick' ? 0.05 : 0.18);
      if (recipe === 'tick') tone(b, () => 1900, ad(0.001, 0.012), 1);
      else tone(b, (t) => 700 + 2600 * t, ad(0.005, 0.07), 1);
      return normalise(b.d, recipe === 'tick' ? 0.3 : 0.35);
    }
    case 'voxEffort': case 'voxHurt': case 'voxDeath': {
      // non-verbal: a buzzy glottal source through two vowel formants, pitched per variant
      const len = recipe === 'voxEffort' ? 0.16 : recipe === 'voxHurt' ? 0.22 : 0.55;
      const src = new Buf(sr, len), f0 = jitter(recipe === 'voxDeath' ? 120 : 150, 0.2);
      const glide = recipe === 'voxDeath' ? (t: number) => f0 * (1 - 0.45 * (t / len)) : recipe === 'voxHurt' ? (t: number) => f0 * (1.25 - 0.4 * (t / len)) : () => f0;
      tone(src, glide, recipe === 'voxDeath' ? swell(0.05, len) : swell(0.02, len), 1, 'saw');
      noise(src, r, () => 3000, swell(0.02, len), recipe === 'voxDeath' ? 0.5 : 0.25, 500);
      const f1 = jitter(520, 0.12), f2 = jitter(1150, 0.12);
      const a = bandpass(src.d, sr, f1, 4), c = bandpass(src.d, sr, f2, 6);
      for (let i = 0; i < src.n; i++) src.d[i] = a[i] + 0.6 * c[i];
      return normalise(src.d, recipe === 'voxDeath' ? 0.45 : 0.4);
    }
    case 'gunPistol': case 'gunHeavy': case 'gunSmg': case 'gunRifle': case 'gunShotgun': {
      // design/audio-direction.md: mechanical click + transient crack + body (the room reverb adds the tail)
      const P = {
        gunPistol: { len: 0.35, crack: 5200, body: 900, low: 85, bodyGain: 0.9, decay: 0.05 },
        gunHeavy: { len: 0.55, crack: 4200, body: 700, low: 60, bodyGain: 1.2, decay: 0.09 },
        gunSmg: { len: 0.22, crack: 6000, body: 1100, low: 95, bodyGain: 0.7, decay: 0.03 },
        gunRifle: { len: 0.45, crack: 7000, body: 1000, low: 75, bodyGain: 1.0, decay: 0.06 },
        gunShotgun: { len: 0.7, crack: 3800, body: 600, low: 50, bodyGain: 1.5, decay: 0.12 },
      }[recipe];
      const b = new Buf(sr, P.len);
      noise(b, r, () => jitter(P.crack, 0.1), (t) => Math.exp(-t / 0.006), 1, 800); // crack
      noise(b, r, (t) => P.body * Math.exp(-t * 6) + 200, ad(0.002, P.decay), P.bodyGain); // body
      tone(b, (t) => P.low * Math.exp(-t * 5) + 30, ad(0.002, P.decay * 1.4), P.bodyGain * 0.8); // low thump
      noise(b, r, () => 8000, (t) => (t < 0.0015 ? 1 : 0), 0.4, 3000); // mechanical click
      return normalise(b.d, 0.95);
    }
    case 'gunSuppressed': {
      // dull thump + loud mechanical slide
      const b = new Buf(sr, 0.22);
      noise(b, r, () => 900, ad(0.003, 0.025), 0.8, 150);
      tone(b, (t) => 120 * Math.exp(-t * 10) + 40, ad(0.002, 0.03), 0.6);
      for (const t0 of [0.012, 0.05]) noise(b, r, () => 7000, (t) => (t < t0 ? 0 : Math.exp(-(t - t0) / 0.005)), 0.7, 2000);
      return normalise(b.d, 0.7);
    }
    case 'explosion': {
      // design/audio-direction.md: crack + boom + sub tail + debris rain (0.5 s)
      const b = new Buf(sr, 1.6);
      noise(b, r, () => 7000, (t) => Math.exp(-t / 0.012), 1.2, 600); // crack
      noise(b, r, (t) => 1800 * Math.exp(-t * 4) + 120, ad(0.004, 0.35), 1.6); // boom body
      tone(b, (t) => jitter(52, 0.1) * Math.exp(-t * 1.5) + 24, ad(0.005, 0.55), 1.4); // sub tail
      for (let k = 0; k < 14; k++) {
        const t0 = 0.25 + r() * 0.55;
        noise(b, r, () => 3500 + r() * 3000, (t) => (t < t0 ? 0 : Math.exp(-(t - t0) / 0.01)), 0.12 + r() * 0.15, 1500); // debris
      }
      return normalise(b.d, 0.97);
    }
    case 'slash': {
      // blade: fast airy swish into a wet cut
      const b = new Buf(sr, 0.28);
      noise(b, r, (t) => 4500 - 3000 * Math.min(1, t / 0.08), swell(0.04, 0.12), 0.7, 900);
      noise(b, r, () => jitter(1300), (t) => (t < 0.06 ? 0 : Math.exp(-(t - 0.06) / 0.05)), 1, 200);
      tone(b, (t) => 160 * Math.exp(-t * 8) + 60, (t) => (t < 0.06 ? 0 : Math.exp(-(t - 0.06) / 0.05)), 0.6);
      return normalise(b.d, 0.75);
    }
    case 'thunk': case 'twang': {
      // a blade going in: dull knock; in a wall it keeps vibrating (twang)
      const b = new Buf(sr, recipe === 'twang' ? 0.6 : 0.2);
      tone(b, (t) => jitter(150, 0.1) * Math.exp(-t * 10) + 70, ad(0.002, 0.04), 1);
      noise(b, r, () => 1100, ad(0.001, 0.02), 0.8, 300);
      if (recipe === 'twang') tone(b, (t) => jitter(380, 0.1) * (1 + 0.04 * Math.sin(t * 60)), (t) => (t < 0.01 ? 0 : 0.5 * Math.exp(-(t - 0.01) / 0.18)), 0.7, 'saw');
      return normalise(b.d, 0.75);
    }
    case 'squelch': {
      const b = new Buf(sr, 0.3);
      noise(b, r, (t) => 700 + 900 * Math.sin(t * 40) ** 2, swell(0.12, 0.3), 1, 200);
      return normalise(b.d, 0.5);
    }
    case 'ping': {
      // pin pulled: small bright metal ring
      const b = new Buf(sr, 0.25);
      tone(b, () => jitter(2600, 0.05), ad(0.001, 0.07), 0.8);
      tone(b, () => jitter(3900, 0.05), ad(0.001, 0.05), 0.4);
      noise(b, r, () => 8000, ad(0.0005, 0.004), 0.5, 3000);
      return normalise(b.d, 0.45);
    }
    case 'clink': {
      const b = new Buf(sr, 0.16);
      tone(b, () => jitter(1700, 0.1), ad(0.001, 0.03), 0.7);
      tone(b, () => jitter(2500, 0.1), ad(0.001, 0.02), 0.4);
      noise(b, r, () => 3000, ad(0.001, 0.01), 0.6, 600);
      return normalise(b.d, 0.5);
    }
    case 'slap': {
      const b = new Buf(sr, 0.12);
      noise(b, r, () => 3200, ad(0.001, 0.015), 1, 500);
      tone(b, (t) => 280 * Math.exp(-t * 20) + 90, ad(0.001, 0.025), 0.6);
      return normalise(b.d, 0.6);
    }
    case 'clang': {
      // metal on metal (blade clang, the street sign's gong-like hit)
      const b = new Buf(sr, 0.9);
      for (const [f, g, d] of [[520, 1, 0.3], [790, 0.6, 0.22], [1170, 0.4, 0.15], [1740, 0.25, 0.1]] as const) tone(b, () => jitter(f, 0.04), ad(0.001, d), g);
      noise(b, r, () => 6000, ad(0.0005, 0.006), 0.8, 2000);
      return normalise(b.d, 0.6);
    }
    case 'hiss': {
      // the grenade's fuse: a thin hiss (a gameplay cue)
      const b = new Buf(sr, 0.9);
      noise(b, r, () => 9000, (t) => Math.min(1, t / 0.03) * Math.max(0, 1 - t / 0.9), 1, 3500);
      return normalise(b.d, 0.3);
    }
    case 'slideRack': {
      // two metal clacks: back, then forward
      const b = new Buf(sr, 0.25);
      for (const [t0, g] of [[0, 0.8], [0.11, 1]] as const) noise(b, r, () => 6500, (t) => (t < t0 ? 0 : Math.exp(-(t - t0) / 0.008)), g, 1500);
      return normalise(b.d, 0.6);
    }
    case 'tapeStop': {
      const b = new Buf(sr, 0.35);
      noise(b, r, (t) => 3000 * Math.exp(-t * 8) + 150, swell(0.05, 0.35), 0.8, 60);
      tone(b, (t) => 220 * Math.exp(-t * 6), swell(0.03, 0.35), 0.5);
      return normalise(b.d, 0.5);
    }
    case 'windLoop': {
      // outdoor ambience: gusting low wind, 8 s loop
      const b = new Buf(sr, 8.5);
      noise(b, r, (t) => 350 + 250 * Math.sin(t * 0.9) + 120 * Math.sin(t * 2.3), (t) => 0.55 + 0.3 * Math.sin(t * 0.7) + 0.15 * Math.sin(t * 1.9), 1, 40);
      return normalise(loopable(b.d, sr), 0.25);
    }
    case 'roomToneLoop': {
      // indoor ambience: faint air + a low electrical hum, 6 s loop
      const b = new Buf(sr, 6.5);
      noise(b, r, () => 600, () => 1, 0.5, 60);
      tone(b, () => 50, () => 1, 0.25);
      tone(b, () => 100, () => 1, 0.1);
      return normalise(loopable(b.d, sr), 0.15);
    }
  }
}
