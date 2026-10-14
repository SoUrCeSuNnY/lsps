import { useState } from 'react';
import {
  AppKeys,
  clearKeys,
  loadKeys,
  loadScene,
  saveKeys,
  saveScene,
  Scene,
  testAmap,
  testIon,
  testTdt,
  testTencent,
} from '../lib/keyStore';
import { BORTLE_TABLE } from '@lsps/core';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (k: AppKeys) => void;
  onScene: (s: Scene) => void;
}

interface KeyField {
  id: keyof AppKeys;
  label: string;
  hint: string;
  url: string;
  urlText: string;
  test?: (v: string) => Promise<string>;
  secret?: boolean;
}

const FIELDS: KeyField[] = [
  {
    id: 'ionToken',
    label: 'Cesium ion Token',
    hint: '3D 地形 + Bing 影像',
    url: 'https://ion.cesium.com/',
    urlText: 'ion.cesium.com',
    test: testIon,
    secret: true,
  },
  {
    id: 'tdtKey',
    label: '天地图 Key',
    hint: '大陆直连高清影像/矢量 + 中文搜索',
    url: 'https://console.tianditu.gov.cn/api/key',
    urlText: 'console.tianditu.gov.cn/api/key',
    test: testTdt,
    secret: true,
  },
  {
    id: 'amapKey',
    label: '高德 Web服务 Key',
    hint: '中文 POI 搜索增强（瓦片免 key 已内置）',
    url: 'https://console.amap.com/dev/key/app',
    urlText: 'console.amap.com',
    test: testAmap,
    secret: true,
  },
  {
    id: 'tencentKey',
    label: '腾讯位置服务 Key',
    hint: '中文 POI 搜索备选（需开启域名白名单）',
    url: 'https://lbs.qq.com/dev/console/key/manage',
    urlText: 'lbs.qq.com',
    test: testTencent,
    secret: true,
  },
  {
    id: 'nominatimUrl',
    label: '地理编码（Nominatim）',
    hint: '免 key 全球搜索，可换自建',
    url: 'https://nominatim.openstreetmap.org',
    urlText: 'nominatim.openstreetmap.org',
  },
];

export function SettingsModal(p: Props) {
  const [k, setK] = useState<AppKeys>(() => loadKeys());
  const [scene, setScene] = useState<Scene>(() => loadScene());
  const [show, setShow] = useState(false);
  const [tests, setTests] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  if (!p.open) return null;

  const set = (patch: Partial<AppKeys>) => {
    setSaved(false);
    setK((v) => ({ ...v, ...patch }));
  };

  return (
    <div className="modal-mask" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>设置</h2>
          <button onClick={p.onClose}>✕</button>
        </div>

        <div className="sec-t row-flex">
          地图 / 搜索密钥
          <button className="chip" onClick={() => setShow((v) => !v)}>
            {show ? '显示密钥' : '隐藏密钥'}
          </button>
        </div>
        {FIELDS.map((f) => (
          <div className="field" key={f.id}>
            <label>
              {f.label}
              <span className="hint-inline">{f.hint}</span>
            </label>
            <div className="row2">
              <input
                type={f.secret && !show ? 'password' : 'text'}
                value={k[f.id]}
                placeholder={f.id === 'nominatimUrl' ? 'https://…' : '粘贴 key'}
                onChange={(e) => set({ [f.id]: e.target.value.trim() } as Partial<AppKeys>)}
              />
              {f.test && (
                <button
                  onClick={() => f.test!(k[f.id]).then((res) => setTests((t) => ({ ...t, [f.id]: res })))}
                >
                  测试
                </button>
              )}
            </div>
            {tests[f.id] && <div className="testres">{tests[f.id]}</div>}
            <div className="note">
              注册：<a href={f.url} target="_blank" rel="noreferrer">{f.urlText}</a>
            </div>
          </div>
        ))}

        <div className="sec-t" style={{ marginTop: 18 }}>夜空环境（摄影）</div>
        <div className="field">
          <label>
            Bortle 暗夜等级
            <span className="hint-inline">决定银河可见性与夜空照度，联动曝光模型</span>
          </label>
          <select
            value={scene.bortle}
            onChange={(e) => {
              const b = +e.target.value;
              setScene((v) => ({ ...v, bortle: b }));
              setSaved(false);
            }}
          >
            {BORTLE_TABLE.map((b) => (
              <option key={b.level} value={b.level}>
                B{b.level} · {b.name}（SQM {b.sqm}）
              </option>
            ))}
          </select>
          <div className="note bortle-preview">
            {BORTLE_TABLE[scene.bortle - 1].milkyWay} · 极限星等 ≈ {BORTLE_TABLE[scene.bortle - 1].nelm.toFixed(1)}
          </div>
        </div>

        <div className="modal-foot">
          <button
            className="primary"
            onClick={() => {
              saveKeys(k);
              saveScene(scene);
              p.onSaved(k);
              p.onScene(scene);
              setSaved(true);
              setTimeout(p.onClose, 450);
            }}
          >
            {saved ? '✓ 已保存并生效' : '保存并应用'}
          </button>
          <button
            onClick={() => {
              const d = clearKeys();
              setK(d);
              setTests({});
              p.onSaved(d);
            }}
          >
            清除本地密钥
          </button>
        </div>
        <div className="note privacy">
          密钥与场景设置仅保存在本浏览器 localStorage，不会提交到任何服务器、不进 git 仓库。
          .env.local 中的 VITE_CESIUM_ION_TOKEN / VITE_TDT_KEY 作为初始默认值。
        </div>
      </div>
    </div>
  );
}
