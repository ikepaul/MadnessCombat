// Co-op relay (PLAN.md M4b): runs in the Vite dev server (vite.config.ts) on the dev server's
// own websocket, so the second laptop only needs the host's address. One host, one guest:
// guest inputs go to the host, host snapshots go to the guest. No game logic here; plain TS
// so it can be unit tested without a server.

export type CoopRole = 'host' | 'guest';

/** Anything we can send a custom event to (a Vite websocket client in practice). */
export interface RelayClient {
  send(event: string, data?: unknown): void;
}

export interface Welcome {
  ok: boolean;
  role: CoopRole;
  /** Why the hello was refused. */
  reason?: string;
  /** Host only: join links for the other laptop (one per network interface). */
  joinUrls?: string[];
  /** The other side is connected already. */
  peer: boolean;
}

export class CoopRelay {
  host?: RelayClient;
  guest?: RelayClient;

  constructor(private joinUrls: () => string[] = () => []) {}

  hello(c: RelayClient, role: CoopRole): void {
    const refuse = (reason: string) => c.send('coop:welcome', { ok: false, role, reason, peer: false } satisfies Welcome);
    if (role === 'host') {
      if (this.host && this.host !== c) return refuse('Another laptop is already hosting.');
      this.host = c;
      c.send('coop:welcome', { ok: true, role, joinUrls: this.joinUrls(), peer: !!this.guest } satisfies Welcome);
      this.guest?.send('coop:peer', { connected: true });
      return;
    }
    if (!this.host) return refuse('No host yet: start the co-op game on the host laptop first.');
    if (this.guest && this.guest !== c) return refuse('The game is full (2 players).');
    this.guest = c;
    c.send('coop:welcome', { ok: true, role, peer: true } satisfies Welcome);
    this.host.send('coop:peer', { connected: true });
  }

  closed(c: RelayClient): void {
    if (c === this.host) {
      this.host = undefined;
      this.guest?.send('coop:peer', { connected: false });
    }
    if (c === this.guest) {
      this.guest = undefined;
      this.host?.send('coop:peer', { connected: false });
    }
  }

  /** Guest -> host: player 2's command for the next tick. */
  input(c: RelayClient, data: unknown): void {
    if (c === this.guest) this.host?.send('coop:input', data);
  }

  /** Host -> guest: the world as of the host's latest tick. */
  snap(c: RelayClient, data: unknown): void {
    if (c === this.host) this.guest?.send('coop:snap', data);
  }
}
