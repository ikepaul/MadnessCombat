// Music system (PLAN.md M4, design/audio-direction.md "Music system"): per room an ambient
// bed (always) plus combat layers 1-3 that follow the number of active enemies and switch on
// bar lines. Stingers are free-timed. Reads assets/music/cues.json; with no tracks delivered
// yet, rooms play their ambience only (no placeholder music is generated, by decision).
import cues from '../../assets/music/cues.json';
import type { SoundId } from '../data/audio';
import type { AudioEngine } from './mixer';
import { BarScheduler, LayerSwitcher } from './scheduler';

interface TrackDef { bpm: number; beatsPerBar: number; loopStart: number; loopEnd: number; stems: string[] }
/** `cues`: the stage script's cue names -> track ids; `diegetic`: what a boombox in the room plays (M8). */
interface RoomCue { ambience: SoundId | null; combat: string | null; cues?: Record<string, string>; diegetic?: string }
interface CueFile { rooms: Record<string, RoomCue>; tracks: Record<string, TrackDef> }

const CUES = cues as unknown as CueFile;
/** Delivered stems, bundled by Vite: file name -> URL. */
const STEM_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/music/*.{ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.split('/').pop()!, url as string]),
);
/** Every file of the track is in assets/music/. */
const delivered = (t: TrackDef) => t.stems.every((f) => !!STEM_URLS[f]);

const decoded = new Map<string, Promise<AudioBuffer>>();

/**
 * M8: the room's boombox tune (`diegetic` in cues.json), decoded once; undefined until the user's
 * file is delivered (the boombox plays radio static meanwhile).
 */
export function diegeticTrack(engine: AudioEngine, roomId: string): Promise<AudioBuffer> | undefined {
  const id = CUES.rooms[roomId]?.diegetic, track = id ? CUES.tracks[id] : undefined;
  if (!id || !track || !delivered(track)) return undefined;
  let p = decoded.get(id);
  if (!p) decoded.set(id, (p = fetch(STEM_URLS[track.stems[0]]).then((r) => r.arrayBuffer()).then((b) => engine.ctx.decodeAudioData(b))));
  return p;
}

/** Layer fade at a bar line (s). invented */
const LAYER_FADE = 0.25;
/** Schedule bar-line changes this far ahead of the audio clock (s). */
const LOOKAHEAD = 0.1;

export class MusicSystem {
  private ambience?: number;
  private layers: GainNode[] = [];
  private switcher?: LayerSwitcher;
  /** Bumped on every track change, so a slow decode can't start a stale track. */
  private trackGen = 0;

  constructor(private engine: AudioEngine) {}

  private room?: RoomCue;

  /** Start the room's ambience and, if delivered, its combat track (stems muted until needed). */
  async setRoom(roomId: string): Promise<void> {
    this.stop();
    const cue = (this.room = CUES.rooms[roomId]);
    if (!cue) return;
    if (cue.ambience) this.ambience = this.engine.play(cue.ambience);
    await this.setTrack(cue.combat);
  }

  /**
   * M8: a stage script's cue (`riot`, `boss`, ...) -> the room's track for it; a cue whose track
   * isn't delivered yet keeps the room's combat track. null = ambience only (the ending's quiet).
   */
  async setCue(cue: string | null): Promise<void> {
    if (!cue) { await this.setTrack(null); return; }
    const id = this.room?.cues?.[cue], track = id ? CUES.tracks[id] : undefined;
    await this.setTrack(track && delivered(track) ? id! : this.room?.combat ?? null);
  }

  /** The track playing now (or loading). */
  private current: string | null = null;

  /**
   * Swap the combat track, keeping the ambience. The same track again carries on where it is; a
   * track whose files aren't all delivered yet leaves the ambience playing alone.
   */
  async setTrack(trackId: string | null): Promise<void> {
    if (trackId !== null && trackId === this.current) return;
    this.current = trackId;
    const gen = ++this.trackGen;
    this.layers.forEach((g) => g.disconnect());
    this.layers = [];
    this.switcher = undefined;
    const track = trackId ? CUES.tracks[trackId] : undefined;
    if (!track || !delivered(track)) return;
    const c = this.engine.ctx;
    const buffers = await Promise.all(track.stems.map(async (f) => c.decodeAudioData(await (await fetch(STEM_URLS[f])).arrayBuffer())));
    if (gen !== this.trackGen) return; // another cue came in while this one was decoding
    const start = c.currentTime + 0.1;
    this.layers = buffers.map((buf) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = track.loopStart;
      src.loopEnd = track.loopEnd;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(g);
      this.engine.musicGain(g);
      src.start(start);
      return g;
    });
    this.switcher = new LayerSwitcher(new BarScheduler(track.bpm, track.beatsPerBar, start));
  }

  /** Intensity 0-3 from the number of active enemies; lands on the next bar line. */
  setIntensity(activeEnemies: number): void {
    const s = this.switcher;
    if (!s) return;
    const now = this.engine.now;
    s.request(Math.min(3, activeEnemies), now);
    const change = s.update(now + LOOKAHEAD);
    if (!change) return;
    this.layers.forEach((g, i) => {
      const on = i < change.level ? 1 : 0;
      g.gain.setValueAtTime(g.gain.value, change.at);
      g.gain.linearRampToValueAtTime(on, change.at + LAYER_FADE);
    });
  }

  stop(): void {
    if (this.ambience !== undefined) this.engine.stop(this.ambience, 0.5);
    this.ambience = undefined;
    this.current = null;
    this.trackGen++;
    this.layers.forEach((g) => g.disconnect());
    this.layers = [];
    this.switcher = undefined;
  }
}
