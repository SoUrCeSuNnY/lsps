export interface Place {
  name: string;
  lat: number;
  lon: number;
  source: string;
}

export async function searchPlaces(
  q: string,
  nominatimUrl: string,
  tdtKey: string,
): Promise<Place[]> {
  const out: Place[] = [];
  const tdtJobs: Promise<void>[] = [];

  if (tdtKey) {
    tdtJobs.push(
      (async () => {
        try {
          const r = await fetch(
            `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: q }))}&tk=${tdtKey}`,
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

  tdtJobs.push(
    (async () => {
      try {
        const r = await fetch(
          `${nominatimUrl}/search?format=jsonv2&limit=5&accept-language=zh-CN&q=${encodeURIComponent(q)}`,
          { headers: { Accept: 'application/json' } },
        );
        const arr = (await r.json()) as { display_name: string; lat: string; lon: string }[];
        for (const it of arr) {
          out.push({ name: it.display_name, lat: +it.lat, lon: +it.lon, source: 'OSM' });
        }
      } catch {
        /* network */
      }
    })(),
  );

  await Promise.all(tdtJobs);
  return out.slice(0, 6);
}
