export interface AppKeys {
  ionToken: string;
  tdtKey: string;
  amapKey: string;
  tencentKey: string;
  nominatimUrl: string;
}

const LS = 'lsps.keys.v1';
const LS_SCENE = 'lsps.scene.v1';

export interface Scene {
  bortle: number;
}

export function defaultKeys(): AppKeys {
  return {
    ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN ?? '',
    tdtKey: import.meta.env.VITE_TDT_KEY ?? '',
    amapKey: '',
    tencentKey: '',
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
  return { ...defaultKeys(), ionToken: '', tdtKey: '', amapKey: '', tencentKey: '' };
}

export function loadScene(): Scene {
  try {
    return { bortle: 5, ...(JSON.parse(localStorage.getItem(LS_SCENE) ?? '{}') as Partial<Scene>) };
  } catch {
    return { bortle: 5 };
  }
}

export function saveScene(s: Scene): void {
  localStorage.setItem(LS_SCENE, JSON.stringify(s));
}

async function probe(url: string, ok: (j: unknown, status: number) => boolean): Promise<string> {
  try {
    const r = await fetch(url);
    let j: unknown = null;
    try {
      j = await r.json();
    } catch {
      /* non-json */
    }
    return ok(j, r.status) ? '✓ 有效' : `✗ 无效/被拒（${r.status}）— 检查 key 类型与域名白名单`;
  } catch (e) {
    return `✗ 网络失败：${String(e).slice(0, 60)}`;
  }
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
  return probe(
    `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: '北京市' }))}&tk=${key}`,
    (j) => (j as { msg?: string })?.msg === 'success',
  );
}

/** Probe an AutoNavi (AMap) Web-service key (browser key with domain whitelist works). */
export async function testAmap(key: string): Promise<string> {
  if (!key) return '未填写';
  return probe(`https://restapi.amap.com/v3/geocode/geo?address=%E5%8C%97%E4%BA%AC&key=${key}`, (j) => {
    const s = (j as { status?: string; infocode?: string })?.status;
    return s === '1';
  });
}

/** Probe a Tencent位置服务 WebService key (需开启域名白名单授权方式). */
export async function testTencent(key: string): Promise<string> {
  if (!key) return '未填写';
  return probe(
    `https://apis.map.qq.com/ws/place/v1/suggestion?keyword=%E5%8C%97%E4%BA%AC&key=${key}`,
    (j, st) => st === 200 && (j as { status?: number })?.status === 0,
  );
}
