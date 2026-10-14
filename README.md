# LSPS · 3D 取景器

Web 版 **3D 选址/取景软件**：联网高精度 3D 地图上模拟任意时刻的光照、天气与星空，
并用电影级相机参数（焦段/画幅/光圈/ISO/快门角/ND）预演"这里这个时间会拍到什么"。

> 对标 CineTracer / SCOUT 一类取景器工具的开源实现。仓库本身 MIT；
> GPL/AGPL 组件全部以进程边界/公开 API 隔离，CI 有许可证白名单闸门。

## 功能现状

- 🏮 **默认场景：重庆洪崖洞** — 打开即是"全网最火蓝调时刻机位"（千厮门大桥侧取景位）：
  启动自动定位**当天日落→民用暮光之间的蓝调时刻**；**49 栋 OSM 3D 吊脚楼群**
  （Overpass 开放数据预置 + 运行时兜底，自研程序化夜景灯光立面纹理）；
  实况天气（Open-Meteo/7Timer）驱动云量/雨雪/雾的大气状态；星空与月亮就位。
- 🌍 **3D 地图**：CesiumJS（Apache-2.0）。**多源注册表**：天地图影像/矢量（WMTS，大陆直连）、
  高德卫星/矢量（公开瓦片免 key）、OSM、Cesium ion Bing；POI 搜索聚合
  天地图/高德/腾讯（用户 key）+ Nominatim；设置页在线填 key（localStorage）。
- 🕒 **时间机器**：精确到分钟的 UTC 时钟驱动太阳位置（Cesium 内置 ELP/ESOC 天文历），
  实时昼夜、晨昏蒙影、建筑/地形阴影（shadow map）；**24h 事件时间轴**
  （照度曲线 + 日出/日落/晨光/暮光/月升落/日月食标记，拖动/点击跳转）。
- 📷 **取景器模拟**：传感器（全幅/Super35/S16/M43…）× 焦段 → 视场角；1.85:1 / 2.39:1 /
  16:9 / 4:3 / 9:16 画幅遮幅、三分线、安全框、水平仪、方位/横滚读数；
  物理曝光模型（照度→EV→光圈/ISO/快门/ND 匹配，画面亮度实时响应）；一键截图（含取景框烘焙）。
- ☀️ **太阳路径**：当天太阳弧线（晨昏蓝调着色）+ 地平圈 + 太阳实时位置标记；
  日出/日落/民用晨昏蒙影时刻（astronomy-engine，MIT）。
- 🌙 **星空**：夜半后天球亮星（Yale BSC 公有领域星表，J2000→地固系逐帧旋转变换），
  月相/月亮高度驱动月光照明强度；**Bortle 1-9 暗夜等级**（SQM/极限星等/银河可见性
  与曝光联动，Bortle 1958 公开共识表）。
- 🌘 **日月食**：未来两次日食/月食预测（astronomy-engine 食计算），本地可见性与
  食分，一键跳转拍摄时间。
- 🌦 **天气**：Open-Meteo 实况（免 key，主源）+ **7Timer!**（NASA，公有领域，备源）；
  云量压暗、雨雪粒子（自研 GLSL）、雾浓度。
- 🛰 **卫星过境（插件）**：`plugins/sat-trak` —— satellite.js（GPL-2.0）安装在
  主 workspace 之外，本地 HTTP+JSON 协议通信（GPL 隔离示范，数据源 CelesTrak）。

## 快速开始

```bash
npm install                 # 建议国内: npm i --registry=https://registry.npmmirror.com
cp .env.example apps/web/.env.local   # 填 key（可全空，自动降级 OSM 底图）
npm run dev                 # http://localhost:5173
npm test && npm run build   # 单测 + 构建
npm run check:licenses      # 许可证白名单闸门（CI 同款）
npm run fetch:assets        # 可选: 拉取 CC-BY 银河全景贴图（ESO）
```

