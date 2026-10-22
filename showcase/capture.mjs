// Deterministic frame-by-frame capture for the showcase reel.
//
// Why per-frame: the page's renderFrame(n) is a pure function of the frame
// index (no wall-clock, no rAF, no exposure EMA history), so screenshotting
// frame n yields a reproducible frame — exact 30fps output with no dropped
// frames, which realtime capture on a software GPU cannot guarantee.
//
// Batches are resumable: --from/--to capture a range and frames already on
// disk are skipped, so an interrupted run continues where it stopped.
//
// Usage:
//   node showcase/capture.mjs --stills            one frame per shot (review)
//   node showcase/capture.mjs --from 0 --to 299   capture a range
//   node showcase/capture.mjs --encode            encode from captured frames
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tileMiddleware } from './tileproxy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DIST = join(HERE, 'dist');
const OUT = join(HERE, 'build');
const FRAMES = join(OUT, 'frames');
const PORT = 5188;
let CDP_PORT = 9333;

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const W = Number(arg('--w', 1600));
const H = Number(arg('--h', 900));
const STILLS = argv.includes('--stills');
const ENCODE_ONLY = argv.includes('--encode');
const FROM = Number(arg('--from', 0));
const TO = Number(arg('--to', Infinity));

const { SHOTS, TOTAL_FRAMES, FPS } = await import(pathToFileURL(join(HERE, 'src/shots.ts')).href);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.xml': 'application/xml', '.jsonl': 'application/json',
};

