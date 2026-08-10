# Songdian B2B — 管理后台（Next.js 16）

> AGENTS.md — 新会话快速上手指南。聚焦「启动命令 + 结构 + 雷区踩坑 + 常用修改路径」。
> 本子项目**雷区极多**，新会话极易踩坑导致全站 500 / 无样式 / 永远登录失败，请务必先读「雷区」节。

---

## 项目定位

松典科技 B2B 官网的**管理后台**，端口 `3001`，服务 `../backend/` 的 `/api/v1/admin/*`。

生产环境后台必须使用已备案域名和 HTTPS；Secure HttpOnly 会话 Cookie 不支持 IP/HTTP 登录。
Docker 内 API 代理使用
`BACKEND_PROXY_URL=http://backend:8000`，不要改成公网 IP。
Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui 风格组件。
`proxy.ts` 做前端路由守卫（校验后端下发的 HttpOnly `access_token` Cookie），接口层另有 RBAC 兜底。

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
| 图表 | apexcharts / react-apexcharts、@fullcalendar/* |
| 交互 | react-dnd（拖拽排序）、flatpickr（日期）、@react-jvectormap（地图） |
| 数据获取 | SWR (v2) + 全局 `SWRProvider`（封装 `apiFetch`，详见 `lib/api-client.ts`） |
| 守卫 | `proxy.ts`（Edge Runtime，校验后端下发的 HttpOnly `access_token` Cookie） |

---

## 目录结构（`src/`）

```
admin-next/src/
├── app/                 # 路由（(admin) 布局分组 + (full-width-pages)）
│   ├── (admin)/         # 受守卫页面：dashboard/products/categories/news/inquiries/media/*-form
│   ├── (full-width-pages)/  # 登录等全宽页：signin / signup
│   ├── layout.tsx / globals.css / not-found.tsx
├── components/          # auth/calendar/charts/common/ecommerce/example/form/header/tables/ui/user-profile/videos
├── context/             # 全局状态：SidebarContext / ThemeContext / SWRProvider
├── hooks/               # 自定义 hooks
├── icons/               # ⚠️ SVG 图标用 generated.tsx（内联 React 组件），不要走 @svgr/webpack
├── layout/              # 侧边栏 / 顶部栏布局
├── lib/                 # API 客户端等工具
└── proxy.ts        # 路由守卫（见雷区 ④）
```

---

## 路由总览

| 路由 | 说明 |
|------|------|
| `/` | Dashboard |
| `/products` `/categories` | 产品列表（拖拽排序 + SEO 快速编辑）/ 分类管理 |
| `/news` `/inquiries` `/media` | 新闻列表（拖拽排序）/ 询盘 CRM（分配/标签/跟进时间线）/ 媒体管理 |
| `/product-form` `/news-form` | 产品 / 新闻编辑表单（含 SEO 元数据面板） |
| `/signin` `/signup` | 认证（公开） |

---

## ⚠️ 雷区（新会话必读，踩中即崩）

1. **Node 必须 24.18.0**：Node 22 与 Next 16 Turbopack 的 `next/image` Web Streams 不兼容，启动即报错。
2. **严禁 `@svgr/webpack`**：该依赖虽在 `package.json` devDependencies，但本机 Turbopack 的 webpack-loader worker 子进程**启动即崩（exit 1）**，会拖垮所有页面 500。SVG 图标一律用 `src/icons/generated.tsx` 里的内联 React 组件，不要 `import Icon from './x.svg'`。
3. **必须保留 `postcss.config.mjs`**（`@tailwindcss/postcss`）：这是唯一正确的 Tailwind v4 管线。删除它 → Next 16 退化为原生 Tailwind，在本机多 lockfile 仓库里会误判 workspace 根、漏扫 `.tsx` 里的布局类 → 整页「没有样式」（HTTP 仍 200，肉眼像裸 HTML）。
4. **`proxy.ts` 的 matcher 必须排除 `/api` 与 `/uploads`**：当前为 `["/((?!_next/static|_next/image|favicon.ico|api/|uploads/).*)"]`。若写成 `["/((?!_next/static|_next/image|favicon.ico).*)"]` 会把登录接口 `/api/v1/admin/login` 也当未登录页重定向到 /signin → 浏览器端永远登录失败。
5. **客户端组件必须显式 `"use client"`**：含 `useState/useRef/useEffect` 的组件忘了加 → 报 500「importing a module that depends on useState into a RSC module」。
6. **中文注释不能写进 JSDoc `/** */`**：Rust 写的 `next-code-frame` 按 byte 索引定位 JSDoc 字符串，遇 UTF-8 多字节字符会 panic（`end byte index X is not a char boundary`）。统一用 `//` 行注释写中文。
7. **React 19 禁止 useEffect 同步 setState**：lint 规则 `react-hooks/set-state-in-effect`。prop 变化时重置子组件 state 用 `key={prop}` 强制重挂载，而非 useEffect+setState。
8. **`.next/dev` 缓存写冲突（Turbopack 整组 500）**：浏览器报 `An unexpected Turbopack error`、dev 日志出现 `Persisting failed: Another write batch or compaction is already active` / `拒绝访问 (os error 5)`，是**两个 next dev 进程抢写同一 `.next/dev` 缓存**所致，整个 `(admin)` 路由组页面一起 500（仅 `/signin` 因重定向才返回 307）。修法三板斧：① `netstat -ano | grep ":3001 "` 拿 PID → `taskkill /F /PID <pid>` 杀冲突进程（**注意别误杀 :3000 的 frontend**）；② `rm -rf .next/dev` 清空缓存；③ 单进程重起（Node 24 直调 next bin）。

