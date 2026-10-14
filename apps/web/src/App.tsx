import { useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  exposureDeltaStops,
  illuminance,
  goldenHourQuality,
  ndStopsNeeded,
  shutterSecondsForFps,
  verticalFovDeg,
  horizontalFovDeg,
  sensorById,
  skyQuality,
} from '@lsps/core';
import { createViewer, flyTo, cameraGround, setVerticalFov, swapBasemap } from './cesium/viewer';
import { Effects } from './cesium/effects';
import { StarField } from './cesium/starfield';
import { SunPath } from './cesium/sunpath';
import { loadOsmBuildings, loadPackedBuildings } from './cesium/osm-buildings';
import { daySky, nextEclipses, skyInfo } from './lib/astro';
import { fetchCurrent, precipIntensity, skyKind, WEATHER_LABELS } from './lib/weather';
import { searchPlaces } from './lib/search';
import { captureFrame, download } from './lib/capture';
import { AppKeys, loadKeys, loadScene, saveScene, Scene } from './lib/keyStore';
import { Panels, Readout, Settings } from './ui/Panels';
import { Viewfinder } from './ui/Viewfinder';
import { SettingsModal } from './ui/SettingsModal';
import { Timeline } from './ui/Timeline';

const keysRef0 = loadKeys();
const scene0 = loadScene();

