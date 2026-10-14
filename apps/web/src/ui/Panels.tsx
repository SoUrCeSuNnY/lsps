import type { ReactNode } from 'react';
import { BORTLE_TABLE, ND_FILTERS, SENSORS } from '@lsps/core';
import { MAP_SOURCES } from '../cesium/providers';
import { Basemap } from '../cesium/providers';
import { Precip } from '../cesium/effects';
import { ASPECTS, APERTURE_STOPS, FOCAL_PRESETS, sensorById } from '@lsps/core';

export interface Settings {
  dateStr: string; // naive string, treated as UTC
  playing: boolean;
  speed: number;
  basemap: Basemap;
  sensorId: string;
  focal: number;
  aperture: number;
  iso: number;
  fps: number;
  shutterAngle: number;
  ndStops: number;
  aspect: number;
  grid: boolean;
  safe: boolean;
  vf: boolean;
  lighting: boolean;
  shadows: boolean;
  sunPath: boolean;
  stars: boolean;
  weatherMode: 'off' | 'live';
  cloud: number;
  precip: Precip;
  precipI: number;
  fog: number;
  bortle: number;
}

export interface Readout {
  lat: number;
  lon: number;
  heading: number;
  roll: number;
  sunAlt: number;
  sunAz: number;
  moonAlt: number;
  moonAz: number;
  moonIllum: number;
  waxing: boolean;
  lux: number;
  ev100: number;
  ndNeed: number;
  delta: number;
  hFov: number;
  vFov: number;
  golden: string;
  sunrise: string;
  sunset: string;
  twiE: string;
  weatherText: string;
  sqm: number;
  nelm: number;
  mwText: string;
}

interface Props {
  s: Settings;
  r: Readout;
  set: (patch: Partial<Settings>) => void;
  onSearch: (q: string) => void;
  results: { name: string; lat: number; lon: number; source: string }[];
  onPick: (p: { lat: number; lon: number }) => void;
  onJump: (d: Date) => void;
  onShot: () => void;
  sky: { sunrise: Date | null; sunset: Date | null; twilightEvening: Date | null };
  hasKeys: { ion: boolean; tdt: boolean };
}

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sec">
      <div className="sec-t">{title}</div>
      {children}
    </div>
  );
}

const rowStyle = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const };

