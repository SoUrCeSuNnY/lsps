# LSPS · Cinematic Showcase

隔离的**演示视频生成器**：用 LSPS 自己的引擎（CesiumJS + `@lsps/core` 曝光/镜头数学 +
`apps/web` 的 Effects / StarField）渲染一支 2D+3D 产品动态设计片，再逐帧导出 mp4 / GIF / 封面。

**它不是外挂动画**——画面里每个数字都来自生产代码的同一套数学，逐帧算出来：

| 画面元素 | 真实来源 |
|---|---|
| 太阳高度/方位、月相、日出日落 | `astronomy-engine`（经 `apps/web/src/lib/astro.ts`） |
| 地面照度 lux、Bortle/SQM/极限星等 | `@lsps/core` `illuminance()` / `skyQuality()` |
| 焦段 → 视场角 | `@lsps/core` `verticalFovDeg()` 驱动 Cesium `PerspectiveFrustum.fov` |
| 光圈/ISO/快门/ND → 曝光 Δ | `@lsps/core` `exposureDeltaStops()` |
| 曝光 Δ → 画面亮度 | 同一个 Δ 送进 `Effects.setExposure()` 的 GLSL |
| 星空、月亮与月相 | `apps/web` `StarField` + 真实月球位置/照面比例 |
| 天气（云/雨/雪/雾） | `apps/web` `Effects` GLSL 后处理 + 2D 层 |
| 三维城市与地标体量 | Cesium 实体几何（`landmark3d.ts`），受真实太阳方位光照 |

## 画面分工：为什么 hero 是 2D，3D 是窗口

一句话：**能确定性的东西做成全屏，依赖网络的东西做成窗口。**

- **2D 电影层**（`skyline.ts` / `card-earth.ts`）：天空、太阳、月亮、地标剪影、地面倒影、
  变形镜头光晕、雨雪雾、暗角与颗粒。全部由帧号决定，离线可复现，而且是**设计**出来的——
  每个元素按构图摆放。
- **3D 实况窗口**（右上角 `LIVE 3D · CESIUM ENGINE`）：真的 Cesium 场景，真实的相机视场角、
  真实太阳方位照在建筑立面上、真实卫星影像。它回读合成进 2D 画布。

3D 不做全屏是有原因的：地表影像要真的下载。软件渲染（SwiftShader）下，太空视角一颗地球
一帧要几千张瓦片，屏幕空间误差逼着 Cesium 出到最大细节，画面会抖成棋盘缝；影像服务一慢，
整帧就是黑的。把它做成一个约 36% 宽的取景窗，**既保住"这是同一个引擎算出来的"这件事，
又不会被网络状态毁掉镜头。**

## 镜头表

时刻不是编的，是 2026-10-22 当天用 `astronomy-engine` 算出来的真实天文时刻；
`cam.height` 是地标真实高度，相机距离由镜头焦段和传感器尺寸反解（`shots.ts` 的 `pose()`）。

| 镜头 | 地标 | UTC | 真实事件（太阳高度） | 天气 | 焦段 / 曝光 |
|---|---|---|---|---|---|
| 1 | 巴黎 埃菲尔铁塔 330 m | 16:10Z | 日落前黄金时刻 +5.2° | 晴 | 28→92mm，ND 0→3 |
| 2 | 迪拜 哈利法塔 828 m | 07:40Z | 正午强光 +53.3° | 晴 | 20→58mm，ND 0→10 |
| 3 | 吉萨 金字塔 139 m | 09:10Z | 上午 +48.3° | 沙尘霾 | 24→44mm，f/11 |
| 4 | 悉尼 歌剧院 65 m | 20:10Z | 南半球白昼 +12.6° | 阴 92% | 35→24mm 拉远 |
| 5 | 重庆 洪崖洞 88 m | 10:32Z | 民用暮光蓝调 −3.5°（月 31.6°、84%） | 雨 | 50→35mm，ISO 1600 |
| 6 | 纽约 帝国大厦 443 m | 23:20Z | 深夜 −14.3°（满月 88%，31.6°） | 雪 | 85→135mm，f/2 ISO3200 |
| 7 | 伦敦 威斯敏斯特 96 m | 15:10Z | 下午转阴 +13.3° | 雷暴 | 40→30mm |

