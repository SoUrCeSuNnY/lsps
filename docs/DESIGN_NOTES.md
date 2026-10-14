# 设计说明 · Clean-room 声明

## 灵感来源

LSPS v0.2 的**功能设计思路**（多地图源矩阵、24h 摄影事件时间轴、Bortle 暗夜等级与
曝光联动、多源天气、卫星过境等）参考了商业应用 **PlanIt! Aurora**
(com.planitphoto.aurora) 的产品形态。我们对其表达敬意与致谢：它验证了摄影/影视
选址规划这一产品方向。

## 边界（我们严格遵守）

借鉴的是**思想与功能清单**——版权保护表达、不保护思想。本项目：

1. **零代码复制**：不反编译、不复制、不翻译 PlanIt! Aurora 的任何字节码/源码。
   所有代码由 lsps 仓库的 MIT 提交历史自然生长（git log 可审计）。
2. **零素材提取**：不使用其 APK 内任何贴图、天空盒、地图样式（那些是高德/PlanIt
   的版权资产）。雨雪雾云 shader 为自写 GLSL；天空贴图仅用 CC0/公有领域来源。
3. **零数据爬取**：不使用 skyscraperpage 建筑库（专有数据库）。3D 建筑仅走
   OSM 开放数据（Cesium OSM Buildings，CC BY 4.0 / ODbL）。
4. **不冒用授权**：不提取其内嵌的任何 API key（例如 APK 中 meteoblue 的订阅 key
   属 PlanIt 账户资产，绝不可用）。本项目所有 key 由用户在自己浏览器填入，
   仅存 localStorage，不进仓库。
5. **服务边界**：
   - 高德瓦片：公开 raster 端点（高德官网自用同款 `webst/webrd0{1-4}.is.autonavi.com`），
     带署名；POI 搜索走高德开放平台官方 API + 用户自有 Web服务 key。
   - 腾讯：仅其官方 WebService API（`apis.map.qq.com/ws/place/v1/search`）+ 用户 key。
   - 不集成高德/腾讯/Google/Mapbox SDK（专有许可），不内嵌 Windy 插件（其条款
     约束下未来如需再走官方申请）。
6. **公开数据源全部标注许可证与署名义务**：见 `licenses/ATTRIBUTIONS.md`。

## 各能力的公开文档依据

| 能力 | 官方文档（实现依据） |
|---|---|
| 天地图 WMTS | https://tech.tianditu.cn/mapapi-front/ |
| 高德开放平台 Web服务 | https://lbs.amap.com/api/webservice/summary |
| 腾讯位置服务 WebService | https://lbs.qq.com/webApi/webservice/webservice |
| Open-Meteo | https://open-meteo.com/en/docs |
| 7Timer! (NASA) | https://www.7timer.info/doc.php?lang=en |
| Bortle 等级 | Bortle 1958, Sky & Telescope（公开天文共识表） |
| 日月食/历算 | astronomy-engine (MIT) https://github.com/cosinekitty/astronomy |
| CesiumJS 地球 | https://cesium.com/learn/cesiumjs/ (Apache-2.0) |
| CelesTrak TLE（插件） | https://celestrak.org/data-access/ |
