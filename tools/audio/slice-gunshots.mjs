// Cut single gunshots out of a long range recording (16-bit PCM WAV) into short mono WAVs:
// detect each shot's onset, keep `length` seconds from just before it, fade the tail out,
// peak-normalise. No dependencies (this machine has no ffmpeg/sox).
//
//   node tools/audio/slice-gunshots.mjs <in.wav> <out-prefix> [maxShots] [length]
//
// Used for assets/audio/gunshots/ (see assets/audio/LICENSES.md).
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPrefix, maxShotsArg = '6', lengthArg = '0.6'] = process.argv.slice(2);
if (!inPath || !outPrefix) {
  console.error('usage: node tools/audio/slice-gunshots.mjs <in.wav> <out-prefix> [maxShots] [length]');
  process.exit(1);
}
const maxShots = Number(maxShotsArg), length = Number(lengthArg);

function readWav(path) {
  const b = readFileSync(path);
  const channels = b.readUInt16LE(22), rate = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  if (bits !== 16) throw new Error(`${path}: only 16-bit PCM is supported`);
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'data') {
      const frames = Math.floor(size / (2 * channels)), mono = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += b.readInt16LE(o + 8 + (i * channels + c) * 2);
        mono[i] = s / channels / 32768;
      }
      return { rate, data: mono };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error(`${path}: no data chunk`);
}

function writeWav(path, rate, data) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2);
  writeFileSync(path, b);
}

const { rate, data } = readWav(inPath);
// onset = the envelope (5 ms windows) jumping above half the recording's peak, at least 0.25 s after the last one
const win = Math.round(rate * 0.005);
let peak = 0;
for (const s of data) peak = Math.max(peak, Math.abs(s));
const onsets = [];
for (let i = 0; i + win < data.length; i += win) {
  let m = 0;
  for (let j = i; j < i + win; j++) m = Math.max(m, Math.abs(data[j]));
  if (m > peak * 0.5 && (onsets.length === 0 || i - onsets[onsets.length - 1] > rate * 0.25)) onsets.push(i);
}
// refine each onset: the shot's peak within 150 ms, then back to where the transient starts rising
const starts = onsets.map((o) => {
  let pi = o, pm = 0;
  for (let i = o; i < Math.min(data.length, o + rate * 0.15); i++) if (Math.abs(data[i]) > pm) { pm = Math.abs(data[i]); pi = i; }
  let s = pi;
  while (s > 0 && pi - s < rate * 0.05 && Math.abs(data[s]) > pm * 0.08) s--;
  return Math.max(0, s - Math.round(rate * 0.002));
});
const shots = [];
for (let k = 0; k < starts.length && shots.length < maxShots; k++) {
  // stop before the next shot; skip shots too close to the next one to make a clean clip
  const next = starts[k + 1] ?? data.length;
  const room = next - starts[k] - Math.round(rate * 0.01);
  if (room < rate * Math.min(length, 0.25)) continue;
  shots.push({ start: starts[k], len: Math.min(Math.round(rate * length), room, data.length - starts[k]) });
}
const n = shots.length;
for (let k = 0; k < n; k++) {
  const { start, len } = shots[k];
  const out = data.slice(start, start + len);
  const fade = Math.round(rate * Math.min(0.15, length / 3));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  let m = 0;
  for (const s of out) m = Math.max(m, Math.abs(s));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.89 / m; // about -1 dBFS
  writeWav(`${outPrefix}_${k + 1}.wav`, rate, out);
}
console.log(`${inPath}: ${onsets.length} shots found, wrote ${n}`);