相机朝向按真实太阳/月亮方位挑（约太阳方位 +140°，取侧逆光的立体感）；夜景朝向月亮。
`node showcase/audit-massing.mjs` 会检查每个三维体量的顶端高度与镜头表里的真实高度是否一致。

## 运行

```bash
npm install                        # showcase 已注册为 workspace
npm run build -w @lsps/showcase    # 产出 showcase/dist
npm run dev   -w @lsps/showcase    # 实时预览 http://127.0.0.1:5178
```

## 导出视频

```bash
node showcase/capture.mjs --stills            # 每个镜头一张静帧，审片用
node showcase/capture.mjs                     # 抓全部 1142 帧 → build/frames/
node showcase/capture.mjs --encode            # 由已抓帧合成 mp4 + GIF + cover.png
node showcase/capture.mjs --shot paris-golden # 只重抓一个镜头
node showcase/capture.mjs --from 300 --to 499 # 分段抓（断点续跑，已存在的帧跳过）
node showcase/audit-massing.mjs               # 体量高度 vs 镜头表 一致性检查
```

需要本机 `ffmpeg` 在 PATH 里，以及已安装的 Chrome/Edge。

### 为什么逐帧抓，而不是录屏

`renderFrame(n)` 是**帧号的纯函数**：不读挂钟、不依赖 rAF、曝光走收敛值而不是逐帧 EMA 平滑。
所以抓第 n 帧得到的画面只由 n 决定，可复现、可分段、可重跑，软件渲染下也不会丢帧
（实时录屏在 SwiftShader 上必然掉帧）。

唯一的非确定性来源是 3D 窗口里的**网络瓦片**。所以抓帧驱动按镜头分批预热：同一镜头相机固定，
先把地表跑到稳定，再连抓该镜头所有帧；片头片尾是纯 2D 卡片，三维场景不参与合成，直接跳过预热。
预热时带 `{ skipPaint: true }`：Cesium 的帧遍历（发起瓦片请求的就是它）照跑，2D 覆盖层和
canvas 回读省掉，轮询才不会拖慢收敛。

### 瓦片走本地缓存代理

`tileproxy.mjs` 在 dev server 和抓帧 server 上都挂 `/tiles/{z}/{x}/{y}.jpg`：
先查磁盘缓存，没有再回源，回源按 `UPSTREAMS` 顺序试（Esri World Imagery → OSM.de 镜像），
并发限 6。

为什么要它：`tile.openstreetmap.org` 在这台机器的网络里**连不通**（GitHub 通、OSM 不通），
直接连它的话每个镜头预热 150 秒都跑不到稳定，画面永远是没贴图的椭球。换成可用源之后
预热从 150s 掉到 3–20s。磁盘缓存再让第二次跑几乎瞬间完成——改镜头表时这决定成本。

### 抓帧的四个坑

1. **无头浏览器里 WebGL canvas 不参与页面截图合成**（像素在，合成层没有），所以抓帧模式
   用 `drawImage(viewer.canvas)` 把三维画面回读进 2D 画布再截图。
2. `?capture=1` 给 `<html>` 加 `.capture` 关掉所有 CSS transition——同步抓帧会采样到
   过渡动画的中间态，画面就依赖挂钟时间了。
