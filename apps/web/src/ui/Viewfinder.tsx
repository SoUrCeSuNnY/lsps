import { compass, fmtDeg } from '../lib/astro';
import { Readout, Settings } from './Panels';

interface Props {
  s: Settings;
  r: Readout;
}

const GOLDEN_LABEL: Record<string, string> = {
  night: '夜',
  blue: '蓝调时刻',
  golden: '黄金时刻',
  day: '白天',
};

export function Viewfinder({ s, r }: Props) {
  if (!s.vf) return null;
  return (
    <div className="vf-root">
      <div className="vf-box" style={{ aspectRatio: String(s.aspect) }}>
        {s.grid && (
          <div
            className="vf-grid"
            style={{
              backgroundImage:
                'linear-gradient(to right, transparent 33.2%, rgba(255,255,255,.4) 33.2% 33.5%, transparent 33.5% 66.5%, rgba(255,255,255,.4) 66.5% 66.8%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,.4) 33.2% 33.5%, transparent 33.5% 66.5%, rgba(255,255,255,.4) 66.5% 66.8%, transparent 66.8%)',
            }}
          />
        )}
        {s.safe && <div className="vf-safe" />}
        <div className="vf-cross" />
        <div className="vf-tl">
          <div>{GOLDEN_LABEL[r.golden] ?? r.golden} · 太阳 {fmtDeg(r.sunAlt, 0)} / {compass(r.sunAz)}</div>
          <div>月亮 {fmtDeg(r.moonAlt, 0)} 照明 {(r.moonIllum * 100).toFixed(0)}%</div>
        </div>
        <div className="vf-tr">
          <div>
            {s.focal}mm · f/{s.aperture} · ISO {s.iso} · 1/{Math.round((360 * s.fps) / s.shutterAngle)}s
          </div>
          <div>
            ND {s.ndStops}st {r.ndNeed > 0.2 && s.ndStops === 0 ? `· 需 ND ${r.ndNeed.toFixed(1)}st` : ''}
          </div>
        </div>
        <div className="vf-bl">
          <div>方位 {r.heading.toFixed(0)}° {compass(r.heading)}</div>
          <div>横滚 {fmtDeg(r.roll, 1)}</div>
        </div>
        <div className="vf-br">
          <div>{r.weatherText}</div>
          <div>EV₁₀₀ {r.ev100.toFixed(1)} · Δ{r.delta >= 0 ? '+' : ''}{r.delta.toFixed(1)}st</div>
        </div>
        <div className={`vf-level ${Math.abs(r.roll) < 0.6 ? 'ok' : ''}`}>
          <span style={{ transform: `rotate(${r.roll}deg)` }} />
        </div>
      </div>
    </div>
  );
}
