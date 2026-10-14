// CDP console/exception collector for headless debugging (node 24 native WebSocket)
const port = 9223;
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
send('Runtime.enable');
send('Log.enable');
send('Page.enable');
send('Page.navigate', { url: 'http://localhost:5173/' });
const seen = new Set();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  const p = m.method;
  if (p === 'Log.entryAdded') {
    const en = m.params.entry;
    if (en.level === 'error' || en.level === 'warning') {
      const txt = `${en.source} ${en.url}:${en.lineNumber} ${en.text}\n${en.stackTrace?.callFrames.map((f) => `  at ${f.url}:${f.lineNumber}`).join('\n') ?? ''}`;
      if (!seen.has(txt)) { seen.add(txt); console.log('=== LOG.' + en.level + ' ===\n' + txt.slice(0, 2000)); }
    }
  }
  if (p === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const txt = d.exception?.description || d.text;
    const stack = (d.stack?.callFrames || []).map((f) => `  at ${f.functionName} ${f.url}:${f.lineNumber}`).join('\n');
    const full = `${txt}\n${stack}`;
    if (!seen.has(full)) { seen.add(full); console.log('=== EXCEPTION ===\n' + full.slice(0, 2000)); }
  }
  if (p === 'Runtime.consoleAPICall' && ['error', 'warning'].includes(m.params.type)) {
    const txt = m.params.args.map((a) => a.description ?? a.value).join('\n');
    if (!seen.has(txt)) { seen.add(txt); console.log('=== CONSOLE.' + m.params.type + ' ===\n' + txt.slice(0, 2000)); }
  }
};
setTimeout(() => { console.log('DONE-COLLECT'); process.exit(0); }, 40000);
