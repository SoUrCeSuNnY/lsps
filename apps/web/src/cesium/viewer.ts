import * as Cesium from 'cesium';
import { Basemap, makeImagery, makeTerrain, makeTdtLabelLayer } from './providers';

export interface ViewerOpts {
  ionToken: string;
  tdtKey: string;
  basemap: Basemap;
}

export async function createViewer(container: HTMLElement, o: ViewerOpts): Promise<Cesium.Viewer> {
  const base = await makeImagery(o.basemap, o.ionToken, o.tdtKey);
  const terrain = await makeTerrain(o.ionToken);
  const viewer = new Cesium.Viewer(container, {
    baseLayer: Cesium.ImageryLayer.fromProviderAsync(Promise.resolve(base)),
    terrain,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
    contextOptions: {
      webgl: { preserveDrawingBuffer: true, powerPreference: 'high-performance' },
    },
  });
  const scene = viewer.scene;
  scene.globe.enableLighting = true;
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1d33');
  scene.highDynamicRange = true;
  scene.fog.enabled = true;
  viewer.shadows = true;
  const sm = (scene as unknown as { shadowMap?: { shadowDarkness: number } }).shadowMap;
  if (sm) sm.shadowDarkness = 0.85;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4e7;
  if (o.tdtKey) {
    const label = makeTdtLabelLayer(o.basemap, o.tdtKey);
    if (label) viewer.imageryLayers.addImageryProvider(label);
  }
  return viewer;
}

export async function swapBasemap(
  viewer: Cesium.Viewer,
  kind: Basemap,
  ionToken: string,
  tdtKey: string,
): Promise<void> {
  const base = await makeImagery(kind, ionToken, tdtKey);
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(base);
  if (tdtKey) {
    const label = makeTdtLabelLayer(kind, tdtKey);
    if (label) viewer.imageryLayers.addImageryProvider(label);
  }
}

export function setVerticalFov(viewer: Cesium.Viewer, fovDeg: number): void {
  const frustum = viewer.camera.frustum;
  if (frustum instanceof Cesium.PerspectiveFrustum) {
    frustum.fov = Cesium.Math.toRadians(fovDeg);
  }
}

export function flyTo(viewer: Cesium.Viewer, lat: number, lon: number, alt = 1200): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-28),
      roll: 0,
    },
    duration: 1.6,
  });
}

/** Ground position the camera looks at (falls back to camera's own longitude/latitude). */
export function cameraGround(viewer: Cesium.Viewer): Cesium.Cartographic | null {
  const ray = new Cesium.Ray(viewer.camera.positionWC, viewer.camera.directionWC);
  const t = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84);
  if (t) {
    const pos = Cesium.Ray.getPoint(ray, t.start);
    return Cesium.Cartographic.fromCartesian(pos);
  }
  const ell = viewer.camera.positionCartographic;
  return ell && Number.isFinite(ell.longitude) && ell.height < 3e7 ? ell : null;
}
