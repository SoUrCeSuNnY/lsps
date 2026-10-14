const port = 9223;
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));
let id = 0;
const calls = new Map();
const send = (method, params = {}) =>
  new Promise((ok) => {
    const i = ++id;
    calls.set(i, ok);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && calls.has(m.id)) {
    calls.get(m.id)(m.result);
    calls.delete(m.id);
  }
};
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
await new Promise((ok) => setTimeout(ok, 15000));
const probe = `(() => {
  const c = document.querySelector('canvas');
  const ces = window.__cesiumDebug || null;
  return JSON.stringify({
    panels: !!document.querySelector('.panels'),
    canvas: c ? { w: c.width, h: c.height } : null,
    bodyText: document.body.innerText.slice(0, 220),
  });
})()`;
const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
console.log(r.result?.value ?? JSON.stringify(r));
process.exit(0);