// Default scene: 重庆洪崖洞 — stilted houses over the Jialing River, China's
// most photographed blue-hour facade. Coordinates from OpenStreetMap (ODbL).
const HONGYADONG = { lat: 29.562, lon: 106.5798, name: '重庆 · 洪崖洞' };
// Qiansimen bridge, north bank: the classic Hongyadong blue-hour camera spot.
const HYD_VIEW = { lon: 106.5789, lat: 29.5643, alt: 230, heading: 148, pitch: -7 };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toInputValue(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Start at TODAY's blue hour (midpoint sunset -> civil dusk) at Hongyadong. */
function initialDateStr(): string {
  try {
    const now2 = new Date();
    const sky = skyInfo(now2, HONGYADONG.lat, HONGYADONG.lon);
    const set = sky.sunset?.getTime();
    const twi = sky.twilightEvening?.getTime();
    if (set && twi && twi > set) return toInputValue(new Date((set + twi) / 2));
  } catch {
    /* fall through */
  }
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T10:15`;
}

const initial: Settings = {
  dateStr: initialDateStr(),
  playing: false,
  speed: 300,
  basemap: keysRef0.tdtKey ? 'tdt-img' : 'osm',
  sensorId: 'ff',
  focal: 35,
  aperture: 2.8,
  iso: 800,
  fps: 24,
  shutterAngle: 180,
  ndStops: 0,
  aspect: 1.85,
  grid: true,
  safe: false,
  vf: true,
  lighting: true,
  shadows: true,
  sunPath: false,
  stars: true,
  weatherMode: 'live',
  cloud: 40,
  precip: 'none',
  precipI: 0.5,
  fog: 0,
  bortle: scene0.bortle,
};

const initialReadout: Readout = {
  lat: HONGYADONG.lat, lon: HONGYADONG.lon, heading: 0, roll: 0,
  sunAlt: 0, sunAz: 0, moonAlt: 0, moonAz: 0, moonIllum: 0, waxing: true,
  lux: 0, ev100: 0, ndNeed: 0, delta: 0, hFov: 0, vFov: 0,
  golden: 'day', sunrise: '', sunset: '', twiE: '', weatherText: '',
  sqm: 21, nelm: 6, mwText: '',
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const fxRef = useRef<Effects | null>(null);
  const starRef = useRef<StarField | null>(null);
  const pathRef = useRef<SunPath | null>(null);
  const sRef = useRef<Settings>(initial);
  const keysRef = useRef<AppKeys>(keysRef0);
  const observerRef = useRef({ lat: HONGYADONG.lat, lon: HONGYADONG.lon });
  const skyRef = useRef<ReturnType<typeof skyInfo> | null>(null);
  const readoutRef = useRef<Readout>(initialReadout);

  const [s, setS] = useState<Settings>(initial);
  const [r, setR] = useState<Readout>(initialReadout);
  const [results, setResults] = useState<{ name: string; lat: number; lon: number; source: string }[]>([]);
  const [ready, setReady] = useState(false);
  const [keys, setKeys] = useState<AppKeys>(keysRef0);
  const [showSettings, setShowSettings] = useState(false);

  const set = (patch: Partial<Settings>) => {
    sRef.current = { ...sRef.current, ...patch };
    setS(sRef.current);
  };

  useEffect(() => {
    let disposed = false;
    let tickId = 0;
    if (viewerRef.current) return; // StrictMode double-mount guard: keep the first viewer
    let expSmooth: number | null = null;
    (async () => {
      const v = await createViewer(hostRef.current!, {
        ionToken: keysRef.current.ionToken,
        tdtKey: keysRef.current.tdtKey,
        basemap: sRef.current.basemap,
      });
      if (disposed) return;
      viewerRef.current = v;
      fxRef.current = new Effects(v);
      starRef.current = new StarField(v.scene);
      pathRef.current = new SunPath(v);
      v.clock.currentTime = Cesium.JulianDate.fromDate(new Date(sRef.current.dateStr + 'Z'));
      v.clock.shouldAnimate = false;
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(HYD_VIEW.lon, HYD_VIEW.lat, HYD_VIEW.alt),
        orientation: {
          heading: Cesium.Math.toRadians(HYD_VIEW.heading),
          pitch: Cesium.Math.toRadians(HYD_VIEW.pitch),
          roll: 0,
        },
        duration: 0,
      });
      setReady(true);
      loadPackedBuildings(v, '/data/hongyadong.json')
        .then((b) => console.log(`[hongyadong] ${b.count} 栋 3D 建筑（OSM ODbL 预置数据）`))
        .catch(async () => {
          try {
            const b = await loadOsmBuildings(v, HONGYADONG.lat, HONGYADONG.lon);
            console.log(`[hongyadong] ${b.count} 栋（Overpass 实时）`);
          } catch (e) {
            console.warn('[hongyadong] 建筑加载失败', e);
          }
        });

      const tick = () => {
        const st = sRef.current;
        const jd = v.clock.currentTime;
        const date = Cesium.JulianDate.toDate(jd);
        const g = cameraGround(v);
        if (g) observerRef.current = { lat: g.latitude / (Math.PI / 180), lon: g.longitude / (Math.PI / 180) };
        const { lat, lon } = observerRef.current;
        const sky = skyInfo(date, lat, lon);
        skyRef.current = sky;
        const shutter = shutterSecondsForFps(st.fps, st.shutterAngle);
        const lux = illuminance({
          sunAltDeg: sky.sunAlt,
          cloudPct: st.cloud,
          moonAltDeg: sky.moonAlt,
          moonPhase: sky.moonIllum,
          bortle: st.bortle,
        });
        const delta = exposureDeltaStops(lux, shutter, st.iso, st.aperture, st.ndStops);
        // Smoothed, bounded exposure: time-lapse playback moves the sun in jumps,
        // a raw per-tick exposure recomputation pumps brightness = visible flicker.
        const clamped = Math.max(-4.5, Math.min(2.5, delta));
        const expTarget = Math.pow(2, clamped) * 0.32;
        expSmooth = expSmooth === null ? expTarget : expSmooth + (expTarget - expSmooth) * 0.12;
        fxRef.current?.setExposure(expSmooth);
        const night = Math.min(1, Math.max(0, (-sky.sunAlt - 3) / 5)); // continuous, no pop at -6 deg
        (v.scene as unknown as { moonIntensity: number }).moonIntensity =
          0.05 + 2.4 * sky.moonIllum * Math.max(0, Math.sin((sky.moonAlt * Math.PI) / 180)) * night;
        starRef.current?.update(jd, sky.sunAlt);
        if (st.sunPath) pathRef.current?.setMarker(jd, lat, lon);
        const sensor = sensorById(st.sensorId);
        const q = skyQuality({
          bortle: st.bortle,
          moonIllum: sky.moonIllum,
          moonAltDeg: sky.moonAlt,
          cloudPct: st.cloud,
          sunAltDeg: sky.sunAlt,
        });
        readoutRef.current = {
          lat, lon,
          heading: (360 - Cesium.Math.toDegrees(v.camera.heading)) % 360,
          roll: Cesium.Math.toDegrees(v.camera.roll),
          sunAlt: sky.sunAlt, sunAz: sky.sunAz,
          moonAlt: sky.moonAlt, moonAz: sky.moonAz,
          moonIllum: sky.moonIllum, waxing: sky.waxing,
          lux,
          ev100: Math.log2(lux / 2.5),
          ndNeed: ndStopsNeeded(lux, shutter, st.iso, st.aperture),
          delta,
          hFov: horizontalFovDeg(st.focal, sensor),
          vFov: verticalFovDeg(st.focal, sensor),
          golden: goldenHourQuality(sky.sunAlt),
          sunrise: sky.sunrise ? sky.sunrise.toISOString() : '',
          sunset: sky.sunset ? sky.sunset.toISOString() : '',
          twiE: sky.twilightEvening ? sky.twilightEvening.toISOString() : '',
          weatherText: readoutRef.current.weatherText,
          sqm: q.sqm,
          nelm: q.nelm,
          mwText: q.text,
        };
        setR(readoutRef.current);
        if (st.playing) set({ dateStr: toInputValue(date) });
      };
      tickId = window.setInterval(tick, 400);
      tick();
    })();
    return () => {
      disposed = true;
      if (tickId) window.clearInterval(tickId);
    };
  }, []);

  // clock
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.clock.shouldAnimate = s.playing;
    v.clock.multiplier = s.speed;
    if (!s.playing) v.clock.currentTime = Cesium.JulianDate.fromDate(new Date(s.dateStr + 'Z'));
  }, [s.playing, s.speed, s.dateStr, ready]);

  // lens
  useEffect(() => {
    const v = viewerRef.current;
    if (v) setVerticalFov(v, verticalFovDeg(s.focal, sensorById(s.sensorId)));
  }, [s.focal, s.sensorId, ready]);

  // environment toggles
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.scene.globe.enableLighting = s.lighting;
    v.shadows = s.shadows;
    starRef.current && (starRef.current.enabled = s.stars);
    if (s.sunPath) {
      const d = new Date(s.dateStr + 'Z');
      pathRef.current?.show(d, observerRef.current.lat, observerRef.current.lon);
    } else pathRef.current?.hide();
  }, [s.lighting, s.shadows, s.stars, s.sunPath, s.dateStr, ready]);

  // basemap
  const basemapRef = useRef(s.basemap);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || basemapRef.current === s.basemap) return;
    basemapRef.current = s.basemap;
    swapBasemap(v, s.basemap, keysRef.current.ionToken, keysRef.current.tdtKey).catch((e) => console.warn(e));
  }, [s.basemap, ready]);

  // weather apply
  useEffect(() => {
    fxRef.current?.setCloud(s.cloud);
    fxRef.current?.setPrecip(s.precip, s.precip === 'none' ? 0 : s.precipI);
    fxRef.current?.setFog(s.fog);
  }, [s.cloud, s.precip, s.precipI, s.fog, ready]);

  // live weather refresh when observer moves (debounced)
  useEffect(() => {
    if (s.weatherMode !== 'live') return;
    let cancel = false;
    const t = window.setTimeout(async () => {
      try {
        const w = await fetchCurrent(r.lat, r.lon);
        if (cancel) return;
        const cur = sRef.current;
        const kind = skyKind(w.code);
        const prec = kind === 'rain' || kind === 'storm' ? 'rain' : kind === 'snow' ? 'snow' : 'none';
        const fogV = kind === 'fog' ? 0.8 : 0;
        const sp: Partial<Settings> = {};
        if (Math.abs(w.cloudPct - cur.cloud) > 6) sp.cloud = w.cloudPct;
        if (prec !== cur.precip) sp.precip = prec;
        if (Math.abs(precipIntensity(w) - cur.precipI) > 0.15) sp.precipI = precipIntensity(w);
        if (fogV !== cur.fog) sp.fog = fogV;
        set(sp);
        const patch: Readout = {
          ...readoutRef.current,
          weatherText: `${WEATHER_LABELS[w.code] ?? w.code} ${w.tempC.toFixed(0)}°C 云${w.cloudPct}% · ${w.provider}`,
        };
        readoutRef.current = patch;
        setR(patch);
      } catch {
        /* offline */
      }
    }, 700);
    return () => {
      cancel = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.weatherMode, Math.round(r.lat * 100), Math.round(r.lon * 100)]);

  // timeline data (24h curve for the current UTC day)
  const dayKey = s.dateStr.slice(0, 10);
  const lat2 = Math.round(r.lat * 50) / 50;
  const lon2 = Math.round(r.lon * 50) / 50;
  const day = useMemo(() => {
    const ms = Date.parse(dayKey + 'T00:00:00Z');
    return daySky(ms, lat2, lon2, s.cloud, s.bortle);
  }, [dayKey, lat2, lon2, s.cloud, s.bortle]);

  const eclipses = useMemo(
    () => nextEclipses(new Date(s.dateStr + 'Z'), lat2, lon2, 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey.slice(0, 7), lat2, lon2],
  );
  const eclipseMarks = eclipses
    .filter((e) => e.peak.getTime() >= day.dayStartMs && e.peak.getTime() <= day.dayStartMs + 864e5)
    .map((e) => ({ t: e.peak.getTime(), label: e.type === 'solar' ? '日食' : '月食' }));

  const onSearch = async (q: string) => {
    const res = await searchPlaces(q, keysRef.current);
    setResults(res);
  };

  const onKeysSaved = (k: AppKeys) => {
    keysRef.current = k;
    setKeys(k);
    const v = viewerRef.current;
    if (!v) return;
    if (k.ionToken) Cesium.Ion.defaultAccessToken = k.ionToken;
    try {
      v.scene.setTerrain(
        k.ionToken
          ? new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true }))
          : new Cesium.Terrain(Promise.resolve(new Cesium.EllipsoidTerrainProvider())),
      );
    } catch (e) {
      console.warn('terrain switch failed', e);
    }
    basemapRef.current = sRef.current.basemap;
    swapBasemap(v, sRef.current.basemap, k.ionToken, k.tdtKey).catch((e) => console.warn(e));
  };

  const onSceneSaved = (sc: Scene) => {
    saveScene(sc);
    set({ bortle: sc.bortle });
  };

  const onPick = (p: { lat: number; lon: number }) => {
    observerRef.current = { lat: p.lat, lon: p.lon };
    if (viewerRef.current) flyTo(viewerRef.current, p.lat, p.lon, 1200);
  };

  const onJump = (d: Date) => set({ dateStr: toInputValue(d), playing: false });
  const onScrub = (ms: number) => set({ dateStr: toInputValue(new Date(ms)), playing: false });

  const onShot = () => {
    const v = viewerRef.current;
    if (!v) return;
    const url = captureFrame(v, {
      aspect: s.aspect,
      grid: s.grid,
      lines: [
        `${s.dateStr}Z`,
        `${s.focal}mm  f/${s.aperture}  ISO${s.iso}  ND${s.ndStops}`,
        `太阳 ${r.sunAlt.toFixed(0)}°/${r.sunAz.toFixed(0)}°  ${r.golden}`,
        `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`,
        `B${s.bortle} SQM ${r.sqm.toFixed(1)} ${r.mwText}`,
      ],
    });
    if (url) download(url, `lsps-${s.dateStr.replace(':', '')}.png`);
  };

  return (
    <div className="app">
      <aside className="side">
        <h1>
          LSPS <span>3D 取景器</span>
          <button
            className="gear"
            title={`密钥设置 — ion:${keys.ionToken ? '✓' : '未配置'} 天地图:${keys.tdtKey ? '✓' : '未配置'} 高德:${keys.amapKey ? '✓' : '未配置'}`}
            onClick={() => setShowSettings(true)}
          >
            ⚙ 设置
          </button>
        </h1>
        <Panels
          s={s}
          r={r}
          set={set}
          onSearch={onSearch}
          results={results}
          onPick={onPick}
          onJump={onJump}
          onShot={onShot}
          sky={{
            sunrise: skyRef.current?.sunrise ?? null,
            sunset: skyRef.current?.sunset ?? null,
            twilightEvening: skyRef.current?.twilightEvening ?? null,
          }}
          hasKeys={{ ion: !!keys.ionToken, tdt: !!keys.tdtKey }}
        />
        <div className="astro">
          <div className="sec-t">天象与夜空</div>
          <table>
            <tbody>
              <tr><td>日出 / 日落</td><td>{r.sunrise ? new Date(r.sunrise).toUTCString().slice(17, 22) : '--'} / {r.sunset ? new Date(r.sunset).toUTCString().slice(17, 22) : '--'} UTC</td></tr>
              <tr><td>民用晨昏(晚)</td><td>{r.twiE ? new Date(r.twiE).toUTCString().slice(17, 22) : '--'} UTC</td></tr>
              <tr><td>月亮</td><td>高度 {r.moonAlt.toFixed(0)}° · 照明 {(r.moonIllum * 100).toFixed(0)}% {r.waxing ? '盈' : '亏'}</td></tr>
              <tr><td>夜空质量</td><td>B{s.bortle} · SQM {r.sqm.toFixed(1)} · 极限星等 {r.nelm.toFixed(1)}</td></tr>
              <tr><td>银河</td><td>{r.mwText}</td></tr>
              <tr><td>地面照度(估)</td><td>{r.lux >= 1000 ? `${(r.lux / 1000).toFixed(0)}k` : r.lux.toFixed(2)} lx</td></tr>
              <tr><td>曝光建议</td><td>{r.delta > 1 ? `过曝 ${r.delta.toFixed(1)}st：收光圈/加 ND` : r.delta < -1 ? `欠曝 ${(-r.delta).toFixed(1)}st：开光圈/提 ISO/慢快门` : '平衡'}</td></tr>
              {eclipses.map((e, i) => (
                <tr key={i}>
                  <td>{e.type === 'solar' ? '☀ 日食' : '🌕 月食'}</td>
                  <td>
                    {e.peak.toISOString().slice(0, 10)} {e.kind} · {e.localText}{' '}
                    <button className="chip" onClick={() => onJump(e.peak)}>跳</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="foot">
          依赖：CesiumJS (Apache-2.0) · astronomy-engine (MIT) · three.js 仅算法参考 (MIT)。
          天气 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0) / 7Timer! (公有领域)。
          星表 Yale BSC（公有领域）· Bortle 表：公开天文共识数据。
          地图数据 © 其提供方，详见 licenses/ATTRIBUTIONS.md。架构设计参考 PlanIt! Aurora（clean-room，见 docs/DESIGN_NOTES.md）。
        </div>
      </aside>
      <main className="stage">
        <div ref={hostRef} className="cesium" />
        <Viewfinder s={s} r={r} />
        <Timeline sky={day} cursorMs={Date.parse(s.dateStr + 'Z')} eclipseMarks={eclipseMarks} onScrub={onScrub} onJump={onJump} />
        {!ready && <div className="loading">地球加载中…</div>}
      </main>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} onSaved={onKeysSaved} onScene={onSceneSaved} />
    </div>
  );
}
