/**
 * 3D layer: procedural landmark massing.
 *
 * The live app streams real building footprints from Overpass OSM. A frame-based
 * export cannot depend on that: the public instances are rate-limited and
 * unreachable from the render network, so captured frames would vary with an
 * external service's availability. The reel builds its own 3D geometry from each
 * landmark's documented dimensions. Boxes and prisms go through Cesium's
 * normal-based lighting, so sun altitude and azimuth drive the shading for real —
 * the faces you see and the HUD's exposure readout come from the same skyInfo().
 *
 * Coordinates are metres in a local east/north frame anchored at the landmark.
 * Cesium box/cylinder graphics cannot be pitched, so mass far from the anchor
 * floats above the curved earth: the backdrop district stays compact.
 */
import * as Cesium from 'cesium';

export interface Mass {
  /** east/north offset of the footprint centre, metres */
  x: number;
  z: number;
  /** footprint width (east) and depth (north), metres */
  w: number;
  d: number;
  /** base height and top height, metres */
  base: number;
  h: number;
  /** 4-sided pyramid (apex over the centre) rather than a box */
  pyramid?: boolean;
  /** scenery rather than the landmark, so the height audit ignores it */
  backdrop?: boolean;
  /** thin vertical disc (the London Eye's wheel) rather than a box */
  disc?: boolean;
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** City blocks so a landmark sits inside a skyline rather than on a plain. */
function blocks(seed: number, count: number, rMin: number, spread: number, maxH: number): Mass[] {
  const out: Mass[] = [];
  for (let i = 0; i < count; i++) {
    const a = hash(i * 3.1 + seed) * Math.PI * 2;
    const r = rMin + hash(i * 7.7 + seed) * spread;
    out.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 55 + hash(i * 11 + seed) * 120,
      d: 55 + hash(i * 13 + seed) * 120,
      base: 0,
      h: 18 + hash(i * 17 + seed) * maxH,
      backdrop: true,
    });
  }
  return out;
}

/** Stack of footprints, tapering upward: the shape of every tiered tower. */
function tiers(spec: [number, number, number][]): Mass[] {
  let top = 0;
  return spec.map(([w, d, h]) => {
    const m: Mass = { x: 0, z: 0, w, d, base: top, h: top + h };
    top += h;
    return m;
  });
}

/** Tallest point of the landmark itself (backdrop scenery excluded). */
export function summit(list: Mass[]): number {
  return list.reduce((a, m) => (m.backdrop ? a : Math.max(a, m.h)), 0);
}

