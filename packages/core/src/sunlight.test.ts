import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { illuminance, goldenHourQuality } from './sunlight.ts';

describe('sunlight', () => {
  it('clear noon ~110 klx', () => {
    const e = illuminance({ sunAltDeg: 90, cloudPct: 0, moonAltDeg: -30, moonPhase: 0 });
    assert.ok(Math.abs(e - 110000) < 1000, `${e}`);
  });

  it('overcast is 15% of clear', () => {
    const clear = illuminance({ sunAltDeg: 90, cloudPct: 0, moonAltDeg: -30, moonPhase: 0 });
    const oc = illuminance({ sunAltDeg: 90, cloudPct: 100, moonAltDeg: -30, moonPhase: 0 });
    assert.ok(Math.abs(oc / clear - 0.15) < 0.01, `${oc / clear}`);
  });

  it('full moon zenith night ~0.1-0.6 lx', () => {
    const e = illuminance({ sunAltDeg: -30, cloudPct: 0, moonAltDeg: 90, moonPhase: 1 });
    assert.ok(e > 0.1 && e < 0.6, `${e}`);
  });

  it('moonless overcast night < 0.02 lx', () => {
    const e = illuminance({ sunAltDeg: -40, cloudPct: 100, moonAltDeg: -30, moonPhase: 0 });
    assert.ok(e < 0.02, `${e}`);
  });

  it('twilight decays, quality buckets', () => {
    const a = illuminance({ sunAltDeg: -1, cloudPct: 0, moonAltDeg: -30, moonPhase: 0 });
    const b = illuminance({ sunAltDeg: -5, cloudPct: 0, moonAltDeg: -30, moonPhase: 0 });
    assert.ok(a > b);
    assert.equal(goldenHourQuality(-3), 'blue');
    assert.equal(goldenHourQuality(5), 'golden');
    assert.equal(goldenHourQuality(40), 'day');
    assert.equal(goldenHourQuality(-20), 'night');
  });
});
