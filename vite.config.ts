import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { CoopRelay, type CoopRole } from './src/net/relay';

/** Dev only: the pose editor lab (/?lab=pose-editor) saves src/data/poses.json through this. */
function poseSaver(): Plugin {
  return {
    name: 'pose-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__poses', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (typeof data.poses !== 'object' || typeof data.clips !== 'object') throw new Error('expected { poses, clips }');
            writeFileSync(resolve(process.cwd(), 'src/data/poses.json'), body.endsWith('\n') ? body : `${body}\n`);
            res.end('saved');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

/**
 * Dev only: co-op relay on the dev server's websocket (PLAN.md M4b). Start the server with
 * `npm run dev:lan` so the other laptop can reach it.
 */
function coopRelay(): Plugin {
  return {
    name: 'coop-relay',
    apply: 'serve',
    configureServer(server) {
      const joinUrls = () => {
        const port = (server.httpServer?.address() as AddressInfo | null)?.port ?? 5173;
        return Object.values(networkInterfaces()).flat()
          .filter((n) => n && n.family === 'IPv4' && !n.internal)
          .map((n) => `http://${n!.address}:${port}/?coop=join`);
      };
      const relay = new CoopRelay(joinUrls);
      server.ws.on('coop:hello', (data: { role: CoopRole }, client) => {
        relay.hello(client, data.role);
        client.socket.once('close', () => relay.closed(client));
      });
      server.ws.on('coop:input', (data, client) => relay.input(client, data));
      server.ws.on('coop:snap', (data, client) => relay.snap(client, data));
      // M14b (UXS-06): Esc in the lobby / quit to the title: the other laptop hears the peer left
      server.ws.on('coop:bye', (_data, client) => relay.closed(client));
    },
  };
}

export default defineConfig({
  plugins: [poseSaver(), coopRelay()],
  server: { port: 5173, strictPort: true },
  // UXS-21: Phaser in its own (cacheable) chunk; the warning limit back at 1000 kB so growth shows
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1000,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ }] } } },
  },
  // whole-wave and whole-stage simulations: the 5 s default trips when every file runs in parallel on a busy machine
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
