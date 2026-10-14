// Open-Meteo public API client.
// Isolation note: open-meteo/open-meteo server code is AGPL-3.0 — we NEVER bundle
// or self-host it; we only call the free public HTTP API. Forecast data: CC BY 4.0,
// attribution "Weather data by Open-Meteo.com" is rendered in the UI.
export interface WeatherNow {
  tempC: number;
  humidity: number;
  precipMm: number;
  cloudPct: number;
  windKmh: number;
  code: number;
  fetchedAt: number;
  provider: 'open-meteo' | '7timer';
}

export async function fetchCurrent(lat: number, lon: number): Promise<WeatherNow> {
  try {
    return await fetchOpenMeteo(lat, lon);
  } catch {
    return await fetch7Timer(lat, lon);
  }
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m,weather_code' +
    '&timezone=auto';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = (await r.json()) as { current: Record<string, number> };
  const c = j.current;
  return {
    tempC: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    precipMm: c.precipitation,
    cloudPct: c.cloud_cover,
    windKmh: c.wind_speed_10m,
    code: c.weather_code,
    fetchedAt: Date.now(),
    provider: 'open-meteo',
  };
}

/**
 * 7Timer! (NASA/NIH Braunsberg, public-domain forecast API) as fallback.
 * No weather codes -> synthesized WMO-ish code from cloud/precip fields.
 */
async function fetch7Timer(lat: number, lon: number): Promise<WeatherNow> {
  const url =
    `https://api.7timer.info/bin/astro.php?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` +
    '&product=numeric&astrometric=0&units=metric&json=1&lang=en&tzshift=0';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`7timer ${r.status}`);
  const j = (await r.json()) as {
    dataseries: {
      temperature2m: number;
      rh: number;
      precip: number;
      cloudcover: { high: number; mid: number; low: number };
      wind10m: { speed: number };
    }[];
  };
  const s = j.dataseries?.[0];
  if (!s) throw new Error('7timer empty');
  const cloudPct = Math.min(100, Math.round((s.cloudcover.high + s.cloudcover.mid + s.cloudcover.low) / 3));
  const code = s.precip > 0.2 ? 61 : cloudPct > 80 ? 3 : cloudPct > 40 ? 2 : 0;
  return {
    tempC: s.temperature2m,
    humidity: s.rh,
    precipMm: s.precip,
    cloudPct,
    windKmh: s.wind10m.speed * 3.6,
    code,
    fetchedAt: Date.now(),
    provider: '7timer',
  };
}

export type SkyKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export function skyKind(code: number): SkyKind {
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if (code >= 1) return 'cloudy';
  return 'clear';
}

export function precipIntensity(w: WeatherNow): number {
  const base = Math.min(1, w.precipMm / 4 + 0.25);
  return w.code >= 95 ? Math.min(1, base + 0.4) : base;
}

export const WEATHER_LABELS: Record<number, string> = {
  0: '晴', 1: '大致晴朗', 2: '局部多云', 3: '阴',
  45: '雾', 48: '雾凇雾',
  51: '轻毛毛雨', 53: '毛毛雨', 55: '浓毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '小阵雨', 81: '阵雨', 82: '暴阵雨',
  85: '小阵雪', 86: '大阵雪',
  95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹',
};