export const MASSES: Record<string, (seed: number) => Mass[]> = {
  /** Eiffel Tower: 330 m to the tip. */
  eiffel: (seed) => [
    ...blocks(seed, 26, 420, 900, 42),
    { x: -95, z: -95, w: 62, d: 62, base: 0, h: 57 },
    { x: 95, z: -95, w: 62, d: 62, base: 0, h: 57 },
    { x: -95, z: 95, w: 62, d: 62, base: 0, h: 57 },
    { x: 95, z: 95, w: 62, d: 62, base: 0, h: 57 },
    ...tiers([
      [200, 200, 9],
      [140, 140, 96],
      [64, 64, 8],
      [50, 50, 55],
      [24, 24, 7],
      [16, 16, 64],
      [4, 4, 91],
    ]),
  ],
  /** Burj Khalifa: 828 m to the spire tip. */
  burj: (seed) => [
    ...blocks(seed, 22, 500, 1000, 120),
    ...tiers([
      [220, 220, 105],
      [186, 186, 140],
      [156, 156, 125],
      [128, 128, 110],
      [102, 102, 95],
      [78, 78, 82],
      [56, 56, 76],
      [36, 36, 59],
    ]),
    { x: 0, z: 0, w: 9, d: 9, base: 800, h: 828 },
  ],
  /** Giza: Khufu 139 m, Khafre 143 m (on higher ground), Menkaure 65 m. */
  pyramid: (seed) => [
    { x: 110, z: -30, w: 215, d: 215, base: 0, h: 139, pyramid: true },
    { x: -260, z: 230, w: 215, d: 215, base: 8, h: 143, pyramid: true },
    { x: -500, z: 420, w: 102, d: 102, base: 0, h: 65, pyramid: true },
    ...blocks(seed, 14, 700, 700, 14),
  ],
  /**
   * Sydney Opera House: 65 m to the top sail ridge. The podium is the real
   * 152 m x 88 m platform; at a 150 m camera a wider slab spans more than the
   * frame's horizontal FOV and the shot reads as a tan wall.
   */
  opera: (seed) => [
    ...blocks(seed, 18, 420, 620, 70),
    { x: 0, z: 0, w: 152, d: 88, base: 0, h: 12 },
    // the sails, as angular shells standing on the podium (long shell group
    // toward -z, the concert-hall group behind it)
    { x: -30, z: -14, w: 67, d: 62, base: 10, h: 48, pyramid: true },
    { x: 28, z: -26, w: 58, d: 54, base: 10, h: 65, pyramid: true },
    { x: -22, z: 26, w: 58, d: 52, base: 10, h: 53, pyramid: true },
    { x: 44, z: 30, w: 40, d: 36, base: 10, h: 39, pyramid: true },
  ],
  /** 洪崖洞: the stilted block steps back as it rises, ~88 m. */
  hongyadong: (seed) => [
    ...blocks(seed, 22, 420, 760, 210),
    ...Array.from({ length: 7 }, (_, f): Mass => ({
      x: -40 + f * 6,
      z: 0,
      w: 330 - f * 26,
      d: 250 - f * 20,
      base: 6 + f * 11.4,
      h: 18 + f * 11.4,
    })),
    { x: -180, z: -40, w: 16, d: 16, base: 0, h: 92 },
    { x: 180, z: -40, w: 16, d: 16, base: 0, h: 78 },
    // suspension deck crossing the tops of the towers
    { x: 0, z: -40, w: 520, d: 26, base: 64, h: 70 },
  ],
  /** Empire State Building: 381 m to the roof, 443 m to the antenna tip. */
  empire: (seed) => [
    ...blocks(seed, 26, 520, 1100, 200),
    ...tiers([
      [200, 200, 160],
      [152, 152, 110],
      [112, 112, 60],
      [80, 80, 30],
      [56, 56, 21],
    ]),
    { x: 0, z: 0, w: 14, d: 14, base: 381, h: 401 },
    { x: 0, z: 0, w: 4, d: 4, base: 401, h: 443 },
  ],
  /**
   * Westminster: Big Ben 96 m, Victoria Tower 98 m, the London Eye 120 m.
   * The camera aims at the anchor, so the tower being filmed has to sit at
   * x=0 — an offset puts the subject out of frame. South is -z.
   */
  london: (seed) => [
    ...blocks(seed, 24, 480, 900, 80),
    // The Palace of Westminster is ~300 m x 35 m along the river front. Modelled
    // as a squat 150 x 96 block it reads as a wall filling the panel from a
    // 300 m camera; as a long bar it reads as a building.
    { x: 0, z: 40, w: 55, d: 300, base: 0, h: 30 },
    { x: 0, z: -95, w: 34, d: 34, base: 30, h: 86 },
    { x: 0, z: -95, w: 22, d: 22, base: 86, h: 96, pyramid: true },
    // Victoria Tower at the south end of the river front, 98 m
    { x: 10, z: 150, w: 60, d: 60, base: 0, h: 98 },
    // the Eye on the south bank, offset east so it clears the camera's sight
    // line to the clock tower (the camera stands ~520 m SSW of the anchor)
    { x: 200, z: -170, w: 120, d: 120, base: 8, h: 128, disc: true, backdrop: true },
    // Westminster Bridge runs north-south across the tideway
    { x: 70, z: -80, w: 19, d: 290, base: 5, h: 8, backdrop: true },
  ],
};

export interface Landmark3d {
  remove(): void;
}

