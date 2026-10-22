import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  exposureDeltaStops,
  illuminance,
  sensorById,
  skyQuality,
  shutterSecondsForFps,
  verticalFovDeg,
  horizontalFovDeg,
} from '@lsps/core';
import { Effects } from 'app/cesium/effects';
import { StarField } from 'app/cesium/starfield';
import { makeImagery } from 'app/cesium/providers';
import { buildLandmark, type Landmark3d } from './landmark3d';
import { skyInfo, daySky } from 'app/lib/astro';
import { FPS, TOTAL_FRAMES, frameToState, frameToTimecode, shotEase, SITES, type Shot } from './shots';
import { drawSkyline, silhouetteColor, mixHex, drawFlare, drawSkyGlow, SKYLINE_TOP } from './skyline';
import { drawCardEarth, faceTarget, subSolarPoint } from './card-earth';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const stageEl = document.getElementById('stage3d')!;
const p2d = document.getElementById('panel2d') as HTMLCanvasElement;
const scopeC = document.getElementById('scope-c') as HTMLCanvasElement;
const reel = document.getElementById('reel')!;
const boot = document.getElementById('boot')!;

const $ = (id: string) => document.getElementById(id)!;
const el = {
  meta: $('meta'),
  gauges: $('gauges'),
  ev: $('ev-meter'),
  scope: $('scope'),
  reticle: $('reticle'),
  rec: $('rec'),
  scrub: $('scrub'),
  mTime: $('m-time'),
  mSun: $('m-sun'),
  mSky: $('m-sky'),
  mWx: $('m-wx'),
  gFocal: $('g-focal'),
  gAp: $('g-ap'),
  gIso: $('g-iso'),
  gSh: $('g-sh'),
  gNd: $('g-nd'),
  gFov: $('g-fov'),
  evFill: $('ev-fill'),
  evVal: $('ev-val'),
  scrubFill: $('scrub-fill'),
  scrubKnob: $('scrub-knob'),
};

/**
 * Warm-up mode: run Cesium's per-frame traversal (which is what issues imagery
 * requests) without painting the 2D plate. The plate composites the whole
 * 1600x900 canvas, ~900 grain rects and a WebGL readback per call; under
 * SwiftShader that starves the tile stream and blocks the driver's own
 * evaluate calls, so a warm that should take seconds takes minutes.
 */
let skipPaint = false;

let viewer: Cesium.Viewer;
let fx: Effects;
let stars: StarField;
const scopeDays = new Map<string, ReturnType<typeof daySky>>();
let rafId = 0;

/**
 * Landmark massing — the product's signature feature, built from geometry the
 * reel owns (see landmark3d.ts). The live app streams footprints from Overpass
 * OSM, which a frame export cannot depend on: the public instances are
 * rate-limited and unreachable from the render network, so captured frames would
 * vary with an external service's availability.
 */
let builtShot = '';
let builtHandle: Landmark3d | null = null;

function showLandmarkFor(s: Shot, night: number): void {
  const key = `${s.id}:${night > 0.5 ? 'n' : 'd'}`;
  if (key === builtShot) return;
  builtShot = key;
  builtHandle?.remove();
  // s.lat/s.lon is where the camera stands; s.cam is the landmark being filmed.
  builtHandle = buildLandmark(
    viewer,
    s.skyline,
    s.cam.lat,
    s.cam.lon,
    s.id.length * 7 + Math.round(s.cam.lat),
    night > 0.5,
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pseudo-random in [0,1) — star positions must not vary between runs. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Space background + the 2D vector earth, for the title and end cards. */
function drawCardScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  st: ReturnType<typeof frameToState>,
  date: Date,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#04060c');
  g.addColorStop(1, '#070c16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 420; i++) {
    const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const b = Math.sin(i * 269.5 + 183.3) * 24634.6345;
    const x = (a - Math.floor(a)) * W;
    const y = (b - Math.floor(b)) * H;
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(st.frame * 0.06 + i));
    ctx.fillStyle = `rgba(226,236,255,${0.16 + 0.5 * tw * ((i % 7) / 7)})`;
    const s = Math.max(1, dpr * (i % 23 === 0 ? 1.8 : 1));
    ctx.fillRect(x, y, s, s);
  }

  const face = faceTarget();
  const sun = subSolarPoint(date);
  const drift = -12 + st.local * 24;
  const isTitle = st.shot.id === 'title';
  const r = Math.min(W, H) * (isTitle ? 0.42 : 0.3);
  drawCardEarth(
    ctx,
    W * (isTitle ? 0.72 : 0.5) + drift * dpr,
    H * (isTitle ? 0.56 : 0.52),
    r,
    H,
    { lat: face.lat, lon: face.lon + drift * 0.35 },
    sun,
    st.frame / FPS,
    dpr,
    `${SITES.length} SCOUT SITES · ${date.toISOString().slice(0, 10)} · REAL TERMINATOR`,
  );
}

