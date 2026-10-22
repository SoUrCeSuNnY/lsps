// Caching tile proxy for the showcase renderer.
//
// Two problems it solves:
//
// 1. Availability. `tile.openstreetmap.org` is unreachable from the network this
//    project is developed on (its CDN blocks requests without a browser-like
//    Referer and drops connections from here), so every globe shot warmed for
//    150 s and never settled. Esri World Imagery answers fast and sends
//    `access-control-allow-origin: *`, which is what Cesium's imagery loader needs.
//
// 2. Repeatability. Warming a shot's camera is a pure network-fetch cost, so the
//    frames captured from shot N onwards are only as good as the tile cache.
//    Caching to disk makes a re-run (or a second pass over one shot) near
//    instant, which is what makes iterating on the shot list affordable.
//
// The proxy is mounted by both `capture.mjs` (headless frame export) and the
// vite dev server, so `npm run dev` in the showcase renders the same basemap the
// exported video uses.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Imagery endpoints, in priority order. First 2xx response wins. */
export const UPSTREAMS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
];

const TILE_RE = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.(jpg|png)$/;

export function tileMiddleware(cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  /** In-flight fetches, so a burst of requests for one tile hits upstream once. */
  const pending = new Map();
  let inflight = 0;
  const MAX_INFLIGHT = 6;
  const queue = [];

  function pump() {
    while (inflight < MAX_INFLIGHT && queue.length) {
      const job = queue.shift();
      inflight++;
      job().finally(() => {
        inflight--;
        pump();
      });
    }
  }

  async function upstream(z, x, y, ext) {
    for (const template of UPSTREAMS) {
      const url = template
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': 'LSPS-showcase/0.1 (frame renderer; https://github.com/SoUrCeSuNnY/lsps)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) continue; // empty/placeholder tile
        return { buf, ext: ext ?? (template.includes('arcgisonline') ? 'jpg' : 'png') };
      } catch {
        /* next upstream */
      }
    }
    return null;
  }

  return function handle(req, res) {
    const m = TILE_RE.exec(decodeURIComponent((req.url ?? '').split('?')[0]));
    if (!m) {
      res.statusCode = 404;
      return res.end('not found');
    }
    const [, zs, xs, ys] = m;
    const z = Number(zs);
    const x = Number(xs);
    const y = Number(ys);
    const n = 2 ** z;
    if (z > 19 || x < 0 || x >= n || y < 0 || y >= n) {
      res.statusCode = 400;
      return res.end('tile out of range');
    }
    const key = `${z}/${x}/${y}`;
    const file = join(cacheDir, key);
    const send = (buf, ext) => {
      res.setHeader('Content-Type', ext === 'png' ? 'image/png' : 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      // Cesium probes availability with HEAD; writing a body to a HEAD
      // response desynchronises the connection.
      res.end(req.method === 'HEAD' ? undefined : buf);
    };
    for (const ext of ['jpg', 'png']) {
      const f = `${file}.${ext}`;
      if (existsSync(f)) return send(readFileSync(f), ext);
    }
    const running = pending.get(key);
    if (running) return running.then((r) => (r ? send(r.buf, r.ext) : fail(res)));

    const p = new Promise((done) => {
      queue.push(async () => {
        const cached = ['jpg', 'png'].map((e) => `${file}.${e}`).find((f) => existsSync(f));
        if (cached) return done({ buf: readFileSync(cached), ext: cached.slice(-3) });
        const r = await upstream(z, x, y);
        if (r) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(`${file}.${r.ext}`, r.buf);
        }
        done(r);
      });
      pump();
    })
      .catch(() => null)
      .finally(() => pending.delete(key));
    pending.set(key, p);
    return p.then((r) => (r ? send(r.buf, r.ext) : fail(res)));
  };
}

function fail(res) {
  res.statusCode = 502;
  res.end('upstream unreachable');
}
