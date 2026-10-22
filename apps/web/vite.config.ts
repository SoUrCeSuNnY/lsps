import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx': 'image/ktx',
  '.ktx2': 'image/ktx2',
  '.atc': 'application/octet-stream',
  '.crn': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
};

// Serve /cesium/* straight from node_modules in dev. viteStaticCopy's dev
// middleware mishandles Accept-headered requests (SkyBox/Assets came back as
// SPA-fallback HTML), so we use a plain file server here; build still copies.
function findCesiumBuild(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const cand = path.join(dir, 'node_modules', 'cesium', 'Build', 'Cesium');
    if (existsSync(cand)) return cand;
    dir = path.dirname(dir);
  }
  throw new Error('cesium Build not found');
}

const CESIUM_BUILD = findCesiumBuild();

function serveCesium(): Plugin {
  return {
    name: 'lsps-serve-cesium',
    apply: 'serve',
    configureServer(server) {
      const root = CESIUM_BUILD;
      server.middlewares.use('/cesium', (req, res) => {
        const clean = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const file = path.normalize(path.join(root, clean));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
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

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  plugins: [
    serveCesium(),
    react(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((d) => ({
        // Absolute, forward-slashed: `src` globs relative to vite root (apps/web)
        // and Cesium is hoisted to the repo root, so the old relative path
        // matched nothing and dist shipped with no Cesium statics at all.
        src: CESIUM_BUILD.replace(/\\/g, '/') + '/' + d,
        dest: 'cesium',
      })),
    }),
  ],
  optimizeDeps: {
    // Pre-bundle the whole Cesium ESM tree with esbuild (raw dev loading is ~6000
    // modules = minutes; bundled = seconds). Its CJS deps are interop'd in the process.
    include: ['cesium'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
