# Songdian Technology — B2B 外贸官网（Next.js + FastAPI）

松典科技（广东）有限公司面向全球 OEM / ODM 数码相机采购商的 B2B 展示型官网。前端为 **Next.js（App Router）**，通过项目自有 FastAPI 后端获取产品/新闻/分类数据，支持 ISR 增量静态再生 + Streaming SSR。

> 定位：面向全球 OEM / ODM 数码相机采购商。设计语言为「Tesla 极简」——无阴影、靠 border 分隔、品牌红仅用于激活态、Electric Blue 仅用于 CTA。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16.2.10（App Router，默认 Turbopack）+ React 19.2.4 |
| 语言 | TypeScript 5（`strict: true`） |
| 样式 | Tailwind CSS v4（`@tailwindcss/postcss`）+ shadcn/ui 组件库 |
| 后端 | 项目自有 FastAPI REST API（`backend/`，端口 8000） |
| 数据迁移 | 旧 WordPress 数据经一次性 ETL 迁至 PostgreSQL（`backend/migration/` 模块已随 M6 移除），前端仅消费 FastAPI |
| 表单 | react-hook-form + Zod（客户端校验 + 服务端 action 提交） |
| 邮件 | nodemailer SMTP（询盘通知，可选配置） |
| 动画 | framer-motion（`components/motion/*`） |
| 图标 | lucide-react（`^1.23.0`） |
| HTML 消毒 | `sanitize-html`（服务端白名单过滤，`lib/html-cleaner.ts`） |
| 地图 | Leaflet（经 `components/ContactMapLoader.tsx` 用 `next/dynamic({ ssr:false })` 按需加载，不进首屏 bundle） |
| SEO | next-super-meta（元信息）+ `lib/seo.ts`（JSON-LD 结构化数据）+ `app/robots.ts` / `app/sitemap.ts` |
| 性能 | React `cache()` 请求去重 + Streaming SSR + Suspense 边界 + 5 个 loading.tsx 骨架屏 + 顶部进度条 |

---

## 环境要求

- **Node.js** ≥ 24（Next.js 16 Turbopack 需要 Node 24，Node 22 的 Web Streams 与 `next/image` 远程优化不兼容）
- **FastAPI 后端** 运行在 `localhost:8000`（前端直接调用后端 API）
- 包管理器：`npm`

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

> ⚠️ **沙箱环境** 下 `npm run dev` 可能因 fork 限制失败（EAGAIN），改用：
> `"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3000`
>
> 注意：本机已装 Node 24.18.0 at `C:\Program Files\nodejs\node.exe`，
> 必须用 Node 24 而非默认的 Node 22 启动。不能用 `node_modules/.bin/next`（bash wrapper），
> Node 24 直接执行会 SyntaxError，须直调 JS 入口 `next/dist/bin/next`。

