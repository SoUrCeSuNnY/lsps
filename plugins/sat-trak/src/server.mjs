// Isolated satellite pass calculator (skeleton).
// The MIT code here never imports GPL at module load: satellite.js is dynamically
// imported only if the user installed it inside this directory.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 7788);
let sat = null;
try {
  sat = (await import('satellite.js')).default ?? (await import('satellite.js'));
  console.log('satellite.js loaded (GPL-2.0, isolated install)');
} catch {
  console.log('satellite.js not installed — run: npm install satellite.js (this dir). /passes will return 503.');
}

async function fetchTle(group) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`celestrak ${r.status}`);
  return r.text();
}

function parseTle(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    out.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (u.pathname === '/health') {
    res.end(JSON.stringify({ ok: true, engine: sat ? 'satellite.js' : null }));
    return;
  }
  if (u.pathname === '/passes') {
    if (!sat) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'satellite.js not installed' }));
      return;
    }
    const lat = Number(u.searchParams.get('lat'));
    const lon = Number(u.searchParams.get('lon'));
    const minEl = Number(u.searchParams.get('minEl') ?? 10);
    const group = u.searchParams.get('group') ?? 'stations';
    try {
      const tles = parseTle(await fetchTle(group));
      const observer = { lat, lon, alt: 0.1 };
      const passes = [];
      const start = new Date(`${u.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      for (const t of tles.slice(0, 60)) {
        const rec = sat.twoline2satrec(t.l1, t.l2);
        let cur = null;
        for (let m = 0; m <= 1440; m += 1) {
          const dt = new Date(start.getTime() + m * 60000);
          const posVel = sat.propagate(rec, dt);
          if (!posVel?.position) continue;
          const gmst = sat.gmst(dt);
          const ecf = sat.eciToEcf(posVel.position, gmst);
          const el = sat.ecfToLookAngles(observer, ecf).elevation * (180 / Math.PI);
          if (el > minEl && !cur) cur = { name: t.name, aos: dt.toISOString(), maxEl: el, maxElTime: dt.toISOString() };
          if (el > minEl && cur) {
            if (el > cur.maxEl) { cur.maxEl = el; cur.maxElTime = dt.toISOString(); }
          } else if (el <= minEl && cur) {
            cur.los = dt.toISOString();
            passes.push(cur);
            cur = null;
          }
        }
      }
      passes.sort((a, b) => b.maxEl - a.maxEl);
      res.end(JSON.stringify({ passes: passes.slice(0, 20) }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});

server.listen(PORT, '127.0.0.1', () => console.log(`sat-trak listening on http://127.0.0.1:${PORT}`));
