// Music system (PLAN.md M4, design/audio-direction.md "Music system"): per room an ambient
// bed (always) plus combat layers 1-3 that follow the number of active enemies and switch on
// bar lines. Stingers are free-timed. Reads assets/music/cues.json; with no tracks delivered
// yet, rooms play their ambience only (no placeholder music is generated, by decision).
import cues from '../../assets/music/cues.json';
import type { SoundId } from '../data/audio';
import type { AudioEngine } from './mixer';
import { BarScheduler, LayerSwitcher } from './scheduler';

interface TrackDef { bpm: number; beatsPerBar: number; loopStart: number; loopEnd: number; stems: string[] }
interface RoomCue { ambience: SoundId | null; combat: string | null }
interface CueFile { rooms: Record<string, RoomCue>; tracks: Record<string, TrackDef> }

const CUES = cues as unknown as CueFile;
/** Delivered stems, bundled by Vite: file name -> URL. */
const STEM_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/music/*.{ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.split('/').pop()!, url as string]),
);
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

  /** Start the room's ambience and, if delivered, its combat track (stems muted until needed). */
  async setRoom(roomId: string): Promise<void> {
    this.stop();
    const cue = CUES.rooms[roomId];
    if (!cue) return;
    if (cue.ambience) this.ambience = this.engine.play(cue.ambience);
    await this.setTrack(cue.combat);
  }

  /**
   * M8 scripted cue (sequencer `music`): swap the combat track, keeping the ambience. A cue whose
   * track isn't delivered yet leaves the ambience playing alone.
   */
  async setTrack(trackId: string | null): Promise<void> {
    const gen = ++this.trackGen;
    this.layers.forEach((g) => g.disconnect());
    this.layers = [];
    this.switcher = undefined;
    const track = trackId ? CUES.tracks[trackId] : undefined;
    if (!track) return;
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
    this.trackGen++;
    this.layers.forEach((g) => g.disconnect());
    this.layers = [];
    this.switcher = undefined;
  }
}