---

## 常用修改路径

| 需求 | 操作 |
|------|------|
| 改产品/新闻表单 | `app/(admin)/product-form` / `news-form` + `components/form/*` |
| 改列表/拖拽排序 | `app/(admin)/products` / `news` + `components/ecommerce` / `react-dnd` |
| 改侧边栏/顶部栏 | `components/layout/*` + `context/` |
| 改 API 调用 | `lib/`（封装 fetch 到 `/api/v1/admin/*`） |
| 改数据获取/SWR | `lib/api-client.ts`（`swrFetcher`/`apiFetch`）+ 各 list 页 `useSWR` |
| 加图标 | 在 `icons/generated.tsx` 加内联 SVG 组件（**勿用 @svgr/webpack**） |
| 改路由守卫 | `proxy.ts`（注意 matcher 排除项，见雷区 ④） |
| 改配色/主题 | `app/globals.css` + `tailwind` 配置 |

---

## 路由守卫安全（2026-07-28 修复）

`proxy.ts` 现使用 `jose` 校验 `access_token` 的 HS256 **签名**（不再仅 base64 解码 `exp`）。
要求：

- `admin-next` 必须在**运行期**配置与后端一致的 `JWT_SECRET`；禁止以 Docker build arg 注入；
- 未配置 `JWT_SECRET` 时降级为仅校验 `exp` 并告警（仅本地开发，不安全）；
- 仍需保持 matcher 排除 `/api` 与 `/uploads`（见雷区 ④），否则登录被拦截。

详见 `../backend/CODE_REVIEW_REMEDIATION.md` #13。

## 审计修复（2026-07-31）

P0 级审计修复（详见 `../audit_verification_report.md`）：
- **询盘 CRM**：`inquiries/page.tsx` 全面重写——表格新增「负责人」列（点击弹出分配面板）、「标签」列（逗号编辑）、状态五态管线流转按钮、展开行显示跟进时间线。新增分配弹窗和标签编辑弹窗。后端新增 `PUT .../assign` + `POST .../follow-note` 端点。
- **产品 SEO 管理**：`product-form/page.tsx` 新增「SEO 元数据」面板（seo_title / seo_description 输入框 + 字数计数器）；`products/page.tsx` 表格新增「SEO」列（已设置=绿色 / 未设置=灰色，点击弹出快速编辑弹窗）。
- **产品批量操作**：`products/page.tsx` 新增全选/单选 Checkbox + 批量操作栏（发布选中/隐藏选中/删除选中），`Promise.all` 并发逐条 PUT/DELETE。
- **用户管理**：`users/page.tsx` 新增用户管理页——表格列出所有后台账号 + 新建弹窗（username/password）+ 删除（admin 不可删）+ 密码重置弹窗。所有新账号统一管理员权限。

## 邮件通知 SMTP 后台配置（2026-08-01）

- `settings/page.tsx` 新增「邮件通知（询盘 SMTP）」分组：识别 `smtp_*` / `inquiry_email_*` 键归组展示（两列栅格），右上角「测试发送」按钮（先 PUT 保存当前表单 → POST `/admin/settings/smtp/test` 用已存配置发信）。
- `smtp_password` 后端脱敏：GET 返回 `******`，PUT 回传掩码时后端保留原值（前端无需特殊处理）。
- ⚠️ SMTP 配置 key 由后端惰性创建（`GET /admin/settings` 触发），前端**不要**在页面里手动建 key；页面只依赖后端返回的 key 渲染。
- **仪表盘增强**：`EcommerceMetrics.tsx` 新增询盘国家分布（按 country 字段 Top 10）和询盘状态分布进度条。后端 `GET /admin/stats`。
- **审计日志**：`audit-logs/page.tsx` 新增审计日志表格页——时间/用户/操作/资源/结果/IP，分页+搜索。侧边栏新增入口。
- **动态头部**：`UserDropdown.tsx` 改为从 `/admin/profile` 动态读取用户名，显示真实 username + 首字母头像（不再硬编码"管理员"/"A"）。
- **询盘国家标记**：`inquiries/page.tsx` 跟进对话框新增 Country 输入框，保存时写入数据库（纯后台标记，客户表单不需要国家字段）。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