3. **不能用 `_surface._tilesToRender` 的数量判断"地表跑稳了"**。地面机位（相机高度几米到
   几百米）整个视锥可能都落在四叉树的同一个叶子里，那个计数器会长期停在 1，于是预热死等预算
   上限（实测 467s/镜头），而抓出来的帧其实早就贴满图了。改用**渲染画布的像素标准差**做门
   槛：没贴图时画面就是一段平滑天空渐变（detail 很低），贴上图后街道细节把标准差顶上去，
   连续 4 次采样波动小于 5%（detail 已高于 18 时放宽到 12%）才算稳定。用标准差而不是绝对
   亮度，是因为正午和深夜的亮度差两个数量级，阈值没法统一。detail 的下限要放低（≥2）：
   蓝调时刻加上雨幕，画面本身就没有高频内容，按正午镜头调出来的下限会让夜景永远跑不到稳定。
4. **`__raf` 的 `skipPaint` 会漏到抓帧那一帧**。预热用 `skipPaint: true` 省掉 2D 覆盖层，
   如果 `__render` 沿用这个状态，驱动截图时 2D 层根本不会重绘——所有镜头的静帧都是同一张
   片头。`__render` 必须显式清掉它。

## 顺带修掉的上游问题

做这支片时用到 `apps/web` 的生产代码，两处问题一起修了（不只影响演示片）：

- **`Effects` 的雾在夜里会洗成白天。** `FOG_FRAG` 的雾色是写死的近白 `(0.62,0.66,0.72)`，
  只按亮度微调。雾是大气散射，颜色必须跟着环境光走，否则蓝调时刻一开雾，三维窗口直接变成
  阴天的灰白幕布，主体全吞掉。现在雾色按相机位置的真实太阳高度在日/夜两套色之间插值，
  夜间值由 Cesium 自己的 `uniformState.sunPositionWC` 算出——不需要调用方多传参数，
  `apps/web` 的主界面同步受益。
- **`globe.enableLighting` 对影像层不起作用。** 标着打开之后，太阳在地平线下 15° 的纽约，
  渲染画布平均亮度 46.8，和同一机位 15:00Z 的 47.1 没有区别；开关这个标志只动 0.3/255。
  演示片的三维窗口改用 `ImageryLayer.brightness` 做夜压（实测 1.0→46.8、0.35→39.7、
  0.08→31.9），并把月光抬回来一点：满月照雪城确实比无月夜亮。

## 产物

交付物在 `showcase/media/`（提交进仓库），中间产物在 `showcase/build/`（已 gitignore）：

- `lsps-showcase.mp4` — 1600×900 / 24fps / 全片 47.6 s，H.264 CRF18
- `lsps-showcase-preview.gif` — README 内联播放用。GitHub 限制 10 MB，而整片压到 10 MB 以内
  只剩 480px，字都读不清。所以预览取**每个镜头的前 30%**（每个镜头的动态都在开头发生），
  换来 720px @ 10fps；不够再逐级降档
- `cover.png` — 封面（巴黎黄金时刻）

## 已知边界

- 无 ion token 时地球是椭球（无地形起伏），三维窗口只有城市体量。
- **曝光显示是调色曲线，不是字面 2^Δ。** 镜头表两端的曝光差有 14 档（正午戴 10 档 ND 的
  哈利法塔 vs 午夜的曼哈顿），字面执行必然一边全爆一边全黑。所以画面亮度走
  `1.7 · 2^(Δ/5)` 加夜景增益——**HUD 里印的 Δ 仍然是真实值。**
- 三维地标体量按公开尺寸搭的盒子与棱锥，不是实测模型；真实 footprint 走
  `apps/web` 的 Overpass 通道（公共实例限流，逐帧导出不能依赖它）。
- 地标剪影是矢量插画（2D 层）。
- 夜景城市灯光是几何点（开源 Cesium 没有 `showCityLights`，那是 ion 付费资产）。

## 第三方素材授权

- 卫星瓦片：Esri, Maxar, Earthstar Geographics（导出时经本地代理取用）
- `showcase/src/coastline.ts`：Natural Earth 110m 海岸线，经 world-atlas TopoJSON 解码，
  公有领域。重新生成：`node showcase/decode-coast.mjs`
