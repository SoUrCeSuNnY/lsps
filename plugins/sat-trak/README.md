# sat-trak — 卫星/ISS 过境插件（GPL 隔离示范）

本目录演示 lsps 的 **GPL 隔离架构**：主仓库（MIT）零 GPL 依赖，卫星星历计算使用
[`satellite.js`](https://github.com/shcherbin/satellite-js)（**GPL-2.0**），以
**独立进程 + JSON 协议** 的方式与主应用通信。GPL 的 copyleft 触发点是"链接/合并分发"，
进程边界 + 数据协议是社区公认的隔离做法。

## 隔离契约

1. 本目录 **不是** npm workspace 成员，`satellite.js` 永不进入根 `package-lock.json`。
2. 用户显式安装：`cd plugins/sat-trak && npm install satellite.js`（本目录自带独立
   `package.json` / lockfile，许可声明见 `LICENSE-NOTES.md`）。
3. 主应用通过 `http://127.0.0.1:7788` 的 JSON 接口读取计算结果，只交换数据，不共享代码。
4. 未安装 satellite.js 时，本服务启动并诚实返回 503，主应用隐藏"卫星过境"面板。

## 启动

```bash
cd plugins/sat-trak
npm install          # 会安装 GPL-2.0 的 satellite.js（仅本地）
node src/server.mjs  # 监听 127.0.0.1:7788
```

在 lsps 设置中开启"卫星过境"后，主应用会调用本服务。

## 协议

`GET /health` → `{ "ok": true, "engine": "satellite.js" | null }`

`GET /passes?lat=39.9&lon=116.4&date=2026-10-13&minEl=10&group=stations`

```jsonc
{
  "passes": [
    { "name": "ISS (ZARYA)", "aos": "2026-10-13T12:34:56Z", "los": "...",
      "maxEl": 63.2, "maxElTime": "...", "azAos": 240, "azLos": 60 }
  ]
}
```

TLE 数据源：CelesTrak（免费公开数据，引用其使用条款 https://celestrak.org/data-access/ ）。

## 免责声明

运行本插件需要你在本地自行安装 GPL 组件；分发 lsps 主仓库不构成对 GPL 代码的链接分发。
