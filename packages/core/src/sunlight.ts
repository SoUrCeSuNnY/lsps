const DEG = Math.PI / 180;

import { bortleLux } from './nightsky.ts';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Simplified horizontal-plane illuminance model (lux), tuned for previz �?not a
 * radiometric transfer model. Anchors:
 *  - Clear noon sun overhead: ~110,000 lx direct + ~20,000 lx sky diffuse
 *  - Overcast noon: ~15% of clear
 *  - Civil twilight band (0°..-6°): 20% -> 2% of day level
 *  - Full moon at zenith: ~0.25 lx; moonless night sky: ~0.001-0.01 lx
 */
export function illuminance(lux: {
  sunAltDeg: number;
  cloudPct: number;
  moonAltDeg: number;
  moonPhase: number;
  bortle?: number;
}): number {
  const { sunAltDeg, cloudPct, moonAltDeg, moonPhase } = lux;
  const cloud = clamp01(cloudPct / 100);

  if (sunAltDeg > 0) {
    const clear = 20000 + Math.sin(sunAltDeg * DEG) * 90000;
    const overcast = Math.max(1000, clear * 0.15);
    return lerp(clear, overcast, cloud);
  }
  if (sunAltDeg > -6) {
    const day = illuminance({ sunAltDeg: 0.5, cloudPct, moonAltDeg, moonPhase, bortle: lux.bortle });
    const t = clamp01(-sunAltDeg / 6);
    return day * lerp(0.2, 0.02, t);
  }
  const moon = Math.max(0, Math.sin(moonAltDeg * DEG)) * 0.25 * clamp01(moonPhase);
  const pollution = lux.bortle ? bortleLux(lux.bortle, cloudPct) : (1 - cloud) * 0.006;
  const starlight = 0.002;
  return moon * (1 - 0.85 * cloud) + starlight + pollution;
}

/** Golden hour window estimate around sunrise/sunset (sun above -4°). */
export function goldenHourQuality(sunAltDeg: number): 'night' | 'blue' | 'golden' | 'day' {
  if (sunAltDeg < -6) return 'night';
  if (sunAltDeg < 0) return 'blue';
  if (sunAltDeg < 12) return 'golden';
  return 'day';
}
