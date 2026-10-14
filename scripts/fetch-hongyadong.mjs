// Fetches Hongyadong (重庆洪崖洞) OSM building footprints into
// apps/web/public/data/hongyadong.json for instant, rate-limit-free startup.
// Data: © OpenStreetMap contributors (ODbL) — see licenses/ATTRIBUTIONS.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'lsps-viewfinder/0.2 (location scouting; github.com/SoUrCeSuNnY/lsps)';
const q = `[out:json][timeout:25];(way(around:240,29.562,106.5798)["building"];);out geom tags;`;

let json = null;
for (let attempt = 0; attempt < 4 && !json; attempt++) {
  for (const base of ['https://overpass.kumi.systems', 'https://overpass-api.de', 'https://overpass.private.coffee', 'https://overpass.osm.ch']) {
    try {
      const r = await fetch(base + '/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(q),
      });
      const t = await r.text();
      const j = JSON.parse(t);
      console.log(base, r.status, 'elements:', j.elements.length);
      if (j.elements.length > 0) {
        json = j;
        break;
      }
    } catch (e) {
      console.log(base, 'skip:', String(e).slice(0, 60));
    }
  }
  if (!json) await new Promise((ok) => setTimeout(ok, 3000));
}
if (!json) {
  console.error('all overpass mirrors failed');
  process.exit(1);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps/web/public/data/hongyadong.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(json));
console.log('saved', out, json.elements.length, 'buildings');
