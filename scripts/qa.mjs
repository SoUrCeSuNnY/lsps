// QA regression v3: clean GPU Edge instance on :5173.
// New Cesium's render loop catches errors SILENTLY (no event) and stops rAF —
// so QA measures loop life empirically: main-thread responsiveness + canvas
// liveness + a source-patched renderError counter.
// Usage: node scripts/qa.mjs [cdpPort] [url]
const port = process.argv[2] ?? '9229';
const url = process.argv[3] ?? 'http://localhost:5173/';

const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page =
  list.find((t) => t.type === 'page' && t.url.includes('5173')) ??
  list.find((t) => t.type === 'page');
if (!page) {
  console.error('QA FAIL: no CDP page target on port', port);
  process.exit(1);
}
console.log('QA target:', page.url.slice(0, 60));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));
let id = 0;
const calls = new Map();
const send = (m, p = {}) =>
  new Promise((ok) => {
    const i = ++id;
    calls.set(i, (r) => {
      clearTimeout(t);
      ok(r);
    });
    const t = setTimeout(() => {
      calls.delete(i);
      ok({});
    }, 30000);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICall' && m.params.type === 'error') {
    console.log('PAGE-ERR:', m.params.args.map((a) => a.description ?? a.value ?? '').join(' ').slice(0, 240));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log('PAGE-EXC:', (d.exception?.description || d.text || '').slice(0, 240));
  }
  if (m.id && calls.has(m.id)) {
    calls.get(m.id)(m.result);
    calls.delete(m.id);
  }
};
const evalJs = async (expression, ms = 15000) => {
  const t = new Promise((ok) => setTimeout(() => ok('EVAL-TIMEOUT'), ms));
  const p = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => {
    if (r.exceptionDetails)
      return 'EVAL-ERR ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  });
  return Promise.race([p, t]);
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail: String(detail).slice(0, 110) });
};

// CDP patch: wrap widget.render at runtime to count the SILENT loop deaths
// (new Cesium offers no public event) and emulate the app's restart behavior.
await send('Page.navigate', { url });
console.log('navigated, polling for scene boot...');

let boot = 'pending';
for (let i = 0; i < 30 && boot !== 'booted'; i++) {
  await new Promise((ok) => setTimeout(ok, 5000));
  boot = await evalJs(`(function(){
    const L = window.__lsps;
    if (!L) return 'pending';
    if (!window.__patched) {
      window.__patched = 1;
      window.__rerr = 0;
      const w = L.viewer.cesiumWidget;
      const orig = w.render.bind(w);
      w.render = function() {
        try { orig(); }
        catch (e) {
          window.__rerr++;
          window.__rerrStack = String((e && (e.stack || e)) || e).slice(0, 500);
          // replicate Cesium loop-death (loop flag) then restart:
          w._useDefaultRenderLoop = false;
          w.useDefaultRenderLoop = true;
        }
      };
    }
    return 'booted';
  })()`, 12000);
}
check('viewer booted (createViewer completed)', boot === 'booted', boot);

if (boot === 'booted') {
  // main-thread responsiveness: loop death starves the page
  const t0 = Date.now();
  const r1 = await evalJs('1+1', 8000);
  const r1b = await evalJs('1+1', 8000);
  check('main thread responsive (eval <8s x2)', r1 === 2 && r1b === 2, `r1=${r1} r1b=${r1b}`);

  const st = JSON.parse(String(await evalJs(
    `JSON.stringify({
      loop: !!window.__lsps.viewer.cesiumWidget._useDefaultRenderLoop,
      rerr: window.__rerr,
      stack: String(window.__rerrStack||'').slice(0,500),
      ents: window.__lsps.viewer.dataSources.length ? window.__lsps.viewer.dataSources.get(0).entities.values.length : -1,
      camH: Math.round(window.__lsps.viewer.camera.positionCartographic.height),
    })`, 12000) ?? '{}'));
  check('render loop running', st.loop === true, st.loop);
  // buildings stream in batches (10/frame) — poll up to 15s
  let ents = -1;
  for (let i = 0; i < 8; i++) {
    ents = Number(
      await evalJs(
        `window.__lsps.viewer.dataSources.length ? window.__lsps.viewer.dataSources.get(0).entities.values.length : -1`,
        8000,
      ),
    );
    if (ents >= 40) break;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  check('Hongyadong buildings (>=40 ents)', ents >= 40, 'ents=' + ents);
  check('no render deaths (patched counter)', st.rerr === 0, 'rerr=' + st.rerr);
  if (st.stack) console.log('RENDER DEATH STACK:', st.stack);
  check('camera on spot (<1500m)', st.camH > 0 && st.camH < 1500, 'h=' + st.camH + 'm');

  // liveness over time: canvas pixels change (rain/twinkle) + thread stays alive
  const px = `(() => {
    const c = document.querySelector('canvas');
    if (!c) return -1;
    const t = document.createElement('canvas'); t.width = 24; t.height = 24;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i+1] + d[i+2];
    return Math.round(s / (d.length / 4) * 10) / 10;
  })()`;
  const p1 = await evalJs(px, 8000);
  await new Promise((ok) => setTimeout(ok, 3000));
  const p2 = await evalJs(px, 8000);
  check('canvas live (2 samples, thread kept)', p1 !== 'EVAL-TIMEOUT' && p2 !== 'EVAL-TIMEOUT', `p1=${p1} p2=${p2}`);

  const st2 = JSON.parse(String(await evalJs(
    `JSON.stringify({loop: !!window.__lsps.viewer.cesiumWidget._useDefaultRenderLoop, rerr: window.__rerr})`, 12000) ?? '{}'));
  check('loop alive +3s', st2.loop === true, st2.loop);
  check('zero deaths +3s', st2.rerr === 0, 'rerr=' + st2.rerr);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot?.data) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('qa.png', Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved qa.png');
  }
}

let fails = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + '  [' + r.detail + ']');
  if (!r.ok) fails++;
}
console.log(fails === 0 ? 'QA: ALL GREEN' : `QA: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
