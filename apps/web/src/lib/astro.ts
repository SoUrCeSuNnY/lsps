import * as Astro from 'astronomy-engine';
import { illuminance } from '@lsps/core';

export interface DaySky {
  dayStartMs: number;
  luxs: number[];
  sunAlts: number[];
  events: { t: number; label: string }[];
}

/** 24h illuminance/sun-altitude curve (96 samples) + event markers for a UTC day. */
export function daySky(dayStartMs: number, lat: number, lon: number, cloudPct: number, bortle: number): DaySky {
  const obs = new Astro.Observer(lat, lon, 0);
  const t0 = new Date(dayStartMs);
  const moonPhase = Astro.Illumination(Astro.Body.Moon, t0).phase_fraction;
  const luxs: number[] = [];
  const sunAlts: number[] = [];
  for (let i = 0; i < 96; i++) {
    const t = new Date(dayStartMs + i * 900e3);
    const s = horizon(Astro.Body.Sun, t, obs);
    const m = horizon(Astro.Body.Moon, t, obs);
    sunAlts.push(s.altitude);
    luxs.push(illuminance({ sunAltDeg: s.altitude, cloudPct, moonAltDeg: m.altitude, moonPhase, bortle }));
  }
  const end = dayStartMs + 864e5;
  const start = new Date(dayStartMs);
  const riseSet = (body: Astro.Body, dir: number, label: string) => {
    const r = Astro.SearchRiseSet(body, obs, dir, start, 1.02);
    if (r && r.date.getTime() >= dayStartMs && r.date.getTime() <= end) return { t: r.date.getTime(), label };
    return null;
  };
  const twi = (dir: number, label: string) => {
    const r = Astro.SearchAltitude(Astro.Body.Sun, obs, dir, start, 1.02, -6);
    if (r && r.date.getTime() >= dayStartMs && r.date.getTime() <= end) return { t: r.date.getTime(), label };
    return null;
  };
  const events = [
    riseSet(Astro.Body.Sun, +1, '🌅 日出'),
    riseSet(Astro.Body.Sun, -1, '🌇 日落'),
    twi(+1, '🌆 晨光始'),
    twi(-1, '🌌 暮光尽'),
    riseSet(Astro.Body.Moon, +1, '🌙 月升'),
    riseSet(Astro.Body.Moon, -1, '月落'),
  ].filter((x): x is { t: number; label: string } => !!x);
  events.sort((a, b) => a.t - b.t);
  return { dayStartMs, luxs, sunAlts, events };
}

export interface SkyInfo {
  sunAlt: number;
  sunAz: number;
  moonAlt: number;
  moonAz: number;
  moonPhaseAngle: number; // 0 new, 90 first quarter, 180 full, 270 last quarter
  moonIllum: number; // illuminated fraction 0..1
  waxing: boolean;
  sunrise: Date | null;
  sunset: Date | null;
  twilightMorning: Date | null;
  twilightEvening: Date | null;
  moonrise: Date | null;
  moonset: Date | null;
}

function horizon(body: Astro.Body, date: Date, obs: Astro.Observer): { altitude: number; azimuth: number } {
  const eq = Astro.Equator(body, date, obs, true, true);
  return Astro.Horizon(date, obs, eq.ra, eq.dec, 'normal');
}

export function skyInfo(date: Date, lat: number, lon: number): SkyInfo {
  const obs = new Astro.Observer(lat, lon, 0);
  const sun = horizon(Astro.Body.Sun, date, obs);
  const moon = horizon(Astro.Body.Moon, date, obs);
  const phase = Astro.MoonPhase(date);
  const illum = Astro.Illumination(Astro.Body.Moon, date).phase_fraction;
  const d = (t: Astro.AstroTime | null): Date | null => (t ? t.date : null);
  return {
    sunAlt: sun.altitude,
    sunAz: (sun.azimuth + 360) % 360,
    moonAlt: moon.altitude,
    moonAz: (moon.azimuth + 360) % 360,
    moonPhaseAngle: phase,
    moonIllum: illum,
    waxing: phase < 180,
    sunrise: d(Astro.SearchRiseSet(Astro.Body.Sun, obs, +1, date, 2)),
    sunset: d(Astro.SearchRiseSet(Astro.Body.Sun, obs, -1, date, 2)),
    twilightMorning: d(Astro.SearchAltitude(Astro.Body.Sun, obs, +1, date, 2, -6)),
    twilightEvening: d(Astro.SearchAltitude(Astro.Body.Sun, obs, -1, date, 2, -6)),
    moonrise: d(Astro.SearchRiseSet(Astro.Body.Moon, obs, +1, date, 2)),
    moonset: d(Astro.SearchRiseSet(Astro.Body.Moon, obs, -1, date, 2)),
  };
}

export function moonPhaseName(frac: number, waxing: boolean): string {
  if (frac < 0.03) return '新月';
  if (frac > 0.97) return '满月';
  if (Math.abs(frac - 0.5) < 0.04) return waxing ? '上弦月' : '下弦月';
  if (frac < 0.5) return waxing ? '蛾眉月' : '残月';
  return waxing ? '盈凸月' : '亏凸月';
}

export function fmtDeg(v: number, digits = 1): string {
  return `${v.toFixed(digits)}°`;
}

export function compass(azDeg: number): string {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return dirs[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8];
}

export interface EclipseEvent {
  type: 'lunar' | 'solar';
  peak: Date;
  kind: string;
  obscuration: number;
  localVisible: boolean;
  localText: string;
}

const KIND_LUNAR: Record<string, string> = { penumbral: '半影月食', partial: '月偏食', total: '月全食' };
const KIND_SOLAR: Record<string, string> = { partial: '日偏食', annular: '日环食', total: '日全食', hybrid: '日全环食' };

/** Next `each` lunar + solar eclipses after `from` with local visibility. */
export function nextEclipses(from: Date, lat: number, lon: number, each = 2): EclipseEvent[] {
  const out: EclipseEvent[] = [];
  const obs = new Astro.Observer(lat, lon, 0);

  try {
    let e = Astro.SearchLunarEclipse(from);
    for (let i = 0; i < each; i++) {
      const moon = horizon(Astro.Body.Moon, e.peak.date, obs);
      out.push({
        type: 'lunar',
        peak: e.peak.date,
        kind: KIND_LUNAR[e.kind] ?? e.kind,
        obscuration: e.obscuration,
        localVisible: moon.altitude > 0,
        localText: moon.altitude > 0 ? `本地可见（月亮高 ${moon.altitude.toFixed(0)}°）` : '地平线下，不可见',
      });
      e = Astro.NextLunarEclipse(e.peak.date);
    }
  } catch {
    /* search failure */
  }

  try {
    let g = Astro.SearchGlobalSolarEclipse(from);
    for (let i = 0; i < each; i++) {
      let localVisible = false;
      let localText = '本地点不可见（食带外）';
      try {
        const l = Astro.SearchLocalSolarEclipse(g.peak.date, obs);
        localVisible = l.obscuration > 0.01;
        localText = localVisible
          ? `本地可见，食分 ${(l.obscuration * 100).toFixed(0)}%`
          : '本地点不可见（食带外）';
      } catch {
        /* not visible locally */
      }
      out.push({
        type: 'solar',
        peak: g.peak.date,
        kind: KIND_SOLAR[g.kind] ?? '日食',
        obscuration: g.obscuration ?? 0,
        localVisible,
        localText,
      });
      g = Astro.NextGlobalSolarEclipse(g.peak.date);
    }
  } catch {
    /* search failure */
  }
  return out.sort((a, b) => a.peak.getTime() - b.peak.getTime());
}
