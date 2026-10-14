import { useState } from 'react';
import { AppKeys, clearKeys, defaultKeys, loadKeys, saveKeys, testIon, testTdt } from '../lib/keyStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (k: AppKeys) => void;
}

export function SettingsModal(p: Props) {
  const [k, setK] = useState<AppKeys>(() => loadKeys());
  const [show, setShow] = useState(false);
  const [tIon, setTIon] = useState('');
  const [tTdt, setTTdt] = useState('');
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
          <h2>设置 · API 密钥</h2>
          <button onClick={p.onClose}>✕</button>
        </div>

        <div className="field">
          <label>Cesium ion Token（可选）</label>
          <div className="row2">
            <input
              type={show ? 'text' : 'password'}
              placeholder="eyJhbGciOiJ…"
              value={k.ionToken}
              onChange={(e) => set({ ionToken: e.target.value.trim() })}
            />
            <button className="chip" onClick={() => setShow((v) => !v)}>
              {show ? '隐藏' : '显示'}
            </button>
            <button onClick={() => testIon(k.ionToken).then(setTIon)}>测试</button>
          </div>
          {tIon && <div className="testres">{tIon}</div>}
          <div className="note">
            启用 3D 地形（山脉真实起伏阴影）+ Bing 高清影像。免费注册：
            <a href="https://ion.cesium.com/" target="_blank" rel="noreferrer"> ion.cesium.com</a>
            （个人非商用免费额度足够）
          </div>
        </div>

        <div className="field">
          <label>天地图开发者 Key（可选）</label>
          <div className="row2">
            <input
              type={show ? 'text' : 'password'}
              placeholder="xxxxxxxxxxxxxxxx"
              value={k.tdtKey}
              onChange={(e) => set({ tdtKey: e.target.value.trim() })}
            />
            <button onClick={() => testTdt(k.tdtKey).then(setTTdt)}>测试</button>
          </div>
          {tTdt && <div className="testres">{tTdt}</div>}
          <div className="note">
            大陆直连的高清影像/矢量底图 + 中文地址搜索。免费注册：
            <a href="https://console.tianditu.gov.cn/api/key" target="_blank" rel="noreferrer">
              {' '}console.tianditu.gov.cn/api/key
            </a>
            （需实名注册，个人配额充足）
          </div>
        </div>

        <div className="field">
          <label>地理编码服务（Nominatim）</label>
          <input
            type="text"
            value={k.nominatimUrl}
            onChange={(e) => set({ nominatimUrl: e.target.value.trim() })}
          />
          <div className="note">默认官方公共实例；可改为自建 Photon/Nominatim 地址</div>
        </div>

        <div className="modal-foot">
          <button
            className="primary"
            onClick={() => {
              saveKeys(k);
              p.onSaved(k);
              setSaved(true);
              setTimeout(p.onClose, 500);
            }}
          >
            {saved ? '✓ 已保存并生效' : '保存并应用'}
          </button>
          <button
            onClick={() => {
              const d = clearKeys();
              setK(d);
              setTIon('');
              setTTdt('');
              p.onSaved({ ...d, nominatimUrl: defaultKeys().nominatimUrl });
            }}
          >
            清除本地密钥
          </button>
        </div>
        <div className="note privacy">
          密钥仅保存在本浏览器 localStorage，不会提交到任何服务器、不进 git 仓库。
          .env.local 中的同名变量作为初始默认值。
        </div>
      </div>
    </div>
  );
}
