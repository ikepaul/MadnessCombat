// Bar-boundary scheduling for the music system (design/audio-direction.md, "Music system"):
// intensity layer changes wait for the next bar line; stingers are free-timed. Pure maths on
// the audio clock, so it can be unit tested.

export class BarScheduler {
  /** Seconds per bar. */
  readonly bar: number;

  /** `start` = audio-clock time the track's first bar began. */
  constructor(bpm: number, beatsPerBar: number, private start: number) {
    this.bar = (60 / bpm) * beatsPerBar;
  }

  /** The first bar line at or after `t` (a change requested exactly on a bar line lands on it). */
  nextBoundary(t: number): number {
    if (t <= this.start) return this.start;
    const bars = Math.ceil((t - this.start) / this.bar - 1e-9);
    return this.start + bars * this.bar;
  }
}

/**
 * Intensity layers 0-3: a change is queued for the next bar line; asking again before then
 * replaces the pending target (only the latest request lands).
 */
export class LayerSwitcher {
  current = 0;
  pending?: { level: number; at: number };

  constructor(private bars: BarScheduler) {}

  request(level: number, now: number): void {
    if (level === this.current) { this.pending = undefined; return; }
    if (this.pending?.level === level) return;
    this.pending = { level, at: this.bars.nextBoundary(now) };
  }

  /** Apply a pending change once the audio clock reaches its bar line. Returns the change, if any. */
  update(now: number): { level: number; at: number } | undefined {
    const p = this.pending;
    if (!p || now < p.at) return undefined;
    this.current = p.level;
    this.pending = undefined;
    return p;
  }
}
