// Audio engine (PLAN.md M4, design/audio-direction.md technical spec): Web Audio directly.
// voices -> per-voice gain/pan -> bus (+ reverb send) -> kill-cam low-pass -> compressor ->
// limiter -> output. One engine for the whole game; scenes hook their world's events into it.
import { AUDIO, BUS_GAIN, type Bus, type ReverbSize, SOUNDS, type SoundDef, type SoundId } from '../data/audio';
import { SETTINGS } from '../settings';
import { render } from './synth';
import { VoicePool } from './voices';

export interface PlayOptions {
  /** Screen x in px (pan). */
  screenX?: number;
  /** 0 = front edge of the floor, 1 = back wall (depth attenuation). */
  depth?: number;
  /** Extra playback-rate factor (e.g. combo ticks pitched up). */
  rate?: number;
  /** Extra linear gain. */
  gain?: number;
  /** Start this many seconds later (a casing lands after the shot). */
  delay?: number;
}

interface Live { src: AudioBufferSourceNode; gain: GainNode }

const dbToGain = (db: number) => 10 ** (db / 20);

/** Recorded sounds bundled by Vite: path under assets/audio/ -> URL. */
const FILE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/audio/**/*.{ogg,wav}', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.replace('../../assets/audio/', ''), url as string]),
);