export function Panels(p: Props) {
  const { s, set } = p;
  const isoList = [100, 200, 400, 800, 1600, 3200, 6400];
  return (
    <div className="panels">
      <Sec title="选址">
        <div style={rowStyle}>
          <input
            className="grow"
            placeholder="搜索地点（Enter）"
            onKeyDown={(e) => e.key === 'Enter' && p.onSearch((e.target as HTMLInputElement).value)}
          />
        </div>
        {p.results.map((r, i) => (
          <button key={i} className="res" onClick={() => p.onPick(r)} title={`${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`}>
            [{r.source}] {r.name.length > 40 ? r.name.slice(0, 40) + '…' : r.name}
          </button>
        ))}
        <div className="hint">
          坐标：{p.r.lat.toFixed(4)}, {p.r.lon.toFixed(4)}（跟随相机注视点）
        </div>
        <div style={rowStyle}>
          <label className="lb">底图</label>
          <select value={s.basemap} onChange={(e) => set({ basemap: e.target.value })}>
            {MAP_SOURCES.map((b) => (
              <option key={b.id} value={b.id} disabled={b.requires === 'ion' && !p.hasKeys.ion}>
                {b.label}
                {b.requires === 'ion' && !p.hasKeys.ion ? '（缺 ion token）' : b.requires === 'tdt' && !p.hasKeys.tdt ? '（缺天地图 key）' : ''}
              </option>
            ))}
          </select>
        </div>
      </Sec>

      <Sec title="时间（UTC）">
        <input type="datetime-local" step={60} value={s.dateStr} onChange={(e) => set({ dateStr: e.target.value })} style={{ width: '100%' }} />
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <button className={s.playing ? 'on' : ''} onClick={() => set({ playing: !s.playing })}>
            {s.playing ? '⏸ 暂停' : '▶ 播放'}
          </button>
          <select value={s.speed} onChange={(e) => set({ speed: +e.target.value })}>
            {[1, 60, 300, 1800, 7200, 43200].map((v) => (
              <option key={v} value={v}>
                ×{v}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <button onClick={() => p.sky.sunrise && p.onJump(new Date(new Date(s.dateStr + 'Z').setUTCDate(new Date(s.dateStr + 'Z').getUTCDate() + 1)))}>
            次日
          </button>
          <button onClick={() => p.sky.sunrise && p.onJump(p.sky.sunrise)}>日出</button>
          <button onClick={() => p.sky.sunset && p.onJump(p.sky.sunset)}>日落</button>
          <button onClick={() => p.sky.twilightEvening && p.onJump(p.sky.twilightEvening)}>蓝调时刻</button>
        </div>
      </Sec>

      <Sec title="相机">
        <div style={rowStyle}>
          <label className="lb">传感器</label>
          <select value={s.sensorId} onChange={(e) => set({ sensorId: e.target.value })}>
            {SENSORS.map((sn) => (
              <option key={sn.id} value={sn.id}>
                {sn.name}
              </option>
            ))}
          </select>
        </div>
        <div style={rowStyle}>
          <label className="lb">焦段</label>
          <input
            type="range"
            min={8}
            max={400}
            value={s.focal}
            onChange={(e) => set({ focal: +e.target.value })}
            className="grow"
          />
          <span className="num">{s.focal}mm</span>
        </div>
        <div style={{ ...rowStyle, marginTop: 4 }}>
          {FOCAL_PRESETS.filter((f) => [14, 21, 25, 32, 40, 50, 75, 100, 135, 200].includes(f)).map((f) => (
            <button key={f} className={s.focal === f ? 'on chip' : 'chip'} onClick={() => set({ focal: f })}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <label className="lb">光圈</label>
          <select value={s.aperture} onChange={(e) => set({ aperture: +e.target.value })}>
            {APERTURE_STOPS.map((a) => (
              <option key={a} value={a}>
                f/{a}
              </option>
            ))}
          </select>
          <label className="lb">ISO</label>
          <select value={s.iso} onChange={(e) => set({ iso: +e.target.value })}>
            {isoList.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <label className="lb">帧率</label>
          <select value={s.fps} onChange={(e) => set({ fps: +e.target.value })}>
            {[23.98, 24, 25, 30, 50, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label className="lb">快门角</label>
          <select value={s.shutterAngle} onChange={(e) => set({ shutterAngle: +e.target.value })}>
            {[180, 90, 45].map((a) => (
              <option key={a} value={a}>
                {a}°
              </option>
            ))}
          </select>
          <span className="num">1/{Math.round((360 * s.fps) / s.shutterAngle)}s</span>
        </div>
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <label className="lb">ND</label>
          <select value={s.ndStops} onChange={(e) => set({ ndStops: +e.target.value })}>
            {ND_FILTERS.map((n) => (
              <option key={n.stops} value={n.stops}>
                {n.label}
              </option>
            ))}
          </select>
          <label className="lb">画幅</label>
          <select value={s.aspect} onChange={(e) => set({ aspect: +e.target.value })}>
            {ASPECTS.map((a) => (
              <option key={a.id} value={a.ratio}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <label className="cb"><input type="checkbox" checked={s.vf} onChange={(e) => set({ vf: e.target.checked })} />取景框</label>
          <label className="cb"><input type="checkbox" checked={s.grid} onChange={(e) => set({ grid: e.target.checked })} />三分线</label>
          <label className="cb"><input type="checkbox" checked={s.safe} onChange={(e) => set({ safe: e.target.checked })} />安全框</label>
          <button className="shot" onClick={p.onShot}>📷 截图</button>
        </div>
        <div className="hint">
          HFOV {p.r.hFov.toFixed(1)}° · VFOV {p.r.vFov.toFixed(1)}°（{sensorById(s.sensorId).name}）
        </div>
      </Sec>

      <Sec title="光照与环境">
        <div style={{ ...rowStyle, marginTop: 0 }}>
          <label className="cb"><input type="checkbox" checked={s.lighting} onChange={(e) => set({ lighting: e.target.checked })} />昼夜光照</label>
          <label className="cb"><input type="checkbox" checked={s.shadows} onChange={(e) => set({ shadows: e.target.checked })} />阴影</label>
          <label className="cb"><input type="checkbox" checked={s.sunPath} onChange={(e) => set({ sunPath: e.target.checked })} />太阳路径</label>
          <label className="cb"><input type="checkbox" checked={s.stars} onChange={(e) => set({ stars: e.target.checked })} />星空</label>
        </div>
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <label className="lb">Bortle 暗夜</label>
          <select value={s.bortle} onChange={(e) => set({ bortle: +e.target.value })}>
            {BORTLE_TABLE.map((b) => (
              <option key={b.level} value={b.level}>
                B{b.level} {b.name}
              </option>
            ))}
          </select>
        </div>
      </Sec>

      <Sec title="天气">
        <div style={{ ...rowStyle, marginTop: 0 }}>
          <label className="cb">
            <input type="radio" name="wm" checked={s.weatherMode === 'off'} onChange={() => set({ weatherMode: 'off' })} />手动
          </label>
          <label className="cb">
            <input type="radio" name="wm" checked={s.weatherMode === 'live'} onChange={() => set({ weatherMode: 'live' })} />实时（Open-Meteo）
          </label>
        </div>
        {p.r.weatherText && <div className="hint">现在：{p.r.weatherText}</div>}
        <div style={rowStyle}>
          <label className="lb">云量</label>
          <input type="range" min={0} max={100} value={s.cloud} disabled={s.weatherMode === 'live'} onChange={(e) => set({ cloud: +e.target.value })} className="grow" />
          <span className="num">{s.cloud}%</span>
        </div>
        <div style={rowStyle}>
          <label className="lb">降水</label>
          <select value={s.precip} disabled={s.weatherMode === 'live'} onChange={(e) => set({ precip: e.target.value as Precip })}>
            <option value="none">无</option>
            <option value="rain">雨</option>
            <option value="snow">雪</option>
          </select>
          <input type="range" min={0} max={100} value={s.precipI * 100} disabled={s.weatherMode === 'live' || s.precip === 'none'} onChange={(e) => set({ precipI: +e.target.value / 100 })} className="grow" />
        </div>
        <div style={rowStyle}>
          <label className="lb">雾</label>
          <input type="range" min={0} max={100} value={s.fog * 100} disabled={s.weatherMode === 'live'} onChange={(e) => set({ fog: +e.target.value / 100 })} className="grow" />
          <span className="num">{Math.round(s.fog * 100)}%</span>
        </div>
      </Sec>
    </div>
  );
}
