export interface Weather {
  cloud: number;
  precip: 'none' | 'rain' | 'snow';
  precipI: number;
  fog: number;
  label: string;
}

export interface Lens {
  focalFrom: number;
  focalTo: number;
  aperture: number;
  iso: number;
  ndFrom: number;
  ndTo: number;
  fps: number;
  shutterAngle: number;
}

/** Where the camera frames the subject, in metres and degrees. */
export interface Cam {
  /** landmark coordinates — the camera aims at this */
  lat: number;
  lon: number;
  /** tip-to-toe height of the subject, metres */
  height: number;
  /** ground distance from camera to subject, metres */
  dist: number;
  /** camera elevation above the subject's mid-height, degrees */
  elev: number;
  /** bearing from camera to subject, degrees clockwise from north */
  heading: number;
}

export interface Shot {
  id: string;
  city: string;
  landmark: string;
  /** observer position (deg / metres), derived from `cam` */
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  pitch: number;
  cam: Cam;
  /** UTC ISO for the shot's mid-time */
  time: string;
  /** hours the clock travels across the shot */
  timeSpanH: number;
  weather: Weather;
  lens: Lens;
  /** landmark key: 2D silhouette in skyline.ts, 3D massing in landmark3d.ts */
  skyline: string;
  bortle: number;
  seconds: number;
  /** `card` = title/end plate: 2D earth only, no HUD or weather layer */
  kind: 'globe' | 'card';
}

export const FPS = 24;

/** Scout sites, plotted on the card shots' earth. */
export const SITES: { name: string; lat: number; lon: number }[] = [
  { name: '巴黎', lat: 48.86, lon: 2.29 },
  { name: '纽约', lat: 40.75, lon: -73.99 },
  { name: '迪拜', lat: 25.2, lon: 55.27 },
  { name: '吉萨', lat: 29.98, lon: 31.13 },
  { name: '洪崖洞', lat: 29.56, lon: 106.58 },
  { name: '悉尼', lat: -33.86, lon: 151.22 },
  { name: '伦敦', lat: 51.5, lon: -0.09 },
];

const CLEAR: Weather = { cloud: 6, precip: 'none', precipI: 0, fog: 0, label: 'CLEAR' };
const OVERCAST: Weather = { cloud: 92, precip: 'none', precipI: 0, fog: 0.12, label: 'OVERCAST' };
const RAIN: Weather = { cloud: 88, precip: 'rain', precipI: 0.62, fog: 0.28, label: 'RAIN' };
const SNOW: Weather = { cloud: 78, precip: 'snow', precipI: 0.5, fog: 0.2, label: 'SNOW' };
const HAZE: Weather = { cloud: 46, precip: 'none', precipI: 0, fog: 0.5, label: 'DUST HAZE' };
const STORM: Weather = { cloud: 97, precip: 'rain', precipI: 0.95, fog: 0.34, label: 'STORM' };

const L = (
  focalFrom: number,
  focalTo: number,
  aperture: number,
  iso: number,
  ndFrom: number,
  ndTo: number,
): Lens => ({ focalFrom, focalTo, aperture, iso, ndFrom, ndTo, fps: 24, shutterAngle: 180 });

/**
 * Resolve a camera pose from the subject framing.
 *
 * Distance and elevation are stated against the landmark's real height so the
 * subject stays a constant size in frame while the focal length animates — that
 * is what makes a zoom read as a lens change instead of the camera flying away.
 * Altitudes are above the WGS84 ellipsoid, which for all these cities is within
 * tens of metres of ground level.
 */
function pose(cam: Cam): { lat: number; lon: number; alt: number; heading: number; pitch: number } {
  const D2R = Math.PI / 180;
  const horiz = cam.dist * Math.cos(cam.elev * D2R);
  const brg = (cam.heading + 180) * D2R; // the camera sits opposite the bearing to its subject
  return {
    lat: cam.lat + (horiz * Math.cos(brg)) / 111320,
    lon: cam.lon + (horiz * Math.sin(brg)) / (111320 * Math.cos(cam.lat * D2R)),
    alt: cam.height / 2 + cam.dist * Math.sin(cam.elev * D2R),
    heading: cam.heading,
    pitch: -cam.elev,
  };
}

type ShotSpec = Omit<Shot, 'lat' | 'lon' | 'alt' | 'heading' | 'pitch'>;

const shot = (spec: ShotSpec): Shot => ({ ...spec, ...pose(spec.cam) });

/** Card plates have no 3D subject, so `cam` only carries the earth's face. */
const card = (id: string, landmark: string, lat: number, lon: number, time: string, seconds: number): ShotSpec => ({
  id,
  city: 'LSPS',
  landmark,
  cam: { lat, lon, height: 0, dist: 0, elev: 0, heading: 0 },
  time,
  timeSpanH: 0,
  weather: CLEAR,
  lens: L(35, 35, 2.8, 800, 0, 0),
  skyline: 'none',
  bortle: 5,
  seconds,
  kind: 'card',
});

/**
 * Sun times for 2026-10-22, computed from astronomy-engine:
 * Paris rise 06:21Z set 16:48Z | Dubai rise 02:20Z set 13:45Z
 * Giza rise 04:01Z set 15:17Z | Chongqing set 10:16Z dusk 10:40Z
 * NYC rise 11:14Z set 22:05Z | Sydney rise 19:04Z | London set 17:10Z
 *
 * `height` is each landmark's real tip-to-toe figure.
 */
