import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SENSORS,
  sensorById,
  verticalFovDeg,
  horizontalFovDeg,
  frameWidthM,
  hyperfocalM,
} from './lens.ts';

function close(a: number, b: number, tol: number, msg: string): void {
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
}

describe('lens', () => {
  it('50mm on full frame gives ~27 deg vertical FOV', () => {
    close(verticalFovDeg(50, sensorById('ff')), 26.99, 0.1, 'vfov');
  });

  it('24mm on full frame gives ~73.7 deg horizontal FOV', () => {
    close(horizontalFovDeg(24, sensorById('ff')), 73.74, 0.1, 'hfov');
  });

  it('100mm on Super 35 is narrower than on full frame (crop)', () => {
    assert.ok(verticalFovDeg(100, sensorById('s35')) < verticalFovDeg(100, sensorById('ff')));
  });

  it('frame width at 10m for 25mm FF = 14.4m', () => {
    close(frameWidthM(25, sensorById('ff'), 10), 14.4, 0.1, 'width');
  });

  it('hyperfocal scales with aperture inverse', () => {
    close(hyperfocalM(25, 4), hyperfocalM(25, 8) * 2, 1e-9, 'hyperfocal');
    assert.ok(SENSORS.length > 3);
  });
});
