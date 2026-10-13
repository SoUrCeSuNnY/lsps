Licensing notes for plugins/sat-trak
====================================

- This plugin directory is intentionally EXCLUDED from the root npm workspace so that
  GPL-2.0 components (satellite.js) never enter the MIT-licensed application's
  dependency graph.
- `satellite.js` is GPL-2.0: https://github.com/shcherbin/satellite-js
  You install it yourself (cd plugins/sat-trak && npm install satellite.js); lsps
  exchanges only JSON data with this plugin across a process boundary.
- TLE orbital data: CelesTrak (free public data, see https://celestrak.org/data-access/).
- The skeleton code in src/ is MIT (same as lsps) and contains no GPL code.
