import * as Cesium from 'cesium';
import * as Astro from 'astronomy-engine';

const DEG = Math.PI / 180;
const AU = 1.495978707e11;

// Approach (sampling sun direction, coloring by altitude) follows Cesium's
// official SunPathDisplay sample (Apache-2.0, Cesium GS); the ephemeris source
// here is astronomy-engine GeoVector (GCRS/ICRF, MIT).
function sunDirIcrf(date: Date): Cesium.Cartesian3 | null {
  const m = Cesium.Transforms.computeIcrfToFixedMatrix(Cesium.JulianDate.fromDate(date));
  if (!m) return null;
  const v = Astro.GeoVector(Astro.Body.Sun, date, true);
  const pos = new Cesium.Cartesian3(v.x * AU, v.y * AU, v.z * AU);
  const out = new Cesium.Cartesian3();
  Cesium.Matrix3.multiplyByVector(m, pos, out);
  return out;
}

function colorForAlt(altDeg: number): Cesium.Color {
  if (altDeg < -18) return Cesium.Color.fromCssColorString('#31445e').withAlpha(0.85);
  if (altDeg < -6) return Cesium.Color.fromCssColorString('#6f86c9').withAlpha(0.9);
  if (altDeg < 0) return Cesium.Color.fromCssColorString('#f2b84b').withAlpha(0.95);
  if (altDeg < 12) return Cesium.Color.fromCssColorString('#e4573d');
  return Cesium.Color.fromCssColorString('#ffe9a8');
}

export class SunPath {
  private entities: Cesium.Entity[] = [];
  private marker?: Cesium.Entity;

  constructor(private viewer: Cesium.Viewer) {}

  /** Draw the sun's path for the UTC calendar day containing `day`. */
  show(day: Date, lat: number, lon: number): void {
    this.hide();
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const up = Cesium.Cartesian3.normalize(center, new Cesium.Cartesian3());
    const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const R = 4.5e5;
    const dir = new Cesium.Cartesian3();
    const pts: { p: Cesium.Cartesian3; alt: number }[] = [];
    for (let h = 0; h <= 24.001; h += 0.25) {
      const d = new Date(dayStart + h * 3600e3);
      const sunPos = sunDirIcrf(d);
      if (!sunPos) continue;
      Cesium.Cartesian3.subtract(sunPos, center, dir);
      Cesium.Cartesian3.normalize(dir, dir);
      const alt = Math.asin(Cesium.Cartesian3.dot(dir, up)) / DEG;
      pts.push({
        p: Cesium.Cartesian3.add(
          center,
          Cesium.Cartesian3.multiplyByScalar(dir, R, new Cesium.Cartesian3()),
          new Cesium.Cartesian3(),
        ),
        alt,
      });
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      this.entities.push(
        this.viewer.entities.add({
          polyline: {
            positions: [pts[i].p, pts[i + 1].p],
            width: 3,
            material: colorForAlt(pts[i].alt),
            arcType: Cesium.ArcType.NONE,
          },
        }),
      );
    }
    const ring: Cesium.Cartesian3[] = [];
    const east = Cesium.Cartesian3.cross(up, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(east, east);
    const north = Cesium.Cartesian3.cross(east, up, new Cesium.Cartesian3());
    for (let a = 0; a <= 360; a += 5) {
      const rad = a * DEG;
      const off = Cesium.Cartesian3.add(
        Cesium.Cartesian3.multiplyByScalar(east, Math.sin(rad) * R, new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(north, Math.cos(rad) * R, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
      ring.push(Cesium.Cartesian3.add(center, off, new Cesium.Cartesian3()));
    }
    this.entities.push(
      this.viewer.entities.add({
        polyline: {
          positions: ring,
          width: 1.5,
          material: Cesium.Color.fromCssColorString('#7fd1ae').withAlpha(0.5),
          arcType: Cesium.ArcType.NONE,
        },
      }),
    );
  }

  setMarker(time: Cesium.JulianDate, lat: number, lon: number): void {
    const date = Cesium.JulianDate.toDate(time);
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const sunPos = sunDirIcrf(date);
    if (!sunPos) return;
    const dir = Cesium.Cartesian3.subtract(sunPos, center, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(dir, dir);
    const pos = Cesium.Cartesian3.add(
      center,
      Cesium.Cartesian3.multiplyByScalar(dir, 4.5e5, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    if (!this.marker) {
      this.marker = this.viewer.entities.add({
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString('#fff2b0'),
          outlineColor: Cesium.Color.ORANGE,
          outlineWidth: 2,
        },
      });
    }
    this.marker.position = new Cesium.ConstantPositionProperty(pos);
  }

  hide(): void {
    for (const e of this.entities) this.viewer.entities.remove(e);
    this.entities = [];
  }

  destroy(): void {
    this.hide();
    if (this.marker) this.viewer.entities.remove(this.marker);
  }
}
