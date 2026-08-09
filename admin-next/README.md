# Songdian B2B — 工厂外贸官网（管理后台）

松典科技 B2B 平台的管理后台，基于 **Next.js 16 + React 19 + Tailwind CSS v4**，通过项目自有 **FastAPI 后端** 提供数据服务。用于管理产品、新闻、分类、询盘和媒体资源。

> 基于 [TailAdmin Next.js](https://github.com/TailAdmin/free-nextjs-admin-dashboard) 模板二次开发，已移除演示数据和无用组件。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16.1.6（App Router + Turbopack）+ React 19 |
| 语言 | TypeScript（strict） |
| 样式 | Tailwind CSS v4 + 暗色模式 |
| 后端 | 项目 FastAPI 后端（`../backend/`，端口 8000） |
| 认证 | JWT（Bearer Token，localStorage + Cookie 双存储） |
| 路由守卫 | Next.js Middleware（边缘层 token 校验） |
| 数据获取 | SWR (v2) + 全局 `SWRProvider`，`swrFetcher` 封装 `apiFetch` |
| 图标 | 内联 SVG 组件（`src/icons/generated.tsx`） |

---

## 环境要求

- **Node.js** ≥ 24（Next.js 16 Turbopack 需要 Node 24）
- **FastAPI 后端** 运行在 `localhost:8000`
- 包管理器：npm

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3001
```

> ⚠️ 本机必须用 Node 24.18.0，启动命令：
> `"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3001`

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | FastAPI 后端地址 |
| `BACKEND_PROXY_URL` | `http://localhost:8000` | 服务端 `/api`、`/uploads` rewrite 目标；Compose 中为 `http://backend:8000` |
| `JWT_SECRET` | — | 服务端路由守卫验签密钥，必须与后端一致，禁止使用 `NEXT_PUBLIC_` 前缀 |

---

## 项目结构

```
admin-next/
├── src/
│   ├── app/
│   │   ├── (admin)/              # 需登录的管理页面
│   │   │   ├── page.tsx          # Dashboard（统计卡片）
│   │   │   ├── products/         # 产品列表（搜索/筛选/拖拽排序/删除）
│   │   │   ├── news/             # 新闻列表（拖拽排序/删除）
│   │   │   ├── categories/       # 分类列表（含产品计数）
│   │   │   ├── inquiries/        # 询盘列表
│   │   │   ├── media/            # 媒体库（上传/分类/复制URL）
│   │   │   ├── account/          # 账号设置（改用户名/改密码）
│   │   │   └── (others-pages)/
│   │   │       ├── product-form/ # 产品编辑表单
│   │   │       └── news-form/    # 新闻编辑表单
│   │   ├── (full-width-pages)/(auth)/
│   │   │   └── signin/           # 登录页
│   │   ├── layout.tsx             # 根布局（ThemeProvider + SidebarProvider）
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── auth/SignInForm.tsx    # 登录表单
│   │   ├── header/
│   │   │   ├── NotificationDropdown.tsx  # 通知铃铛（空状态）
│   │   │   └── UserDropdown.tsx          # 用户下拉（Sign out）
│   │   ├── ecommerce/EcommerceMetrics.tsx  # Dashboard 统计卡片
│   │   ├── form/                 # 表单组件
│   │   └── ui/                   # 基础 UI 组件
│   ├── layout/
│   │   ├── AppHeader.tsx         # 顶栏（侧边栏切换 + 主题 + 通知 + 用户）
│   │   ├── AppSidebar.tsx        # 侧边栏导航
│   │   └── Backdrop.tsx          # 移动端遮罩
│   ├── context/
│   │   ├── SidebarContext.tsx     # 侧边栏状态
│   │   ├── ThemeContext.tsx       # 暗色模式
│   │   └── SWRProvider.tsx        # SWR 全局配置（注入 fetcher + 关闭聚焦重校）
│   ├── icons/                    # SVG 图标
│   └── proxy.ts             # 路由守卫（token 校验 + 未登录重定向）
└── public/images/                # 静态资源
```

---

## 功能清单

| 功能 | 说明 |
|------|------|
| 登录 / 登出 | JWT 认证，token 存 localStorage + Cookie |
| Dashboard | 四大统计卡片（产品/新闻/分类/询盘数量） |
| 产品管理 | 搜索/分类筛选、拖拽排序、新增/编辑/删除，**富文本编辑器**编辑产品详情 |
| 新闻管理 | 拖拽排序、新增/编辑/删除，**富文本编辑器**编辑内容，**发布时间编辑** |
| 分类管理 | 查看分类及产品计数 |
| 询盘管理 | 查看询盘列表 |
| 媒体管理 | 图片上传、分类管理、复制 URL |
| 账号设置 | 修改用户名、修改密码 |
| 暗色模式 | 全局切换 |

---

## API 代理

Next.js 通过 `next.config.ts` 中的 `rewrites()` 将请求代理到后端：

```
/api/*     → http://localhost:8000/api/*
/uploads/* → http://localhost:8000/uploads/*
```

---

## 开发约定

- 所有页面为 `"use client"` 客户端组件
- Token 读取：`localStorage.getItem("admin_token")`
- **数据获取统一用 SWR + 共享 api-client**：根布局已用 `SWRProvider` 注入全局 `fetcher`（`swrFetcher`，复用 `apiFetch` 鉴权 + 信封解包）。所有列表页（products / news / categories / inquiries / media）均已迁移为 `useSWR(path)` 拉取，本地派生用 `useMemo`，变更后 `mutate()` 重校（不再手写 `useEffect+setState` 样板）。共享类型集中在 `src/types/index.ts`。
- 媒体库（`/media`）已改为 API 驱动：通过 `GET /api/v1/admin/upload/records` 分页获取上传记录（替代原 localStorage 双存储方案），上传仍走 `POST /api/v1/admin/upload`。
- 底层统一请求入口 `lib/api-client.ts` 的 `apiFetch<T>(path, options: ApiFetchOptions)`：自动带 Bearer token、解包 `{code,data}` 信封、`body` 支持普通对象（自动 `JSON.stringify`）。一次性调用才直接 `fetch`。
- 响应格式：`{ code: "0", msg, data }`，code 为字符串 "0" 表示成功
- 代码注释：中文
- 禁止使用 `@svgr/webpack`（本机 Turbopack webpack-loader worker 会崩溃）
- 必须保留 `postcss.config.mjs`（`@tailwindcss/postcss`，若删除则 Tailwind 原生扫描漏掉 .tsx 布局类，整页无样式）
- `proxy.ts` 的 matcher 必须排除 `/api` 和 `/uploads`（否则登录 POST 被守卫拦截）

## 环境变量

复制 `.env.example` 为 `.env.local` 后填写：

- `NEXT_PUBLIC_API_URL`：后端地址（客户端组件读取，须 `NEXT_PUBLIC_` 前缀）。
- `BACKEND_PROXY_URL`：Next.js 服务端 rewrite 目标；Docker Compose 内使用 `http://backend:8000`。
- 当前腾讯云无域名部署的公网后台入口为 `http://106.53.220.184:8081/signin`；`3001` 仅为 admin-next 应用端口和宿主机回环端口。
- 后续启用域名时，公网入口改为 `https://admin.songdian.tech`、API 改为 `https://api.songdian.tech`；`BACKEND_PROXY_URL=http://backend:8000` 保持不变。
- `JWT_SECRET`：**服务端**中间件读取，用于校验 `access_token` 的 HS256 签名（2026-07-28 修复，
  此前仅 base64 解码 payload，伪造 cookie 可绕过）。必须与后端 `.env` 的 `JWT_SECRET` **完全一致**，
  **切勿加 `NEXT_PUBLIC_` 前缀**（否则密钥泄露到浏览器）。生产环境必须配置；未配置时降级为仅校验
  `exp` 并输出告警（仅本地开发）。
