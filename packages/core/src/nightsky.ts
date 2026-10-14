// Scene model: Bortle dark-sky scale (Bortle 1958, Sky & Telescope; SQM values
// are the widely-cited public consensus table, ground illuminance estimates marked EST).
// Public-domain astronomy facts, own model code (MIT).

export interface BortleInfo {
  level: number;
  name: string;
  sqm: number; // sky quality meter, mag/arcsec^2 (higher = darker)
  nelm: number; // naked-eye limiting magnitude
  milkyWay: string;
  lux: number; // horizontal illuminance, moonless night (EST)
}

export const BORTLE_TABLE: BortleInfo[] = [
  { level: 1, name: '黑暗夜空（理想）', sqm: 21.99, nelm: 7.8, milkyWay: '银河立体可见，黄道光/对日照明显', lux: 0.0002 },
  { level: 2, name: '黑暗夜空', sqm: 21.89, nelm: 7.3, milkyWay: '银河结构丰富，云呈空洞', lux: 0.0003 },
  { level: 3, name: '乡村夜空', sqm: 21.75, nelm: 6.8, milkyWay: '银河依旧壮观，天顶略弱', lux: 0.0005 },
  { level: 4, name: '乡村/郊外过渡', sqm: 21.56, nelm: 6.3, milkyWay: '银河高对比度，夏季大三角可见', lux: 0.001 },
  { level: 5, name: '郊区过渡', sqm: 21.3, nelm: 5.8, milkyWay: '银河方向可辨，云被照亮', lux: 0.005 },
  { level: 6, name: '郊区夜空', sqm: 20.95, nelm: 5.3, milkyWay: '银河仅天顶隐约可见', lux: 0.02 },
  { level: 7, name: '郊区/城市过渡', sqm: 20.45, nelm: 4.8, milkyWay: '银河不可见，天际线微光', lux: 0.1 },
  { level: 8, name: '城市夜空', sqm: 19.95, nelm: 4.3, milkyWay: '仅亮星可辨，天空灰白', lux: 0.6 },
  { level: 9, name: '市中心', sqm: 19.3, nelm: 3.9, milkyWay: '仅月亮与行星', lux: 4 },
];

export function bortleInfo(level: number): BortleInfo {
  return BORTLE_TABLE[Math.min(9, Math.max(1, Math.round(level))) - 1];
}

/**
 * Effective night-sky quality combining Bortle site, moonlight and clouds.
 * Returns SQM (moonlight-scattering degradation is an EST model) + visibility verdicts.
 */
export function skyQuality(opts: {
  bortle: number;
  moonIllum: number;
  moonAltDeg: number;
  cloudPct: number;
  sunAltDeg: number;
}): { sqm: number; nelm: number; milkyWayVisible: boolean; zodiacal: boolean; text: string } {
  const b = bortleInfo(opts.bortle);
  const moon = Math.max(0, Math.sin((opts.moonAltDeg * Math.PI) / 180)) * opts.moonIllum;
  // Full moon brightens sky ~4 mag (SQM 21.9 -> ~18). EST exponential.
  const moonSqmLoss = 4.0 * moon;
  const cloudLoss = (opts.cloudPct / 100) * (moon > 0.1 ? 1.5 : -0.3); // lit clouds brighten, dark clouds hide stars
  const sqm = b.sqm - moonSqmLoss - cloudLoss;
  const nelm = Math.min(7.8, b.nelm - moonSqmLoss * 0.8);
  const milkyWayVisible =
    opts.sunAltDeg < -15 && sqm >= 20.35 && opts.cloudPct < 30;
  const zodiacal = opts.bortle <= 3 && opts.moonIllum < 0.25 && opts.sunAltDeg < -12;
  let text: string;
  if (opts.sunAltDeg > -6) text = '非夜间';
  else if (milkyWayVisible) text = '银河肉眼可见';
  else if (sqm >= 20.9) text = '亮星/星座清晰，银河受月光影响';
  else if (sqm >= 19.9) text = '仅亮星，适合星轨/月景';
  else text = '光害/月光主导，深空不可见';
  return { sqm, nelm, milkyWayVisible, zodiacal, text };
}

/** Night-sky illuminance contribution of light pollution (lux, EST), damped by cloud. */
export function bortleLux(level: number, cloudPct: number): number {
  const b = bortleInfo(level);
  // Thin cloud dims stars; thick lit cloud brightens ground under city glow (simplified: damp)
  return b.lux * (1 - 0.6 * (cloudPct / 100));
}
