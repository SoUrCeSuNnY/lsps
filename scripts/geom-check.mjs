import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('apps/web/public/data/hongyadong.json', 'utf8'));
let issues = 0;
for (const e of j.elements) {
  const g = e.geometry || [];
  const n = g.length;
  if (n < 4) continue;
  const closedDup = g[0].lat === g[n - 1].lat && g[0].lon === g[n - 1].lon;
  let dup = 0;
  for (let i = 1; i < n; i++) if (g[i].lat === g[i - 1].lat && g[i].lon === g[i - 1].lon) dup++;
  const seg = (a, b, c, d) => {
    const o = (p, q, r) => (q.lat - p.lat) * (r.lon - p.lon) - (q.lon - p.lon) * (r.lat - p.lat);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0);
  };
  let selfX = 0;
  for (let i = 0; i < n - 1; i++) for (let k = i + 2; k < n - 1; k++) if (seg(g[i], g[i + 1], g[k], g[k + 1])) selfX++;
  if (closedDup || dup > 0 || selfX > 0) {
    issues++;
    console.log(e.id, 'pts', n, closedDup ? 'closedDup' : '', dup ? 'dupPts:' + dup : '', selfX ? 'selfX:' + selfX : '', e.tags?.name || '');
  }
}
console.log('total:', j.elements.length, 'issues:', issues);
