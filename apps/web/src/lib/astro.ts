import * as Astro from 'astronomy-engine';

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
