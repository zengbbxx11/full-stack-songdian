# Songdian Technology 官网前端

面向全球 OEM/ODM 数码相机采购商的 B2B 官网，基于 Next.js App Router、React Server Components 和 Tailwind CSS 构建。产品、新闻、搜索与询盘数据由 FastAPI 提供；官网负责内容展示、SEO/GEO、分享卡片与询盘转化入口。

视觉规则见 [DESIGN-tesla.md](./DESIGN-tesla.md)，全栈部署见 [../deploy-guide.md](../deploy-guide.md)，当前交付边界见 [../CURRENT_IMPLEMENTATION.md](../CURRENT_IMPLEMENTATION.md)。

## 技术栈

- Next.js 16.3.4、React 19.2、TypeScript
- Tailwind CSS 4、Geist variable font
- React Server Components、Streaming SSR、Suspense、ISR
- React Hook Form、Zod、Lucide React
- Leaflet 地图按需加载
- `next/image`，优先 AVIF/WebP
- Playwright、Lighthouse CI、ESLint

## 环境要求与启动

- Node.js `24.18.0`，以仓库 `.node-version` 为准
- npm
- 本地 FastAPI 默认运行在 `http://127.0.0.1:8000`

```bash
cp .env.example .env.local
npm install
npm run dev
```

访问 `http://localhost:3000`。提交前至少运行：

```bash
npm run lint
npm run verify:seo
npm run build
```

涉及交互、响应式或路由行为时再运行 `npm run test:e2e`。

### E2E 测试前置

Playwright 用例需要三个服务同时可达：后端 `:8000`、官网 `:3000`、后台 `:3001`（后台相关用例在同一个套件里）。运行前设置：

```bash
NODE_OPTIONS= \
  E2E_FRONTEND_URL=http://localhost:3000 \
  E2E_ADMIN_URL=http://localhost:3001 \
  E2E_API_URL=http://127.0.0.1:8000 \
  ./node_modules/.bin/playwright test --reporter=line
```

两条硬性约定：

- **本地 dev 模式下用例地址用 `localhost`**。Next 16 开发服务器对 `/_next/*` 做同源校验，`Origin: http://127.0.0.1:3000` 的 chunk 请求返回 403，导致 JS 不加载、页面不注水、交互用例静默失败。CI 用 `npm run start`（生产构建）启动，不受此限制，`playwright.config.ts` 的默认 `baseURL` 保持 `127.0.0.1:3000`；后端地址两种模式都用 `127.0.0.1`。
- **交互用例必须等待 React 注水**。`page.goto()` / `page.reload()` 在 window load 就返回，此时 DOM 可读写但事件处理器尚未挂载；直接点击会「操作无效、无请求、无报错」。统一使用 `e2e/hydration.ts` 的 `gotoHydrated()`，`reload()` 后补 `waitForHydration()`；不要用 `waitUntil: "networkidle"` 代替。

完整约定（含典型症状对照表与夹具清理要求）见 [AGENTS.md](./AGENTS.md) 的「E2E 测试（Playwright）」章节。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 生产构建与类型检查 |
| `npm run start` | 启动生产构建 |
| `npm run lint` | ESLint 校验 |
| `npm run verify:seo` | 检查 SEO/GEO 代码契约与关键静态资产 |
| `npm run gen:map` | 从后端生成产品 canonical 路径映射 |
| `npm run generate:social-assets` | 生成默认 OG 图和工厂视频 poster |
| `npm run lighthouse` | 执行 Lighthouse CI 与预算断言 |
| `npm run test:e2e` | Playwright 端到端测试 |

`npm run gen:map` 需要后端 API 可达。生成的 `lib/generated/canonical-map.ts` 必须随产品分类/slug 变化一起提交。

## 环境变量

参考 [.env.example](./.env.example)。

| 变量 | 作用 | 注意事项 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | 浏览器访问的公开 API 地址 | 生产使用 HTTPS API 域名；属于构建期变量 |
| `INTERNAL_API_URL` | Server Components/构建阶段访问后端 | Compose 中通常为 `http://backend:8000` |
| `NEXT_PUBLIC_IMAGE_HOST` | `next/image` 允许的远程图片主机 | 只填主机名，不带协议和路径 |
| `ALLOW_LOCAL_IMAGE_OPTIMIZATION` | 允许图片优化器访问本地/局域网地址 | 仅本地开发可设 `true`；生产必须关闭或不设置。已被 `NODE_ENV !== "production"` 硬门槛包住，生产构建恒为 `false` |
| `NEXT_PUBLIC_SITE_URL` | canonical、sitemap、OG 和 `/llms.txt` 基础 URL | 生产必须为官网 HTTPS 主域名 |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | 默认描述 | 避免与公开公司事实漂移 |
| `NEXT_PUBLIC_GA_ID` | GA4 Measurement ID 兜底 | 后台缺少 ga_id 或接口失败时使用；后台明确留空时关闭 GA |
| `NEXT_PUBLIC_GOOGLE_VERIFICATION` | Search Console 验证码 | 可选 |
| `REVALIDATE_SECRET` | `/api/revalidate` 校验的共享密钥 | 必须与后端 `REVALIDATE_SECRET` 一致，否则内容发布后不会即时刷新官网缓存 |

