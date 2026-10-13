# Third-Party Notices

lsps is MIT-licensed. This file lists the third-party **code** it links to.
License gate: `npm run check:licenses` (CI) enforces the whitelist
MIT / Apache-2.0 / BSD / Zlib / ISC / 0BSD / Unlicense / CC0 / CC-BY /
MPL-2.0 (file-level) / BlueOak; GPL-family code is hard-blocked in the app tree.

## Direct runtime dependencies

| Package | License | Role |
|---|---|---|
| CesiumJS (CesiumGS/cesium) | Apache-2.0 | 3D globe, terrain, 3D Tiles, sun/moon/stars ephemeris, shadows, atmosphere |
| three.js (mrdoob/three.js) | MIT | Math & shader reference sources (no runtime dependency of this repo today) |
| astronomy-engine (cosinekitty/astronomy) | MIT | Sunrise/sunset, twilight, moon phase, rise/set searches |
| React / React-DOM | MIT | UI |
| Vite / @vitejs/plugin-react / vite-plugin-static-copy | MIT | Build |
| pmndrs/postprocessing | Zlib | DOF/tone-mapping algorithm reference (ported ideas, noted in-source) |

The full production dependency graph is audited automatically in CI; the complete
NOTICE/LICENSE texts of Apache-2.0 components ship inside the `cesium` npm package
(`node_modules/cesium/LICENSE.md`, `ThirdParty/`), which must be redistributed with
any binary build of this app (Apache-2.0 §4 requirement).

## Deliberately isolated (NOT linked into this repo)

| Component | License | Isolation boundary |
|---|---|---|
| open-meteo/open-meteo (server) | AGPL-3.0 | Public HTTP API only; no code bundled, no self-hosted instance |
| satellite.js | GPL-2.0 | `plugins/sat-trak` (own dir, excluded from workspace, process + JSON protocol) |
| Stellarium / stellarium-web-engine | GPL-2.0 | Ideas/catalog sources only; star data used: Yale BSC (public domain) |
| Google Photorealistic 3D Tiles | GMPA (proprietary) | Runtime, user's own API key, no caching in repo |
