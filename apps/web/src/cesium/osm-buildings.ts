import * as Cesium from 'cesium';

/**
 * Loads OSM building footprints from the public Overpass API and extrudes them
 * as lit facades with a procedural night-illumination canvas texture (the
 * Hongyadong stilted-house look). Data: © OpenStreetMap contributors (ODbL).
 * No token, no private data — open OSM geometry + our own rendering.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

export interface BuildingHandle {
  count: number;
  remove(): void;
}

function parseHeight(tags: Record<string, string> | undefined): number {
  const h = tags?.height;
  if (h) {
    const m = parseFloat(h.replace(/"/g, ''));
    if (Number.isFinite(m) && m > 2) return Math.min(m, 80);
  }
  const lv = tags?.['building:levels'];
  if (lv) {
    const n = parseFloat(lv);
    if (Number.isFinite(n) && n > 0) return Math.min(n * 3.1, 80);
  }
  return 12;
}

function perimeter(positions: Cesium.Cartesian3[]): number {
  let p = 0;
  for (let i = 0; i < positions.length - 1; i++) p += Cesium.Cartesian3.distance(positions[i], positions[i + 1]);
  return p;
}

/**
 * Overpass returns closed ways with a duplicated closing vertex.
 * Cesium's earcut triangulation chokes (RangeError: invalid array length) on
 * consecutive duplicate points — strip them and any explicit ring closure.
 */
function cleanRing(g: { lat: number; lon: number }[]): number[] | null {
  const flat: number[] = [];
  for (let i = 0; i < g.length; i++) {
    const p = g[i];
    const q = g[i + 1];
    if (q && q.lat === p.lat && q.lon === p.lon) continue;
    flat.push(p.lon, p.lat);
  }
  if (flat.length >= 4 && flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1]) {
    flat.splice(flat.length - 2, 2);
  }
  return flat.length >= 6 ? flat : null;
}

let facadeCache = new Map<string, HTMLCanvasElement>();

/** Procedural lit-window facade: warm gold windows on dark timber — 洪崖洞夜景. */
function facadeCanvas(seed: number, glow: number): HTMLCanvasElement {
  const key = seed + ':' + glow;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#2b1d12';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#1c130b';
  for (let y = 0; y < 128; y += 16) x.fillRect(0, y, 128, 2);
  let rnd = seed * 9301 + 49297;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280), rnd / 233280);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      if (rand() < glow) {
        const warm = rand();
        x.fillStyle = warm > 0.5 ? '#ffcf7a' : warm > 0.22 ? '#ffb347' : '#ff8c42';
        x.fillRect(gx * 16 + 4, gy * 16 + 4, 9, 9);
        x.fillStyle = 'rgba(255,190,110,0.25)';
        x.fillRect(gx * 16 + 2, gy * 16 + 2, 13, 13);
      } else if (rand() < 0.16) {
        x.fillStyle = '#5a4a33';
        x.fillRect(gx * 16 + 4, gy * 16 + 4, 9, 9);
      }
    }
  }
  facadeCache.set(key, c);
  return c;
}

export async function loadOsmBuildings(
  viewer: Cesium.Viewer,
  lat: number,
  lon: number,
  radius = 240,
): Promise<BuildingHandle> {
  const body = `data=[out:json][timeout:25];(way(around:${radius},${lat},${lon})["building"];);out geom tags;`;
  const r = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`overpass ${r.status}`);
  const j = (await r.json()) as { elements: OverpassElement[] };
  return extrude(viewer, j.elements ?? []);
}

/** Packed scene data (public/data/*.json, produced by scripts/fetch-hongyadong.mjs). */
export async function loadPackedBuildings(viewer: Cesium.Viewer, url: string): Promise<BuildingHandle> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`packed ${r.status}`);
  const j = (await r.json()) as { elements: OverpassElement[] };
  return extrude(viewer, j.elements ?? []);
}

async function extrude(viewer: Cesium.Viewer, elements: OverpassElement[]): Promise<BuildingHandle> {
  const group = new Cesium.CustomDataSource('osm-buildings');
  const tp = viewer.scene.terrainProvider;
  const hasTerrain = tp && !(tp instanceof Cesium.EllipsoidTerrainProvider);
  const els = elements.filter((e) => e.geometry && e.geometry.length >= 4);
  const centers = els.map((el) => {
    const s = el.geometry!.reduce(
      (a, p) => Cesium.Cartesian3.add(a, Cesium.Cartesian3.fromDegrees(p.lon, p.lat), new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    return Cesium.Cartographic.fromCartesian(Cesium.Cartesian3.multiplyByScalar(s, 1 / el.geometry!.length, s));
  });
  const bases = new Array<number>(els.length).fill(0);
  if (hasTerrain) {
    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(tp, centers);
      sampled.forEach((p, i) => (bases[i] = Number.isFinite(p?.height) ? p.height : 0));
    } catch {
      /* keep flat bases */
    }
  }
  els.forEach((el, idx) => {
    const g = el.geometry!;
    const flat = cleanRing(g);
    if (!flat) return;
    const h = parseHeight(el.tags);
    const seed = idx * 7 + 3;
    const glow = el.tags?.name && /洪崖|吊脚|民宿|酒/.test(el.tags.name) ? 0.72 : 0.45;
    const per = Math.max(1, Math.round(perimeter(Cesium.Cartesian3.fromDegreesArray(flat)) / 14));
    const repV = Math.max(1, Math.round(h / 9));
    const base = bases[idx];
    const ent = group.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
        height: base,
        extrudedHeight: base + h,
        material: new Cesium.ImageMaterialProperty({ image: facadeCanvas(seed, glow), transparent: false }),
        outline: false,
      },
    });
    if (ent.polygon) {
      const mp = ent.polygon.material as Cesium.ImageMaterialProperty;
      mp.repeat = new Cesium.ConstantProperty(new Cesium.Cartesian2(per, repV));
    }
    if (el.tags?.name) {
      const c = centers[idx];
      group.entities.add({
        position: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, base + h + 20),
        label: {
          text: el.tags.name,
          font: '13px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#ffd9a0'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  });
  viewer.dataSources.add(group);
  return {
    count: els.length,
    remove: () => {
      viewer.dataSources.remove(group, true);
    },
  };
}