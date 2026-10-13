// Downloads CC-licensed visual assets at setup time. Repo ships NO heavy data;
// everything fetched here carries an attribution obligation recorded in licenses/ATTRIBUTIONS.md.
import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function download(url, dest) {
  return new Promise((ok, err) => {
    const f = createWriteStream(dest);
    const req = (u) =>
      get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return req(res.headers.location);
        if (res.statusCode !== 200) return err(new Error(`${res.statusCode} ${u}`));
        res.pipe(f);
        f.on('finish', () => f.close(() => ok(dest)));
      }).on('error', err);
    req(url);
  });
}

const jobs = [
  {
    url: 'https://cdn.eso.org/images/screen/eso0932a.jpg',
    dest: 'apps/web/public/assets/milkyway-eso0932a.jpg',
    note: 'ESO/S.Brunier Milky Way panorama, CC BY 4.0 — credit "ESO / S. Brunier" when displayed.',
  },
];

mkdirSync(resolve(root, 'apps/web/public/assets'), { recursive: true });
for (const j of jobs) {
  const p = resolve(root, j.dest);
  process.stdout.write(`fetch ${j.url}\n`);
  await download(j.url, p);
  console.log(`saved ${j.dest}\n  ${j.note}`);
}
console.log('done. Assets are gitignored; re-run anytime.');