export const SHOTS: Shot[] = [
  shot(card('title', '3D 取景器', 18, 150, '2026-10-22T04:20:00Z', 4.2)),
  shot({
    id: 'paris-golden',
    city: 'PARIS · 48.85N 2.29E',
    landmark: 'Tour Eiffel · 330 m',
    cam: { lat: 48.8584, lon: 2.2945, height: 330, dist: 1490, elev: 8, heading: 27 },
    time: '2026-10-22T16:10:00Z',
    timeSpanH: 0.55,
    weather: CLEAR,
    lens: L(28, 92, 4, 100, 0, 3),
    skyline: 'eiffel',
    bortle: 4,
    seconds: 6,
    kind: 'globe',
  }),
  shot({
    id: 'dubai-noon',
    city: 'DUBAI · 25.19N 55.27E',
    landmark: 'Burj Khalifa · 828 m',
    cam: { lat: 25.1972, lon: 55.2744, height: 828, dist: 2350, elev: 10, heading: 310 },
    time: '2026-10-22T07:40:00Z',
    timeSpanH: 0.4,
    weather: CLEAR,
    lens: L(20, 58, 8, 100, 0, 10),
    skyline: 'burj',
    bortle: 3,
    seconds: 5.4,
    kind: 'globe',
  }),
  shot({
    id: 'giza-haze',
    city: 'GIZA · 29.97N 31.13E',
    landmark: 'Great Pyramid · 139 m',
    cam: { lat: 29.9773, lon: 31.1325, height: 139, dist: 300, elev: 12, heading: 309 },
    time: '2026-10-22T09:10:00Z',
    timeSpanH: 0.5,
    weather: HAZE,
    lens: L(24, 44, 11, 100, 3, 6),
    skyline: 'pyramid',
    bortle: 2,
    seconds: 5,
    kind: 'globe',
  }),
  shot({
    id: 'sydney-day',
    city: 'SYDNEY · 33.85S 151.21E',
    landmark: 'Opera House · 65 m',
    cam: { lat: -33.8568, lon: 151.2153, height: 65, dist: 420, elev: 14, heading: 235 },
    time: '2026-10-22T20:10:00Z',
    timeSpanH: 0.45,
    weather: OVERCAST,
    lens: L(35, 24, 5.6, 200, 0, 0),
    skyline: 'opera',
    bortle: 4,
    seconds: 5,
    kind: 'globe',
  }),
  shot({
    id: 'hk-blue-rain',
    city: '重庆 · 29.56N 106.57E',
    landmark: '洪崖洞 蓝调时刻',
    cam: { lat: 29.5643, lon: 106.5789, height: 88, dist: 560, elev: 8, heading: 40 },
    time: '2026-10-22T10:32:00Z',
    timeSpanH: 0.16,
    weather: RAIN,
    lens: L(50, 35, 2.8, 1600, 0, 0),
    skyline: 'hongyadong',
    bortle: 8,
    seconds: 6,
    kind: 'globe',
  }),
  shot({
    id: 'nyc-night-snow',
    city: 'NEW YORK · 40.74N 73.98W',
    landmark: 'Empire State · 443 m',
    cam: { lat: 40.7484, lon: -73.9857, height: 443, dist: 2930, elev: 9, heading: 48 },
    time: '2026-10-22T23:20:00Z',
    timeSpanH: 0.5,
    weather: SNOW,
    lens: L(85, 135, 2, 3200, 0, 0),
    skyline: 'empire',
    bortle: 9,
    seconds: 6,
    kind: 'globe',
  }),
  shot({
    id: 'london-storm',
    city: 'LONDON · 51.50N 0.12W',
    landmark: 'Westminster · Big Ben 96 m',
    cam: { lat: 51.5045, lon: -0.0865, height: 96, dist: 520, elev: 7, heading: 12 },
    time: '2026-10-22T15:10:00Z',
    timeSpanH: 0.9,
    weather: STORM,
    lens: L(40, 30, 4, 400, 0, 3),
    skyline: 'london',
    bortle: 6,
    seconds: 5.4,
    kind: 'globe',
  }),
  shot(card('endcard', 'Location Scouting Viewfinder', -8, 26, '2026-10-22T10:50:00Z', 4.6)),
];

export const TOTAL_SECONDS = SHOTS.reduce((a, s) => a + s.seconds, 0);
/**
 * Sum of the per-shot frame counts, not `round(TOTAL_SECONDS * FPS)`. The
 * capture driver and `frameToState` both walk the shot list and round each
 * shot, so rounding the total as well gives a number they disagree with
 * (47.6 s rounds to 1142, the shots sum to 1143) and the progress bar runs a
 * frame out of step with the reel.
 */
export const TOTAL_FRAMES = SHOTS.reduce((a, s) => a + Math.round(s.seconds * FPS), 0);

export interface FrameState {
  shot: Shot;
  shotIndex: number;
  /** 0..1 within the current shot */
  local: number;
  /** global frame index */
  frame: number;
  timeMs: number;
}

export function frameToState(frame: number): FrameState {
  let acc = 0;
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    const n = Math.round(s.seconds * FPS);
    if (frame < acc + n || i === SHOTS.length - 1) {
      const local = Math.min(1, (frame - acc) / n);
      const mid = Date.parse(s.time);
      return {
        shot: s,
        shotIndex: i,
        local,
        frame,
        timeMs: mid + (local - 0.5) * s.timeSpanH * 3600e3,
      };
    }
    acc += n;
  }
  throw new Error('frame out of range');
}

export function frameToTimecode(frame: number): string {
  const t = frame / FPS;
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  const ff = frame % FPS;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(m)}:${p(sec)}:${p(ff)}`;
}

/** eased 0..1 progress across a shot, with hold-in / hold-out for readability */
export function shotEase(local: number): number {
  const a = 0.12;
  const b = 0.94;
  if (local <= a) return 0;
  if (local >= b) return 1;
  const t = (local - a) / (b - a);
  return t * t * (3 - 2 * t);
}
