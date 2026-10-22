export interface Place {
  name: string;
  lat: number;
  lon: number;
  source: string;
}

export async function searchPlaces(
  q: string,
  keys: { nominatimUrl: string; tdtKey: string; amapKey: string; tencentKey: string },
): Promise<Place[]> {
  const out: Place[] = [];
  const jobs: Promise<void>[] = [];

  if (keys.tdtKey) {
    jobs.push(
      (async () => {
        try {
          const r = await fetch(
            `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: q }))}&tk=${keys.tdtKey}`,
          );
          const j = (await r.json()) as { msg?: string; location?: { point?: string; name?: string } };
          if (j.msg === 'success' && j.location?.point) {
            const [lon, lat] = j.location.point.split(',').map(Number);
            if (Number.isFinite(lat) && Number.isFinite(lon))
              out.push({ name: j.location.name ?? q, lat, lon, source: '天地图' });
          }
        } catch {
          /* network */
        }
      })(),
    );
  }

  if (keys.amapKey) {
    jobs.push(
      (async () => {
        try {
          const r = await fetch(
            `https://restapi.amap.com/v5/place/text?keywords=${encodeURIComponent(q)}&types=190000&key=${keys.amapKey}`,
          );
          const j = (await r.json()) as { status?: string; pois?: { name: string; location: string }[] };
          for (const p of (j.pois ?? []).slice(0, 4)) {
            const [lon, lat] = (p.location ?? '').split(',').map(Number);
            if (Number.isFinite(lat) && Number.isFinite(lon))
              out.push({ name: p.name, lat, lon, source: '高德' });
          }
        } catch {
          /* network */
        }
      })(),
    );
  }

  if (keys.tencentKey) {
    jobs.push(
      (async () => {
        try {
          const r = await fetch(
            `https://apis.map.qq.com/ws/place/v1/search?keyword=${encodeURIComponent(q)}&page_size=4&key=${keys.tencentKey}`,
          );
          const j = (await r.json()) as { status?: number; data?: { title: string; location: { lat: number; lng: number } }[] };
          for (const p of j.data ?? [])
            out.push({ name: p.title, lat: p.location.lat, lon: p.location.lng, source: '腾讯' });
        } catch {
          /* network */
        }
      })(),
    );
  }

  jobs.push(
    (async () => {
      try {
        // Users paste the base URL with a trailing slash in settings.
        const base = keys.nominatimUrl.replace(/\/+$/, '');
        const r = await fetch(
          `${base}/search?format=jsonv2&limit=5&accept-language=zh-CN&q=${encodeURIComponent(q)}`,
          { headers: { Accept: 'application/json' } },
        );
        const arr = (await r.json()) as { display_name: string; lat: string; lon: string }[];
        for (const it of arr) out.push({ name: it.display_name, lat: +it.lat, lon: +it.lon, source: 'OSM' });
      } catch {
        /* network */
      }
    })(),
  );

  await Promise.all(jobs);
  return out.slice(0, 8);
}
