/**
 * Incident-light exposure model (spot/incident meter math used on set):
 *   EV100 = log2(lux / 2.5)          (K = 2.5 incident calibration)
 *   EV_S  = EV100 + log2(ISO/100)    (scene exposure value at sensor speed)
 *   EV_S  = log2(N^2 / t) + NDstops  (camera exposure triangle + ND)
 */

export function ev100FromIlluminance(lux: number): number {
  return Math.log2(Math.max(lux, 1e-6) / 2.5);
}

export function evCamera(aperture: number, shutterSeconds: number, iso: number): number {
  return Math.log2((aperture * aperture) / shutterSeconds) - Math.log2(iso / 100);
}

/** f-stop that renders a "middle gray" scene of `lux` at given shutter/ISO (no ND). */
export function apertureFor(lux: number, shutterSeconds: number, iso: number): number {
  const evs = ev100FromIlluminance(lux) + Math.log2(iso / 100);
  return Math.sqrt(Math.pow(2, evs) * shutterSeconds);
}

/** ND stops required to keep exposure at `aperture` for a scene of `lux`. 0 = no filter needed. */
export function ndStopsNeeded(lux: number, shutterSeconds: number, iso: number, aperture: number): number {
  const evs = ev100FromIlluminance(lux) + Math.log2(iso / 100);
  return Math.max(0, evs - Math.log2((aperture * aperture) / shutterSeconds));
}

/**
 * Stops of over/under-exposure the simulated sensor sees.
 * +2 = two stops bright → visual exposure multiplier 4.
 */
export function exposureDeltaStops(
  lux: number,
  shutterSeconds: number,
  iso: number,
  aperture: number,
  ndStops: number,
): number {
  const evs = ev100FromIlluminance(lux) + Math.log2(iso / 100);
  return evs - (evCamera(aperture, shutterSeconds, iso) + ndStops);
}

/** Map exposure delta (stops) to a bounded display/exposure factor for tone mapping. */
export function exposureFactor(deltaStops: number, midpoint = 0): number {
  const d = deltaStops - midpoint;
  return Math.min(64, Math.max(1 / 64, Math.pow(2, d)));
}

/** 180° shutter rule: exposure time for a frame rate. */
export function shutterSecondsForFps(fps: number, shutterAngleDeg = 180): number {
  return shutterAngleDeg / 360 / fps;
}