function srv(root) {
  return async (req, res) => {
    let url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/' || url === '') url = '/index.html';
    const file = resolve(join(root, url));
    if (!file.startsWith(resolve(root))) {
      res.statusCode = 403;
      return res.end('forbidden');
    }
    try {
      const buf = await readFile(file);
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(buf);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  };
}

const tiles = tileMiddleware(join(OUT, 'tiles'));
const serve = async (req, res) => {
  if ((req.url ?? '').startsWith('/tiles/')) return tiles(req, res);
  return srv(DIST)(req, res);
};
const server = createServer((req, res) => serve(req, res));
// An interrupted run can leave its port bound; walk forward until one is free.
async function listen() {
  for (let p = PORT; p < PORT + 20; p++) {
    try {
      await new Promise((ok, bad) => {
        server.once('error', bad);
        server.listen(p, '127.0.0.1', ok);
      });
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error('no free port near ' + PORT);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

let browser = null;
/** Ask the OS for a free TCP port rather than assuming a fixed one is open. */
function freePort(preferred) {
  return new Promise((ok, bad) => {
    const s = createServer();
    s.once('error', bad);
    s.listen(preferred, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
}

async function launchBrowser() {
  if (!EDGE) throw new Error('no Chrome/Edge found');
  // A fixed CDP port is a trap: if a killed run left a browser holding it, the
  // new browser silently starts *without* debugging and the driver attaches to
  // the dead run's page — which points at a server that no longer exists, so
  // every warm spins to its budget and captures nothing.
  const port = await freePort(CDP_PORT).catch(() => CDP_PORT);
  // A fresh profile each run: Edge restores the previous session's tabs from a
  // reused one, and those tabs outlive their server.
  const prof = join(REPO, `.showcase-profile-${process.pid}`);
  browser = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${prof}`,
      '--no-first-run', '--no-default-browser-check',
      '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--hide-scrollbars', '--disable-features=Translate',
      `--window-size=${W},${H}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  );
  CDP_PORT = port;
  browser.unref();
  return () => {
    if (browser?.pid) {
      try { process.kill(-browser.pid, 'SIGKILL'); } catch { /* gone */ }
    }
    try { rmSync(prof, { recursive: true, force: true }); } catch { /* best effort */ }
  };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { ok } = this.pending.get(m.id);
        this.pending.delete(m.id);
        ok(m.result ?? {});
      }
    };
  }
  /**
   * Attach through the *browser* endpoint and create our own target.
   *
   * Picking a page out of /json is not reliable: Edge pops an internal tab
   * (sync-confirmation-dialog) that is a `page` type and sorts first, and the
   * driver then navigates and evaluates against that chrome page — so the
   * engine never boots, every warm spins to its budget, and the capture yields
   * nothing. A target we create ourselves cannot be an interloper.
   */
  static async attach() {
    for (let i = 0; i < 90; i++) {
      try {
        const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
        if (!v.webSocketDebuggerUrl) throw new Error('no browser ws');
        const ws = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
        const cdp = new Cdp(ws);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        cdp.sessionId = sessionId;
        cdp.targetId = targetId;
        return cdp;
      } catch { /* not ready */ }
      await sleep(500);
    }
    throw new Error('CDP not reachable');
  }
  send(method, params = {}) {
    const i = ++this.id;
    return new Promise((ok) => {
      this.pending.set(i, { ok });
      this.ws.send(JSON.stringify({
        id: i,
        method,
        params,
        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      }));
    });
  }
  async ev(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result?.value;
  }
}

function ffmpeg(args) {
  return new Promise((ok, bad) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('exit', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg exit ' + c + '\n' + err.slice(-2000)))));
  });
}

async function encode() {
  const have = readdirSync(FRAMES).filter((f) => /^f\d{5}\.(jpg|png)$/.test(f)).length;
  if (!have) throw new Error('no frames captured yet');
  // Deliverables land in media/ (committed); build/ is scratch.
  const MEDIA = join(HERE, 'media');
  mkdirSync(MEDIA, { recursive: true });
  const src = join(FRAMES, 'f%05d.jpg');
  const mp4 = join(MEDIA, 'lsps-showcase.mp4');
  console.log(`encoding mp4 from ${have} frames…`);
  await ffmpeg([
    '-y', '-framerate', String(FPS), '-i', src,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    mp4,
  ]);
  // README embeds a GIF: GitHub renders a repo GIF inline and autoplays it,
  // which it will not do for a repo-hosted mp4. GitHub rejects images over
  // 10 MB, and the full 47.6 s reel only fits at a 480px GIF, which is unreadable.
  // So the preview keeps the first `frac` of every shot — each scene's motion
  // reads, the file gets ~40% shorter, and that buys the resolution back.
  console.log('encoding gif preview…');
  const pal = join(OUT, 'pal.png');
  const gif = join(MEDIA, 'lsps-showcase-preview.gif');
  const windowSel = (frac) => {
    let acc = 0;
    const parts = [];
    for (const s of SHOTS) {
      const n = Math.round(s.seconds * FPS);
      parts.push(`between(n,${acc},${acc + Math.round(n * frac) - 1})`);
      acc += n;
    }
    return parts.join('+');
  };
  const plans = [
    { fps: 10, w: 720, colors: 72, frac: 0.3 },
    { fps: 8, w: 640, colors: 64, frac: 0.4 },
    { fps: 8, w: 560, colors: 56, frac: 0.6 },
    { fps: 8, w: 480, colors: 48, frac: 1 },
  ];
  for (const [i, p] of plans.entries()) {
    const vf = `fps=${p.fps},scale=${p.w}:-1:flags=lanczos`;
    // Single filter_complex per pass. ffmpeg 9 rejects `-vf` plus a labelled
    // `-map`, and a split whose second pad goes unused is an error too.
    const pre = p.frac >= 1 ? '' : `select='${windowSel(p.frac)}',setpts=N/FRAME_RATE/TB,`;
    await ffmpeg([
      '-y', '-i', src,
      '-filter_complex', `${pre}${vf},palettegen=max_colors=${p.colors}`,
      pal,
    ]);
    await ffmpeg([
      '-y', '-i', src, '-i', pal,
      '-filter_complex', `${pre}${vf}[x];[x][1:v]paletteuse=dither=sierra2_4a`,
      '-loop', '0', gif,
    ]);
    const mb = statSync(gif).size / 1e6;
    console.log(`  gif attempt ${i + 1}: ${p.w}px @ ${p.fps}fps, ${(p.frac * 100).toFixed(0)}% of each shot -> ${mb.toFixed(1)} MB`);
    if (mb <= 9.5) break;
  }
  const coverFrame = frameOfShotMid('paris-golden');
  const coverSrc = join(FRAMES, `f${String(coverFrame).padStart(5, '0')}.jpg`);
  if (existsSync(coverSrc)) writeFileSync(join(MEDIA, 'cover.png'), readFileSync(coverSrc));
  console.log('wrote', mp4);
  console.log('wrote', join(MEDIA, 'lsps-showcase-preview.gif'));
}

/** global frame index at the midpoint of a shot id */
function frameOfShotMid(id) {
  let acc = 0;
  for (const s of SHOTS) {
    const n = Math.round(s.seconds * FPS);
    if (s.id === id) return acc + Math.round(n / 2);
    acc += n;
  }
  return 0;
}

/**
 * Drive the engine at a fixed camera until the globe surface settles.
 *
 * Cesium only issues imagery requests from its per-frame traversal, so warming
 * has to run the page's own rAF loop — synchronous render() calls from the
 * driver load almost nothing and the surface freezes at zoom 0/1.
 *
 * Card shots (title/end) are pure 2D vector art with the 3D canvas hidden, so
 * there is nothing to warm: running the loop there burns seconds per shot and
 * the surface counter never moves.
 */
async function warm(cdp, shot, frame, budgetMs = 90000, verbose = true) {
  if (shot.kind === 'card') {
    if (verbose) process.stdout.write(`[card ${shot.id}] `);
    return { ms: 0, settled: true, toRender: 0, bright: 0, detail: 0 };
  }
  const t0 = Date.now();
  // skipPaint keeps the loop cheap: Cesium's traversal (which is what issues
  // the imagery requests) still runs, the 2D overlay + canvas readback does not.
  await cdp.ev(`window.__show.__raf(${frame}, { skipPaint: true })`);
  const hist = [];
  let last = { toRender: 0, bright: 0, detail: 0 };
  let settled = false;
  while (Date.now() - t0 < budgetMs) {
    await sleep(350);
    last = JSON.parse(String(await cdp.ev('JSON.stringify(window.__show.__globe())')));
    hist.push(last.detail);
    if (hist.length < 7) continue;
    const w = hist.slice(-4);
    const peak = Math.max(...w);
    const spread = (peak - Math.min(...w)) / Math.max(1e-3, peak);
    // Settled = detail stopped climbing. The absolute floor is low on purpose:
    // a blue-hour shot behind rain has almost no high-frequency content, so a
    // threshold tuned on the noon shots would never let it finish. Detail above
    // ~18 means the imagery is loaded at the zoom the inset actually needs (the
    // panel is only ~580px wide), so tolerate a noisier plateau there.
    if (peak >= 18 ? spread < 0.12 : peak >= 2 && spread < 0.05) {
      settled = true;
      break;
    }
  }
  await cdp.ev('window.__show.__stop()');
  if (verbose) {
    process.stdout.write(
      `[warm ${((Date.now() - t0) / 1000).toFixed(0)}s tiles=${last.toRender} detail=${last.detail}${settled ? '' : ' UNSETTLED'}] `,
    );
  }
  return { ms: Date.now() - t0, settled, ...last };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (ENCODE_ONLY) {
    await encode();
    server.close();
    return process.exit(0);
  }
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('showcase/dist missing — run `npm run build -w @lsps/showcase` first');
  }

  const port = await listen();
  const kill = await launchBrowser();
  const cdp = await Cdp.attach();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  console.log(`serving dist on :${port}, loading showcase page…`);
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?capture=1` });
  let booted = false;
  for (let i = 0; i < 150; i++) {
    booted = await cdp.ev('!!(window.__show && window.__show.__render)').catch(() => false);
    if (booted) break;
    await sleep(1000);
  }
  if (!booted) {
    const msg = await cdp.ev(`document.getElementById('boot')?.textContent || 'no boot element'`).catch(() => '?');
    throw new Error('engine never booted — ' + msg);
  }
  console.log('engine booted;', TOTAL_FRAMES, 'frames =', (TOTAL_FRAMES / FPS).toFixed(1), 's @', FPS, 'fps');

  const t0 = Date.now();
  mkdirSync(FRAMES, { recursive: true });
  const only = arg('--shot', null);
  let acc = 0;
  let captured = 0;

  // Per-shot batching: the camera is fixed within a shot, so tiles are warmed
  // once per shot and every frame after that lands on a settled surface.
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    const n = Math.round(s.seconds * FPS);
    const first = acc;
    const last = acc + n - 1;
    acc += n;

    if (only && s.id !== only) continue;
    const lo = Math.max(first, Number.isFinite(FROM) ? FROM : first);
    const hi = Math.min(last, Number.isFinite(TO) ? TO : last);
    if (lo > hi) continue;

    const missing = [];
    for (let f = lo; f <= hi; f++) {
      if (!existsSync(join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`))) missing.push(f);
    }
    if (!missing.length && !STILLS) continue;

    const mid = Math.round((first + last) / 2);
    if (STILLS) {
      const w = await warm(cdp, s, mid);
      await cdp.ev(`window.__show.__render(${mid})`);
      const sh = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      const f = join(OUT, `still-${s.id}.jpg`);
      writeFileSync(f, Buffer.from(sh.data, 'base64'));
      console.log(`  still ${s.id.padEnd(16)} tiles=${w.toRender} bright=${w.bright} ${w.settled ? "ok" : "UNSETTLED"} ${f}`);
      continue;
    }

    const w = await warm(cdp, s, missing[0]);
    process.stdout.write(`  ${s.id.padEnd(16)} warm ${w.ms}ms tiles=${w.toRender} bright=${w.bright}${w.settled ? "" : " (unsettled)"} -> `);
    for (const f of missing) {
      await cdp.ev(`window.__show.__render(${f})`);
      const sh = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      writeFileSync(join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(sh.data, 'base64'));
      captured++;
    }
    const rate = captured / Math.max(1, (Date.now() - t0) / 1000);
    console.log(`${missing.length} frames (${rate.toFixed(1)} fps overall)`);
  }

  console.log(`done: ${captured} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await cdp.send('Browser.close').catch(() => undefined);
  kill();
  server.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  console.log('\ninterrupted — resume with --from <last+1> (existing frames are kept)');
  if (browser?.pid) {
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { /* gone */ }
  }
  server.close();
  process.exit(130);
});

main().catch((e) => {
  console.error('CAPTURE FAILED:', e.message);
  server.close();
  process.exit(1);
});
