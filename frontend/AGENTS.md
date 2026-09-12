# Songdian Technology — 松典科技 B2B 官网

> AGENTS.md — 新会话快速上手指南。所有关键信息集中在这里，避免每次从头探索。

> 2026-08-19 更新：`lib/api/client.ts` 已使用结构化 `ApiError`；产品详情只把 HTTP 404 / `A010001` 当作不存在，服务故障进入可重试错误页。`/preview/[token]` 为 `no-store` / `noindex` 签名预览。产品图保持 `object-contain` 且不得恢复大内边距。生产由 Compose/GHCR 部署。

> 2026-09-11 更新：Next.js 升至 **16.3.4**（`frontend` 与 `admin-next` 同步）。新增 **E2E 注水约定** —— 交互用例必须用 `e2e/hydration.ts` 的 `gotoHydrated()`，详见下方「E2E 测试（Playwright）」章节。`ALLOW_LOCAL_IMAGE_OPTIMIZATION` 增加 `NODE_ENV !== "production"` 生产硬门槛。

---

## 项目定位

松典科技（广东）有限公司 B2B 官网，面向全球 OEM/ODM 数码相机采购商。
后端为项目自有 **FastAPI**（`../backend/`，端口 8000），前端 Next.js Headless（SSR + ISR）。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 + React 19 + TypeScript（strict） |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 后端 | 项目 FastAPI（`localhost:8000`），数据已从旧 WordPress 后端经 ETL 迁至 PostgreSQL（WP 残留代码已清理） |
| 表单 | react-hook-form + Zod + 客户端直接 POST FastAPI |
| SEO | next-super-meta + JSON-LD 结构化数据 |
| 动画 | framer-motion |
| 路由 | App Router（ISR 60s + Streaming SSR） |
| 性能 | React `cache()` 请求去重 + Suspense 流式渲染 + 骨架屏 |

## 项目路径

```
本地: C:\Users\Administrator\Desktop\Front-end project\full-stack-project\frontend
后端: C:\Users\Administrator\Desktop\Front-end project\full-stack-project\backend（FastAPI :8000）
管理后台: C:\Users\Administrator\Desktop\Front-end project\full-stack-project\admin-next（Next.js :3001）
服务器: /home/ubuntu/full-stack-songdian
```

### 本地启动

```bash
npm run dev → http://localhost:3000
```

> ⚠️ 本机沙箱 `npm run dev` 可能 fork 失败（EAGAIN），改用：
> `node_modules/next/dist/bin/next dev -p 3000`

### 生产启动

正式环境拉取 CI 构建的 GHCR 镜像，由根目录 Docker Compose 运行 `next start -p 3000`，再由 1Panel OpenResty 反向代理；不在服务器现场使用 PM2 构建或保活源码。

---

## 设计系统

基于极简风格 + 松典品牌红色（Logo 中 GD 字母为红色）：

| 颜色 | 色值 | 用途 |
|------|------|------|
| 品牌红 | `#d4343e` | 转化型 CTA（询盘/报价/联系）+ 导航 hover/激活态 + 进度条 |
| 品牌红 Hover | `#b91c1c` | 转化型 CTA hover 态（如询盘表单提交） |
| Electric Blue | `#3E6AE1` | 工具/功能按钮（搜索提交/分页等主动操作；分类筛选栏为红色激活指示，见 DESIGN-tesla.md） |
| Electric Blue Hover | `#3561CC` | 工具按钮 hover 态 |
| Carbon Dark | `#171A20` | 标题 + Hero 区域底色 |
| Graphite | `#393C41` | 正文 |
| Pewter | `#5C5E62` | 辅助文字/描述 |
| Light Ash | `#F4F4F4` | 卡片/区域背景 |

---

## 页面路由

