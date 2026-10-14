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
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5173/' });
await new Promise((ok) => setTimeout(ok, 25000));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('shot4.png', Buffer.from(shot.data, 'base64'));
console.log('saved shot4.png bytes=' + shot.data.length);
process.exit(0);
