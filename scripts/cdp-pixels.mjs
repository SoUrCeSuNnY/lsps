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
const expr = `(() => {
  const c = document.querySelector('canvas');
  if (!c) return 'no canvas';
  const t = document.createElement('canvas');
  t.width = 64; t.height = 64;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
  const n = d.length / 4;
  return JSON.stringify({ avgR: (r/n)|0, avgG: (g/n)|0, avgB: (b/n)|0, css: getComputedStyle(document.querySelector('.cesium')).display });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(r.result?.value ?? JSON.stringify(r.exceptionDetails ?? r));
process.exit(0);