| 路由 | 数据来源 | 渲染 |
|------|---------|------|
| `/` | FastAPI + content-data.ts | ISR 60s + Streaming（4 个 Suspense 边界） |
| `/products` | FastAPI 产品列表 + 分类筛选 | ISR 60s |
| `/products/[...slug]` | FastAPI 产品详情 + 相册 | ISR 60s + Suspense；规范地址 `/products/{category}/{slug}`，旧扁平地址与错误分类段由 `proxy.ts` 调后端 `GET /api/v1/products/{slug}/canonical` 解析后 308 |
| `/news` | FastAPI 新闻列表 | ISR 60s |
| `/news/[slug]` | FastAPI 新闻详情 | ISR 60s |
| `/about` | content-data.ts 静态内容 | Static |
| `/solutions` | content-data.ts 解决方案列表（OEM/ODM/经销） | Static |
| `/solutions/faq` | content-data.ts FAQ 列表 | Static |
| `/contact` | 联系表单 + Leaflet 地图 + SMTP | Static |
| `/search` | FastAPI 全文搜索 | SSR（实时 `no-store`，新内容即时可搜） |
| `/privacy-policy` | content-data.ts 隐私政策 | Static |

### 重定向（308 permanent）

| 旧路由 | 新路由 | 原因 | 实现位置 |
|--------|--------|------|---------|
| `/services` | `/solutions` | 2026-07 路由重构 | `next.config.ts` |
| `/services/faq` | `/solutions/faq` | 同上 | `next.config.ts` |
| `/blog` | `/news` | 旧路径清理 | `next.config.ts` |
| `/blog/:slug*` | `/news/:slug*` | 同上 | `next.config.ts` |
| `/inquiry` | `/contact` | 同上 | `next.config.ts` |
| `/products/{slug}` | `/products/{category}/{slug}` | 产品 URL 规范化（SEO 权重集中到分类嵌套地址） | `proxy.ts`（边缘中间件） |
| `/products/{wrongCategory}/{slug}` | `/products/{真实分类}/{slug}` | 分类段错误同样 308 到规范地址 | `proxy.ts`（边缘中间件） |

> 注：路由级重定向在 `next.config.ts`；**产品 URL 规范化的 308 在根目录 `proxy.ts`**（因本环境页面级 `redirect()` 不生效，见 README「已知注意事项」）。规范路径**运行时**取自后端 `GET /api/v1/products/{slug}/canonical`（含产品当前分类，带 60 秒短缓存；后端明确 404 时不回退静态映射），`lib/generated/canonical-map.ts` 仅在后端不可达时兜底。

### 错误处理 & 加载状态

| 文件 | 职责 |
|------|------|
| `app/error.tsx` | 全局错误边界（友好错误页 + 重试按钮） |
| `app/not-found.tsx` | 全局 404 页面 |
| `app/loading.tsx` | 根级骨架屏 |
| `app/products/loading.tsx` | 产品列表页骨架屏 |
| `app/products/[...slug]/loading.tsx` | 产品详情页骨架屏（两栏布局） |
| `app/news/loading.tsx` | 新闻列表页骨架屏 |
| `app/news/[slug]/loading.tsx` | 新闻详情页骨架屏 |

---

## 关键文件

