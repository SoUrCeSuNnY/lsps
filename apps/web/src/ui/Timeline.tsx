import { useRef, useState } from 'react';
import { DaySky } from '../lib/astro';

interface Props {
  sky: DaySky;
  cursorMs: number;
  eclipseMarks: { t: number; label: string }[];
  onScrub: (ms: number) => void;
  onJump: (d: Date) => void;
}

function luxColor(lux: number): string {
  const l = Math.log10(Math.max(lux, 1e-4));
  const t = Math.min(1, Math.max(0, (l + 4) / 8.4));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(4, 205)},${mix(6, 214)},${mix(13, 228)})`;
}

export function Timeline(p: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const day = p.sky.dayStartMs;

  if (collapsed)
    return (
      <div className="timeline collapsed">
        <button onClick={() => setCollapsed(false)}>展开时间轴 ▴</button>
      </div>
    );

  const pct = (t: number) => ((t - day) / 864e5) * 100;

  const scrub = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    p.onScrub(day + f * 864e5);
  };

  // golden/blue bands from sunAlt
  const bands: { left: number; width: number; cls: string }[] = [];
  const sun = p.sky.sunAlts;
  for (let i = 0; i < 96; i++) {
    const cls = sun[i] > 0 && sun[i] < 12 ? 'golden' : sun[i] > -6 && sun[i] <= 0 ? 'blue' : '';
    if (!cls) continue;
    const left = (i / 96) * 100;
    const last = bands[bands.length - 1];
    if (last && last.cls === cls && Math.abs(last.left + last.width - left) < 0.01) last.width += 100 / 96;
    else bands.push({ left, width: 100 / 96, cls });
  }

  const grad = `linear-gradient(to right, ${p.sky.luxs
    .map((v, i) => `${luxColor(v)} ${((i / 95) * 100).toFixed(1)}%`)
    .join(', ')})`;

  const cursorPct = Math.min(100, Math.max(0, pct(p.cursorMs)));
  const cursorDate = new Date(p.cursorMs);
  const hh = String(cursorDate.getUTCHours()).padStart(2, '0');
  const mm = String(cursorDate.getUTCMinutes()).padStart(2, '0');

  return (
    <div className="timeline">
      <div className="tl-events">
        {p.sky.events.map((e, i) => (
          <button key={i} className="tl-marker" style={{ left: `${pct(e.t)}%` }} onClick={() => p.onJump(new Date(e.t))}>
            {e.label}
          </button>
        ))}
        {p.eclipseMarks.map((e, i) => (
          <button key={`ec${i}`} className="tl-marker eclipse" style={{ left: `${pct(e.t)}%` }} onClick={() => p.onJump(new Date(e.t))}>
            🌘{e.label}
          </button>
        ))}
      </div>
      <div
        className="tl-bar"
        ref={barRef}
        style={{ background: grad }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          scrub(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && scrub(e.clientX)}
      >
        {bands.map((b, i) => (
          <div key={i} className={`tl-band ${b.cls}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} />
        ))}
        <div className="tl-cursor" style={{ left: `${cursorPct}%` }}>
          <span>{hh}:{mm}Z</span>
        </div>
      </div>
      <div className="tl-scale">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h % 24).padStart(2, '0')}Z
          </span>
        ))}
        <button className="tl-toggle" onClick={() => setCollapsed(true)}>
          ▾
        </button>
      </div>
    </div>
  );
}
