# 首页线上资源审计（2026-09-16）

对象：https://www.zsaki.icu/；采集时间 2026-09-16T07:02:54.801Z。原始记录：[home-resources-live.json](home-resources-live.json)。采集脚本：frontend/scripts/audit-home-resources.mjs（从 frontend 执行 node scripts/audit-home-resources.mjs）。

## 测量口径

Chromium，390×844，DPR 2，冷缓存，CDP 设置下载 2 Mbps、延迟 100 ms；不接受分析 Cookie，不点击视频。页面 load 后等待 3 秒记录初始阶段，再逐步滚动全页、等待 10 秒记录整页资源。计数包括被取消请求，字节仅统计 loadingFinished 的 encodedDataLength（压缩传输数据，非源码体积）；取消请求的已传输部分未计入，故不是精确账单流量。

- 最新初始阶段：603.4 KiB，45 请求。首次样本为 478.3 KiB；后台预取调度会影响此阶段边界。
- 完整滚动：874.0 KiB，65 请求；两次整页结果均约 874 KiB。
- 初始阶段 LCP：1216 ms；CLS：0.000024（最大会话窗口）。不是现场用户分位数，也不代表全滚动过程 CLS。未测 INP、CPU 降速、服务器并发或冷图片转换耗时。
- 两条列表 RSC 请求收到 HTTP 200 后被浏览器取消，不能当作服务器 5xx。

## TOP 20（完整滚动、按传输字节降序）

