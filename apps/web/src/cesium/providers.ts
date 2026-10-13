import * as Cesium from 'cesium';

export type Basemap = 'tdt-img' | 'tdt-vec' | 'osm' | 'ion-bing';

export const BASEMAPS: { id: Basemap; label: string; requires: 'tdt' | 'ion' | 'none' }[] = [
  { id: 'tdt-img', label: '天地图 影像（大陆直连）', requires: 'tdt' },
  { id: 'tdt-vec', label: '天地图 矢量', requires: 'tdt' },
  { id: 'ion-bing', label: 'Bing Aerial (Cesium ion)', requires: 'ion' },
  { id: 'osm', label: 'OpenStreetMap', requires: 'none' },
];

const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'];

function tdt(layer: string, key: string): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/DataServer?T=${layer}&x={x}&y={y}&l={z}&tk=${key}`,
    subdomains: TDT_SUBDOMAINS,
    maximumLevel: 18,
    credit: new Cesium.Credit('© 天地图'),
  });
}

export async function makeImagery(
  kind: Basemap,
  ionToken: string,
  tdtKey: string,
): Promise<Cesium.ImageryProvider> {
  switch (kind) {
    case 'ion-bing':
      if (!ionToken) throw new Error('需要 VITE_CESIUM_ION_TOKEN');
      Cesium.Ion.defaultAccessToken = ionToken;
      return Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL });
    case 'tdt-img':
      if (!tdtKey) throw new Error('需要 VITE_TDT_KEY');
      return tdt('img_w', tdtKey);
    case 'tdt-vec':
      if (!tdtKey) throw new Error('需要 VITE_TDT_KEY');
      return tdt('vec_w', tdtKey);
    case 'osm':
    default:
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
        credit: new Cesium.Credit('© OpenStreetMap contributors (ODbL)'),
      });
  }
}

/** 天地图注记图层（img/vec 搭配 cva/cvb），仅 tdt 底图时返回。 */
export function makeTdtLabelLayer(kind: Basemap, tdtKey: string): Cesium.ImageryProvider | null {
  if (!tdtKey) return null;
  if (kind === 'tdt-img') return tdt('cva_w', tdtKey);
  if (kind === 'tdt-vec') return tdt('cvb_w', tdtKey);
  return null;
}

export async function makeTerrain(ionToken: string): Promise<Cesium.Terrain | undefined> {
  if (!ionToken) return undefined;
  Cesium.Ion.defaultAccessToken = ionToken;
  return new Cesium.Terrain(
    Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true }),
  );
}
