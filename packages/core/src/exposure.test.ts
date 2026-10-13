import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  apertureFor,
  ev100FromIlluminance,
  evCamera,
  exposureDeltaStops,
  exposureFactor,
  ndStopsNeeded,
  shutterSecondsForFps,
} from './exposure.ts';

function close(a: number, b: number, tol: number, msg: string): void {
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
}

describe('exposure', () => {
  it('EV100 = 16 for 163840 lux', () => {
    close(ev100FromIlluminance(163840), 16, 1e-9, 'ev100');
  });

  it('EV16 scene at 1/64 ISO100 needs f/32; at f/16 needs 2 stops ND', () => {
    close(apertureFor(163840, 1 / 64, 100), 32, 1e-6, 'aperture');
    close(ndStopsNeeded(163840, 1 / 64, 100, 16), 2, 1e-9, 'nd');
  });

  it('f/2.8 @ 24fps 180deg ISO800 in full sun needs ~10 stops ND', () => {
    const t = shutterSecondsForFps(24, 180);
    const nd = ndStopsNeeded(110000, t, 800, 2.8);
    assert.ok(nd > 9.5 && nd < 10.3, `nd=${nd}`);
  });

  it('camera EV formula', () => {
    close(evCamera(16, 1 / 50, 100), Math.log2(16 * 16 * 50), 1e-9, 'evc');
  });

  it('exposure delta sign: 4x light = +2 stops = 4x factor', () => {
    close(exposureDeltaStops(163840 * 4, 1 / 64, 100, 32, 0), 2, 1e-9, 'delta');
    close(exposureFactor(2), 4, 1e-9, 'factor');
  });

  it('night is heavily under at day settings', () => {
    assert.ok(exposureDeltaStops(0.25, 1 / 48, 800, 2.8, 0) < -5);
  });
});
