# Songdian Technology — 松典科技 B2B 官网

> AGENTS.md — 新会话快速上手指南。所有关键信息集中在这里，避免每次从头探索。

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
| 表单 | react-hook-form + Zod + Server Actions |
| SEO | next-super-meta + JSON-LD 结构化数据 |
| 动画 | framer-motion |
| 路由 | App Router（ISR 60s + Streaming SSR） |
| 性能 | React `cache()` 请求去重 + Suspense 流式渲染 + 骨架屏 |

## 项目路径

```
本地: C:\Users\Administrator\Desktop\Front-end project\full-stack-project\frontend
后端: C:\Users\Administrator\Desktop\Front-end project\full-stack-project\backend（FastAPI :8000）
管理后台: C:\Users\Administrator\Desktop\Front-end project\full-stack-project\admin-next（Next.js :3001）
服务器: /home/ubuntu/songdianweb
```

### 本地启动

```bash
npm run dev → http://localhost:3000
```

> ⚠️ 本机沙箱 `npm run dev` 可能 fork 失败（EAGAIN），改用：
> `node_modules/next/dist/bin/next dev -p 3000`

### 服务器启动（PM2）

PM2 保活，端口 3000，通过 1Panel OpenResty 反向代理到 80 端口。

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
| `/products/[...slug]` | FastAPI 产品详情 + 相册 | ISR 60s + Suspense；规范地址 `/products/{category}/{slug}`，旧扁平地址经 `proxy.ts` 308 重定向 |
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

> 注：路由级重定向在 `next.config.ts`；**产品 URL 规范化的 308 在根目录 `proxy.ts`**（因本环境页面级 `redirect()` 不生效，见 README「已知注意事项」）。

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
| `components/Header.tsx` | 导航栏（白底黑字，品牌红 hover，CSS transition） |
| `components/Footer.tsx` | 页脚 |
| `components/NavigationProgress.tsx` | 顶部路由切换进度条（品牌红 #d4343e，零依赖） |
| `components/motion/HeroSection.tsx` | 首页 Hero |
| `components/ProductCard.tsx` | 产品卡片（服务端组件 RSC，图片走 SafeImage 兜底；hover 红框+阴影+缩放） |
| `components/ProductGallery.tsx` | 产品详情页左侧缩略图+右侧大图（next/image + priority） |
| `components/PostCard.tsx` | 新闻卡片（服务端组件 RSC，图片走 SafeImage 兜底；hover 蓝框+阴影+亮度变化） |
| `components/SafeImage.tsx` | 客户端图片组件（仅处理 onError 换占位），供 RSC 卡片复用，减少 hydration |
| `components/ContactMapLoader.tsx` | 客户端加载器，`next/dynamic({ ssr:false })` 按需引入 Leaflet，不进首屏 bundle |
| `components/StatsBand.tsx` | 首页深色数据带（真实经营指标 + 数字滚动 count-up 入场，framer-motion） |
| `components/InstantSearch.tsx` | 顶部即时搜索（combobox/listbox ARIA 语义，键盘可选） |
| `components/CookieConsent.tsx` | Cookie 同意横幅（底部横向条幅；同意后才注入 GA；偏好存 `localStorage`） |
| `components/CookieSettingsTrigger.tsx` | 页脚「Cookie Settings」重开入口（派发 `cookie-settings:open` 事件） |
| `components/ProductViewTracker.tsx` | 产品详情页 GA4 `product_view` 事件打点（客户端组件，useEffect 触发） |
| `components/CtaButton.tsx` | 转化型 CTA 客户端包装：`InteractiveHoverButton` + `onClick` + GA4 `cta_click` 事件 |
| `lib/analytics.ts` | GA4 事件追踪 — `trackEvent()` 安全封装（无 gtag 时静默跳过） |
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
| 地图按需加载 | `ContactMapLoader.tsx` | `next/dynamic({ ssr:false })`，Leaflet 仅在联系页加载，不进首屏 bundle |
| 列表错误降级 | `app/products`、`app/news` | fetch 加 try/catch，后端异常时渲染「暂不可用+重试」而非整页 error |
| 可访问性 | `app/layout.tsx` + `globals.css` | 全站 skip-link 跳主内容 + 全局 focus-visible 焦点环；外链补 `rel="noopener"` |