| 文件 | 职责 |
|------|------|
| `lib/content-data.ts` | 全站可编辑文本（公司信息、产品分类、服务、FAQ、About 时间轴等） |
| `lib/api/client.ts` | FastAPI 客户端 — `apiFetch()` 封装 + Result 信封解析 + 缓存控制（revalidate / no-store / tags） |
| `lib/api/products.ts` | 产品数据访问层（列表/详情/分类/slug） |
| `lib/api/news.ts` | 新闻数据访问层 |
| `lib/api/search.ts` | 全文搜索数据访问层 |
| `components/form/InquiryForm.tsx` | 当前询盘表单：提交 FastAPI，由后端落 PostgreSQL 并发送 SMTP 通知 |
| `lib/seo.ts` | JSON-LD 结构化数据生成器 |
| `lib/html-cleaner.ts` | 富文本 HTML 清洗器（去内联样式/容器）+ `sanitize-html` 白名单消毒（堵存储型 XSS），新闻/产品详情 `dangerouslySetInnerHTML` 必经此层 |
| `lib/site-config.ts` | 页脚链接等静态配置 |
| `lib/types.ts` | TypeScript 类型定义（ProductSummary, ProductDetail, WCProductCategory 等；ProductDetail 含 seoTitle/seoDescription 字段） |
| `app/products/[...slug]/page.tsx` | 产品详情页 — `generateMetadata` 优先读取后端 seoTitle/seoDescription，空则回退 title/content_html 截取 |
| `components/Header.tsx` | 导航栏（`lg` 桌面断点、平板移动菜单、搜索与顶部滚动重置） |
| `components/Footer.tsx` | 页脚（社交图标统一槽位与等间距） |
| `components/NavigationProgress.tsx` | 顶部路由切换进度条（品牌红 #d4343e，零依赖） |
| `components/motion/HeroSection.tsx` | 首页 Hero |
| `components/ProductCard.tsx` | 产品卡片（服务端组件 RSC，图片走 SafeImage 兜底；hover 红框+阴影+缩放） |
| `components/ProductGallery.tsx` | 产品详情页左侧缩略图+右侧大图（next/image + 主图 `preload`） |
| `components/PostCard.tsx` | 新闻卡片（服务端组件 RSC，图片走 SafeImage 兜底；hover 蓝框+阴影+亮度变化） |
| `components/SafeImage.tsx` | 客户端图片组件（仅处理 onError 换占位），供 RSC 卡片复用，减少 hydration |
| `components/ContactMapLoader.tsx` | 客户端加载器，`next/dynamic({ ssr:false })` 按需引入 Leaflet，不进首屏 bundle |
| `components/StatsBand.tsx` | 首页深色数据带（服务端输出真实经营指标，避免首屏动画运行时） |
| `components/InstantSearch.tsx` | 顶部即时搜索（combobox/listbox ARIA 语义、键盘可选、单层聚焦边框） |
| `components/CookieConsent.tsx` | Cookie 同意横幅（底部横向条幅；同意后才注入 GA；偏好存 `localStorage`；撤回时经 `lib/consent.ts` 立即停用已加载的 GA） |
| `lib/consent.ts` | 分析同意状态单一来源：`hasAnalyticsConsent()` / `syncAnalyticsConsent()`（停用 GA、派发同意变更事件）与存储 key / 同意版本 |
| `components/CookieSettingsTrigger.tsx` | 页脚「Cookie Settings」重开入口（派发 `cookie-settings:open` 事件） |
| `components/ProductViewTracker.tsx` | 产品详情页 GA4 `product_view` 事件打点（客户端组件，useEffect 触发） |
| `components/CtaButton.tsx` | 转化型 CTA 客户端包装：`InteractiveHoverButton` + `onClick` + GA4 `cta_click` 事件 |
| `lib/analytics.ts` | GA4 事件追踪 — `trackEvent()` 安全封装：先读当前同意状态，未同意或无 gtag 时静默跳过（撤回同意后即使 gtag 仍在也不发送） |
| `components/HomeCtaSection.tsx` | 首页底部转化 CTA 区块（客户端组件，承载 InteractiveHoverButton） |
| `components/ui/interactive-hover-button.tsx` | Magic UI 风格交互悬停按钮（dot 展开 + 文字滑出 + 箭头滑入；纯 CSS 过渡，`fill` 自定义悬停色） |

---

## Hover 效果规范

所有 hover 视觉动效均使用 **CSS**（Tailwind `hover:` / `group-hover:` 类 + `transition`），不使用 JS 动画库；CTA 的导航跳转由客户端 `onClick`（如 `CtaButton`、`Header`）处理，与 hover 动效解耦。

| 元素 | 效果 | 实现 |
|------|------|------|
| 导航链接 | 黑→红 `#d4343e`，0.3s | `hover:text-[#d4343e] transition-colors duration-300` |
| 下拉菜单项 | 黑→红 `#d4343e`，0.15s | `hover:text-[#d4343e] transition-colors duration-150` |
| 转化型 CTA（InteractiveHoverButton） | 白底红框 → hover 红点 `scale-[100.8]` 铺满变红底、文字滑出箭头滑入（`fill="bg-[#d4343e]"`） | 纯 CSS `group-hover` 过渡，无 JS 动画库 |
| 工具/功能按钮 | Blue→Blue Hover | `hover:bg-[#3561CC] transition-colors duration-300` |
| 产品卡片 | 红框 `#d4343e` + shadow-lg + 图片 scale(1.03) + 标题变红 | CSS `hover:` 类 |
| 新闻卡片 | 蓝框 `#3E6AE1` + shadow-sm + 图片 brightness(1.06) + 标题变蓝 | CSS `hover:` 类 |
| 时间轴节点 | 红底圆圈 + 数字变白 | CSS `hover:` 类 |

