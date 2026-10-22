// Guard: the 3D massing must be as tall as the shot table claims it is.
//
// The camera framing is computed from `cam.height` (the landmark's real
// tip-to-toe figure), so a massing list that tops out at 2x that value fills the
// frame with the subject's middle tiers and the landmark reads as an abstract
// block. Run from the repo root: `node showcase/audit-massing.mjs`.
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { SHOTS } = await import(pathToFileURL(resolve(HERE, 'src/shots.ts')).href);
const { MASSES, summit } = await import(pathToFileURL(resolve(HERE, 'src/landmark3d.ts')).href);

let bad = 0;
for (const s of SHOTS) {
  if (s.kind === 'card') continue;
  const list = MASSES[s.skyline]?.(s.id.length * 7 + Math.round(s.cam.lat)) ?? [];
  const got = summit(list);
  const want = s.cam.height;
  const ok = Math.abs(got - want) / want < 0.42;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${s.skyline.padEnd(12)} model ${got.toFixed(0).padStart(4)} m vs shot ${want} m`,
  );
}
// A pyramid's 4-slice cylinder measures its apex at `h`, so the tip is exact.
if (bad) {
  console.error(`${bad} landmark(s) out of agreement with the shot table`);
  process.exit(1);
}
console.log('massing heights agree with the shot table');
