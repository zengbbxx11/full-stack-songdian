# Songdian B2B — 管理后台（Next.js 16）

> AGENTS.md — 新会话快速上手指南。聚焦「启动命令 + 结构 + 雷区踩坑 + 常用修改路径」。
> 本子项目**雷区极多**，新会话极易踩坑导致全站 500 / 无样式 / 永远登录失败，请务必先读「雷区」节。

---

## 项目定位

松典科技 B2B 官网的**管理后台**，端口 `3001`，服务 `../backend/` 的 `/api/v1/admin/*`。
Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui 风格组件。
`middleware.ts` 做前端路由守卫（校验后端下发的 HttpOnly `access_token` cookie），接口层另有 RBAC 兜底。

---

## 本地启动

```bash
# ⚠️ 必须用 Node 24.18.0（系统默认路径）
"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3001
```

> ⚠️ 不能用 `npm run dev` 或 `node_modules/.bin/next`：本机沙箱 fork 易失败（EAGAIN），且 bin wrapper 在部分环境下不工作；**直调 `node_modules/next/dist/bin/next` 最稳**。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 + React 19 + TypeScript（strict） |
| 样式 | Tailwind CSS v4 + `@tailwindcss/postcss` + `@tailwindcss/forms` |
| UI | 内置 `components/ui/`（shadcn 风格）+ lucide-react 图标 |
| 图表 | apexcharts / react-apexcharts、@fullcalendar/*、swiper |
| 交互 | react-dnd（拖拽排序）、flatpickr（日期）、@react-jvectormap（地图） |
| 守卫 | `middleware.ts`（Edge Runtime，校验后端下发的 HttpOnly `access_token` cookie） |

---

## 目录结构（`src/`）

```
admin-next/src/
├── app/                 # 路由（(admin) 布局分组 + (full-width-pages)）
│   ├── (admin)/         # 受守卫页面：dashboard/products/categories/news/inquiries/media/*-form
│   ├── (full-width-pages)/  # 登录等全宽页：signin / signup
│   ├── layout.tsx / globals.css / not-found.tsx
├── components/          # auth/calendar/charts/common/ecommerce/example/form/header/tables/ui/user-profile/videos
├── context/             # 全局状态（如侧边栏折叠）
├── hooks/               # 自定义 hooks
├── icons/               # ⚠️ SVG 图标用 generated.tsx（内联 React 组件），不要走 @svgr/webpack
├── layout/              # 侧边栏 / 顶部栏布局
├── lib/                 # API 客户端等工具
└── middleware.ts        # 路由守卫（见雷区 ④）
```

---

## 路由总览

| 路由 | 说明 |
|------|------|
| `/` | Dashboard |
| `/products` `/categories` | 产品列表（拖拽排序）/ 分类管理 |
| `/news` `/inquiries` `/media` | 新闻列表（拖拽排序）/ 询盘 / 媒体管理 |
| `/product-form` `/news-form` | 产品 / 新闻编辑表单 |
| `/signin` `/signup` | 认证（公开） |

---

## ⚠️ 雷区（新会话必读，踩中即崩）

1. **Node 必须 24.18.0**：Node 22 与 Next 16 Turbopack 的 `next/image` Web Streams 不兼容，启动即报错。
2. **严禁 `@svgr/webpack`**：该依赖虽在 `package.json` devDependencies，但本机 Turbopack 的 webpack-loader worker 子进程**启动即崩（exit 1）**，会拖垮所有页面 500。SVG 图标一律用 `src/icons/generated.tsx` 里的内联 React 组件，不要 `import Icon from './x.svg'`。
3. **必须保留 `postcss.config.mjs`**（`@tailwindcss/postcss`）：这是唯一正确的 Tailwind v4 管线。删除它 → Next 16 退化为原生 Tailwind，在本机多 lockfile 仓库里会误判 workspace 根、漏扫 `.tsx` 里的布局类 → 整页「没有样式」（HTTP 仍 200，肉眼像裸 HTML）。
4. **`middleware.ts` 的 matcher 必须排除 `/api` 与 `/uploads`**：当前为 `["/((?!_next/static|_next/image|favicon.ico|api/|uploads/).*)"]`。若写成 `["/((?!_next/static|_next/image|favicon.ico).*)"]` 会把登录接口 `/api/v1/admin/login` 也当未登录页重定向到 /signin → 浏览器端永远登录失败。
5. **客户端组件必须显式 `"use client"`**：含 `useState/useRef/useEffect` 的组件忘了加 → 报 500「importing a module that depends on useState into a RSC module」。
6. **中文注释不能写进 JSDoc `/** */`**：Rust 写的 `next-code-frame` 按 byte 索引定位 JSDoc 字符串，遇 UTF-8 多字节字符会 panic（`end byte index X is not a char boundary`）。统一用 `//` 行注释写中文。
7. **React 19 禁止 useEffect 同步 setState**：lint 规则 `react-hooks/set-state-in-effect`。prop 变化时重置子组件 state 用 `key={prop}` 强制重挂载，而非 useEffect+setState。

---

## 常用修改路径

| 需求 | 操作 |
|------|------|
| 改产品/新闻表单 | `app/(admin)/product-form` / `news-form` + `components/form/*` |
| 改列表/拖拽排序 | `app/(admin)/products` / `news` + `components/ecommerce` / `react-dnd` |
| 改侧边栏/顶部栏 | `components/layout/*` + `context/` |
| 改 API 调用 | `lib/`（封装 fetch 到 `/api/v1/admin/*`） |
| 加图标 | 在 `icons/generated.tsx` 加内联 SVG 组件（**勿用 @svgr/webpack**） |
| 改路由守卫 | `middleware.ts`（注意 matcher 排除项，见雷区 ④） |
| 改配色/主题 | `app/globals.css` + `tailwind` 配置 |

---

## 路由守卫安全（2026-07-28 修复）

`middleware.ts` 现使用 `jose` 校验 `access_token` 的 HS256 **签名**（不再仅 base64 解码 `exp`）。
要求：

- `admin-next` 必须配置与后端一致的 `JWT_SECRET`（服务端变量，`env.example` 有模板）；
- 未配置 `JWT_SECRET` 时降级为仅校验 `exp` 并告警（仅本地开发，不安全）；
- 仍需保持 matcher 排除 `/api` 与 `/uploads`（见雷区 ④），否则登录被拦截。

详见 `../backend/CODE_REVIEW_REMEDIATION.md` #13。