---

## 性能优化（弱网/低端设备）

| 优化项 | 文件 | 效果 |
|--------|------|------|
| React `cache()` 请求去重 | `lib/api/*.ts` — `getProductBySlug` | `generateMetadata` + 页面组件共享同一个请求 |
| Streaming + Suspense | `app/page.tsx` | 首页静态区块先出，数据区块流式填充 |
| 产品详情 Suspense | `app/products/[...slug]/page.tsx` | 相关产品不阻塞主内容渲染 |
| 骨架屏 loading.tsx | 5 个 loading.tsx 文件 | 路由切换零白屏 |
| 顶部进度条 | `components/NavigationProgress.tsx` | 点击即反馈，品牌红 #d4343e |
| AVIF/WebP 图片 | `next.config.ts` — `images.formats` | 图片体积减 30-50% |
| 字体 display: "swap" | `app/layout.tsx` — Geist 字体 | 消除文字不可见闪烁（FOIT） |
| `apiFetch()` 统一封装 | `lib/api/client.ts` | 所有 API 调用共享 ISR revalidate 逻辑 |
| Tree-shaking | `next.config.ts` — `optimizePackageImports` | framer-motion / lucide-react 按需加载 |
| 卡片回归 RSC | `SafeImage.tsx` + `ProductCard/PostCard` | 图片兜底逻辑下沉到客户端子组件，卡片本体为服务端组件，减少 hydration |
| 首屏图片优先级 | `HeroSection.tsx`、`Header.tsx`、`SafeImage.tsx` | Hero/Logo 和首个 LCP 候选使用 `preload`；`SafeImage` 默认 `loading="lazy"` |
| 动态组件分包 | `app/about/page.tsx` | 时间轴与证书画廊用 `next/dynamic` 拆分客户端代码；不等同于视口触发加载 |
| 视频延迟请求 | `FactoryVideo.tsx` | poster 首先展示，`preload="none"`，用户点击播放后加载视频 |
| 地图按需加载 | `ContactMapLoader.tsx` | `next/dynamic({ ssr:false })`，Leaflet 仅在联系页客户端加载，不进服务端首屏 bundle；当前不是 IntersectionObserver 视口懒加载 |
| 列表错误降级 | `app/products`、`app/news` | fetch 加 try/catch，后端异常时渲染「暂不可用+重试」而非整页 error |
| 可访问性 | `app/layout.tsx` + `globals.css` | 全站 skip-link 跳主内容 + 全局 focus-visible 焦点环；外链补 `rel="noopener"` |

---

## 环境变量

