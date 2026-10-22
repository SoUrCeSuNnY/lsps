// One-off: decode the world-atlas TopoJSON land polygon into plain [lat,lon]
// rings for the 2D card earth. Kept in the repo so the asset is reproducible.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'build', 'dl-land-110m.json');
if (!existsSync(SRC)) throw new Error('download land-110m.json into showcase/build/ first');

const t = JSON.parse(readFileSync(SRC, 'utf8'));
const [sx, sy] = t.transform.scale;
const [tx, ty] = t.transform.translate;

function arc(i) {
  const a = t.arcs[i < 0 ? ~i : i];
  let x = 0;
  let y = 0;
  const pts = [];
  for (const [dx, dy] of a) {
    x += dx;
    y += dy;
    pts.push([tx + x * sx, ty + y * sy]);
  }
  return i < 0 ? pts.reverse() : pts;
}

const rings = [];
for (const g of t.objects.land.geometries) {
  for (const polygon of g.arcs) {
    for (const ring of polygon) {
      let pts = [];
      for (const idx of ring) {
        const p = arc(idx);
        pts = pts.length ? pts.concat(p.slice(1)) : p.slice();
      }
      if (pts.length >= 6) pts.pop(); // drop the duplicated closing vertex
      rings.push(pts.map(([lon, lat]) => [+lat.toFixed(3), +lon.toFixed(3)]));
    }
  }
}
rings.sort((a, b) => b.length - a.length);
const kept = rings.slice(0, 90);
const total = kept.reduce((a, r) => a + r.length, 0);

const body = JSON.stringify(kept);
writeFileSync(
  join(HERE, 'src', 'coastline.ts'),
  `/**
 * Natural Earth 110m land outlines, decoded to [lat, lon] rings.
 * Source: world-atlas land-110m.json (Natural Earth, public domain).
 * Small islands beyond the 90 largest rings are dropped — they are invisible
 * at the card shots' globe radius and cost a ring transform each frame.
 */
export const COAST: number[][][] = ${body};
export const COAST_POINTS = ${total};
`,
);
console.log(`wrote src/coastline.ts: ${kept.length} rings, ${total} points, ${(body.length / 1024).toFixed(0)} KB`);
