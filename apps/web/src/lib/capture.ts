import * as Cesium from 'cesium';

export interface FrameInfo {
  lines: string[];
  aspect: number;
  grid: boolean;
}

/** Screenshot: Cesium WebGL canvas + baked viewfinder frame (bars/grid/telemetry). */
export function captureFrame(viewer: Cesium.Viewer, info: FrameInfo): string {
  viewer.render();
  const src = viewer.canvas;
  const w = src.width;
  const h = src.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(src, 0, 0);

  const boxH = Math.min(h, w / info.aspect);
  const boxW = w;
  const y0 = (h - boxH) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.95)';
  ctx.fillRect(0, 0, w, y0);
  ctx.fillRect(0, y0 + boxH, w, h - y0 - boxH);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, w / 1600);
  if (info.grid) {
    for (let i = 1; i <= 2; i++) {
      const x = boxW * (i / 3);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + boxH);
      ctx.stroke();
      const y = y0 + boxH * (i / 3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(boxW, y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  const cx = boxW / 2;
  const cy = y0 + boxH / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx, cy + 12);
  ctx.stroke();

  const fs = Math.max(14, w / 80);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const pad = fs * 0.8;
  info.lines.forEach((ln, i) => {
    const side = i % 2 === 0;
    ctx.fillText(ln, side ? pad : boxW - pad - ctx.measureText(ln).width, y0 + fs * 1.4 + i * fs * 1.5);
  });
  return out.toDataURL('image/png');
}

export function download(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function currentAspect(ratio: number): number {
  return ratio;
}
