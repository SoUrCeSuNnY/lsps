import * as Cesium from 'cesium';
import { Basemap, makeImagery, makeLabelLayer, makeTerrain } from './providers';

export interface ViewerOpts {
  ionToken: string;
  tdtKey: string;
  basemap: Basemap;
}

export async function createViewer(container: HTMLElement, o: ViewerOpts): Promise<Cesium.Viewer> {
  const base = await makeImagery(o.basemap, o);
  const terrain = await makeTerrain(o.ionToken);
  const viewer = new Cesium.Viewer(container, {
    defaultView: false, // suppress Cesium's built-in US intro flight (it overrides our scene camera)
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
  const sm = (scene as unknown as { shadowMap?: { shadowDarkness: number; softShadows: boolean } }).shadowMap;
  if (sm) {
    sm.shadowDarkness = 0.85;
    sm.softShadows = true; // PCSS: kills the frame-to-frame hard-edge shadow flicker during time-lapse
  }
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4e7;
  const label = makeLabelLayer(o.basemap, o.tdtKey);
  if (label) viewer.imageryLayers.addImageryProvider(label);
  return viewer;
}

export async function swapBasemap(
  viewer: Cesium.Viewer,
  kind: Basemap,
  ionToken: string,
  tdtKey: string,
): Promise<void> {
  const base = await makeImagery(kind, { ionToken, tdtKey });
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(base);
  const label = makeLabelLayer(kind, tdtKey);
  if (label) viewer.imageryLayers.addImageryProvider(label);
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

/** Ground position the camera looks at (near-side globe intersection). */
export function cameraGround(viewer: Cesium.Viewer): Cesium.Cartographic | null {
  const ray = new Cesium.Ray(viewer.camera.positionWC, viewer.camera.directionWC);
  const p = viewer.scene.globe.pick(ray, viewer.scene);
  if (p) return Cesium.Cartographic.fromCartesian(p);
  const ell = viewer.camera.positionCartographic;
  return ell && Number.isFinite(ell.longitude) && ell.height < 3e7 ? ell : null;
}
