const port = 9223;
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
send('Network.enable');
send('Page.enable');
send('Runtime.enable');
send('Page.navigate', { url: 'http://localhost:5173/' });
const reqs = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.responseReceived') {
    const { requestId, response } = m.params;
    reqs.set(requestId, response.url);
    const mime = (response.mimeType || '') + ' ' + response.status;
    if (mime.includes('text/html'))
      console.log('HTML-RESPONSE', mime, response.url.slice(0, 200));
    if (response.status >= 400 && !response.url.includes('favicon'))
      console.log('HTTP-ERR', mime, response.url.slice(0, 160));
  }
  if (m.method === 'Network.loadingFailed') {
    const u = reqs.get(m.params.requestId);
    console.log('FAILED', m.params.errorText, (u || '').slice(0, 160));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log('EXC:', (d.exception?.description || d.text).slice(0, 300));
  }
};
setTimeout(() => { console.log('DONE'); process.exit(0); }, 30000);