---

## 环境变量

配置文件：`.env.local`（开发）/ `.env.example`（模板）

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `NEXT_PUBLIC_API_URL` | FastAPI 后端地址 | `http://localhost:8000` |
| `NEXT_PUBLIC_ISR_REVALIDATE` | ISR 重新验证间隔（秒） | `60` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 测量 ID；仅用户接受「分析」Cookie 后才加载，未配置则零追踪 | （可选） |
| `NEXT_PUBLIC_SITE_URL` | 前端站点地址 | `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_NAME` | 站点名称（SEO） | `Songdian Technology...` |
| `NEXT_PUBLIC_IMAGE_HOST` | Next.js 图片优化允许的后端主机（不含协议） | `106.53.220.184` |

> SMTP 已迁移到 FastAPI 后端和管理后台“系统设置”；frontend 不配置 SMTP 口令。

---

## 图片管理

- **Logo**：`public/logo.png`（本地）
- **产品图 / 文章图**：通过 FastAPI 后端管理（管理后台上传，`/uploads/` 提供静态文件服务）
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
| 改询盘收件邮箱 | `.env.local` → `INQUIRY_EMAIL_TO` |
| 添加重定向 | `next.config.ts` → `redirects()` |
| 新闻详情样式乱 | 历史富文本 HTML 遗留，由 `html-cleaner.ts` 自动清洗（去内联样式）+ `sanitize-html` 白名单消毒 |

---

## 生产部署

| 项目 | 值 |
|------|-----|
| 服务器 | 腾讯云 + 1Panel Linux 面板 |
| 前端 | PM2 保活，端口 3000 |
| 后端 | FastAPI，端口 8000，uvicorn |
| 管理后台 | PM2 保活或静态导出 |
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
`WCProductImage` / `WCProductCategory` / `WCAttribute`。详见 `../backend/CODE_REVIEW_REMEDIATION.md` #9。

## 审计修复（2026-07-31）

P0 级审计修复（详见 `../audit_verification_report.md`）：
- **产品 SEO**：`ProductDetail` 类型新增 `seoTitle` / `seoDescription` 字段。产品详情页 `generateMetadata` 优先读这两个字段，空则回退原有的 title/content_html 截取。Open Graph 同步使用 SEO 值。
- **GA4 事件追踪**：新增 5 个自定义事件 —— `cta_click`（CtaButton + HomeCtaSection）、`product_view`（ProductViewTracker）、`contact_submit`（InquiryForm）。`lib/analytics.ts` 安全封装，无 GA ID 或未同意 Cookie 时静默跳过。
- **FAQ 嵌入能力**：`lib/content-data.ts` 的 FAQ 条目支持可选 `productCategories: string[]` 字段。

## 生产构建与 HTTP 兼容修复（2026-08-01）

- **询盘提交 randomUUID 兼容**：`components/form/InquiryForm.tsx` 的 `crypto.randomUUID()` 在 HTTP（非 HTTPS，如 IP 直连）环境不存在（非安全上下文）——已加 fallback：可用则 `randomUUID()`，否则 `inq-${Date.now()}-${Math.random()...}`。勿改回直接调用。
- **首页预渲染兜底**：`app/page.tsx` 的 `NewsSection` 对 `getPosts()` 加 `.catch(() => ({ posts: [], pagination: null }))`——`docker compose build` 时后端未启动不会因预渲染 404 失败（降级空数据，运行时正常拉取）。新增首页数据区块时**必须**带同类兜底，否则生产构建会挂。
