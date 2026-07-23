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
| 后端 | 项目 FastAPI（`localhost:8000`），数据从 WordPress ETL 迁移而来 |
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
| Electric Blue | `#3E6AE1` | 主 CTA 按钮 |
| Electric Blue Hover | `#3561CC` | CTA hover 态 |
| 品牌红 | `#d4343e` | 导航 hover/激活态 + 进度条 |
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
| `/products/[slug]` | FastAPI 产品详情 + 相册 | ISR 60s + Suspense（相关产品异步） |
| `/news` | FastAPI 新闻列表 | ISR 60s |
| `/news/[slug]` | FastAPI 新闻详情 | ISR 60s |
| `/about` | content-data.ts 静态内容 | Static |
| `/solutions` | content-data.ts 解决方案列表（OEM/ODM/经销） | Static |
| `/solutions/faq` | content-data.ts FAQ 列表 | Static |
| `/contact` | 联系表单 + Leaflet 地图 + SMTP | Static |
| `/search` | FastAPI 全文搜索 | SSR |
| `/privacy-policy` | content-data.ts 隐私政策 | Static |

### 重定向（`next.config.ts` → 308 permanent）

| 旧路由 | 新路由 | 原因 |
|--------|--------|------|
| `/services` | `/solutions` | 2026-07 路由重构 |
| `/services/faq` | `/solutions/faq` | 同上 |
| `/blog` | `/news` | 旧路径清理 |
| `/blog/:slug*` | `/news/:slug*` | 同上 |
| `/inquiry` | `/contact` | 同上 |

### 错误处理 & 加载状态

| 文件 | 职责 |
|------|------|
| `app/error.tsx` | 全局错误边界（友好错误页 + 重试按钮） |
| `app/not-found.tsx` | 全局 404 页面 |
| `app/loading.tsx` | 根级骨架屏 |
| `app/products/loading.tsx` | 产品列表页骨架屏 |
| `app/products/[slug]/loading.tsx` | 产品详情页骨架屏（两栏布局） |
| `app/news/loading.tsx` | 新闻列表页骨架屏 |
| `app/news/[slug]/loading.tsx` | 新闻详情页骨架屏 |

---

## 关键文件

| 文件 | 职责 |
|------|------|
| `lib/content-data.ts` | 全站可编辑文本（公司信息、产品分类、服务、FAQ、About 时间轴等） |
| `lib/api/client.ts` | FastAPI 客户端 — `apiFetch()` 封装 + Result 信封解析 + ISR 60s |
| `lib/api/products.ts` | 产品数据访问层（列表/详情/分类/slug） |
| `lib/api/news.ts` | 新闻数据访问层 |
| `lib/api/search.ts` | 全文搜索数据访问层 |
| `lib/inquiry-service.ts` | 询盘提交 Server Action（文件持久化 + SMTP 邮件通知） |
| `lib/seo.ts` | JSON-LD 结构化数据生成器 |
| `lib/html-cleaner.ts` | Astra 主题 HTML 清洗器（去除容器/元信息/内联样式） |
| `lib/site-config.ts` | 页脚链接等静态配置 |
| `lib/types.ts` | TypeScript 类型定义（ProductSummary, ProductDetail, WCProductCategory 等） |
| `components/Header.tsx` | 导航栏（白底黑字，品牌红 hover，CSS transition） |
| `components/Footer.tsx` | 页脚 |
| `components/NavigationProgress.tsx` | 顶部路由切换进度条（品牌红 #d4343e，零依赖） |
| `components/motion/HeroSection.tsx` | 首页 Hero |
| `components/ProductCard.tsx` | 产品卡片（hover 红框+阴影+缩放+标签） |
| `components/ProductGallery.tsx` | 产品详情页左侧缩略图+右侧大图（next/image + priority） |
| `components/PostCard.tsx` | 新闻卡片（hover 蓝框+阴影+亮度变化） |

---

## Hover 效果规范

所有 hover 效果均使用 **CSS**（Tailwind `hover:` 类 + `transition-colors`），不使用 JS 事件处理器。

| 元素 | 效果 | 实现 |
|------|------|------|
| 导航链接 | 黑→红 `#d4343e`，0.3s | `hover:text-[#d4343e] transition-colors duration-300` |
| 下拉菜单项 | 黑→红 `#d4343e`，0.15s | `hover:text-[#d4343e] transition-colors duration-150` |
| CTA 按钮 | Blue→Blue Hover | `hover:bg-[#3561CC] transition-colors duration-300` |
| 产品卡片 | 红框 `#d4343e` + shadow-lg + 图片 scale(1.03) + 标题变红 | CSS `hover:` 类 |
| 新闻卡片 | 蓝框 `#3E6AE1` + shadow-sm + 图片 brightness(1.06) + 标题变蓝 | CSS `hover:` 类 |
| 时间轴节点 | 红底圆圈 + 数字变白 | CSS `hover:` 类 |

---

## 性能优化（弱网/低端设备）

| 优化项 | 文件 | 效果 |
|--------|------|------|
| React `cache()` 请求去重 | `lib/api/*.ts` — `getProductBySlug` | `generateMetadata` + 页面组件共享同一个请求 |
| Streaming + Suspense | `app/page.tsx` | 首页静态区块先出，数据区块流式填充 |
| 产品详情 Suspense | `app/products/[slug]/page.tsx` | 相关产品不阻塞主内容渲染 |
| 骨架屏 loading.tsx | 5 个 loading.tsx 文件 | 路由切换零白屏 |
| 顶部进度条 | `components/NavigationProgress.tsx` | 点击即反馈，品牌红 #d4343e |
| AVIF/WebP 图片 | `next.config.ts` — `images.formats` | 图片体积减 30-50% |
| 字体 display: "swap" | `app/layout.tsx` — Geist 字体 | 消除文字不可见闪烁（FOIT） |
| `apiFetch()` 统一封装 | `lib/api/client.ts` | 所有 API 调用共享 ISR revalidate 逻辑 |
| Tree-shaking | `next.config.ts` — `optimizePackageImports` | framer-motion / lucide-react 按需加载 |

---

## 环境变量

配置文件：`.env.local`（开发）/ `.env.example`（模板）

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `NEXT_PUBLIC_API_URL` | FastAPI 后端地址 | `http://localhost:8000` |
| `NEXT_PUBLIC_ISR_REVALIDATE` | ISR 重新验证间隔（秒） | `60` |
| `NEXT_PUBLIC_SITE_URL` | 前端站点地址 | `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_NAME` | 站点名称（SEO） | `Songdian Technology...` |
| `SMTP_HOST` | SMTP 服务器（询盘邮件） | （可选） |
| `SMTP_PORT` | SMTP 端口 | `587` |
| `SMTP_USER` / `SMTP_PASS` | SMTP 认证（授权码） | （可选） |
| `INQUIRY_EMAIL_TO` | 接收询盘通知的邮箱 | （可选） |

> ⚠️ SMTP 四项不填则仅保存到 `data/inquiries.json`，不发邮件。

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
| 新闻详情样式乱 | Astra 主题 HTML 遗留，由 `html-cleaner.ts` 自动清洗 |

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
