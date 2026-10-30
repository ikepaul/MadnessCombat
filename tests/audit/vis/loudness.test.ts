// VIS loudness script (design/audit/vis.md §4, VIS-13): peak / RMS dBFS after def gain x bus gain,
// variant 1 of each sound. Generated recipes are rendered with `synth.render`; recorded WAVs are
// decoded (PCM 16/24 bit) and peak-normalised to 0.89 as the mixer does; OGG recordings are not
// decodable here and are listed as such (the audit measured them in the browser).
// Opt-in: `AUDIT=1 npx vitest run tests/audit/vis/loudness --silent=false`.
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { render } from '../../../src/audio/synth';
import { BUS_GAIN, type SoundDef, type SoundId, SOUNDS } from '../../../src/data/audio';

const SR = 48000;
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function wav(path: string): Float32Array {
  const b = readFileSync(path);
  let o = 12, fmt = { ch: 1, bits: 16 }, data: Buffer | undefined;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + n);
    o += 8 + n + (n & 1);
  }
  if (!data) throw new Error(`no data chunk in ${path}`);
  const bps = fmt.bits / 8, frames = Math.floor(data.length / (bps * fmt.ch));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const p = i * bps * fmt.ch;
    out[i] = fmt.bits === 24 ? (data.readIntLE(p, 3) / 8388608) : fmt.bits === 32 ? data.readFloatLE(p) : data.readInt16LE(p) / 32768;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.89 / peak;
  return out;
}

export function loudness(id: SoundId): { peak: number; rms: number; len: number; src: string } | undefined {
  const def = SOUNDS[id] as SoundDef;
  let d: Float32Array, src = 'recipe';
  const f = def.files?.[0];
  if (f?.endsWith('.wav')) { d = wav(`assets/audio/${f}`); src = 'wav'; }
  else if (f) return undefined;
  else d = render(def.recipe, SR, 1);
  const g = def.gain * BUS_GAIN[def.bus];
  let peak = 0, sum = 0;
  for (const v of d) { peak = Math.max(peak, Math.abs(v * g)); sum += (v * g) ** 2; }
  return { peak: db(peak), rms: db(Math.sqrt(sum / d.length)), len: d.length / SR, src };
}

describe.skipIf(!process.env.AUDIT)('VIS loudness', () => {
  it('every sound id: peak / RMS after def x bus gain', () => {
    const rows = ['| id | bus | src | peak dB | RMS dB | len s |', '|---|---|---|---|---|---|'];
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      const def = SOUNDS[id] as SoundDef;
      if (def.loop) continue;
      const r = loudness(id);
      rows.push(r ? `| ${id} | ${def.bus} | ${r.src} | ${r.peak.toFixed(1)} | ${r.rms.toFixed(1)} | ${r.len.toFixed(2)} |` : `| ${id} | ${def.bus} | ogg (browser only) | | | |`);
    }
    console.log(rows.join('\n'));
  });
});