生产构建：
```bash
npm run build
npm run start
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | FastAPI 后端地址 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | 站点规范地址 |
| `NEXT_PUBLIC_SITE_NAME` | `Songdian Technology...` | 站点名称（SEO） |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | — | 站点描述（SEO） |
| `NEXT_PUBLIC_ISR_REVALIDATE` | `60` | ISR 缓存时间（秒） |
| `NEXT_PUBLIC_GA_ID` | — | Google Analytics 4 测量 ID（如 `G-XXXX`）。**仅当用户在 Cookie 同意横幅接受「分析」类后才加载**；不配置则 GA 完全不加载，站点零追踪 |

### SMTP 邮件通知（可选）

配置后，Contact 页询盘提交会自动发送邮件通知。不配置则仅保存到 `data/inquiries.json`。

| 变量 | 示例 | 说明 |
|------|------|------|
| `SMTP_HOST` | `smtp.qq.com` | SMTP 服务器地址 |
| `SMTP_PORT` | `587` | 端口（TLS=587, SSL=465） |
| `SMTP_USER` | `xxx@qq.com` | 发件邮箱完整地址 |
| `SMTP_PASS` | 授权码 | **必须是授权码，非登录密码** |
| `INQUIRY_EMAIL_TO` | `zengxb21@proton.me` | 接收通知的邮箱 |
| `INQUIRY_EMAIL_FROM` | — | 发件人显示地址（默认取 SMTP_USER） |

建议在项目根目录创建 `.env.local` 按需覆盖（不入库）。

---

## 项目结构

```
frontend/
├─ app/                         # App Router 路由（页面）
│  ├─ layout.tsx                # 根布局：字体(Geist + display:swap)、全局 SEO、JSON-LD、Header/Footer/FloatingInquiry/NavigationProgress
│  ├─ globals.css               # Tailwind v4 + 设计令牌（CSS 变量）
│  ├─ page.tsx                  # 首页（Streaming SSR：4 个 Suspense 边界）
│  ├─ error.tsx                 # 全局错误边界（重试 + 返回首页）
│  ├─ loading.tsx               # 全局加载骨架屏
│  ├─ not-found.tsx             # 自定义 404 页面
│  ├─ about/                    # 关于我们（静态）
│  ├─ solutions/                # 解决方案概览（静态）
│  │  └─ faq/                   # 常见问题（粘性目录 + 锚点直达）
│  ├─ products/                 # 产品列表 + 分类筛选（ISR）
│  │  ├─ loading.tsx            # 产品列表骨架屏
│  │  └─ [slug]/                # 产品详情 + 相册 + 规格（ISR，Suspense 异步加载相关产品）
│  ├─ news/                     # 新闻列表 + 置顶（ISR）
│  │  └─ [slug]/                # 新闻详情（ISR）
│  ├─ search/                   # 全站搜索页
│  ├─ contact/                  # 联系页：表单 + Leaflet 地图 + SMTP 邮件通知
│  ├─ privacy-policy/           # 隐私政策
│  ├─ robots.ts                 # /robots.txt
│  └─ sitemap.ts                # /sitemap.xml
│
├─ components/
│  ├─ Header.tsx / Footer.tsx   # 站点导航与页脚（Footer 为 Server Component）
│  ├─ NavigationProgress.tsx    # 顶部路由进度条（品牌红 #d4343e）
│  ├─ FloatingInquiry.tsx       # 全站底部常驻询盘栏
│  ├─ Breadcrumbs.tsx           # Tesla 风格面包屑
│  ├─ ProductCard.tsx           # 产品卡片（RSC，图片用 SafeImage 兜底）
│  ├─ SafeImage.tsx             # 图片加载失败占位（客户端子组件，卡片本体保持 RSC）
│  ├─ ProductGallery.tsx        # 产品图集（客户端缩略图切换）
│  ├─ PostCard.tsx              # 文章卡片（RSC，图片用 SafeImage 兜底）
│  ├─ NewsGrid.tsx              # 文章网格
│  ├─ ExhibitionMarquee.tsx     # 展会图片横向滚动墙
│  ├─ FaqToc.tsx                # FAQ 分类目录（滚动高亮 + 平滑锚点跳转）
│  ├─ ContactMap.tsx            # Leaflet 地图（客户端动态加载）
│  ├─ ContactMapLoader.tsx     # Leaflet 按需加载包装（next/dynamic ssr:false）
│  ├─ StatsBand.tsx             # 首页深色数据带（framer-motion count-up）
│  ├─ InstantSearch.tsx         # 顶部即时搜索框（combobox/listbox ARIA）
│  ├─ CertificateGallery.tsx    # 证书 Lightbox 画廊
│  ├─ FactoryVideo.tsx          # 工厂视频播放器
│  ├─ SpotlightCard.tsx         # 鼠标聚光灯卡片
│  ├─ AnimatedCounter.tsx       # 数字滚动动画
│  ├─ form/                     # InquiryForm + FormField（RHF + Zod）
│  ├─ motion/                   # framer-motion 封装
│  ├─ CookieConsent.tsx         # Cookie 同意横幅（底部横向条幅：左文案右按钮；同意后才注入 GA）
│  ├─ CookieSettingsTrigger.tsx # 页脚「Cookie Settings」重开入口（派发 cookie-settings:open 事件）
│  └─ ui/                       # shadcn/ui 基础组件
│
├─ lib/
│  ├─ api/                      # FastAPI 客户端（products / news / search / categories）
│  │  └─ client.ts              # 统一 fetch 封装（支持 ISR revalidate / no-store / tags）
│  ├─ html-cleaner.ts           # 正文 HTML 清洗 + sanitize-html 白名单消毒
│  ├─ content-data.ts           # 全站可编辑文案
│  ├─ inquiry-service.ts        # 询盘服务端 action（文件持久化 + SMTP）
│  ├─ seo.ts                    # 结构化数据：organization / breadcrumb / article / product / faq
│  ├─ media.ts                  # 图片资源映射
│  ├─ site-config.ts            # 页脚链接等静态配置
│  ├─ coord-transform.ts        # 地图坐标转换工具
│  ├─ exhibitions.ts            # 展会图片动态读取
│  ├─ types.ts                  # API 响应与前端应用层类型
│  └─ utils.ts                  # cn() 等通用工具
│
├─ data/                        # 运行时数据（不入库）
│  └─ inquiries.json            # 询盘记录
│
├─ public/                      # 静态资源（logo.png、展会图片、社媒图标等）
├─ next.config.ts               # 图片优化（AVIF/WebP）+ 生产配置 + 重定向
├─ postcss.config.mjs           # Tailwind v4 postcss 插件
├─ tsconfig.json                # 路径别名 @/* → 项目根
└─ package.json
```

---

## 数据来源

本前端通过项目自有 **FastAPI 后端**（`../backend/`）的 REST API 获取所有数据：

| 数据类型 | API 端点 | 说明 |
|---|---|---|
| 产品列表 | `GET /api/v1/products` | 分页 + 分类筛选 + 排序 |
| 产品详情 | `GET /api/v1/products/{slug}` | 含 tags / galleries / attributes |
| 新闻列表 | `GET /api/v1/news` | 分页 |
| 新闻详情 | `GET /api/v1/news/{slug}` | 含 content_html |
| 产品分类 | `GET /api/v1/product-categories` | 只读列表 |
| 新闻分类 | `GET /api/v1/news-categories` | 只读列表 |
| 全文搜索 | `GET /api/v1/search` | 关键词 + 类型过滤 |
| 询盘提交 | `POST /api/v1/inquiries` | 表单数据（幂等键防重） |

> 数据来源已从 WordPress ETL 迁移到 FastAPI，后续通过管理后台（`../admin-next/`）维护。

---

## 路由与渲染策略

| 路由 | 数据来源 | 渲染 |
|------|---------|------|
| `/` | FastAPI + `content-data.ts` | ISR 60s + **Streaming**（4 个 Suspense 边界） |
| `/products` | FastAPI 产品列表 + 分类筛选 | ISR 60s |
| `/products/[slug]` | FastAPI 产品详情 + 相关产品 | ISR 60s + **Suspense** |
| `/news` | FastAPI 新闻列表 | ISR 60s |
| `/news/[slug]` | FastAPI 新闻详情 | ISR 60s |
| `/search` | FastAPI 全文搜索 | SSR（实时 `no-store`，新内容即时可搜） |
| `/about` | `content-data.ts` 静态内容 | 静态 |
| `/solutions` | `content-data.ts` | 静态 |
| `/solutions/faq` | `content-data.ts` | 静态（revalidate 3600s） |
| `/contact` | 联系表单 + Leaflet 地图 + SMTP | 静态 |

### 重定向（308 永久）

| 旧路由 | 新路由 | 原因 |
|--------|--------|------|
| `/services` | `/solutions` | 路由重构 |
| `/services/faq` | `/solutions/faq` | 同上 |
| `/blog` | `/news` | 统一命名 |
| `/blog/:slug*` | `/news/:slug*` | 同上 |
| `/inquiry` | `/contact` | 询盘入口统一到联系页 |

---

## 设计系统

| 令牌 | 值 | 用途 |
|------|----|------|
| Electric Blue | `#3E6AE1` | 主 CTA 按钮 |
| Electric Blue Hover | `#3561CC` | CTA hover 态 |
| 品牌红 | `#d4343e` | 导航 hover/激活态、Logo 中 GD 红、进度条颜色 |
| Carbon Dark | `#171A20` | 标题 + Hero 区域底色 |
| Graphite | `#393C41` | 正文 |
| Pewter | `#5C5E62` | 辅助文字/描述 |
| Light Ash | `#F4F4F4` | 卡片/区域背景 |