/** Peak-normalise a recording (the spec normalises per category; the def's gain sets the level). */
function normalised(buf: AudioBuffer, peak = 0.89): AudioBuffer {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const s of buf.getChannelData(c)) m = Math.max(m, Math.abs(s));
  if (m > 0) for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  }
  return buf;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private buses = {} as Record<Bus, GainNode>;
  private reverb: ConvolverNode;
  private reverbWet: GainNode;
  private buffers = new Map<SoundId, AudioBuffer[]>();
  private pool = new VoicePool();
  private live = new Map<number, Live>();
  private killCamUntil = 0;
  private duckGain: GainNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.15;
    // brick-wall-ish limiter at about -1 dB
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.05;
    this.master = c.createGain();
    this.lowpass = c.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.lowpass.connect(comp).connect(limiter).connect(this.master).connect(c.destination);
    this.reverb = c.createConvolver();
    this.reverbWet = c.createGain();
    this.reverb.connect(this.reverbWet).connect(this.lowpass);
    this.duckGain = c.createGain();
    this.duckGain.connect(this.lowpass);
    for (const bus of Object.keys(BUS_GAIN) as Bus[]) {
      const g = c.createGain();
      g.connect(bus === 'music' ? this.duckGain : this.lowpass);
      this.buses[bus] = g;
    }
    this.setRoomReverb('medium');
    this.applySettings();
    // browsers start audio suspended until the first user gesture
    const resume = () => void c.resume();
    window.addEventListener('pointerdown', resume, { once: false });
    window.addEventListener('keydown', resume, { once: false });
  }

  /** Volumes from the settings stub (master / music / sfx). */
  applySettings(): void {
    this.master.gain.value = SETTINGS.master;
    for (const [bus, g] of Object.entries(this.buses) as [Bus, GainNode][]) {
      g.gain.value = BUS_GAIN[bus] * (bus === 'music' ? SETTINGS.music : SETTINGS.sfx);
    }
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  get inKillCam(): boolean {
    return this.now < this.killCamUntil;
  }

  private buffersFor(id: SoundId): AudioBuffer[] {
    let list = this.buffers.get(id);
    if (!list) {
      const def: SoundDef = SOUNDS[id];
      list = Array.from({ length: def.variants }, (_, v) => {
        const data = render(def.recipe, this.ctx.sampleRate, v + 1);
        const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
        buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
        return buf;
      });
      this.buffers.set(id, list);
    }
    return list;
  }

  /**
   * Render every sound ahead of use, one per timer slice so no single frame stalls (the
   * whole set takes ~0.5 s). Anything played before its turn renders on demand.
   */
  warmUp(): void {
    void this.loadFiles();
    const queue = (Object.keys(SOUNDS) as SoundId[]).filter((id) => !this.buffers.has(id));
    const next = () => {
      const id = queue.shift();
      if (!id) return;
      this.buffersFor(id);
      setTimeout(next, 0);
    };
    next();
  }

  /** Decode the recorded variants (assets/audio/) and swap them in for the generated ones. */
  private filesLoading = false;
  private async loadFiles(): Promise<void> {
    if (this.filesLoading) return;
    this.filesLoading = true;
    await Promise.all((Object.keys(SOUNDS) as SoundId[]).map(async (id) => {
      const files = (SOUNDS[id] as SoundDef).files;
      if (!files) return;
      try {
        const bufs = await Promise.all(files.map(async (f) => {
          const url = FILE_URLS[f];
          if (!url) throw new Error(`missing sound file ${f}`);
          return normalised(await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()));
        }));
        this.buffers.set(id, bufs);
      } catch (e) {
        console.warn(`sound ${id}: keeping the generated version`, e);
      }
    }));
  }

  /** Play a one-shot (or a loop for loop sounds; returns its voice id to stop it later). */
  play(id: SoundId, o: PlayOptions = {}): number {
    const def: SoundDef = SOUNDS[id];
    const bufs = this.buffersFor(id);
    const c = this.ctx, now = c.currentTime;
    const rate = (1 + (Math.random() * 2 - 1) * AUDIO.pitchJitter) * (o.rate ?? 1) * (this.inKillCam ? AUDIO.killCamRate : 1);
    const v = this.pool.start(id, def.variants, def.limit, now, def.loop ? Infinity : bufs[0].duration / rate);
    if (v.steal !== undefined) this.stop(v.steal, 0.02);
    const src = c.createBufferSource();
    src.buffer = bufs[v.variant];
    src.playbackRate.value = rate;
    src.loop = !!def.loop;
    const gain = c.createGain();
    const depthDb = AUDIO.depthDb * Math.max(0, Math.min(1, o.depth ?? 0));
    const jitterDb = def.loop ? 0 : (Math.random() * 2 - 1) * AUDIO.gainJitterDb;
    gain.gain.value = def.gain * (o.gain ?? 1) * dbToGain(depthDb + jitterDb);
    const pan = c.createStereoPanner();
    pan.pan.value = o.screenX === undefined ? 0 : Math.max(-1, Math.min(1, (o.screenX - 960) / 960)) * AUDIO.panRange;
    src.connect(gain).connect(pan).connect(this.buses[def.bus]);
    if (def.reverb > 0) {
      const send = c.createGain();
      send.gain.value = def.reverb;
      pan.connect(send).connect(this.reverb);
    }
    src.start(o.delay ? now + o.delay : 0);
    this.live.set(v.voiceId, { src, gain });
    src.onended = () => this.live.delete(v.voiceId);
    return v.voiceId;
  }

  stop(voiceId: number, fade = 0.05): void {
    const l = this.live.get(voiceId);
    if (!l) return;
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(0, t, fade / 3);
    l.src.stop(t + fade);
    this.live.delete(voiceId);
  }

  /** Room reverb from a generated impulse response (decaying noise) for the room's size class. */
  setRoomReverb(size: ReverbSize): void {
    const { length, wet } = AUDIO.reverb[size];
    const c = this.ctx, n = Math.floor(c.sampleRate * length);
    const ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    this.reverb.buffer = ir;
    this.reverbWet.gain.value = wet;
  }

  /** Music -4 dB, recovering over 300 ms after `hold` s (explosions, boss attacks, kill cams). */
  duck(hold: number): void {
    const g = this.duckGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(dbToGain(AUDIO.duckDb), t + 0.03);
    g.setValueAtTime(dbToGain(AUDIO.duckDb), t + hold);
    g.linearRampToValueAtTime(1, t + hold + AUDIO.duckRelease);
  }

  /** Kill cam: low-pass ~1.2 kHz + slower playback for `seconds`, with a tape-stop whoosh in. */
  killCam(seconds: number): void {
    const f = this.lowpass.frequency, t = this.ctx.currentTime;
    this.play('tapeStop');
    this.killCamUntil = t + seconds;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(AUDIO.killCamLowpass, t + 0.08);
    f.setValueAtTime(AUDIO.killCamLowpass, t + seconds);
    f.exponentialRampToValueAtTime(20000, t + seconds + 0.25);
    for (const l of this.live.values()) {
      l.src.playbackRate.setValueAtTime(l.src.playbackRate.value * AUDIO.killCamRate, t);
      l.src.playbackRate.setValueAtTime(l.src.playbackRate.value, t + seconds);
    }
    this.duck(seconds);
  }

  /** Music bus fade for a layer (music system). */
  musicGain(node: AudioNode): void {
    node.connect(this.buses.music);
  }
}

let engine: AudioEngine | undefined;

/** The shared engine (created on first use; there is one AudioContext for the whole game). */
export function audio(): AudioEngine | undefined {
  if (!engine && typeof AudioContext !== 'undefined') engine = new AudioEngine();
  return engine;
}
