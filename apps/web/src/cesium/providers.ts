import * as Cesium from 'cesium';

export interface MapSource {
  id: string;
  label: string;
  requires: 'none' | 'tdt' | 'ion';
  group: 'china' | 'global';
  main: (keys: { ionToken: string; tdtKey: string }) => Promise<Cesium.ImageryProvider>;
  labelLayer?: (keys: { tdtKey: string }) => Cesium.ImageryProvider | null;
}

const TDT_SUB = ['0', '1', '2', '3', '4', '5', '6', '7'];

/** Standard Tianditu WMTS endpoint (same pattern used by professional apps). */
function tdtWmts(layer: 'img' | 'vec' | 'cia' | 'cvb', key: string): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url:
      `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${key}`,
    subdomains: TDT_SUB,
    maximumLevel: 18,
    credit: new Cesium.Credit('© 天地图'),
  });
}

/** AutoNavi public raster tiles (webst=imagery, webrd=vector). No key, attribution required. */
function amapTiles(style: '6' | '8', sub: 'webst' | 'webrd'): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url: `https://${sub}0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x={x}&y={y}&z={z}`,
    subdomains: ['1', '2', '3', '4'],
    maximumLevel: 18,
    credit: new Cesium.Credit('© 高德地图'),
  });
}

async function ionBing(keys: { ionToken: string }): Promise<Cesium.ImageryProvider> {
  if (!keys.ionToken) throw new Error('需要 ion token');
  Cesium.Ion.defaultAccessToken = keys.ionToken;
  return Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL });
}

export const MAP_SOURCES: MapSource[] = [
  {
    id: 'tdt-img',
    label: '天地图 影像（大陆直连）',
    requires: 'tdt',
    group: 'china',
    main: (k) => Promise.resolve(tdtWmts('img', k.tdtKey)),
    labelLayer: (k) => (k.tdtKey ? tdtWmts('cia', k.tdtKey) : null),
  },
  {
    id: 'tdt-vec',
    label: '天地图 矢量',
    requires: 'tdt',
    group: 'china',
    main: (k) => Promise.resolve(tdtWmts('vec', k.tdtKey)),
    labelLayer: (k) => (k.tdtKey ? tdtWmts('cvb', k.tdtKey) : null),
  },
  {
    id: 'amap-img',
    label: '高德 卫星（免 key）',
    requires: 'none',
    group: 'china',
    main: () => Promise.resolve(amapTiles('6', 'webst')),
    labelLayer: () => amapTiles('8', 'webrd'),
  },
  {
    id: 'amap-vec',
    label: '高德 矢量（免 key）',
    requires: 'none',
    group: 'china',
    main: () => Promise.resolve(amapTiles('8', 'webrd')),
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    requires: 'none',
    group: 'global',
    main: () =>
      Promise.resolve(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          maximumLevel: 19,
          credit: new Cesium.Credit('© OpenStreetMap contributors (ODbL)'),
        }),
      ),
  },
  {
    id: 'ion-bing',
    label: 'Bing Aerial (Cesium ion)',
    requires: 'ion',
    group: 'global',
    main: (k) => ionBing(k),
  },
];

export type Basemap = string;

export function mapSource(id: Basemap): MapSource {
  return MAP_SOURCES.find((m) => m.id === id) ?? MAP_SOURCES.find((m) => m.id === 'osm')!;
}

export async function makeImagery(
  id: Basemap,
  keys: { ionToken: string; tdtKey: string },
): Promise<Cesium.ImageryProvider> {
  return mapSource(id).main(keys);
}

export function makeLabelLayer(
  id: Basemap,
  tdtKey: string,
): Cesium.ImageryProvider | null {
  const src = mapSource(id);
  return src.labelLayer ? src.labelLayer({ tdtKey }) : null;
}

export async function makeTerrain(ionToken: string): Promise<Cesium.Terrain | undefined> {
  if (!ionToken) return undefined;
  Cesium.Ion.defaultAccessToken = ionToken;
  // ion endpoint can hang for 30s+ on CN networks — cap it, fall back to ellipsoid
  const provider = Cesium.CesiumTerrainProvider.fromIonAssetId(1, {
    requestVertexNormals: true,
  }).catch(() => undefined);
  const timeout = new Promise<undefined>((ok) => setTimeout(() => ok(undefined), 8000));
  const p = await Promise.race([provider, timeout]);
  return p ? new Cesium.Terrain(Promise.resolve(p)) : undefined;
}