/**
 * The reel's basemap. Tiles come from the local caching proxy
 * (showcase/tileproxy.mjs), mounted by both the dev server and the capture
 * server. Talking to tile.openstreetmap.org directly does not work from here:
 * that CDN is unreachable on this network, so every shot warmed for 150 s and
 * never settled. If the page is served without the proxy, fall back to the
 * app's own OSM provider.
 */
async function makeBasemap(): Promise<Cesium.ImageryProvider> {
  try {
    const probe = await fetch('/tiles/1/0/0.jpg', { method: 'HEAD' });
    if (probe.ok) {
      return new Cesium.UrlTemplateImageryProvider({
        url: '/tiles/{z}/{x}/{y}.jpg',
        maximumLevel: 16,
        credit: new Cesium.Credit('© Esri, Maxar, Earthstar Geographics · © OpenStreetMap contributors'),
      });
    }
  } catch {
    /* proxy not mounted */
  }
  return makeImagery('osm', { ionToken: '', tdtKey: '' });
}

async function boot3d(): Promise<void> {
  const basemap = await makeBasemap();
  viewer = new Cesium.Viewer(stageEl, {
    baseLayer: Cesium.ImageryLayer.fromProviderAsync(Promise.resolve(basemap)),
    terrain: undefined,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    baseLayerPicker: false,
    infoBox: false,
    selectionIndicator: false,
    showRenderLoopErrors: false,
    shouldAnimate: false,
    contextOptions: { webgl: { preserveDrawingBuffer: true, powerPreference: 'high-performance' } },
  });
  // No ion token in the showcase (it must run keyless on CI and for visitors),
  // so the globe stays ellipsoidal — that is what the earth shots frame anyway.
  const s = viewer.scene;
  s.globe.enableLighting = true;
  s.globe.baseColor = Cesium.Color.fromCssColorString('#070d18');
  s.highDynamicRange = true;
  s.fog.enabled = true;
  if (s.sun) s.sun.show = true;
  if (s.moon) s.moon.show = true;
  if (s.skyAtmosphere) s.skyAtmosphere.brightnessShift = -0.12;
  s.backgroundColor = Cesium.Color.fromCssColorString('#04060a');
  viewer.shadows = true;
  const sm = (s as unknown as { shadowMap?: { shadowDarkness: number; softShadows: boolean } }).shadowMap;
  if (sm) {
    sm.shadowDarkness = 0.8;
    sm.softShadows = true;
  }
  viewer.scene.screenSpaceCameraController.enableInputs = false;

  fx = new Effects(viewer);
  stars = new StarField(s);
  (window as unknown as { __show: unknown }).__show = {
    Cesium,
    viewer,
    fx,
    stars,
    renderFrame,
    // The driver's capture call always paints the 2D plate — skipPaint is a
    // warm-loop-only mode, so it has to be cleared here rather than inherited.
    __render: (n: number) => {
      skipPaint = false;
      renderFrame(n);
    },
    /**
     * Tile streaming only advances on animation frames — Cesium issues its
     * imagery requests from the per-frame globe traversal, so a render() called
     * synchronously by the driver freezes the surface at zoom 0/1. __raf gives
     * the pipeline a real frame loop, exactly like the live app.
     */
    __raf: (n: number, opts?: { skipPaint?: boolean }) => {
      cancelAnimationFrame(rafId);
      skipPaint = !!opts?.skipPaint;
      const loop = (): void => {
        renderFrame(n);
        rafId = requestAnimationFrame(loop);
      };
      loop();
    },
    __stop: (): void => cancelAnimationFrame(rafId),
    // Globe readiness. Tiles arrive over the network, so a frame captured
    // before the surface settles paints an untextured ellipsoid.
    //
    // The gate is the *standard deviation* of the rendered canvas, not the
    // tile count: a ground-level camera sits inside a single quadtree leaf, so
    // `_tilesToRender` reports 1 forever while the imagery refines underneath
    // it. Detail (untextured = a smooth sky gradient, textured = streets) is
    // what actually distinguishes a settled frame, and unlike an absolute
    // brightness threshold it works for a noon shot and a midnight one alike.
    __globe: () => {
      const g = viewer.scene.globe as typeof viewer.scene.globe & {
        _surface?: { _tilesToRender?: unknown[] };
      };
      const c = viewer.canvas;
      const S = 64;
      const t = document.createElement('canvas');
      t.width = S;
      t.height = S;
      const x = t.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(c, 0, 0, S, S);
      const d = x.getImageData(0, 0, S, S).data;
      const n = d.length / 4;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      const mean = sum / n;
      let varSum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3 - mean;
        varSum += l * l;
      }
      return {
        toRender: g._surface?._tilesToRender?.length ?? 0,
        bright: Math.round(mean * 10) / 10,
        detail: Math.round(Math.sqrt(varSum / n) * 10) / 10,
      };
    },
  };
}

