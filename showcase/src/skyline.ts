/**
 * 2D layer: the cinematic plate.
 *
 * Deterministic — pure geometry driven by the frame index, no wall-clock, no
 * randomness, so a captured frame is reproducible from its index alone and the
 * reel renders identically offline. All landmark paths live in a 1000-unit-wide
 * space with y measured upward from the horizon; `unit` converts world units to
 * pixels.
 */

type Ctx = CanvasRenderingContext2D;

export interface SilhouetteOpts {
  ctx: Ctx;
  /** canvas x of the silhouette's centre */
  cx: number;
  horizonY: number;
  /** pixels per world unit (world space is 1000 units wide) */
  unit: number;
  color: string;
  alpha: number;
  /** strip sky tones, so a night silhouette stays readable against its sky */
  skyTop?: string;
  skyBottom?: string;
  /** night/blue hour: scatter warm window lights (洪崖洞 look) */
  lit?: boolean;
  /** filled by rect() so window lights can be masked to the building mass */
  rects?: [number, number, number, number][];
}

function project(o: SilhouetteOpts, x: number, yUp: number): [number, number] {
  return [o.cx + (x - 500) * o.unit, o.horizonY - yUp * o.unit];
}

export function hexToRgb(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return (
    '#' +
    x
      .map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * A silhouette must stay readable against its own sky, including at night when
 * both are near-black. Anchor it to the sky's darkest tone and push it below
 * that floor so the outline always separates.
 */
export function silhouetteColor(skyTop: string, skyBottom: string): string {
  const t = hexToRgb(skyTop);
  const b = hexToRgb(skyBottom);
  const darkest = t[0] + t[1] + t[2] <= b[0] + b[1] + b[2] ? skyTop : skyBottom;
  return mixHex(darkest, '#000000', 0.82);
}

/** Warm window lights for night / blue-hour shots (洪崖洞 lit-facade look). */
function windowLights(o: SilhouetteOpts): void {
  const { ctx, unit } = o;
  const cell = Math.max(2.2, unit * 15);
  ctx.save();
  for (const [rx, ry, rw, rh] of o.rects ?? []) {
    const x0 = o.cx + (rx - 500) * unit;
    const x1 = o.cx + (rx + rw - 500) * unit;
    const yTop = o.horizonY - (ry + rh) * unit;
    const yBot = o.horizonY - ry * unit;
    const cols = Math.max(1, Math.floor((x1 - x0) / cell));
    const rows = Math.max(1, Math.floor((yBot - yTop) / cell));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const k = (rx + c) * 91 + (ry + r) * 17;
        if (hash(k) < 0.58) continue;
        ctx.fillStyle = hash(k + 3) > 0.62 ? 'rgba(255,208,126,0.9)' : 'rgba(255,168,82,0.72)';
        ctx.fillRect(
          x0 + c * cell + cell * 0.22,
          yTop + r * cell + cell * 0.24,
          Math.max(1, cell * 0.4),
          Math.max(1, cell * 0.34),
        );
      }
    }
  }
  ctx.restore();
}

