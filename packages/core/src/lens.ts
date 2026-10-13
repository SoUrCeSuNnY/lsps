export interface Sensor {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export const SENSORS: Sensor[] = [
  { id: 'ff', name: 'Full Frame 36×24', widthMm: 36, heightMm: 24 },
  { id: 'apl', name: 'ARRI Alexa LF 36×25.58', widthMm: 36, heightMm: 25.58 },
  { id: 's35', name: 'Super 35 (3-perf) 24.89×18.66', widthMm: 24.89, heightMm: 18.66 },
  { id: 's16', name: 'Super 16 12.52×7.58', widthMm: 12.52, heightMm: 7.58 },
  { id: 'm43', name: 'Micro 4/3 17.3×13', widthMm: 17.3, heightMm: 13 },
  { id: '11', name: '1-inch 13.2×8.8', widthMm: 13.2, heightMm: 8.8 },
];

export const FOCAL_PRESETS = [14, 16, 18, 21, 24, 28, 32, 35, 40, 50, 65, 75, 85, 100, 135, 180, 250, 300];

export const APERTURE_STOPS = [1.0, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

export const ND_FILTERS = [
  { stops: 0, label: 'ND 0' },
  { stops: 3, label: 'ND 8' },
  { stops: 6, label: 'ND 64' },
  { stops: 8, label: 'ND 256' },
  { stops: 10, label: 'ND 1024' },
];

export const ASPECTS = [
  { id: '1.85', label: '1.85 : 1', ratio: 1.85 },
  { id: '2.39', label: '2.39 : 1 (Scope)', ratio: 2.39 },
  { id: '16:9', label: '16 : 9', ratio: 16 / 9 },
  { id: '4:3', label: '4 : 3', ratio: 4 / 3 },
  { id: '1:1', label: '1 : 1', ratio: 1 },
  { id: '9:16', label: '9 : 16', ratio: 9 / 16 },
];

const DEG = Math.PI / 180;

export function sensorById(id: string): Sensor {
  return SENSORS.find((s) => s.id === id) ?? SENSORS[0];
}

export function verticalFovDeg(focalMm: number, sensor: Sensor): number {
  return 2 * Math.atan(sensor.heightMm / 2 / focalMm) / DEG;
}

export function horizontalFovDeg(focalMm: number, sensor: Sensor): number {
  return 2 * Math.atan(sensor.widthMm / 2 / focalMm) / DEG;
}

export function diagonalFovDeg(focalMm: number, sensor: Sensor): number {
  const diag = Math.hypot(sensor.widthMm, sensor.heightMm);
  return 2 * Math.atan(diag / 2 / focalMm) / DEG;
}

/** Frame width (m) covered at distance d (m) for the given lens — scouting "how wide is my shot". */
export function frameWidthM(focalMm: number, sensor: Sensor, distanceM: number): number {
  return (sensor.widthMm / focalMm) * distanceM;
}

export function frameHeightM(focalMm: number, sensor: Sensor, distanceM: number): number {
  return (sensor.heightMm / focalMm) * distanceM;
}

/** Thin-lens hyperfocal distance (m). */
export function hyperfocalM(focalMm: number, aperture: number, pixelMicron = 0.008): number {
  const c = pixelMicron / 1000;
  return (focalMm * focalMm) / (aperture * c * 1000);
}
