import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BORTLE_TABLE, bortleInfo, skyQuality, bortleLux } from './nightsky.ts';
import { illuminance } from './sunlight.ts';

describe('nightsky (Bortle)', () => {
  it('table monotonic: darker B1, brighter B9', () => {
    for (let i = 1; i < 9; i++) {
      assert.ok(bortleInfo(i).sqm > bortleInfo(i + 1).sqm, `sqm B${i}>B${i + 1}`);
      assert.ok(bortleInfo(i).nelm > bortleInfo(i + 1).nelm, `nelm B${i}>B${i + 1}`);
      assert.ok(bortleInfo(i).lux < bortleInfo(i + 1).lux, `lux B${i}<B${i + 1}`);
    }
    assert.equal(BORTLE_TABLE.length, 9);
  });

  it('public anchors: B1 SQM ~21.99 (Bortle 1958), B9 inner-city bright', () => {
    assert.ok(Math.abs(bortleInfo(1).sqm - 21.99) < 0.02);
    assert.ok(bortleInfo(9).lux > 1);
  });

  it('full moon washes out milky way at dark site', () => {
    const dark = skyQuality({ bortle: 2, moonIllum: 0, moonAltDeg: 60, cloudPct: 0, sunAltDeg: -30 });
    const moon = skyQuality({ bortle: 2, moonIllum: 1, moonAltDeg: 60, cloudPct: 0, sunAltDeg: -30 });
    assert.ok(dark.milkyWayVisible);
    assert.ok(!moon.milkyWayVisible);
    assert.ok(moon.sqm < dark.sqm - 3);
  });

  it('city never shows milky way, B4 rural does at new moon', () => {
    assert.ok(!skyQuality({ bortle: 8, moonIllum: 0, moonAltDeg: -40, cloudPct: 0, sunAltDeg: -40 }).milkyWayVisible);
    assert.ok(skyQuality({ bortle: 4, moonIllum: 0, moonAltDeg: -40, cloudPct: 0, sunAltDeg: -40 }).milkyWayVisible);
  });

  it('illuminance integrates bortle at night, clamps at daylight', () => {
    const city = illuminance({ sunAltDeg: -40, cloudPct: 0, moonAltDeg: -30, moonPhase: 0, bortle: 9 });
    const dark = illuminance({ sunAltDeg: -40, cloudPct: 0, moonAltDeg: -30, moonPhase: 0, bortle: 1 });
    assert.ok(city > dark * 50, `${city} vs ${dark}`);
    assert.ok(dark > 0.001 && dark < 0.01);
  });

  it('bortleLux damped by cloud', () => {
    assert.ok(bortleLux(9, 0) > bortleLux(9, 100));
  });
});
