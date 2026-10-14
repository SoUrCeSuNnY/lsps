# Data & Content Attributions

Displayed in-app where marked; this file is the canonical list.

- **Map imagery**: © 天地图 (when key set) / © 高德图幅（公开瓦片，署名内置）/ © OpenStreetMap
  contributors, basemap data © OpenDatabase (ODbL, https://www.openstreetmap.org/copyright) /
  Bing Maps Aerial via Cesium ion (Cesium ion Terms of Use).
- **POI search**: 高德开放平台 / 腾讯位置服务 / 天地图地理编码 / Nominatim(OSM) — 各按
  用户自申请 key 的官方条款使用。
- **Weather data**: [Open-Meteo.com](https://open-meteo.com/) — CC BY 4.0 (primary);
  **7Timer!** (NASA/NIH Braunsberg) — public domain (fallback). Attribution shown in UI.
- **Bortle dark-sky table**: Bortle 1958 (Sky & Telescope) public astronomy consensus
  values; SQM/lux mapping is our own EST model.
- **Hongyadong 3D buildings**: building footprints/heights © OpenStreetMap
  contributors (ODbL extract, prebaked via scripts/fetch-hongyadong.mjs into
  apps/web/public/data/hongyadong.json); facade night-light texture is
  procedural (generated at runtime, no third-party asset).
- **Star catalog**: Yale Bright Star Catalog — public domain (5th ed.).
- **Milky Way panorama** (optional asset via `npm run fetch:assets`): ESO / S. Brunier — CC BY 4.0.
- **TLE data** (sat-trak plugin): CelesTrak, https://celestrak.org/data-access/ (free public data).
- **Sun/Moon/planet ephemerides**: computed locally by astronomy-engine (MIT) and Cesium's
  internal ELP/MPP02 + ESOC theories — data provenance: NASA JPL / CNES-IMC / ESA, public science data.
- **Geocoding**: Nominatim (OSM Foundation usage policy) / 天地图地理编码 API.
