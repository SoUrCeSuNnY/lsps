import * as Cesium from 'cesium';
import { STARS } from '../data/bright-stars';

const DEG = Math.PI / 180;

function colorForBv(bv: number): Cesium.Color {
  if (bv < -0.1) return Cesium.Color.fromCssColorString('#9db4ff');
  if (bv < 0.3) return Cesium.Color.fromCssColorString('#cad7ff');
  if (bv < 0.6) return Cesium.Color.WHITE;
  if (bv < 1.0) return Cesium.Color.fromCssColorString('#fff4ea');
  if (bv < 1.5) return Cesium.Color.fromCssColorString('#ffd2a1');
  return Cesium.Color.fromCssColorString('#ffcc6f');
}

/**
 * ICRF-fixed bright-star overlay. Star directions are J2000 equatorial;
 * each frame they are rotated to the Earth-fixed frame with Cesium's
 * ICRF->Fixed transform (precession/nutation consistent with the Cesium sun).
 */
export class StarField {
  private col: Cesium.PointPrimitiveCollection;
  private pts: Cesium.PointPrimitive[] = [];
  private icrf: Cesium.Cartesian3[];
  private baseColor: Cesium.Color[] = [];
  private baseSize: number[] = [];
  private scratch = new Cesium.Cartesian3();
  enabled = true;

  constructor(scene: Cesium.Scene) {
    this.col = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.icrf = STARS.map((s) => {
      const ra = s.ra * 15 * DEG;
      const de = s.dec * DEG;
      return new Cesium.Cartesian3(Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de));
    });
    STARS.forEach((s) => {
      const c = colorForBv(s.bv ?? 0);
      this.baseColor.push(c);
      this.baseSize.push(Math.min(9, Math.max(1.5, 5.5 - s.mag * 1.1)));
      this.pts.push(
        this.col.add({
          color: c,
          pixelSize: this.baseSize[this.baseSize.length - 1],
          outlineColor: Cesium.Color.WHITE.withAlpha(0.25),
          outlineWidth: 0.5,
        }),
      );
    });
  }

  update(time: Cesium.JulianDate, sunAltDeg: number): void {
    const vis = this.enabled ? Math.min(1, Math.max(0, (-sunAltDeg - 3) / 8)) : 0;
    this.col.show = vis > 0.01;
    if (!this.col.show) return;
    const m = Cesium.Transforms.computeIcrfToFixedMatrix(time);
    if (!m) return;
    const R = Cesium.Ellipsoid.WGS84.maximumRadius * 4;
    for (let i = 0; i < STARS.length; i++) {
      Cesium.Cartesian3.multiplyByScalar(this.icrf[i], R, this.scratch);
      Cesium.Matrix4.multiplyByPoint(m, this.scratch, this.scratch);
      const p = this.pts[i];
      p.position = Cesium.Cartesian3.clone(this.scratch);
      const tw = 0.94 + 0.06 * Math.sin(i * 12.9898 + Cesium.JulianDate.totalDays(time) * 1200);
      p.color = this.baseColor[i].withAlpha(Math.min(1, vis * tw));
    }
  }

  destroy(): void {
    this.col.show = false;
  }
}
