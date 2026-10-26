import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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

export default defineConfig({
  plugins: [poseSaver()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
