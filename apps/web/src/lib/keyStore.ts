export interface AppKeys {
  ionToken: string;
  tdtKey: string;
  nominatimUrl: string;
}

const LS = 'lsps.keys.v1';

export function defaultKeys(): AppKeys {
  return {
    ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN ?? '',
    tdtKey: import.meta.env.VITE_TDT_KEY ?? '',
    nominatimUrl: import.meta.env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
  };
}

export function loadKeys(): AppKeys {
  try {
    return { ...defaultKeys(), ...(JSON.parse(localStorage.getItem(LS) ?? '{}') as Partial<AppKeys>) };
  } catch {
    return defaultKeys();
  }
}

export function saveKeys(k: AppKeys): void {
  localStorage.setItem(LS, JSON.stringify(k));
}

export function clearKeys(): AppKeys {
  localStorage.removeItem(LS);
  return { ionToken: '', tdtKey: '', nominatimUrl: 'https://nominatim.openstreetmap.org' };
}

/** Probe a Cesium ion token against the World Terrain asset endpoint. */
export async function testIon(token: string): Promise<string> {
  if (!token) return '未填写';
  try {
    const r = await fetch('https://api.cesium.com/v1/assets/1/endpoint', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 200) return '✓ 有效（World Terrain 地形可用，影像服务可用）';
    if (r.status === 401 || r.status === 403) return `✗ 无效（token 被拒 ${r.status}）`;
    return `✗ 服务返回 ${r.status}`;
  } catch (e) {
    return `✗ 网络失败：${String(e).slice(0, 60)}`;
  }
}

/** Probe a Tianditu key with a geocode call. */
export async function testTdt(key: string): Promise<string> {
  if (!key) return '未填写';
  try {
    const r = await fetch(
      `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: '北京市' }))}&tk=${key}`,
    );
    const j = (await r.json()) as { msg?: string };
    if (j.msg === 'success') return '✓ 有效（影像/矢量瓦片与中文搜索可用）';
    return `✗ 无效：${j.msg ?? '未知'}`;
  } catch (e) {
    return `✗ 网络失败：${String(e).slice(0, 60)}`;
  }
}
