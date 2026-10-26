// Voice bookkeeping (design/audio-direction.md, technical spec): per-sound voice limits with
// oldest-voice stealing, and variant picking that never repeats the last variant. No Web
// Audio here, so the limits can be unit tested.

export interface VoiceStart {
  voiceId: number;
  variant: number;
  /** Voice to stop because the limit was reached (oldest steals). */
  steal?: number;
}

export class VoicePool {
  private nextId = 1;
  /** sound id -> live voices, oldest first */
  private live = new Map<string, { id: number; end: number }[]>();
  private lastVariant = new Map<string, number>();

  constructor(private rng: () => number = Math.random) {}

  /** Start a voice of `sound` lasting `duration` s at time `now`. */
  start(sound: string, variants: number, limit: number, now: number, duration: number): VoiceStart {
    const voices = (this.live.get(sound) ?? []).filter((v) => v.end > now);
    let steal: number | undefined;
    if (voices.length >= limit) steal = voices.shift()!.id;
    const id = this.nextId++;
    voices.push({ id, end: now + duration });
    this.live.set(sound, voices);
    return { voiceId: id, variant: this.pickVariant(sound, variants), steal };
  }

  /** Voices of `sound` still playing at `now`. */
  count(sound: string, now: number): number {
    return (this.live.get(sound) ?? []).filter((v) => v.end > now).length;
  }

  private pickVariant(sound: string, variants: number): number {
    if (variants <= 1) return 0;
    const last = this.lastVariant.get(sound);
    let v = Math.floor(this.rng() * (variants - 1));
    if (last !== undefined && v >= last) v++; // never the same variant twice in a row
    this.lastVariant.set(sound, v);
    return v;
  }
}