function poly(o: SilhouetteOpts, pts: [number, number][]): void {
  const { ctx } = o;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const [px, py] = project(o, x, y);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

function rect(o: SilhouetteOpts, x: number, y: number, w: number, h: number): void {
  o.rects?.push([x, y, w, h]);
  poly(o, [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** City backdrop so each landmark sits inside a skyline rather than in a void. */
function cityBackdrop(o: SilhouetteOpts, seed: number): void {
  const { ctx } = o;
  ctx.save();
  ctx.globalAlpha = o.alpha * 0.45;
  ctx.fillStyle = o.color;
  for (let i = 0; i < 26; i++) {
    const w = 26 + hash(i + seed) * 46;
    const x = -20 + i * 38 + hash(i * 3 + seed) * 22;
    const h = 34 + hash(i * 7 + seed) * 118;
    rect(o, x, 0, w, h);
    if (hash(i * 11 + seed) > 0.72) rect(o, x + w * 0.3, h, w * 0.4, 26 + hash(i) * 40);
  }
  ctx.restore();
}

// Built from simple convex pieces: a self-intersecting outline fills as a
// bowtie under the nonzero rule and reads as a smudge at silhouette scale.
const LEGS: [number, number][][] = [
  [[330, 0], [404, 0], [470, 470], [452, 470]],
  [[670, 0], [596, 0], [530, 470], [548, 470]],
];
const MAST: [number, number][] = [[452, 460], [548, 460], [522, 800], [478, 800]];

export const SKYLINES: Record<string, (o: SilhouetteOpts) => void> = {
  eiffel(o) {
    cityBackdrop(o, 2);
    o.ctx.fillStyle = o.color;
    poly(o, LEGS[0]);
    poly(o, LEGS[1]);
    poly(o, MAST);
    rect(o, 496, 800, 8, 92);
    rect(o, 372, 92, 256, 15);
    rect(o, 424, 205, 152, 12);
    rect(o, 458, 330, 84, 10);
    rect(o, 470, 452, 60, 9);
  },
  burj(o) {
    cityBackdrop(o, 5);
    o.ctx.fillStyle = o.color;
    const tiers: [number, number, number, number][] = [
      [400, 0, 200, 150],
      [416, 150, 168, 210],
      [430, 360, 140, 190],
      [442, 550, 116, 170],
      [452, 720, 92, 150],
      [462, 870, 70, 130],
      [472, 1000, 50, 120],
      [482, 1120, 32, 110],
    ];
    for (const [x, y, w, h] of tiers) rect(o, x, y, w, h);
    rect(o, 495, 1230, 6, 210);
    rect(o, 418, 90, 12, 1140);
    rect(o, 570, 150, 12, 1000);
  },
  pyramid(o) {
    o.ctx.fillStyle = o.color;
    poly(o, [[180, 0], [430, 0], [305, 190]]);
    poly(o, [[330, 0], [690, 0], [510, 290]]);
    poly(o, [[620, 0], [830, 0], [726, 150]]);
    rect(o, 120, 0, 780, 8);
  },
  opera(o) {
    cityBackdrop(o, 9);
    o.ctx.fillStyle = o.color;
    rect(o, 220, 0, 560, 22);
    const { ctx } = o;
    // Three shells, tallest at the west end, each a blade leaning to windward.
    for (const [x, w, h] of [
      [340, 150, 320],
      [470, 130, 250],
      [582, 100, 170],
    ] as [number, number, number][]) {
      const [ax, ay] = project(o, x, 18);
      const [tx, ty] = project(o, x + w * 0.62, 18 + h);
      const [bx, by] = project(o, x + w, 18);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(...project(o, x - w * 0.02, 18 + h * 0.62), tx, ty);
      ctx.quadraticCurveTo(...project(o, x + w * 0.72, 18 + h * 0.34), bx, by);
      ctx.closePath();
      ctx.fill();
    }
  },
  hongyadong(o) {
    cityBackdrop(o, 13);
    o.ctx.fillStyle = o.color;
    for (let f = 0; f < 7; f++) {
      const y = 20 + f * 78;
      const w = 330 - f * 26;
      const x = 500 - w / 2 - 40 + f * 12;
      rect(o, x, y, w, 62);
      rect(o, x - 14, y + 52, w + 28, 12);
    }
    rect(o, 300, 560, 14, 200);
    rect(o, 660, 500, 14, 260);
    poly(o, [[240, 750], [760, 690], [760, 706], [240, 766]]);
    for (let i = 0; i < 9; i++) rect(o, 260 + i * 56, 700 - i * 6, 5, 90);
  },
  empire(o) {
    cityBackdrop(o, 21);
    o.ctx.fillStyle = o.color;
    const tiers: [number, number, number, number][] = [
      [400, 0, 200, 330],
      [424, 330, 152, 220],
      [444, 550, 112, 190],
      [460, 740, 80, 150],
      [472, 890, 56, 110],
    ];
    for (const [x, y, w, h] of tiers) rect(o, x, y, w, h);
    rect(o, 494, 1000, 12, 190);
    rect(o, 486, 1190, 28, 26);
    rect(o, 497, 1216, 6, 120);
    for (let i = 0; i < 6; i++) rect(o, 412 + i * 30, 40, 6, 280);
  },
  london(o) {
    cityBackdrop(o, 31);
    o.ctx.fillStyle = o.color;
    rect(o, 150, 0, 96, 300);
    poly(o, [[150, 300], [246, 300], [198, 386]]);
    rect(o, 186, 386, 24, 60);
    rect(o, 300, 0, 560, 26);
    const [ex, ey] = project(o, 700, 190);
    o.ctx.strokeStyle = o.color;
    o.ctx.beginPath();
    o.ctx.arc(ex, ey, 170 * o.unit, 0, Math.PI * 2);
    o.ctx.lineWidth = Math.max(2, 9 * o.unit);
    o.ctx.stroke();
    for (const [ix, iy] of [
      [560, 190],
      [840, 190],
      [700, 50],
      [700, 330],
    ] as [number, number][]) {
      const [px, py] = project(o, ix, iy);
      o.ctx.beginPath();
      o.ctx.moveTo(px, py);
      o.ctx.lineTo(ex, ey);
      o.ctx.lineWidth = Math.max(1, 3 * o.unit);
      o.ctx.stroke();
    }
    poly(o, [[820, 0], [930, 0], [876, 430]]);
  },
};

export function drawSkyline(name: string, o: SilhouetteOpts): void {
  const fn = SKYLINES[name];
  if (!fn) return;
  const rects: [number, number, number, number][] = [];
  const opts: SilhouetteOpts = { ...o, rects };
  const { ctx } = o;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  fn(opts);
  ctx.restore();
  if (o.lit) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, o.alpha + 0.12);
    windowLights(opts);
    ctx.restore();
  }
}

export const SKYLINE_NAMES = Object.keys(SKYLINES);

/**
 * Height of the *subject* in world units — the figure framing scales against.
 * Measured off the geometry each builder draws, not the city backdrop, which is
 * taller than several of the landmarks and would shrink them into dots.
 */
export const SKYLINE_TOP: Record<string, number> = {
  eiffel: 892,
  burj: 1440,
  pyramid: 290,
  opera: 338,
  hongyadong: 790,
  empire: 1336,
  london: 446,
};


/**
 * Anamorphic flare: the horizontal streak and ghost chain a real cine lens puts
 * on a small, bright source. Drawn additively, scaled by how bright the scene
 * actually is, so it strengthens into a sunset and dies under overcast sky.
 */
export function drawFlare(
  ctx: Ctx,
  W: number,
  H: number,
  sx: number,
  sy: number,
  strength: number,
  dpr: number,
): void {
  if (strength <= 0.02) return;
  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // main halo
  const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.055);
  halo.addColorStop(0, `rgba(255,244,220,${0.5 * strength})`);
  halo.addColorStop(0.35, `rgba(255,206,140,${0.2 * strength})`);
  halo.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sx, sy, W * 0.055, 0, 7);
  ctx.fill();

  // anamorphic streak, wider than the frame edge to edge
  const streak = ctx.createLinearGradient(0, sy, W, sy);
  streak.addColorStop(0, 'rgba(120,170,255,0)');
  streak.addColorStop(0.3, `rgba(170,205,255,${0.16 * strength})`);
  streak.addColorStop(0.5, `rgba(255,236,206,${0.4 * strength})`);
  streak.addColorStop(0.7, `rgba(170,205,255,${0.16 * strength})`);
  streak.addColorStop(1, 'rgba(120,170,255,0)');
  ctx.fillStyle = streak;
  const sh = Math.max(1.2, H * 0.0035);
  ctx.fillRect(0, sy - sh, W, sh * 2);

  // streak bloom
  const bloom = ctx.createLinearGradient(0, sy - H * 0.05, 0, sy + H * 0.05);
  bloom.addColorStop(0, 'rgba(255,214,160,0)');
  bloom.addColorStop(0.5, `rgba(255,222,176,${0.12 * strength})`);
  bloom.addColorStop(1, 'rgba(255,214,160,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(sx - W * 0.22, sy - H * 0.05, W * 0.44, H * 0.1);

  // ghost chain on the line through the frame centre
  for (const [t, r, tint] of [
    [-0.55, 0.012, '255,196,128'],
    [-1.25, 0.022, '136,208,255'],
    [-1.9, 0.014, '255,176,150'],
    [1.6, 0.03, '150,230,205'],
    [2.3, 0.018, '255,214,140'],
  ] as [number, number, string][]) {
    const gx = cx + (sx - cx) * t;
    const gy = cy + (sy - cy) * t;
    const rad = W * r;
    const g = ctx.createRadialGradient(gx, gy, rad * 0.15, gx, gy, rad);
    g.addColorStop(0, `rgba(${tint},${0.2 * strength})`);
    g.addColorStop(0.75, `rgba(${tint},${0.09 * strength})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(gx, gy, rad, 0, 7);
    ctx.fill();
    ctx.strokeStyle = `rgba(${tint},${0.13 * strength})`;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.arc(gx, gy, rad * 0.72, 0, 7);
    ctx.stroke();
  }
  ctx.restore();
}

/** Sun/moon glow low in the sky, painted before the skyline silhouettes it. */
export function drawSkyGlow(
  ctx: Ctx,
  W: number,
  H: number,
  sx: number,
  horizonY: number,
  alt: number,
  lux: number,
  cloud: number,
): void {
  const sy = horizonY - Math.sin((Math.max(0, alt) * Math.PI) / 180) * H * 0.34;
  const warm = Math.max(0, 1 - Math.max(0, alt) / 22);
  const k = Math.min(1, lux / 22000 + 0.12) * (1 - 0.55 * (cloud / 100));
  const r = W * (0.16 + 0.16 * warm);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, `rgba(255,${228 - 40 * warm},${176 - 70 * warm},${0.62 * k})`);
  g.addColorStop(0.4, `rgba(255,${190 - 30 * warm},${120 - 40 * warm},${0.22 * k})`);
  g.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  ctx.restore();
}
