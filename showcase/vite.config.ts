import { defineConfig, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tileMiddleware } from './tileproxy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

const CESIUM_BUILD = path.join(REPO, 'node_modules', 'cesium', 'Build', 'Cesium');

// Same dev strategy as apps/web: serve Cesium statics straight from node_modules
// (viteStaticCopy's dev middleware mishandles Accept-headered requests).
function serveCesium(): Plugin {
  return {
    name: 'lsps-showcase-serve-cesium',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/cesium', (req, res) => {
        const clean = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const file = path.normalize(path.join(CESIUM_BUILD, clean));
        if (!file.startsWith(CESIUM_BUILD) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** Serve the cached basemap tiles through the same path the exporter uses. */
function serveTiles(): Plugin {
  return {
    name: 'lsps-showcase-tiles',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/tiles', tileMiddleware(path.join(HERE, 'build', 'tiles')));
    },
  };
}

export default defineConfig({
  base: './',
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  plugins: [
    serveCesium(),
    serveTiles(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((d) => ({
        // Absolute, forward-slashed: viteStaticCopy globs relative to `root`,
        // and Cesium is hoisted to the repo root, not showcase/node_modules.
        src: CESIUM_BUILD.replace(/\\/g, '/') + '/' + d,
        dest: 'cesium',
      })),
    }),
  ],
  resolve: {
    alias: {
      '@lsps/core': path.join(REPO, 'packages/core/src/index.ts'),
      app: path.join(REPO, 'apps/web/src'),
    },
  },
  server: {
    port: 5178,
    host: '127.0.0.1',
    strictPort: true,
    fs: { allow: [REPO] },
  },
  optimizeDeps: { include: ['cesium'] },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 9000 },
});
