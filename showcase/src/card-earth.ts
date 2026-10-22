/**
 * 2D orthographic earth for the title/end cards.
 *
 * Deliberately vector art rather than a live 3D globe: a space-view Cesium scene
 * needs thousands of imagery tiles, and streaming them under a software renderer
 * produces visible tile-seam checkerboarding. This draws the same *information* —
 * real coastlines, the solar terminator, graticule and scout sites — as
 * deterministic geometry, which also keeps a captured frame a pure function.
 */
import { COAST } from './coastline';
import { SITES } from './shots';

type Ctx = CanvasRenderingContext2D;

export interface CardEarth {
  sunLat: number;
  sunLon: number;
}

export { SITES };

const D2R = Math.PI / 180;
type Vec3 = [number, number, number];

/** Sub-solar point: solar longitude is the antimeridian of local noon. */
export function subSolarPoint(date: Date): CardEarth {
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const dayOfYear = Math.floor(
    (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5,
  );
  const decl = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  return { sunLat: decl, sunLon: (12 - hours) * 15 };
}

/**
 * Centre of the visible disc: keep the scout sites on the near side by facing
 * the mean of their longitudes.
 */
export function faceTarget(): { lat: number; lon: number } {
  const lats = SITES.map((s) => s.lat * D2R);
  const lons = SITES.map((s) => s.lon * D2R);
  const x = lons.reduce((a, v, i) => a + Math.cos(lats[i]) * Math.cos(v), 0);
  const y = lons.reduce((a, v, i) => a + Math.cos(lats[i]) * Math.sin(v), 0);
  const z = lats.reduce((a, v) => a + Math.sin(v), 0);
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(z, Math.hypot(x, y));
  return { lat: lat / D2R, lon: ((lon / D2R + 180) % 360) - 180 };
}

function unit(lat: number, lon: number): Vec3 {
  const φ = lat * D2R;
  const λ = lon * D2R;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

function latLonOf(v: Vec3): [number, number] {
  return [Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R, Math.atan2(v[1], v[0]) / D2R];
}

/** Rotate geodetic (lat,lon) to screen; returns null on the far side. */
function project(
  lat: number,
  lon: number,
  c: { lat: number; lon: number },
  r: number,
  cx: number,
  cy: number,
) {
  const φ = lat * D2R;
  const λ = (lon - c.lon) * D2R;
  const φc = c.lat * D2R;
  const cosC = Math.sin(φc) * Math.sin(φ) + Math.cos(φc) * Math.cos(φ) * Math.cos(λ);
  if (cosC < 0) return null;
  const px = Math.cos(φ) * Math.sin(λ);
  const py = Math.cos(φc) * Math.sin(φ) - Math.sin(φc) * Math.cos(φ) * Math.cos(λ);
  return { x: cx + px * r, y: cy - py * r, front: cosC };
}

/**
 * Cut a ring to the visible hemisphere.
 *
 * Land polygons straddle the limb, and `project` drops far-side vertices, which
 * fills the visible half of a ring with a chord straight across the disc.
 * Clipping in 3D against dot(p, view) >= 0 and renormalising the crossing points
 * onto the sphere puts that edge on the limb, where it belongs.
 */
function clipToHemisphere(ring: number[][], view: Vec3): number[][] {
  const out: number[][] = [];
  const dot = (v: Vec3) => v[0] * view[0] + v[1] * view[1] + v[2] * view[2];
  let prev = unit(ring[ring.length - 1][0], ring[ring.length - 1][1]);
  let prevIn = dot(prev) >= 0;
  for (const [lat, lon] of ring) {
    const cur = unit(lat, lon);
    const curIn = dot(cur) >= 0;
    if (prevIn !== curIn) {
      const k = dot(prev) / (dot(prev) - dot(cur));
      const m: Vec3 = [
        prev[0] + (cur[0] - prev[0]) * k,
        prev[1] + (cur[1] - prev[1]) * k,
        prev[2] + (cur[2] - prev[2]) * k,
      ];
      const n = Math.hypot(m[0], m[1], m[2]) || 1;
      out.push(latLonOf([m[0] / n, m[1] / n, m[2] / n]));
    }
    if (curIn) out.push([lat, lon]);
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

/** Is this point in daylight, given the sub-solar point? */
function lit(lat: number, lon: number, sun: CardEarth): boolean {
  const φ = lat * D2R;
  const λ = (lon - sun.sunLon) * D2R;
  const φs = sun.sunLat * D2R;
  return Math.sin(φs) * Math.sin(φ) + Math.cos(φs) * Math.cos(φ) * Math.cos(λ) > 0;
}

/**
 * Night-side polygon in screen space, as a radial sweep.
 *
 * Stroking latitude circles (the obvious approach) reads as a fingerprint under
 * the reel's grain. In orthographic projection a screen ray leaves the centre at
 * zenith angle gamma and dot(p, sun) = A cos(gamma) + C sin(gamma), a single
 * sinusoid, so the dark span along each ray is one interval with a closed form.
 */
function nightPath(
  face: { lat: number; lon: number },
  sun: CardEarth,
  r: number,
  cx: number,
  cy: number,
): Path2D {
  const v = unit(face.lat, face.lon);
  const e = unit(90, 0);
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (a: Vec3): Vec3 => {
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / n, a[1] / n, a[2] / n];
  };
  const ex = norm(cross(e, v));
  const ey = cross(v, ex);
  const s = unit(sun.sunLat, sun.sunLon);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const A = dot(v, s);
  const Bx = dot(ex, s);
  const By = -dot(ey, s); // screen y grows downward

  const N = 180;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const C = Bx * Math.cos(th) + By * Math.sin(th);
    let lo = 0;
    let hi = Math.PI / 2;
    if (A >= 0 && C >= 0) lo = hi = 0;
    else if (A < 0 && C >= 0) hi = Math.atan2(-A, C);
    else if (A >= 0 && C < 0) lo = Math.atan2(A, -C);
    for (const [g, into] of [
      [hi, outer],
      [lo, inner],
    ] as [number, [number, number][]][]) {
      into.push([cx + r * Math.sin(g) * Math.cos(th), cy + r * Math.sin(g) * Math.sin(th)]);
    }
  }
  const p = new Path2D();
  outer.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  for (let i = inner.length - 1; i >= 0; i--) p.lineTo(inner[i][0], inner[i][1]);
  p.closePath();
  return p;
}

export function drawCardEarth(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  canvasH: number,
  face: { lat: number; lon: number },
  sun: CardEarth,
  t: number,
  dpr: number,
  label: string,
): void {
  ctx.save();

  // atmosphere halo
  const glow = ctx.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.16);
  glow.addColorStop(0, 'rgba(96,164,224,0.42)');
  glow.addColorStop(1, 'rgba(96,164,224,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.16, 0, 7);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  const base = ctx.createRadialGradient(
    cx - r * 0.3,
    cy - r * 0.3,
    r * 0.1,
    cx,
    cy,
    r * 1.25,
  );
  base.addColorStop(0, '#1d5f86');
  base.addColorStop(0.55, '#123f5e');
  base.addColorStop(1, '#08202f');
  ctx.fillStyle = base;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const view = unit(face.lat, face.lon);

  // Real coastlines, clipped to the visible hemisphere.
  ctx.fillStyle = 'rgba(86,132,96,0.92)';
  ctx.strokeStyle = 'rgba(150,196,150,0.5)';
  ctx.lineWidth = Math.max(0.5, dpr * 0.55);
  for (const ring of COAST) {
    const vis = clipToHemisphere(ring, view);
    if (vis.length < 3) continue;
    ctx.beginPath();
    let pen = false;
    for (const [lat, lon] of vis) {
      const p = project(lat, lon, face, r, cx, cy);
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else {
        ctx.moveTo(p.x, p.y);
        pen = true;
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Night side: one analytic polygon, so the terminator is a clean curve.
  ctx.fillStyle = 'rgba(6,10,18,0.76)';
  ctx.fill(nightPath(face, sun, r, cx, cy));

  // graticule
  ctx.strokeStyle = 'rgba(150,200,230,0.14)';
  ctx.lineWidth = Math.max(0.6, dpr * 0.6);
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    let pen = false;
    for (let j = 0; j <= 180; j++) {
      const p = project(lat, -180 + (j / 180) * 360, face, r, cx, cy);
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else {
        ctx.moveTo(p.x, p.y);
        pen = true;
      }
    }
    ctx.stroke();
  }
  for (let lon = -180; lon < 180; lon += 30) {
    ctx.beginPath();
    let pen = false;
    for (let j = 0; j <= 120; j++) {
      const p = project(-90 + (j / 120) * 180, lon, face, r, cx, cy);
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else {
        ctx.moveTo(p.x, p.y);
        pen = true;
      }
    }
    ctx.stroke();
  }

  // scout sites: lit by the real terminator, pulse in sequence
  SITES.forEach((site, i) => {
    const p = project(site.lat, site.lon, face, r, cx, cy);
    if (!p) return;
    const phase = (t * 1.6 + i * 0.42) % 1;
    const isDay = lit(site.lat, site.lon, sun);
    const pr = r * 0.012 + 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr, 0, 7);
    ctx.fillStyle = isDay ? '#ffd08a' : '#8fd8ff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr + phase * r * 0.05, 0, 7);
    ctx.strokeStyle = `rgba(255,208,138,${(1 - phase) * 0.55 * p.front})`;
    ctx.lineWidth = Math.max(0.7, dpr);
    ctx.stroke();
  });

  ctx.restore();

  // limb
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.strokeStyle = 'rgba(170,214,240,0.4)';
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();

  ctx.font = `${Math.max(8, r * 0.045)}px ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(190,215,235,0.5)';
  ctx.textAlign = 'center';
  // Inside the canvas: cy + r*1.3 pushed the caption past the bottom edge at
  // the card shots' disc radius.
  ctx.fillText(label, cx, Math.min(canvasH - 14, cy + r * 1.14));
  ctx.textAlign = 'start';
  ctx.restore();
}