本地后端图片使用 loopback 或局域网 IP 且 `next/image` 拒绝请求时，才临时设置：

```dotenv
ALLOW_LOCAL_IMAGE_OPTIMIZATION=true
```

修改后重启开发服务器。生产启用此项会扩大服务端图片请求范围，因此禁止开启。

生产安全兜底：`next.config.ts` 把该开关与 `NODE_ENV !== "production"` 做了**与运算**，所以生产构建即使显式设置了 `ALLOW_LOCAL_IMAGE_OPTIMIZATION=true` 也恒为 `false`。此外，开发模式下若 `NEXT_PUBLIC_API_URL` 指向 loopback/局域网地址而开关未开，启动时会打印一条 `[next.config]` 前缀的可操作告警——因为这种情况的失败表现为「图片全空白」，`/_next/image` 返回 `400 "url" parameter is not allowed`，很容易被误判成图片丢失。

## Google Analytics 与 Microsoft Clarity

管理后台“系统设置”中填写 `ga_id`（GA4 测量 ID）和 `clarity_id`（Clarity 安装代码最后的项目 ID，仅字母和数字）。只填 ID，不要填写整段脚本。Clarity 默认关闭，没有环境变量或硬编码项目 ID；后台留空即可关闭。

官网挂载后通过公开设置接口读取配置，请求最多等待 5 秒。后台保存会清理公开设置缓存，已打开的网页需完整刷新才能读取新 ID；后续修改 ID 无需重新构建前端。

两个工具共享 Analytics Cookie 选择。新增会话回放后同意版本提升为 2，旧访客会重新看到提示。Clarity 仅在同意后向 head 异步插入脚本，广告存储始终拒绝；撤回同意时发送 Consent V2 拒绝信号并停止记录，再次同意会恢复。询盘表单包含 `data-clarity-mask="true"`，管理后台不加载 Clarity。

首次部署后打开设置页保存 Clarity ID，在官网接受 Analytics Cookie，再到 Clarity 检查安装和会话。Clarity 项目侧请开启要求 Cookie 同意的设置。开发测试应拦截第三方请求，避免向真实项目发送测试流量。

配置边界测试：`node --test scripts/test-tracking.mjs`。浏览器同意流程：启动官网后运行 `npm run test:e2e -- e2e/analytics-consent.spec.ts`；可用 `E2E_FRONTEND_URL` 指定地址，或用 `E2E_BROWSER_CHANNEL=chrome` 使用本机 Chrome。

## 路由与渲染

| 路由 | 数据与渲染 |
| --- | --- |
| `/` | 首页，Streaming SSR，多组 Suspense 边界 |
| `/products` | 产品列表、分类筛选和分页，ISR |
| `/products/[category]/[slug]` | 产品规范详情页，ISR；旧扁平 URL 由 `proxy.ts` 308 重定向 |
| `/news`、`/news/[slug]` | 新闻列表与详情，ISR |
| `/solutions`、`/solutions/faq` | OEM/ODM 方案与 FAQ |
| `/about` | 公司、工厂视频、认证、时间线与研发能力 |
| `/contact` | 询盘表单和地图 |
| `/search` | 产品与新闻联合搜索 |
| `/preview/[token]` | 签名草稿预览，`no-store`、`noindex` |
| `/privacy-policy` | 隐私政策 |
| `/robots.txt`、`/sitemap.xml` | Next.js 动态元数据路由 |
| `/llms.txt` | 实验性 AI 站点导览，Route Handler + 1 小时 ISR |

## 资源加载与性能边界

官网采用“首屏关键资源优先、非关键资源按需”的分层策略，不把所有内容一律延迟加载：