/**
 * Where the live 3D panel is composited, as fractions of the frame. The 3D
 * canvas is *only* ever shown here — the 2D plate is opaque and covers the
 * rest — so `resize()` sizes the Cesium canvas to this rect instead of the
 * full page. Rasterising 1600×900 to fill a 584×378 window costs ~4.7× the
 * pixels for nothing, and on a software GPU that is the whole capture budget.
 */
const INSET = { x: 0.565, y: 0.155, w: 0.365, h: 0.42 };

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  p2d.width = Math.floor(innerWidth * dpr);
  p2d.height = Math.floor(innerHeight * dpr);
  scopeC.width = 360;
  scopeC.height = 150;
  // `inset` must be cleared first: it is the shorthand for the four offsets and
  // assigning it after them would reset the values just set.
  stageEl.style.inset = 'auto';
  stageEl.style.left = `${INSET.x * 100}%`;
  stageEl.style.top = `${INSET.y * 100}%`;
  stageEl.style.width = `${INSET.w * 100}%`;
  stageEl.style.height = `${INSET.h * 100}%`;
  if (viewer) viewer.resize();
}

/**
 * Night grade for the live 3D panel.
 *
 * `globe.enableLighting` is set, but on this build it does not visibly darken
 * the imagery: with the sun 15° below the horizon the rendered canvas measures
 * the same mean luminance (46.8) as it does at 15:00Z (47.1), and toggling the
 * flag moves it by 0.3/255. So the night look is applied on the imagery layer
 * directly — `brightness` is Cesium's own per-layer multiply and it does take
 * effect (0.08 measured 31.9, 0.35 measured 39.7, 1.0 measured 46.8). The moon
 * term lifts it back a little: a bright moon over snow really does light a
 * city. This runs after `setCloud` and folds its dimming in, because both
 * write the same property.
 */
function setNightGrade(night: number, moonUp: number, cloudPct: number): void {
  const lay = viewer.imageryLayers.get(0);
  if (!lay) return;
  const lift = 1 + 0.55 * moonUp;
  const k = (1 - night) + night * 0.1 * lift;
  lay.brightness = k * (1 - 0.3 * Math.min(1, Math.max(0, cloudPct / 100)));
  lay.saturation = 1 - 0.45 * night;
}