| # | 资源 | KiB | 判断与建议 |
|---|---|---:|---|
| 1 | [/_next/static/chunks/2l3l1h98xwgpv.js](https://www.zsaki.icu/_next/static/chunks/2l3l1h98xwgpv.js) | 86.77 | 包含 Inquiry 与 zod 的代码；本地此前已禁用联系页预取，部署后确认是否仍在首页下载。 |
| 2 | [/_next/static/chunks/0u2bczj3id3e8.js](https://www.zsaki.icu/_next/static/chunks/0u2bczj3id3e8.js) | 70.01 | 公共脚本，尚无模块归因；先比较部署后产物，避免盲目拆分框架。 |
| 3 | [/_next/static/media/GeistMono_Variable.p.3ms9vq719j3f8.woff2](https://www.zsaki.icu/_next/static/media/GeistMono_Variable.p.3ms9vq719j3f8.woff2) | 69.99 | 本地 layout 已移除 Mono 字体；待上线验证。 |
| 4 | [/_next/static/media/Geist_Variable-s.p.0mrjj4bg00-he.woff2](https://www.zsaki.icu/_next/static/media/Geist_Variable-s.p.0mrjj4bg00-he.woff2) | 68.31 | 保留正文字体；若仍为瓶颈再评估系统字体，需视觉回归。 |
| 5 | [/_next/static/chunks/44_f3r5xgocdu.js](https://www.zsaki.icu/_next/static/chunks/44_f3r5xgocdu.js) | 43.08 | 公共脚本，尚无模块归因；保持 immutable 缓存，部署后重新分析。 |
| 6 | [/_next/static/chunks/2rnf2wnd__2ha.js](https://www.zsaki.icu/_next/static/chunks/2rnf2wnd__2ha.js) | 38.33 | 含 motion 代码；若部署后仍加载，再按实际动画入口评估减少客户端动画，风险为交互变化。 |
| 7 | [/MediaIcon/instagram.png](https://www.zsaki.icu/MediaIcon/instagram.png) | 30.54 | Footer 已切换 60px WebP；待上线验证。 |
| 8 | [/](https://www.zsaki.icu/) | 25.98 | HTML 已 gzip 和共享缓存；保留现有 ISR，不能据此认定所有 CDN 均已命中。 |
| 9 | [https://api.zsaki.icu/uploads/news/soncdian-wins-guangdong-quality-trust-recognition/cover.webp (w=1024)](https://www.zsaki.icu/_next/image?url=https%3A%2F%2Fapi.zsaki.icu%2Fuploads%2Fnews%2Fsoncdian-wins-guangdong-quality-trust-recognition%2Fcover.webp&w=1024&q=75) | 24.98 | PostCard sizes 本地已校准；保持响应式 AVIF/WebP 和懒加载。 |
| 10 | [/MediaIcon/tik-tok.png](https://www.zsaki.icu/MediaIcon/tik-tok.png) | 23.46 | Footer 已切换 60px WebP；待上线验证。 |
| 11 | [/banner/banner.webp (w=1024)](https://www.zsaki.icu/_next/image?url=%2Fbanner%2Fbanner.webp&w=1024&q=75) | 23.04 | 主视觉仅约 23 KiB，保留清晰度及优先加载，不优先继续有损压缩。 |
| 12 | [/global-odm-partners.jpg (w=1536)](https://www.zsaki.icu/_next/image?url=%2Fglobal-odm-partners.jpg&w=1536&q=75) | 20.45 | 检查地图展示所需源宽；收益较小，避免牺牲标注可读性。 |
| 13 | [/Exhibitions/THE INDOCOMTECH EXPO 2024.webp (w=512)](https://www.zsaki.icu/_next/image?url=%2FExhibitions%2FTHE%2520INDOCOMTECH%2520EXPO%25202024.webp&w=512&q=75) | 19.32 | 已有 512w AVIF，保留懒加载。 |
| 14 | [/Exhibitions/CES 2025.webp (w=512)](https://www.zsaki.icu/_next/image?url=%2FExhibitions%2FCES%25202025.webp&w=512&q=75) | 19.20 | 已有 512w AVIF，保留懒加载。 |
| 15 | [https://api.zsaki.icu/uploads/news/songdian-joins-m43-standard-group/cover.webp (w=1024)](https://www.zsaki.icu/_next/image?url=https%3A%2F%2Fapi.zsaki.icu%2Fuploads%2Fnews%2Fsongdian-joins-m43-standard-group%2Fcover.webp&w=1024&q=75) | 18.61 | PostCard sizes 本地已校准；待上线比较实际选图宽度。 |
| 16 | [/Exhibitions/The Photography & Video Show 2025.webp (w=512)](https://www.zsaki.icu/_next/image?url=%2FExhibitions%2FThe%2520Photography%2520%2526%2520Video%2520Show%25202025.webp&w=512&q=75) | 18.30 | 已有 512w AVIF，保留懒加载。 |
| 17 | [/_next/static/chunks/0j5x7tced-9lp.css](https://www.zsaki.icu/_next/static/chunks/0j5x7tced-9lp.css) | 17.54 | 约 18 KiB gzip；保留当前样式构建和 immutable 缓存。 |
| 18 | [/Exhibitions/CES 2026.webp (w=512)](https://www.zsaki.icu/_next/image?url=%2FExhibitions%2FCES%25202026.webp&w=512&q=75) | 15.90 | 已有 512w AVIF，保留懒加载。 |
| 19 | [/MediaIcon/facebook.png](https://www.zsaki.icu/MediaIcon/facebook.png) | 15.87 | Footer 已切换 60px WebP；待上线验证。 |
| 20 | [/Exhibitions/China (South Africa) Trade Fair 2024.webp (w=512)](https://www.zsaki.icu/_next/image?url=%2FExhibitions%2FChina%2520(South%2520Africa)%2520Trade%2520Fair%25202024.webp&w=512&q=75) | 15.73 | 已有 512w AVIF，保留懒加载。 |

## 分类与缓存

| 类型 | 请求数 | 已完成传输 KiB |
|---|---:|---:|
| Script | 19 | 311.8 |
| Font | 2 | 138.3 |
| Image | 20 | 314.0 |
| Document | 1 | 26.0 |
| Stylesheet | 1 | 17.5 |
| Fetch | 22 | 66.4 |

静态 JS/CSS/字体已有一年 immutable；图片优化器响应为 public, max-age=3600, must-revalidate；旧社交 PNG 为 max-age=0。此次无视频下载。图片不能一概视为最大优先级：字体和 JS 合计约 450 KiB，英雄图已很小。

## 具体行动、收益与风险

| 优先级/状态 | 相关文件或内容 | 当前问题与修改方式 | 收益 | 风险/边界 |
|---|---|---|---|---|
| P1，本轮完成 | frontend/components/PostCard.tsx；frontend/e2e/news-prefetch.spec.ts | 添加 prefetch=false，卡片出现或悬停时不再预取文章；点击仍用 Link 导航。 | 减少不一定访问的文章 RSC 请求和相关脚本竞争；本地浏览器验证点击前文章请求为 0。 | 首次点击需要现场请求，导航延迟可能增加；上线节省量尚未实测。 |
| P1，本地此前完成，待发布 | frontend/app/layout.tsx | 线上仍下载 Geist Mono；本地已删除无必要字体加载。 | 该样本约 70 KiB 字体传输。 | 检查是否存在依赖等宽字体的展示。 |
| P1，本地此前完成，待发布 | frontend/components/Footer.tsx；frontend/public/MediaIcon/*-60.webp | 线上仍用原 PNG；本地改为匹配显示尺寸的 WebP。 | 四个文件原始体积合计减少约 69 KB；不等同于首屏节省。 | 验证图标清晰度、点击区域及路径。 |
| P1，本地此前完成，待发布 | frontend/components/Header.tsx、Footer.tsx、HomeCtaSection.tsx | 联系页等入口预取会拉取额外 RSC 和表单脚本；本地选择性关闭。 | 减轻 2 Mbps 下后台流量；需部署后确认最大 87 KiB 表单相关 chunk 是否消失。 | 不能把整个 chunk 无条件视为必然可删除；共享依赖仍可能被其他入口需要。 |
| P1，待内容修正 | CMS News：songdian-manufacturing-oem-partner-for-kenko；db/t_news.csv:236、db/songdianB2B_full.sql:1663 为历史快照线索 | 线上摘要仍称 12 automated lines，正文出现 12 Lines / 12 intelligent assembly lines；按用户确认统一为 10，发布时同步缓存刷新。 | 首页摘要、News 正文与工厂口径一致。 | 本轮未改业务数据库或历史备份；不可直接全库把 12 替换为 10。其他产能数字未获确认，不应顺带重写。 |
| P2，待部署后评估 | frontend/components/motion；frontend/app/page.tsx | 线上 motion 相关块约 38 KiB；先定位必要动画入口，再决定是否用 CSS 或减少客户端边界。 | 可能降低 JS 执行与下载。 | 会影响动画；不能仅凭包名移除依赖。 |
| P2，本地此前完成，待发布 | frontend/components/PostCard.tsx；frontend/components/ProductGallery.tsx | sizes 已根据实际容器校准，减少移动端选取过大源图。 | 降低适用断点图片传输，图库保持清晰。 | 当前线上字节不是修改后效果，需复测。 |

## 后续顺序

1. 对该篇 News 做限定 slug、限定字段的事实修正，保留其他运营内容和已确认的四款推广产品；BK05/GO7 继续暂缓。
2. 发布经过验证的累计前后台改动后，在相同条件下重跑脚本，比较字体、社交图、RSC 和大 JS 块；先检查缓存刷新与图片缓存卷。当前未部署。
3. 再决定是否裁减 motion 或字体；补真实移动端交互 INP、服务器负载和 Search Console 抓取验证。无需因本次测量增加服务架构。

本轮本地验证：生产构建成功（66 页），相关 ESLint 通过；News 卡片预取/点击回归 1 项通过。首次测试发现开关未写入，补齐后重新构建复测通过。线上报告测量的是发布中的旧版本，不代表本地累计改动已经上线。