| 资源/区域 | 当前策略 | 说明 |
| --- | --- | --- |
| Hero、Logo、首个 LCP 候选 | `next/image` `preload` | 保障首屏最大内容及时显示，不应改成懒加载 |
| 产品/新闻卡片图片 | `SafeImage` 默认 `loading="lazy"` | `preload={true}` 只给首屏候选；失败时渲染占位 |
| 首页非首屏图片 | `next/image` 默认懒加载或显式 `loading="lazy"` | 配合 `sizes` 减少不必要的下载尺寸 |
| About 时间轴、证书画廊 | `next/dynamic` 代码分包 | 当前是组件动态分包，不等同于滚动进入视口才加载 |
| Contact Leaflet 地图 | IntersectionObserver + `next/dynamic({ ssr: false })` | 距视口 200px 时才挂载地图组件并加载瓦片；保留固定占位和手动加载入口 |
| About 工厂视频 | `<video preload="none">` | 展示 poster，用户点击播放后才请求视频数据 |
| 首页异步数据区块 | `Suspense` Streaming SSR | 是服务端流式渲染，不等同于图片懒加载；关键文字仍可被搜索引擎读取 |

修改加载策略时优先检查 LCP、CLS、INP 和弱网移动设备表现；不能为了减少请求而延迟 Hero、首屏标题或首屏 CTA。

## 响应式导航、路由与页脚

- Header 在 `lg` 断点显示桌面导航、搜索框和 Request Quote；低于 `lg` 使用移动菜单，避免平板宽度下搜索框遮挡导航项。
- Header 内部 `Link` 使用 `scroll={false}`，并由 `resetScrollForNavigation()` 显式回到页面顶部，防止 Next.js 在旧滚动位置或异步内容加载完成后把新页面定位到中间区块。
- About 页首屏内容顺序固定为 `Who We Are` 眉题、`Our Story` 主标题，`Our Journey` 位于下一段；从 Home 任意滚动位置点击 About 都必须从页面顶部进入。
- 首页 Hero 在 `xl`（≥1280px）宽屏采用左上方内容布局，沿 `site-container` 对齐；内容列放宽至 `980px`，让 1920px 视口下标题保持合理换行。CTA 需位于固定底部询盘栏上方，Scroll 提示使用视口高度定位以避开 56px 浮层；平板和手机继续使用流式布局。
- `InstantSearch` 聚焦时保留一层品牌红边框，并通过 `data-focus-visible="none"` 避免全局 `:focus-visible` 焦点环造成双层红框；搜索仍保留可见的聚焦状态。
- Footer 的 Facebook、YouTube、Instagram、TikTok 均使用 `44×44px` 外层槽位；没有链接的图标也不能改用裸 `span`，否则会破坏等间距布局。

## 数据流与内容来源

- `lib/api/` 封装产品、新闻、搜索和分类 API。
- `lib/content-data.ts` 是公司事实、首页文案、FAQ、About 内容等静态信息的集中来源。
- `lib/media.ts` 集中映射仓库静态媒体。
- 产品和新闻由 FastAPI/PostgreSQL 提供，不在前端维护副本。
- 询盘直接提交 FastAPI 并写入 PostgreSQL；SMTP 通知和 CRM 状态由后端负责。
- 前端 `data/` 已被忽略，不是当前询盘存储方案。

公司年份口径必须保持一致：

- Songdian Technology (Guangdong) Co., Ltd. 法律实体成立于 2023 年。
- 母公司 Shenzhen Sonida Digital Technology Co., Ltd. 创立于 2006 年。
- “20 years”指集团数字影像制造经验，不代表松典科技这一法律实体成立于 2006 年。

## SEO 与社交分享

根布局提供默认 metadata、canonical 基准、robots、Open Graph、Twitter Card 和 Manufacturer JSON-LD。页面按需生成 Product、Article、FAQ、Breadcrumb 等结构化数据。

默认社交图为 `public/og/og-default.jpg`，固定 1200×630。普通页面使用默认图；产品和新闻详情优先使用内容图片，无图时显式回退到默认图。详情页必须同时提供 Open Graph 与 Twitter metadata，不能依赖根布局隐式继承内容图。

修改 metadata、路由或社交资产后运行 `npm run verify:seo` 和 `npm run build`。

## `/llms.txt` 实验性 GEO 导览

`app/llms.txt/route.ts` 根据共享公司配置生成 Markdown 风格站点导览。它是社区提案，不是正式 Web 标准，也不保证 AI 搜索排名、抓取或引用。

维护要求：

- 只写官网可公开、可验证的事实。
- 法律实体成立年份与集团历史必须分开。
- 公司资料、联系方式或核心页面变化时同步检查该路由。
- 不放未公开报价、私人联系人数据或无法证明的营销数字。
- `Generated` 表示生成日期，不表示公司资料当天更新。

生产请求应返回 `200`、`text/plain; charset=utf-8`，并包含正确的法律实体和集团年份口径：

```bash
curl -i https://www.zsaki.icu/llms.txt
```

## 工厂视频与社交资产

About 页使用：