配置文件：`.env.local`（开发）/ `.env.example`（模板）

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `NEXT_PUBLIC_API_URL` | FastAPI 后端地址 | `http://localhost:8000` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 测量 ID；仅用户接受「分析」Cookie 后才加载，未配置则零追踪 | （可选） |
| `NEXT_PUBLIC_SITE_URL` | 前端站点地址 | `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | 默认站点描述（SEO） | `Songdian Technology...` |
| `NEXT_PUBLIC_IMAGE_HOST` | Next.js 图片优化允许的后端主机（不含协议） | `api.zsaki.icu` |
| `REVALIDATE_SECRET` | 与后端共享的 ISR 按需刷新密钥；校验 `/api/revalidate` | 与后端一致 |

> SMTP 已迁移到 FastAPI 后端和管理后台“系统设置”；frontend 不配置 SMTP 口令。
> SMTP 主机、端口、口令和询盘收件地址由后端/管理后台“系统设置”维护。未配置时询盘仍保存到 PostgreSQL；frontend 不使用或保存任何 SMTP 配置。

---

## 图片管理

- **Logo**：`public/logo.png`（本地）
- **产品图 / 文章图**：通过 FastAPI 后端管理（管理后台上传，`/uploads/` 提供静态文件服务）
- **媒体引用查询**：管理后台调用 `GET /api/v1/admin/upload/{id}/usage` 展示产品图库、产品封面、新闻封面，以及产品和新闻**正文**中引用图片的使用位置（URL 已按归一化形式比较）；被引用素材删除前由后端拦截确认，仅被正文引用的图片同样受保护。
- **上传归档**：产品表单通过 `product:{slug}` 归入 `Products / {slug}`，新闻表单通过 `news:{slug}` 归入 `News / {slug}`；slug 为空时进入“未分类”。这是媒体库相册归属，物理文件仍由后端按其存储策略保存，不能据此拼接 URL。
- **OG 图**：`lib/media.ts` 配置
- **产品相册**：附属于产品，管理后台表单管理
- **展会图片**：`public/Exhibitions/` 目录增删文件

---

## 数据集

| 内容 | 数量 | FastAPI 端点 |
|------|------|-------------|
| 产品 | 42 | `/api/v1/products` |
| 产品分类 | 6 | `/api/v1/product-categories` |
| 新闻 | 9 | `/api/v1/news` |
| 新闻分类 | 2 | `/api/v1/news-categories` |

---

## 常用修改路径

| 需求 | 操作 |
|------|------|
| 改产品/新闻 | 管理后台 `../admin-next/`（:3001） |
| 改文案 | `lib/content-data.ts` |
| 改图片 | 通过管理后台 Media 页面上传 |
| 改导航 | `components/Header.tsx` NAV_LINKS |
| 改配色 | `globals.css` CSS 变量 |
| 改询盘表单 | `components/form/InquiryForm.tsx` |
| 改询盘收件邮箱 | 管理后台“系统设置”中的询盘 SMTP 配置 |
| 添加重定向 | `next.config.ts` → `redirects()` |
| 新闻详情样式乱 | 历史富文本 HTML 遗留，由 `html-cleaner.ts` 自动清洗（去内联样式）+ `sanitize-html` 白名单消毒 |

---

## E2E 测试（Playwright）

套件在 `e2e/`（12 个 spec），入口 `npm run test:e2e`。**必须三个服务齐活**：后端 `:8000`、官网 `:3000`、后台 `:3001`。

```bash
NODE_OPTIONS= \
  E2E_FRONTEND_URL=http://localhost:3000 \
  E2E_ADMIN_URL=http://localhost:3001 \
  E2E_API_URL=http://127.0.0.1:8000 \
  ./node_modules/.bin/playwright test --reporter=line
