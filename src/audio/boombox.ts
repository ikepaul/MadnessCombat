// The stage-1 boombox as a diegetic music source (PLAN.md M8, design/audio-direction.md "Music
// system": positioned in the room, through the room reverb). It plays from wherever the boombox
// is: in the boombox NPC's hand, on the floor, in the hero's hand. The user's tune once it's
// delivered (cues.json `diegetic`), radio static until then (no placeholder music is generated).
// For the outro ("the boombox tune returns") it swells and comes to the middle.
import { project } from '../render/camera';
import type { World } from '../sim/world';
import type { AudioEngine } from './mixer';
import { diegeticTrack } from './music';

/** Outro swell: louder and halfway to centre (invented). */
const OUTRO_GAIN = 2, OUTRO_CENTRE = 0.5;
/** Level of a delivered tune relative to the music bus (invented, tune by ear). */
const TUNE_GAIN = 0.6, TUNE_REVERB = 0.3;

export class BoomboxSource {
  private voice?: number;
  private starting = false;
  private outro = false;
  private off: () => void;

  constructor(private world: World, private engine: AudioEngine) {
    this.off = world.events.on('music', (e) => (this.outro = e.cue === 'outro'));
  }

  /** Where the boombox is now (world point), if anywhere in the room. */
  private where(): { x: number; y: number; z: number } | undefined {
    const carrier = this.world.actors.find((a) => a.carry === 'boombox');
    if (carrier) return { x: carrier.pos.x, y: carrier.pos.y + 0.4, z: carrier.pos.z };
    const it = this.world.items.find((i) => i.kind === 'boombox');
    return it ? it.pos : undefined;
  }

  /** Every frame: start, follow or stop the sound. */
  update(): void {
    const at = this.where();
    if (!at) { this.stop(); return; }
    const r = this.world.room;
    const sx = project(at.x, at.y, at.z)[0];
    const o = {
      screenX: this.outro ? 960 + (sx - 960) * (1 - OUTRO_CENTRE) : sx,
      depth: (at.z - r.zFront) / (r.zBack - r.zFront),
      gain: this.outro ? OUTRO_GAIN : 1,
    };
    if (this.voice !== undefined) { this.engine.place(this.voice, o); return; }
    if (this.starting) return;
    const tune = diegeticTrack(this.engine, r.id);
    if (!tune) { this.voice = this.engine.play('boomboxStatic', o); this.engine.place(this.voice, o, 0); return; }
    this.starting = true;
    void tune.then((buf) => {
      this.starting = false;
      if (this.voice === undefined) this.voice = this.engine.loopBuffer(buf, 'music', TUNE_GAIN, TUNE_REVERB, o);
    });
  }

  stop(): void {
    if (this.voice !== undefined) this.engine.stop(this.voice, 0.3);
    this.voice = undefined;
  }

  /** The scene is going away (restart, room change). */
  dispose(): void {
    this.stop();
    this.off();
  }
}
