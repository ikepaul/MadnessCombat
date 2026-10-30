// M14b (UXS-13): the end card's keys. A reload pressed right after the last kill mustn't throw the
// body count away: the card is deaf for its first moments, and replaying the stage is "hold R".

export const END_CARD = {
  /** Seconds after the card appears before Enter / Esc / R do anything. invented */
  deaf: 0.6,
  /** Seconds R must be held to replay the stage. invented */
  hold: 0.5,
};

/** Times are real seconds (performance.now() / 1000), so pausing or slow-mo don't stretch them. */
export class EndCardGate {
  private shownAt: number | undefined;
  private holdSince: number | undefined;

  show(t: number): void {
    this.shownAt = t;
    this.holdSince = undefined;
  }

  /** The card is up and past its deaf time. */
  ready(t: number): boolean {
    return this.shownAt !== undefined && t - this.shownAt >= END_CARD.deaf;
  }

  /** R went down: a hold starts only on a fresh press once the card listens. */
  pressR(t: number): void {
    if (this.ready(t)) this.holdSince = t;
  }

  releaseR(): void {
    this.holdSince = undefined;
  }

  /** 0..1: how far the replay hold has got (the card draws it). */
  fill(t: number): number {
    return this.holdSince === undefined ? 0 : Math.min(1, (t - this.holdSince) / END_CARD.hold);
  }

  /** R held long enough: replay (once). */
  replayDue(t: number): boolean {
    if (this.fill(t) < 1) return false;
    this.holdSince = undefined;
    this.shownAt = undefined;
    return true;
  }
}