可用的 key（都免费）：
- `VITE_CESIUM_ION_TOKEN`：ion.cesium.com 注册 → 启用 World Terrain 3D 地形 + Bing 影像。
- `VITE_TDT_KEY`：console.tianditu.gov.cn 注册 → 天地图影像/矢量/中文地理编码（大陆直连）。
- 两者都不填：使用 OSM 底图（椭球地形），功能完整。

## 许可证隔离策略（本仓库 MIT 的前提）

| 类别 | 处理 |
|---|---|
| MIT / BSD / Zlib / ISC / 0BSD / CC0 | 直接依赖 |
| Apache-2.0（CesiumJS） | 直接依赖，无传染；随构建物分发其 LICENSE/NOTICE（npm 包自带），`licenses/THIRD_PARTY_NOTICES.md` 总清单 |
| AGPL-3.0（Open-Meteo 服务端代码） | **只调用官方公开 HTTP API**，不打包、不自托管其代码 |
| GPL-2.0（satellite.js、Stellarium） | 主仓零引用；satellite.js 以 `plugins/sat-trak` 独立目录+独立进程+JSON 协议隔离，用户本地自选安装 |
| 专有 ToS（ion / 天地图 / Google 3D Tiles） | 运行时用用户自己的 key，仓库不落数据，Google 瓦片默认关闭 |

CI 每次构建跑 `scripts/check-licenses.mjs`：生产依赖树出现 GPL/AGPL/SSPL/NC 即失败。

## 里程碑路线

- [x] M0 仓库骨架 / CI / 许可证闸门
- [x] M1 地球 + 选址 + 时间钟
- [x] M2 光照：太阳路径 / 阴影 / 晨昏 / 曝光模型
- [x] M3 相机：焦段→FOV / 画幅遮幅 / ND / 截图
- [x] M4 星空：天球亮星 / 月光照明
- [x] M5 天气：Open-Meteo 实况 → 云/雨/雪/雾
- [x] M6 卫星插件骨架 + 合规文件
- [x] v0.2 摄影向：多源地图注册表（高德/腾讯/天地图WMTS）· 24h事件时间轴 ·
  Bortle暗夜联动曝光 · 7Timer备源 · 日月食预测 · 在线设置页（灵感致谢与 clean-room
  声明见 `docs/DESIGN_NOTES.md`）
- [ ] 景深（相机深度纹理 → DOF）、镜头 flare 移植、星轨模式、预报时间轴（v0.3）

## 数据源矩阵（免梯子）

| 数据 | 来源 | 许可 |
|---|---|---|
| 影像 | 天地图 WMTS / 高德公开瓦片 / Bing(ion) / OSM | 注册免费 / 署名直用 / ion ToS / ODbL |
| 地形 | Cesium World Terrain | ion 个人免费额度 |
| POI | 天地图/高德/腾讯（用户 key）/ Nominatim | 各官方条款 |
| 天气 | Open-Meteo API（主）+ 7Timer!（备） | 代码 AGPL 不引入；数据 CC BY 4.0 / 公有领域 |
| 星表 | Yale Bright Star Catalog | 公有领域 |
| 天文历 | astronomy-engine + Cesium ELP/MPP02 | MIT / 公开科学数据 |
| 卫星星历 | CelesTrak TLE | 免费公开数据 |

诚实声明：中国大陆境内没有可合规获取的高精度实景 3D 建筑模型（Google Photorealistic
需梯子且 GMPA 禁缓存），境内取景以影像+地形为主，境外城市可叠加 Cesium OSM Buildings。

## 目录

```
apps/web          Cesium+React 应用（取景 UI、后处理、星空、太阳路径）
packages/core     镜头/曝光/照度纯数学（vitest 单测）
plugins/sat-trak  GPL 卫星插件（隔离，见其 README）
licenses/         THIRD_PARTY_NOTICES / ATTRIBUTIONS
scripts/          许可证闸门、CC 素材下载
```
