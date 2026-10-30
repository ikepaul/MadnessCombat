// Browser side of the co-op connection (PLAN.md M4b): custom events on the Vite dev server's
// websocket (`import.meta.hot`), relayed by src/net/relay.ts. Dev server only: a production
// build has no relay (co-op over the internet would need a real server later).
import type { PlayerCommand } from '../sim/command';
import type { CoopRole, Welcome } from './relay';
import type { Snapshot } from './snapshot';

/** Guests retry this often while no host is up yet (s). */
const RETRY = 2;

export class CoopLink {
  welcome?: Welcome;
  /** The other laptop is connected. */
  peer = false;
  onSnap?: (s: Snapshot) => void;
  onInput?: (c: PlayerCommand) => void;
  onPeer?: (connected: boolean) => void;
  private retryTimer?: ReturnType<typeof setTimeout>;
  /** UXS-06: left (Esc in the lobby, quit to the title): this link is dead, the next coopLink() makes a new one. */
  private gone = false;

  constructor(readonly role: CoopRole) {
    const hot = import.meta.hot;
    if (!hot) {
      this.welcome = { ok: false, role, reason: 'Co-op needs the dev server (npm run dev:lan).', peer: false };
      return;
    }
    hot.on('coop:welcome', (w: Welcome) => {
      if (this.gone) return;
      this.welcome = w;
      this.peer = w.peer;
      if (!w.ok && role === 'guest') this.retryTimer = setTimeout(() => this.hello(), RETRY * 1000);
    });
    hot.on('coop:peer', (p: { connected: boolean }) => {
      if (this.gone) return;
      this.peer = p.connected;
      this.onPeer?.(p.connected);
    });
    hot.on('coop:snap', (s: Snapshot) => { if (!this.gone) this.onSnap?.(s); });
    hot.on('coop:input', (c: PlayerCommand) => { if (!this.gone) this.onInput?.(c); });
    this.hello();
  }

  get ready(): boolean {
    return !!this.welcome?.ok;
  }

  private hello(): void {
    clearTimeout(this.retryTimer);
    import.meta.hot?.send('coop:hello', { role: this.role });
  }

  /** UXS-06: leave the session; the relay tells the other laptop (`coop:peer` false). */
  leave(): void {
    if (this.gone) return;
    this.gone = true;
    clearTimeout(this.retryTimer);
    this.peer = false;
    import.meta.hot?.send('coop:bye', {});
    if (link === this) link = undefined;
  }

  sendInput(c: PlayerCommand): void {
    if (this.gone) return;
    import.meta.hot?.send('coop:input', c);
  }

  sendSnap(s: Snapshot): void {
    if (this.gone) return;
    import.meta.hot?.send('coop:snap', s);
  }
}

let link: CoopLink | undefined;

/** One connection per page, kept across scene restarts. */
export function coopLink(role: CoopRole): CoopLink {
  if (!link || link.role !== role) link = new CoopLink(role);
  return link;
}
