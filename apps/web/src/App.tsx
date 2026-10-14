import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  exposureDeltaStops,
  exposureFactor,
  illuminance,
  goldenHourQuality,
  ndStopsNeeded,
  shutterSecondsForFps,
  verticalFovDeg,
  horizontalFovDeg,
  sensorById,
} from '@lsps/core';
import { createViewer, flyTo, cameraGround, setVerticalFov, swapBasemap } from './cesium/viewer';
import { Effects } from './cesium/effects';
import { StarField } from './cesium/starfield';
import { SunPath } from './cesium/sunpath';
import { skyInfo } from './lib/astro';
import { fetchCurrent, precipIntensity, skyKind, WEATHER_LABELS } from './lib/weather';
import { searchPlaces } from './lib/search';
import { captureFrame, download } from './lib/capture';
import { Panels, Readout, Settings } from './ui/Panels';
import { Viewfinder } from './ui/Viewfinder';

const env = import.meta.env;
const ION = env.VITE_CESIUM_ION_TOKEN ?? '';
const TDT = env.VITE_TDT_KEY ?? '';
const NOMINATIM = env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toInputValue(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const now = new Date();
const initial: Settings = {
  dateStr: toInputValue(new Date(Math.floor(now.getTime() / 60000) * 60000)),
  playing: false,
  speed: 300,
  basemap: TDT ? 'tdt-img' : 'osm',
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
  weatherMode: 'off',
  cloud: 20,
  precip: 'none',
  precipI: 0.5,
  fog: 0,
};

const initialReadout: Readout = {
  lat: 39.9, lon: 116.4, heading: 0, roll: 0,
  sunAlt: 0, sunAz: 0, moonAlt: 0, moonAz: 0, moonIllum: 0, waxing: true,
  lux: 0, ev100: 0, ndNeed: 0, delta: 0, hFov: 0, vFov: 0,
  golden: 'day', sunrise: '', sunset: '', twiE: '', weatherText: '',
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const fxRef = useRef<Effects | null>(null);
  const starRef = useRef<StarField | null>(null);
  const pathRef = useRef<SunPath | null>(null);
  const sRef = useRef<Settings>(initial);
  const observerRef = useRef({ lat: 39.9, lon: 116.4 });
  const skyRef = useRef<ReturnType<typeof skyInfo> | null>(null);
  const readoutRef = useRef<Readout>(initialReadout);

  const [s, setS] = useState<Settings>(initial);
  const [r, setR] = useState<Readout>(initialReadout);
  const [results, setResults] = useState<{ name: string; lat: number; lon: number; source: string }[]>([]);
  const [ready, setReady] = useState(false);

  const set = (patch: Partial<Settings>) => {
    sRef.current = { ...sRef.current, ...patch };
    setS(sRef.current);
  };

  useEffect(() => {
    let disposed = false;
    let tickId = 0;
    if (viewerRef.current) return; // StrictMode double-mount guard: keep the first viewer
    (async () => {
      const v = await createViewer(hostRef.current!, {
        ionToken: ION,
        tdtKey: TDT,
        basemap: sRef.current.basemap,
      });
      if (disposed) return;
      viewerRef.current = v;
      fxRef.current = new Effects(v);
      starRef.current = new StarField(v.scene);
      pathRef.current = new SunPath(v);
      v.clock.currentTime = Cesium.JulianDate.fromDate(new Date(sRef.current.dateStr + 'Z'));
      v.clock.shouldAnimate = false;
      flyTo(v, 39.9, 116.4, 1500);
      setReady(true);

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
        });
        const delta = exposureDeltaStops(lux, shutter, st.iso, st.aperture, st.ndStops);
        fxRef.current?.setExposure(exposureFactor(delta, 0) * 0.32);
        const night = sky.sunAlt < -6 ? 1 : 0;
        (v.scene as unknown as { moonIntensity: number }).moonIntensity =
          0.05 + 2.4 * sky.moonIllum * Math.max(0, Math.sin((sky.moonAlt * Math.PI) / 180)) * night;
        starRef.current?.update(jd, sky.sunAlt);
        if (st.sunPath) pathRef.current?.setMarker(jd, lat, lon);
        const sensor = sensorById(st.sensorId);
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
        };
        setR(readoutRef.current);
        // keep dateStr in sync while playing
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
    swapBasemap(v, s.basemap, ION, TDT).catch((e) => console.warn(e));
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
        set({
          cloud: w.cloudPct,
          fog: skyKind(w.code) === 'fog' ? 0.8 : 0,
          precip:
            skyKind(w.code) === 'rain' || skyKind(w.code) === 'storm'
              ? 'rain'
              : skyKind(w.code) === 'snow'
                ? 'snow'
                : 'none',
          precipI: precipIntensity(w),
        });
        const patch: Readout = {
          ...readoutRef.current,
          weatherText: `${WEATHER_LABELS[w.code] ?? w.code} ${w.tempC.toFixed(0)}°C 云${w.cloudPct}% · Open-Meteo`,
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

  const onSearch = async (q: string) => {
    const res = await searchPlaces(q, NOMINATIM, TDT);
    setResults(res);
  };

  const onPick = (p: { lat: number; lon: number }) => {
    observerRef.current = { lat: p.lat, lon: p.lon };
    if (viewerRef.current) flyTo(viewerRef.current, p.lat, p.lon, 1200);
  };

  const onJump = (d: Date) => set({ dateStr: toInputValue(d), playing: false });

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
      ],
    });
    if (url) download(url, `lsps-${s.dateStr.replace(':', '')}.png`);
  };

  return (
    <div className="app">
      <aside className="side">
        <h1>LSPS <span>3D 取景器</span></h1>
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
          hasKeys={{ ion: !!ION, tdt: !!TDT }}
        />
        <div className="astro">
          <div className="sec-t">天文数据</div>
          <table>
            <tbody>
              <tr><td>日出 / 日落</td><td>{r.sunrise ? new Date(r.sunrise).toUTCString().slice(17, 22) : '--'} / {r.sunset ? new Date(r.sunset).toUTCString().slice(17, 22) : '--'} UTC</td></tr>
              <tr><td>民用晨昏蒙影(晚)</td><td>{r.twiE ? new Date(r.twiE).toUTCString().slice(17, 22) : '--'} UTC</td></tr>
              <tr><td>月亮</td><td>高度 {r.moonAlt.toFixed(0)}° · 照明 {(r.moonIllum * 100).toFixed(0)}% {r.waxing ? '盈' : '亏'}</td></tr>
              <tr><td>地面照度(估)</td><td>{r.lux >= 1000 ? `${(r.lux / 1000).toFixed(0)}k` : r.lux.toFixed(2)} lx</td></tr>
              <tr><td>曝光建议</td><td>{r.delta > 1 ? `过曝 ${r.delta.toFixed(1)}st：收光圈/加 ND` : r.delta < -1 ? `欠曝 ${(-r.delta).toFixed(1)}st：开光圈/提 ISO/慢快门` : '平衡'}</td></tr>
              <tr><td>所需 ND</td><td>{r.ndNeed.toFixed(1)} stops @f/{s.aperture}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="foot">
          依赖：CesiumJS (Apache-2.0) · astronomy-engine (MIT) · three.js 仅算法参考 (MIT)。
          天气数据 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0，仅调用公开 API)。
          星表 Yale BSC（公有领域）。地图数据 © 其提供方，详见 licenses/ATTRIBUTIONS.md。
        </div>
      </aside>
      <main className="stage">
        <div ref={hostRef} className="cesium" />
        <Viewfinder s={s} r={r} />
        {!ready && <div className="loading">地球加载中…</div>}
      </main>
    </div>
  );
}