```text
public/Video/SongdianFactoryVideo.mp4
public/Video/factory-poster.webp
```

播放器使用 `poster`、`playsInline` 和 `preload="none"`。组件支持可选 WebM `<source>`；仓库没有 WebM 时自动使用 MP4，不需要创建空路径。

媒体交付要求：

- MP4 使用浏览器兼容的 H.264 视频流，建议 AAC 音频。
- MP4 应启用 fast start，使 metadata 位于文件前部。
- poster 使用 16:9 WebP，避免播放前出现黑帧。
- 反向代理必须支持 Range 请求；`Range: bytes=0-1023` 应返回 `206`。
- H.264 profile、音频编码和 fast start 需要用 `ffprobe`/`ffmpeg` 或等效工具复核，不能仅凭扩展名判断。

重新生成默认 OG 图和 poster：

```bash
npm run generate:social-assets
```

脚本读取 `public/banner/banner.webp`，输出 `public/og/og-default.jpg` 和 `public/Video/factory-poster.webp`。生成后检查尺寸、体积、文字安全区域和 `git diff`。脚本不会重新编码 MP4。

## 设计与组件边界

- 视觉 token 定义在 `app/globals.css`，组件优先使用 CSS 变量。
- 品牌红用于询盘、报价、联系等转化行为；蓝色用于搜索、分页等工具行为。
- Server Components 是默认选择，交互区域使用最小 Client Component 边界。
- `AnimatedCounter.tsx` 服务端直接输出最终数值，CSS 只做视觉增强，确保无 JS、弱网和 AI 抓取环境得到真实数字。
- `FactoryVideo.tsx` 是 About 页视频播放器。
- `AnimatedSection` 是轻量服务端结构包装；复杂交互才使用 Framer Motion。
- 动画必须尊重 `prefers-reduced-motion`，重要内容不能只在 hover 后出现。

完整视觉规则见 [DESIGN-tesla.md](./DESIGN-tesla.md)。

## 关键目录

```text
app/                           页面、robots、sitemap、llms.txt
components/                    展示与交互组件
components/form/               询盘表单
components/motion/             动画边界
lib/api/                       FastAPI 客户端
lib/content-data.ts            共享公司事实与静态内容
lib/media.ts                   静态媒体路径
lib/seo.ts                     JSON-LD 与 SEO 工具
lib/generated/                 canonical 路径映射
public/og/                     默认社交分享图
public/Video/                  工厂 MP4 与 poster
scripts/generate-og-assets.mjs 社交图与 poster 生成脚本
scripts/verify-seo.mjs          SEO/GEO 契约校验
e2e/                            Playwright 用例（12 个 spec）
e2e/hydration.ts               注水等待 helper：gotoHydrated() / waitForHydration()
playwright.config.ts           E2E 配置（workers: 2，testDir: e2e）
next.config.ts                 图片优化、远程主机与生产配置
proxy.ts                       产品 URL 规范化重定向
```

## 发布检查

1. 源 banner 或社交设计变化时运行 `npm run generate:social-assets`。
2. 产品分类或 slug 变化时运行 `npm run gen:map` 并提交输出。
3. 依次运行 lint、SEO 校验和生产构建。
4. 确认 poster 与默认 OG 图未被 `.gitignore` 排除。
5. 在生产构建中检查 `/llms.txt`、社交 metadata、视频 poster 和 MP4 Range 响应。
6. 通过仓库级部署流程发布，不在运行中容器内临时覆盖静态文件。

## 常见问题

### 后端图片在本地无法由 `next/image` 加载

确认图片主机和 API 地址正确。本地确实需要访问 loopback/局域网地址时，再设置 `ALLOW_LOCAL_IMAGE_OPTIMIZATION=true` 并重启；生产不要开启。

判定方法：直接请求优化器端点，返回 `400 "url" parameter is not allowed` 即为此项未开（此时直连后端 `/uploads/...` 本身是 200，说明文件没丢）：

```bash
curl -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/_next/image?url=<URL 编码后的后端图片地址>&w=1536&q=75"
```

### 构建时后端不可用

首页和列表页对内容 API 有降级处理，但 canonical map 生成仍需要后端。正式发布前应在后端可达时刷新映射并提交。

### 视频本机正常、部署后 poster 404

运行 `git status --short --untracked-files=all`，确认 `public/Video/factory-poster.webp` 出现在提交中；再检查 CI 构建上下文和容器内 `/app/public/Video/`。不要手工复制文件到容器来长期规避问题。

### 修改环境变量后仍使用旧地址

`NEXT_PUBLIC_*` 变量会进入构建产物。生产域名或 API 地址变化后必须重新构建并发布 frontend 镜像。