风格约定：无阴影、仅用 `1px` border（`#EEEEEE`）分隔；圆角 4px / 12px；过渡 `transition-colors duration-300`。

---

## 内容编辑指南

| 改什么 | 在哪里改 |
|-----------|--------|
| 产品/新闻内容 | 后台管理界面（`../admin-next/`） |
| 文案 / 公司信息 / FAQ / About | `lib/content-data.ts` |
| 导航菜单项 | `components/Header.tsx` 中的 `NAV_LINKS` |
| 配色 | `app/globals.css` 的 CSS 变量 |
| 页脚链接 | `lib/site-config.ts` |
| 询盘收件邮箱 | `.env.local` 的 `INQUIRY_EMAIL_TO` |
| 展会图片 | `public/Exhibitions/` 目录增删文件 |

---

## SEO & 结构化数据

- 全局 `metadata` 定义在 `app/layout.tsx`
- JSON-LD：`Organization`、`WebSite`、`BreadcrumbList`、`Article`、`Product`、`FAQPage`、`LocalBusiness`
- `app/robots.ts` 与 `app/sitemap.ts` 自动生成

---

## 隐私与 Cookie 同意

- 官网底部以**横向条幅**呈现 Cookie 同意（`components/CookieConsent.tsx`）：左文案、右按钮（Accept all / Reject / Manage），更宽更矮，视觉沿用 Tesla 极简体系（`bg-card` + 极淡 `ring` 无阴影、Electric Blue 仅主 CTA）。
- 分类：**Strictly necessary（必要，始终开启、不可关）** 与 **Analytics（分析，opt-in）**。偏好存于 `localStorage` 键 `sd-cookie-consent`（含版本号 `v` 与时间戳）。
- **Google Analytics 仅在用户接受「分析」类 Cookie 且配置了 `NEXT_PUBLIC_GA_ID` 时才注入**（见「环境变量」），即「同意后才加载」的 GDPR/ePrivacy 合规门控；未配置则不发任何分析 Cookie。
- 页脚「Cookie Settings」（`components/CookieSettingsTrigger.tsx`）随时重新打开偏好面板。
- 后台 `admin-next` 为登录后内部工具，仅用严格必要的 `admin_token` Cookie + JWT/主题 `localStorage`，**不**展示此横幅。

---

## 部署

生产环境：**腾讯云服务器 + 1Panel Linux 面板**，自托管。详见 `deploy-guide.md`。

```bash
ssh ubuntu@106.53.220.184
cd ~/songdianweb
git pull
npm install
npm run build
pm2 restart songdian
```

---

## 已知注意事项

- **沙箱环境**：`npm run dev` 可能因 fork 限制失败，改用 `"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3000`
- **Node 24 必须**：Next.js 16.2 Turbopack 的 `next/image` 远程优化在 Node 22 下有 Web Streams 兼容性 bug（`controller[kState].transformAlgorithm is not a function`），导致 ```Jest worker``` 错误，必须用 Node ≥24
- **`next build` 在受限沙箱会被 safe-delete 防护拦死**，请用 dev server 验证
- **Leaflet 走按需加载**：`ContactMap` 经 `ContactMapLoader.tsx` 用 `next/dynamic({ ssr:false })` 包裹，仅联系页加载，不进首屏 bundle