/** Sky palette keyed on real sun altitude — the 2D half of the reel. */function skyColors(sunAlt: number, cloud: number, night: number): [string, string, string] {
  const stops: [number, [number, number, number]][] = [
    [-18, [6, 10, 22]],
    [-9, [16, 26, 56]],
    [-4, [58, 44, 92]],
    [-1, [176, 84, 70]],
    [4, [232, 148, 74]],
    [14, [96, 156, 214]],
    [45, [56, 128, 206]],
    [80, [34, 106, 190]],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (sunAlt >= stops[i][0] && sunAlt <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const t = (sunAlt - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const mix = (i: number) => Math.round(lerp(a[1][i], b[1][i], t));
  const desat = (c: [number, number, number], k: number): [number, number, number] => {
    const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return [
      Math.round(c[0] + (g - c[0]) * k),
      Math.round(c[1] + (g - c[1]) * k),
      Math.round(c[2] + (g - c[2]) * k),
    ];
  };
  const cloudK = 0.42 * (cloud / 100) + 0.22 * night;
  const top = desat([mix(0) * 0.55, mix(1) * 0.55, mix(2) * 0.62], cloudK);
  const mid = desat([mix(0), mix(1), mix(2)], cloudK);
  const low = desat(
    [Math.min(255, mix(0) * 1.3 + 26), Math.min(255, mix(1) * 1.12 + 16), Math.min(255, mix(2) * 0.86 + 8)],
    cloudK,
  );
  const hex = (c: [number, number, number]) =>
    `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
  return [hex(top), hex(mid), hex(low)];
}

/**
 * The cinematic plate.
 *
 * Full-bleed 2D art carries the composition — sky, sun, skyline, ground
 * reflection, flare — because it is deterministic, renders offline, and is
 * *designed*: every element is placed for the frame. The live Cesium scene,
 * whose appearance depends on streaming imagery and network-reachable building
 * data, is composited in as a viewport inset: that is honest (it is the same
 * engine, the same sun, the same lens) and it never lets a tile outage break a shot.
 */
/**
 * Moon with its real phase. The shadow disc is cut from the lit disc on a small
 * offscreen buffer: destination-out on the plate itself would erase the sky
 * behind the moon, not just the disc.
 */
let moonC: HTMLCanvasElement | null = null;
function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, illum: number, alpha: number, dpr: number): void {
  const size = Math.ceil(r * 2 + 4);
  moonC = moonC ?? document.createElement('canvas');
  moonC.width = size;
  moonC.height = size;
  const c = moonC.getContext('2d')!;
  c.clearRect(0, 0, size, size);
  const cx = size / 2;
  c.fillStyle = `rgba(238,244,255,${alpha})`;
  c.beginPath();
  c.arc(cx, cx, r, 0, 7);
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'rgba(0,0,0,1)';
  c.beginPath();
  // Offset the shadow disc along the sun-moon axis; the gap is the crescent.
  c.arc(cx + r * 1.5 * (1 - 2 * illum), cx, r * 1.05, 0, 7);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(moonC, x - cx, y - cx);
  void dpr;
}

function draw2d(
  st: ReturnType<typeof frameToState>,
  sky: { sunAlt: number; sunAz: number; moonAlt: number; moonAz: number; moonIllum: number },
  lux: number,
  cloud: number,
  fog: number,
  precip: string,
  precipI: number,
  night: number,
): void {
  const ctx = p2d.getContext('2d')!;
  const W = p2d.width;
  const H = p2d.height;
  const dpr = W / innerWidth;
  ctx.clearRect(0, 0, W, H);

  const shot = st.shot;
  if (shot.kind === 'card') {
    drawCardScene(ctx, W, H, dpr, st, new Date(st.timeMs));
    return;
  }

  const e = shotEase(st.local);
  const focal = lerp(shot.lens.focalFrom, shot.lens.focalTo, e);
  const { sunAlt, sunAz } = sky;
  const sky3 = skyColors(sunAlt, cloud, night);
  // Pan across the subject as the lens zooms, the way an operator reframes.
  const rel = (((sunAz - shot.heading + 540) % 360) - 180) / 180;
  const pan = Math.max(-0.16, Math.min(0.16, rel * 0.0012 * focal));
  const horizonY = H * 0.635;

  // ---- sky ---------------------------------------------------------------
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, sky3[0]);
  g.addColorStop(0.58, sky3[1]);
  g.addColorStop(1, sky3[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizonY);

  // Stars and moon only where the sky is dark and clear enough to see them.
  if (night > 0.25 && cloud < 70) {
    ctx.save();
    const clear = 1 - cloud / 100;
    for (let i = 0; i < 300; i++) {
      const gx = hash(i * 12.9898) * W;
      const gy = hash(i * 78.233) * horizonY * 0.92;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(st.frame * 0.05 + i));
      ctx.fillStyle = `rgba(226,236,255,${(0.1 + 0.55 * tw) * (i % 9 === 0 ? 1 : 0.7) * clear * night})`;
      const s = Math.max(1, dpr * (i % 31 === 0 ? 1.9 : 1));
      ctx.fillRect(gx, gy, s, s);
    }
    ctx.restore();
  }

  // cloud deck: banded, opacity keyed to the shot's cloud cover
  if (cloud > 12) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 14; i++) {
      const y = horizonY * (0.06 + (i / 14) * 0.86);
      const hh = H * (0.02 + (i % 4) * 0.012);
      const a = (0.05 + 0.1 * (i % 3)) * (cloud / 100);
      ctx.fillStyle = `rgba(${i % 2 ? 246 : 210},${i % 2 ? 240 : 218},${i % 2 ? 234 : 226},${a})`;
      ctx.beginPath();
      const off = Math.sin(i * 2.3 + st.frame * 0.004) * W * 0.03;
      ctx.ellipse(W * (0.12 + (i % 5) * 0.2) + off, y, W * (0.16 + (i % 3) * 0.07), hh, 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- sun / moon --------------------------------------------------------
  const sx = W * (0.3 + Math.max(-0.21, Math.min(0.21, (rel / 180) * 0.42)));
  const sy = horizonY - Math.sin((Math.max(-6, sunAlt) * Math.PI) / 180) * H * 0.42;
  drawSkyGlow(ctx, W, H, sx, horizonY, sunAlt, lux, cloud);
  if (sunAlt > -7) {
    const disc = Math.max(3, W * 0.007 * (1 + 1.6 * Math.max(0, 1 - sunAlt / 12)));
    const dg = ctx.createRadialGradient(sx, sy, 0, sx, sy, disc * 2.4);
    dg.addColorStop(0, `rgba(255,250,236,${0.95 * (1 - 0.5 * (cloud / 100))})`);
    dg.addColorStop(0.45, `rgba(255,226,168,${0.6 * (1 - 0.5 * (cloud / 100))})`);
    dg.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(sx, sy, disc * 2.4, 0, 7);
    ctx.fill();
  }

  // Moon: real azimuth, altitude and illuminated fraction.
  if (sky.moonAlt > -2 && night > 0.05) {
    const mx = W * (0.3 + Math.max(-0.22, Math.min(0.22, (((sky.moonAz - shot.heading + 540) % 360) - 180) / 180 * 0.44)));
    const my = horizonY - Math.sin((sky.moonAlt * Math.PI) / 180) * H * 0.42;
    const r = Math.max(5, W * 0.0085);
    const vis = Math.min(1, sky.moonIllum * 1.15) * (1 - 0.5 * (cloud / 100)) * night;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, r * 7);
    mg.addColorStop(0, `rgba(206,224,255,${0.34 * vis})`);
    mg.addColorStop(0.25, `rgba(160,190,240,${0.12 * vis})`);
    mg.addColorStop(1, 'rgba(140,170,230,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, r * 7, 0, 7);
    ctx.fill();
    ctx.restore();
    drawMoon(ctx, mx, my, r, Math.max(0, Math.min(1, sky.moonIllum)), 0.55 + 0.45 * vis, dpr);
  }

  // ---- ground ------------------------------------------------------------
  const gg = ctx.createLinearGradient(0, horizonY, 0, H);
  gg.addColorStop(0, sky3[2]);
  gg.addColorStop(0.22, mixHex(sky3[2], '#05070b', 0.5));
  gg.addColorStop(1, mixHex(sky3[2], '#04060a', 0.88));
  ctx.fillStyle = gg;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // ---- skyline, then its reflection --------------------------------------
  // Frame by the subject's own height, so every landmark fills the band the
  // same way and the focal-length animation reads as a push-in.
  const band = H * (1 - 1 / 2.39);
  const zoom = 0.45 + Math.min(0.95, (focal - 20) / 150);
  const unit = ((band * 0.62) / (SKYLINE_TOP[shot.skyline] ?? 1000)) * zoom;
  const isNight = sunAlt < -1;
  const sil = silhouetteColor(sky3[0], sky3[2]);
  drawSkyline(String(shot.skyline), {
    ctx,
    cx: W * 0.34 + pan * W,
    horizonY,
    unit,
    color: sil,
    alpha: 0.96,
    lit: isNight,
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizonY, W, H - horizonY);
  ctx.clip();
  ctx.translate(0, horizonY * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.16;
  drawSkyline(String(shot.skyline), {
    ctx,
    cx: W * 0.34 + pan * W,
    horizonY,
    unit,
    color: sil,
    alpha: 0.96,
    lit: isNight,
  });
  ctx.restore();

  // light path on the ground under the sun
  if (sunAlt > -8) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const pg = ctx.createLinearGradient(0, horizonY, 0, H);
    const pk = Math.min(1, lux / 18000 + 0.1) * (1 - 0.6 * (cloud / 100));
    pg.addColorStop(0, `rgba(255,206,140,${0.2 * pk})`);
    pg.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(sx - W * 0.012, horizonY);
    ctx.lineTo(sx + W * 0.012, horizonY);
    ctx.lineTo(sx + W * 0.075, H);
    ctx.lineTo(sx - W * 0.075, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawFlare(ctx, W, H, sx, sy, Math.max(0, Math.min(1, (1 - cloud / 100) * (lux / 9000 + 0.15))), dpr);

  // ---- atmosphere --------------------------------------------------------
  if (fog > 0.02) {
    const fg = ctx.createLinearGradient(0, horizonY - H * 0.16, 0, H);
    fg.addColorStop(0, 'rgba(206,214,224,0)');
    fg.addColorStop(0.35, `rgba(206,214,224,${0.3 * fog})`);
    fg.addColorStop(1, `rgba(180,192,206,${0.16 * fog})`);
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizonY - H * 0.16, W, H - horizonY + H * 0.16);
  }

  // frame-locked precipitation (deterministic: seeded by global frame index)
  if (precipI > 0.01 && precip !== 'none') {
    ctx.save();
    ctx.strokeStyle = precip === 'snow' ? 'rgba(255,255,255,0.8)' : 'rgba(198,216,236,0.55)';
    ctx.lineWidth = Math.max(1, dpr);
    const n = Math.round(precipI * (precip === 'snow' ? 260 : 420));
    for (let i = 0; i < n; i++) {
      const seed = i * 9301 + 49297;
      const rx = ((seed % 233280) / 233280) * W;
      const spd = (precip === 'snow' ? 3.2 : 26) + ((seed >> 5) % 60) * 0.35;
      const y = (((st.frame * spd + ((seed >> 3) % 1000) * 4) % (H + 60)) - 30) % (H + 60);
      const yy = y < 0 ? y + H + 60 : y;
      if (precip === 'snow') {
        ctx.beginPath();
        ctx.arc(rx + Math.sin((st.frame + i * 7) / 14) * 16 * dpr, yy, (1.1 + (i % 4) * 0.7) * dpr, 0, 7);
        ctx.stroke();
      } else {
        const len = (14 + (i % 5) * 8) * dpr;
        ctx.beginPath();
        ctx.moveTo(rx, yy);
        ctx.lineTo(rx - 3 * dpr, yy + len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- live 3D viewport inset --------------------------------------------
  // Read the Cesium canvas back into this one. A WebGL canvas is not reliably
  // composited into a headless page screenshot (the pixels exist, the composite
  // layer does not), and drawing it here gives both modes the same framed inset
  // with its own border, rather than a full-bleed layer that can drop tiles.
  const iv = { x: W * INSET.x, y: H * INSET.y, w: W * INSET.w, h: H * INSET.h };
  ctx.save();
  roundRect(ctx, iv.x, iv.y, iv.w, iv.h, 8 * dpr);
  ctx.clip();
  ctx.fillStyle = '#05070a';
  ctx.fillRect(iv.x, iv.y, iv.w, iv.h);
  try {
    // Aspect-fit the whole render: cropping to the subject's own height would
    // show a wall of facade and lose the skyline, which is what makes the panel
    // read as a live camera rather than a texture.
    const c = viewer.canvas;
    const s = Math.min(iv.w / c.width, iv.h / c.height);
    const w = c.width * s;
    const h = c.height * s;
    ctx.drawImage(c, iv.x + (iv.w - w) / 2, iv.y + (iv.h - h) / 2, w, h);
  } catch {
    /* canvas not ready */
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,182,72,0.5)';
  ctx.lineWidth = Math.max(1, dpr);
  roundRect(ctx, iv.x, iv.y, iv.w, iv.h, 8 * dpr);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,182,72,0.9)';
  ctx.font = `${Math.max(8, H * 0.014)}px ui-monospace, monospace`;
  ctx.fillText('LIVE 3D · CESIUM ENGINE', iv.x + 10 * dpr, iv.y + H * 0.032);
  ctx.fillStyle = 'rgba(243,239,231,0.55)';
  ctx.fillText(`${focal.toFixed(0)}mm  FOV ${horizontalFovDeg(focal, sensorById('ff')).toFixed(0)}°`, iv.x + 10 * dpr, iv.y + iv.h - 10 * dpr);

  // ---- location slate ----------------------------------------------------
  ctx.fillStyle = '#ffb648';
  ctx.font = `${Math.max(8, H * 0.016)}px ui-monospace, monospace`;
  ctx.fillText(shot.city.toUpperCase(), W * 0.05, H * 0.775);
  ctx.fillStyle = 'rgba(243,239,231,0.96)';
  ctx.font = `300 ${Math.max(20, H * 0.058)}px system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  ctx.fillText(shot.landmark, W * 0.05, H * 0.845);
  ctx.fillStyle = 'rgba(243,239,231,0.5)';
  ctx.font = `${Math.max(8, H * 0.015)}px ui-monospace, monospace`;
  ctx.fillText(
    `${shot.cam.lat.toFixed(4)}° ${shot.cam.lat >= 0 ? 'N' : 'S'}   ${Math.abs(shot.cam.lon).toFixed(4)}° ${shot.cam.lon >= 0 ? 'E' : 'W'}`,
    W * 0.05,
    H * 0.885,
  );

  // vignette + grain (frame-seeded so captures are reproducible)
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.76);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.045;
  let rnd = st.frame * 1103515245 + 12345;
  for (let i = 0; i < 900; i++) {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    const gx = (rnd / 2147483648) * W;
    const gy = ((rnd >> 7) % 1000) / 1000 * H;
    ctx.fillStyle = gx % 2 > 1 ? '#fff' : '#000';
    ctx.fillRect(gx, gy, dpr, dpr);
  }
  ctx.restore();
}

function drawScope(st: ReturnType<typeof frameToState>, lux: number, cloud: number): void {
  const ctx = scopeC.getContext('2d')!;
  const W = scopeC.width;
  const H = scopeC.height;
  ctx.clearRect(0, 0, W, H);

  const key = st.shot.time.slice(0, 10) + st.shot.lat.toFixed(2);
  let dy = scopeDays.get(key);
  if (!dy) {
    dy = daySky(Date.parse(st.shot.time.slice(0, 10) + 'T00:00:00Z'), st.shot.lat, st.shot.lon, cloud, st.shot.bortle);
    scopeDays.set(key, dy);
  }

  ctx.strokeStyle = 'rgba(243,239,231,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((W / 4) * i, 0);
    ctx.lineTo((W / 4) * i, H);
    ctx.stroke();
  }

  const peak = Math.max(1e-3, ...dy.luxs);
  const lg = (v: number) => Math.log10(Math.max(v, 1e-4));
  const yOf = (v: number) => H - 6 - ((lg(v) + 4) / (lg(peak) + 4)) * (H - 14);

  ctx.beginPath();
  dy.luxs.forEach((v, i) => {
    const x = (i / (dy.luxs.length - 1)) * W;
    const y = yOf(v);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.strokeStyle = '#ffb648';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,182,72,0.13)';
  ctx.fill();

  const frac = ((st.timeMs - Date.parse(st.shot.time.slice(0, 10) + 'T00:00:00Z')) % 864e5) / 864e5;
  const mx = Math.max(0, Math.min(1, frac)) * W;
  ctx.strokeStyle = '#6fe3c4';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(mx, 0);
  ctx.lineTo(mx, H);
  ctx.stroke();
  ctx.fillStyle = '#6fe3c4';
  ctx.beginPath();
  ctx.arc(mx, yOf(lux), 3.2, 0, 7);
  ctx.fill();

  ctx.fillStyle = 'rgba(243,239,231,0.5)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('LUX 24H', 6, 13);
  ctx.fillText(`${lux < 1000 ? lux.toFixed(2) : (lux / 1000).toFixed(1) + 'k'} lx`, W - 62, 13);
}

function setHud(st: ReturnType<typeof frameToState>, data: Record<string, string>, on: boolean): void {
  for (const [k, v] of Object.entries(data)) if (el[k as keyof typeof el]) (el[k as keyof typeof el] as HTMLElement).textContent = v;
  el.meta.classList.toggle('on', on);
  el.gauges.classList.toggle('on', on);
  el.ev.classList.toggle('on', on);
  el.scope.classList.toggle('on', on);
  el.reticle.classList.toggle('on', on);
  el.rec.classList.toggle('on', on);
  el.scrub.classList.toggle('on', on);
  reel.classList.toggle('card', !on);
  el.rec.classList.toggle('blink', st.frame % 30 < 15);
}

/** Pure frame -> full scene state + paint. No wall-clock anywhere. */
export function renderFrame(frame: number): void {
  const st = frameToState(frame);
  const s = st.shot;
  const e = shotEase(st.local);
  const date = new Date(st.timeMs);
  const isCard = s.kind === 'card';
  const pct = (st.frame / TOTAL_FRAMES) * 100;
  el.scrubFill.style.width = `${pct}%`;
  el.scrubKnob.style.left = `${pct}%`;

  if (isCard) {
    // Title/end plate: the 2D vector earth only. Rendering a space-view Cesium
    // scene here would ask for thousands of globe tiles per frame, which the
    // software renderer used for capture cannot stream without seams.
    stageEl.classList.remove('live');
    draw2d(st, { sunAlt: 0, sunAz: 0, moonAlt: -20, moonAz: 0, moonIllum: 0 }, 0, 0, 0, 'none', 0, 0);
    reel.classList.remove('widescreen');
    setHud(st, {}, false);
    return;
  }
  stageEl.classList.add('live');

  viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.alt),
    orientation: {
      heading: Cesium.Math.toRadians(s.heading),
      pitch: Cesium.Math.toRadians(s.pitch),
      roll: 0,
    },
  });

  const focal = lerp(s.lens.focalFrom, s.lens.focalTo, e);
  const nd = lerp(s.lens.ndFrom, s.lens.ndTo, e);
  const frustum = viewer.camera.frustum;
  if (frustum instanceof Cesium.PerspectiveFrustum) {
    const sensor = sensorById('ff');
    frustum.fov = Cesium.Math.toRadians(verticalFovDeg(focal, sensor));
  }

  // Read the sky at the subject, not at the camera: the HUD reports the light
  // falling on the landmark being filmed.
  const sky = skyInfo(date, s.cam.lat, s.cam.lon);
  const cloud = s.weather.cloud;
  const lux = illuminance({
    sunAltDeg: sky.sunAlt,
    cloudPct: cloud,
    moonAltDeg: sky.moonAlt,
    moonPhase: sky.moonIllum,
    bortle: s.bortle,
  });
  const shutter = shutterSecondsForFps(s.lens.fps, s.lens.shutterAngle);
  const delta = exposureDeltaStops(lux, shutter, s.lens.iso, s.lens.aperture, nd);
  const night = Math.min(1, Math.max(0, (-sky.sunAlt - 3) / 5));

  fx.setCloud(cloud);
  fx.setPrecip(s.weather.precip, s.weather.precipI);
  fx.setFog(s.weather.fog);
  setNightGrade(night, sky.moonIllum * Math.max(0, Math.sin((sky.moonAlt * Math.PI) / 180)), cloud);
  // Capture path uses the converged exposure (no per-frame EMA history, so a
  // captured frame depends only on its index).
  //
  // Delta is applied on a quarter scale, not literally: the shot list spans EV
  // differences of 14 stops (Burj Khalifa at noon under a 10-stop ND versus
  // Manhattan at midnight), and a literal 2^delta renders one of those two as
  // pure white and the other as pure black. This is the film-latitude curve a
  // grade applies at delivery — the HUD keeps printing the true delta.
  const gain = 1.7 * Math.pow(2, Math.max(-6, Math.min(6, delta)) / 5) * (1 + 0.8 * night);
  fx.setExposure(gain);
  stars.enabled = sky.sunAlt < 0;
  stars.update(viewer.clock.currentTime, sky.sunAlt);
  (viewer.scene as unknown as { moonIntensity: number }).moonIntensity =
    0.05 + 2.4 * sky.moonIllum * Math.max(0, Math.sin((sky.moonAlt * Math.PI) / 180)) * night;

  showLandmarkFor(s, night);

  viewer.render();
  if (skipPaint) return;

  const sensor = sensorById('ff');
  const q = skyQuality({
    bortle: s.bortle,
    moonIllum: sky.moonIllum,
    moonAltDeg: sky.moonAlt,
    cloudPct: cloud,
    sunAltDeg: sky.sunAlt,
  });

  draw2d(st, sky, lux, cloud, s.weather.fog, s.weather.precip, s.weather.precipI, night);
  drawScope(st, lux, cloud);

  el.mTime.textContent = `${date.toISOString().slice(11, 16)}Z  ${frameToTimecode(st.frame)}`;
  el.mSun.textContent = `${sky.sunAlt >= 0 ? '+' : ''}${sky.sunAlt.toFixed(1)}°  AZ ${sky.sunAz.toFixed(0)}°`;
  el.mSky.textContent = `B${s.bortle}  SQM ${q.sqm.toFixed(1)}  NELM ${q.nelm.toFixed(1)}`;
  el.mWx.textContent = `${s.weather.label}  ${cloud}%`;
  el.gFocal.textContent = `${focal.toFixed(0)}mm`;
  el.gAp.textContent = `f/${s.lens.aperture}`;
  el.gIso.textContent = String(s.lens.iso);
  el.gSh.textContent = `1/${Math.round(1 / shutter)}s`;
  el.gNd.textContent = nd > 0.05 ? `${nd.toFixed(0)}st` : '—';
  el.gFov.textContent = `${horizontalFovDeg(focal, sensor).toFixed(0)}°`;
  const evPct = Math.max(-4, Math.min(4, delta)) / 4;
  el.evFill.style.left = `${evPct >= 0 ? 50 : 50 + evPct * 50}%`;
  el.evFill.style.width = `${Math.abs(evPct) * 50}%`;
  el.evFill.style.background = Math.abs(delta) < 0.4 ? '#6fe3c4' : delta > 0 ? '#ffb648' : '#7fb2ff';
  el.evVal.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} st  ${
    Math.abs(delta) < 0.4 ? 'BALANCED' : delta > 0 ? 'OVER · ADD ND' : 'UNDER · +ISO'
  }`;
  el.evVal.className = 'ev-val ' + (Math.abs(delta) < 0.4 ? '' : delta > 0 ? 'over' : 'under');
  reel.classList.add('widescreen');
  setHud(st, {}, true);
  el.gFocal.classList.toggle('hot', true);
}

async function main(): Promise<void> {
  if (CAPTURE) document.documentElement.classList.add('capture');
  await boot3d();
  resize();
  addEventListener('resize', resize);
  stageEl.classList.add('live');
  boot.classList.add('gone');

  // Capture mode: the driver calls renderFrame(n) over CDP and reads the canvas.
  // renderFrame is synchronous (viewer.render() + 2D paint), so a captured frame
  // depends only on n — no wall-clock, no rAF, no animation history.
  if (CAPTURE) return;

  let f = 0;
  const t0 = performance.now();
  const loop = (): void => {
    f = Math.floor(((performance.now() - t0) / 1000) * FPS) % TOTAL_FRAMES;
    renderFrame(f);
    requestAnimationFrame(loop);
  };
  loop();
}

main().catch((e) => {
  boot.textContent = '引擎启动失败: ' + String((e as Error)?.message ?? e);
  console.error(e);
});