```

> ⚠️ **本地 dev 模式**下用例地址要用 `localhost`，不要用 `127.0.0.1`：Next 16 的开发服务器对 `/_next/*`
> 做同源校验，`Origin: http://127.0.0.1:3000` 的 chunk 请求返回 **403** → JS 不加载 → 页面不注水 →
> 交互用例静默全挂。**CI 不受影响**：CI 用 `npm run start`（生产构建）启动，那里 `127.0.0.1` 是正常的，
> `playwright.config.ts` 的默认 `baseURL` 也保持 `127.0.0.1:3000`。后端 `E2E_API_URL` 两种模式都用 `127.0.0.1`。

### 交互用例必须等 React 注水（重要约定）

`page.goto()` / `page.reload()` 在 **window load** 就返回。此时 SSR 产出的 DOM 已可读写
（`fill()` 能成功、元素能点到），但 **React 还没接管事件处理器**。若紧接着 `click()` / `check()`，
操作会打在“没有事件处理器”的 DOM 上，产生**假失败**：操作无效、无网络请求、无任何报错。
dev 首次编译慢或多进程并发（`workers: 2`）时稳定复现。

因此新增/修改用例时：

- 用 `e2e/hydration.ts` 的 `gotoHydrated(page, url)` 代替裸 `page.goto()`；
- `page.reload()` 之后补一行 `await waitForHydration(page)`；
- **不要用 `waitUntil: "networkidle"` 代替** —— dev 下网络静默会早于注水完成，不可靠。

```ts
import { gotoHydrated, waitForHydration } from "./hydration";

await gotoHydrated(page, "/contact");   // 打开并等注水
await page.getByRole("button").click(); // 此时交互才安全
```

典型症状（见到就往这个方向查，**别去查服务端**）：

| 症状 | 说明 |
|------|------|
| 点登录后整页跳转且没有发出登录请求 | `<button type="submit">` 尚未被 React 接管，浏览器走了**原生表单提交**（`admin-next` 登录表单已显式 `method="post"`，凭据不会进入 URL；旧版本未声明 method，会以 GET 把口令写进查询串） |
| checkbox 勾了但“发布选中”按钮不出现 | 只改了 DOM，React 状态没更新 |
| 移动端抽屉不收起、下拉菜单不弹出 | 同上 |
| 搜索 `waitForRequest` 超时 | 防抖逻辑未接管，压根不发请求 |

注水判定式（本机实测，注水耗时约 350ms）：`document.body` 上出现 `__reactProps$…` / `__reactFiber$…`。

### 夹具必须清理

用例用固定标题建内容（产品/新闻/询盘），**必须在 `finally` 中删除**。否则残留的已发布内容
会真实出现在官网上，且下一轮同标题会触发 `getByRole` 的 strict mode violation。
注意定时发布（`SCHEDULED`）的夹具若不清理，计划时间一到会被调度器真正发布。

### 其他注意

- `playwright.config.ts` 已固定 `workers: 2`；本机常有 3 个 dev server 并存，调高并行会因机器过载出现 teardown 超时（不是用例失败）。
- 套件启动/结束会清理 `test-results/`，失败用例的 trace/video 体积很大，跑前建议先手动清空该目录。
- 管理端是 HttpOnly Cookie 认证：登录响应体**不含 token**，需从 `Set-Cookie` 取；`admin` 连续 5 次密码错会锁定 15 分钟。

---

## 生产部署

| 项目 | 值 |
|------|-----|
| 服务器 | 腾讯云 + 1Panel Linux 面板 |
| 前端 | GHCR 镜像 + Docker Compose，容器端口 3000 |
| 后端 | GHCR 镜像 + Docker Compose，Uvicorn 端口 8000 |
| 管理后台 | GHCR 镜像 + Docker Compose，容器端口 3001 |
| 反向代理 | 1Panel OpenResty |
| 部署文档 | `deploy-guide.md` |

---

## 通信风格

- 用户为中文母语者，用简体中文回复
- 用户关注细节（布局对齐、间距、hover 效果）
- 偏好现代简洁设计，不喜欢冗余装饰
- 修改代码前先读文件确认当前状态
- 面向全球 B2B 采购商，所有用户可见文案使用英文

---

## 代码审查修复（2026-07-28）

`lib/types.ts` 已清理 WordPress/WooCommerce 原始结构类型（死代码）：移除 WP 核心全量类型与
`WCProductTag` / `WCProductAttribute` / `WCProduct`，仅保留仍被应用层类型引用的
`WCProductImage` / `WCProductCategory` / `WCAttribute`。当前类型以 `lib/types.ts` 和实际使用处为准。

## 审计修复（2026-07-31）

P0 级审计修复（相关行为已合入当前代码）：
- **产品 SEO**：`ProductDetail` 类型新增 `seoTitle` / `seoDescription` 字段。产品详情页 `generateMetadata` 优先读这两个字段，空则回退原有的 title/content_html 截取。Open Graph 同步使用 SEO 值。
- **GA4 事件追踪**：新增 5 个自定义事件 —— `cta_click`（CtaButton + HomeCtaSection）、`product_view`（ProductViewTracker）、`contact_submit`（InquiryForm）。`lib/analytics.ts` 安全封装，无 GA ID 或未同意 Cookie 时静默跳过；撤回同意后立即停止发送并停用已加载的 GA（见 `lib/consent.ts`）。
- **FAQ 嵌入能力**：`lib/content-data.ts` 的 FAQ 条目支持可选 `productCategories: string[]` 字段。

## 生产构建与 HTTP 兼容修复（2026-08-01）

- **询盘提交 randomUUID 兼容**：`components/form/InquiryForm.tsx` 的 `crypto.randomUUID()` 在 HTTP（非 HTTPS，如 IP 直连）环境不存在（非安全上下文）——已加 fallback：可用则 `randomUUID()`，否则 `inq-${Date.now()}-${Math.random()...}`。勿改回直接调用。
- **首页预渲染兜底**：`app/page.tsx` 的 `NewsSection` 对 `getPosts()` 加 `.catch(() => ({ posts: [], pagination: null }))`——`docker compose build` 时后端未启动不会因预渲染 404 失败（降级空数据，运行时正常拉取）。新增首页数据区块时**必须**带同类兜底，否则生产构建会挂。

## 官网社交、GEO 与静态媒体（2026-08-27）

- 默认社交图为 `public/og/og-default.jpg`（1200×630）；产品和新闻详情必须显式输出 Twitter metadata，有内容图时优先使用，无图时回退默认图。
- `app/llms.txt/route.ts` 是实验性 AI 站点导览。必须区分 2023 年成立的 Songdian Technology 法律实体和 2006 年开始的集团制造历史，不得把二者合并为同一成立年份。
- `scripts/generate-og-assets.mjs` 通过 `npm run generate:social-assets` 生成默认 OG JPEG 与 `public/Video/factory-poster.webp`。
- About 页工厂视频使用 `preload="none"`、WebP poster 和可选 WebM source；MP4 为兼容回退。视频与 poster 都是随 frontend 镜像发布的静态源码资产。
- `ALLOW_LOCAL_IMAGE_OPTIMIZATION=true` 仅用于本地 loopback/局域网图片调试；生产环境必须关闭或不设置。
  该开关在 `next.config.ts` 里已被 `NODE_ENV !== "production"` 硬门槛包住：**生产构建即使显式设为 `true` 也恒为 `false`**。
  本地若 `NEXT_PUBLIC_API_URL` 指向 loopback 而开关没开，开发模式启动时会打印可操作告警（`[next.config]` 前缀）。

## 官网界面与导航优化（2026-09-01）

- Header 在 `lg` 断点切换桌面导航与移动菜单；搜索框和 Request Quote 不在平板宽度与主导航争抢空间。
- Header 站内链接使用 `scroll={false}` 配合显式顶部重置，确保从 Home 任意滚动位置进入 About 等页面时从首屏开始；About 的首屏顺序为 `Who We Are / Our Story`，`Our Journey` 在下一段。
- `InstantSearch` 聚焦态保留单层品牌红边框，通过 `data-focus-visible="none"` 避免全局焦点环叠加成双层边框；键盘操作和可见聚焦状态仍需保留。
- Footer 的 Facebook、YouTube、Instagram、TikTok 统一使用 `44×44px` 图标槽位；无链接平台也必须占位并提示 `coming soon`，不得让图标间距随链接状态改变。
- 首页 Hero 在 `xl`（≥1280px）宽屏使用上左布局，沿 `site-container` 左侧对齐，标题列放宽至 `980px`；`Explore Products` / `Get a Quote` 必须避开固定 56px 询盘栏。
- Hero 的 Scroll 提示按视口高度安全定位，避免内容撑高时落入底部浮层；本次回归覆盖 1920×920、1440×900、1024×768 和 390×844。

## 同意、规范化 URL 与分页约定（2026-09-12）

- **分析同意可撤回**：同意状态的唯一来源是 `lib/consent.ts`。撤回时除写 `localStorage` 外必须调用 `syncAnalyticsConsent()`（写入 GA 禁用标记并发送 Consent 拒绝信号）并派发变更事件；`trackEvent()` 必须先读同意状态。组件**不得**只判断 `typeof window.gtag === "function"` 决定是否发送。
- **产品 URL 规范化在运行时解析**：`proxy.ts` 调后端 `GET /api/v1/products/{slug}/canonical`（60 秒短缓存，只缓存后端的明确响应），后端返回 404 时不回退静态映射，避免把已下架产品重定向到旧分类地址。`lib/generated/canonical-map.ts` 仅作后端不可达兜底；搜索接口返回的 `url` 已是规范嵌套地址，禁止在前端重新拼接扁平路径。
- **列表分页 canonical**：产品与新闻列表页按有效 `page` 生成自身 canonical（保留 `category` 参数、`page=1` 去掉该参数）；非数字或 <1 的页码按首页处理；超出总页数时 canonical 回落首页并输出 `robots: noindex`。新增列表页时不要写死 canonical。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