/** Local east/north/up frame at the landmark, in metres. */
function frameAt(viewer: Cesium.Viewer, lat: number, lon: number) {
  const el = viewer.scene.globe.ellipsoid;
  const origin = Cesium.Cartesian3.fromDegrees(lon, lat, 0, el);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin, el, new Cesium.Matrix4());
  return {
    toWorld: (x: number, z: number, y: number) =>
      Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(x, z, y), new Cesium.Cartesian3()),
    /**
     * Orientation for a solid at `p`. Entity `orientation` lives in the fixed
     * (ECEF) frame, so the east-north-up rotation at that point is the base —
     * a bare Z-axis quaternion would spin the box in ECEF, not on the ground.
     */
    quatAt: (p: Cesium.Cartesian3) =>
      Cesium.Quaternion.fromRotationMatrix(
        Cesium.Matrix4.getRotation(
          Cesium.Transforms.eastNorthUpToFixedFrame(p, el, new Cesium.Matrix4()),
          new Cesium.Matrix3(),
        ),
        new Cesium.Quaternion(),
      ),
  };
}

/**
 * Build the shot's massing. `night` scatters window lights on the facades — the
 * open Cesium globe has no city-lights layer (that is an ion asset), so the
 * lights are geometry, seeded per shot so a captured frame stays reproducible.
 */
export function buildLandmark(
  viewer: Cesium.Viewer,
  name: string,
  lat: number,
  lon: number,
  seed: number,
  night: boolean,
): Landmark3d {
  const list = MASSES[name]?.(seed) ?? [];
  const { toWorld, quatAt } = frameAt(viewer, lat, lon);

  const entities = list.map((m) => {
    const position = toWorld(m.x, m.z, (m.base + m.h) / 2);
    const q = quatAt(position);
    // A 4-slice cylinder puts its base corners on the local axes, i.e. on a
    // 45° diagonal of the intended footprint; yaw by 45° to square it up.
    const yaw = m.pyramid ? Math.PI / 4 : 0;
    return viewer.entities.add({
      position,
      orientation: yaw
        ? Cesium.Quaternion.multiply(
            q,
            Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, yaw, new Cesium.Quaternion()),
            new Cesium.Quaternion(),
          )
        : q,
      box: m.pyramid
        ? undefined
        : {
            // A disc prop (the London Eye) is a thin vertical panel: Cesium boxes
            // cannot be pitched, so "vertical" means thin along north, not rotated.
            dimensions: m.disc
              ? new Cesium.Cartesian3(m.w, 8, m.h - m.base)
              : new Cesium.Cartesian3(m.w, m.d, m.h - m.base),
            material: Cesium.Color.fromCssColorString(m.disc ? '#465063' : '#2f3742'),
          },
      cylinder: m.pyramid
        ? {
            length: m.h - m.base,
            topRadius: 0,
            bottomRadius: Math.hypot(m.w, m.d) / 2,
            slices: 4,
            material: Cesium.Color.fromCssColorString('#6d6047'),
          }
        : undefined,
    });
  });

  const lights = new Cesium.PointPrimitiveCollection();
  if (night && list.length) {
    const span = list.reduce((a, m) => a + m.w * (m.h - m.base), 0);
    const count = Math.min(900, Math.round(span / 700));
    for (let i = 0; i < count; i++) {
      const m = list[Math.floor(hash(i * 5.3 + seed) * list.length)];
      if (!m || m.h - m.base < 26) continue;
      const side = Math.floor(hash(i * 9.1 + seed) * 4);
      const along = (hash(i * 3.7 + seed) - 0.5) * (side % 2 ? m.d : m.w) * 0.92;
      const out = (side < 2 ? m.w : m.d) / 2 + 3;
      const ex = side === 0 ? out : side === 1 ? -out : 0;
      const ez = side === 2 ? out : side === 3 ? -out : 0;
      const y = m.base + 6 + hash(i * 13.9 + seed) * (m.h - m.base - 9);
      lights.add({
        position: toWorld(m.x + (side % 2 ? along : ex), m.z + (side % 2 ? ez : along), y),
        pixelSize: 1.6 + hash(i * 2.3) * 2.4,
        color: Cesium.Color.fromCssColorString(
          hash(i * 17.3) > 0.7 ? 'rgba(255,236,190,0.95)' : 'rgba(255,176,86,0.85)',
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }
  viewer.scene.primitives.add(lights);

  return {
    remove() {
      for (const e of entities) viewer.entities.remove(e);
      viewer.scene.primitives.remove(lights);
    },
  };
}
