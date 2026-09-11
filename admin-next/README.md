# Songdian B2B — 工厂外贸官网（管理后台）

> 当前状态（2026-09-02）：产品与新闻编辑已接入草稿、定时/立即发布、版本历史、恢复和 15 分钟短期预览；询盘 CRM、通知、用户、设置和审计页面也已接入后端 API。媒体库支持查看图片引用位置和内容归档提示。当前部署与迁移说明以根目录 [`CURRENT_IMPLEMENTATION.md`](../CURRENT_IMPLEMENTATION.md) 为准。

松典科技 B2B 平台的管理后台，基于 **Next.js 16 + React 19 + Tailwind CSS v4**，通过项目自有 **FastAPI 后端** 提供数据服务。用于管理产品、新闻、分类、询盘和媒体资源。

> 基于 [TailAdmin Next.js](https://github.com/TailAdmin/free-nextjs-admin-dashboard) 模板二次开发，已移除演示数据和无用组件。

产品与新闻改为草稿后仍可在后台列表和编辑页查看，通过“打开预览”查看最后保存的内容；普通官网地址不公开草稿。发布时间按当前设备时区输入，提交时转为带时区的 ISO 时间。预览使用非默认官网地址时，在构建后台前配置 `NEXT_PUBLIC_FRONTEND_URL`；浏览器拦截弹窗时可点击生成后的预览链接。

产品复制目前预填基本信息、封面和 SEO，图库与规格需保存后进入编辑页添加。已有产品的图库、规格增删立即保存，不随表单“取消”撤销。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16.3.4（App Router + Turbopack）+ React 19 |
| 语言 | TypeScript（strict） |
| 样式 | Tailwind CSS v4 + 暗色模式 |
| 后端 | 项目 FastAPI 后端（`../backend/`，端口 8000） |
| 认证 | Cookie-only JWT：HttpOnly `access_token` / `refresh_token`，浏览器 JavaScript 不读取令牌 |
| 路由守卫 | Next.js `proxy.ts`（Edge Runtime 校验 `access_token` 签名） |
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

后台相关 E2E 用例位于 `../frontend/e2e/`（不是本目录）。交互用例必须用 `e2e/hydration.ts` 的
`gotoHydrated()` 等待 React 注水，否则会「操作无效、无请求、无报错」的假失败；
跑法与完整约定见 [`../frontend/AGENTS.md`](../frontend/AGENTS.md) 的「E2E 测试（Playwright）」章节。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | `BACKEND_PROXY_URL` 未设置时的代理兼容回退；页面请求仍走同源 `/api`、`/uploads` |
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
│   │   │   ├── media/            # 媒体库（上传/归档/使用情况/复制URL）
│   │   │   ├── account/          # 账号设置（改用户名/改密码）
│   │   │   ├── users/            # 用户管理（创建/删除/重置密码）
│   │   │   ├── settings/         # 系统设置与 SMTP 测试
│   │   │   ├── audit-logs/       # 审计日志
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
│   │   │   ├── NotificationDropdown.tsx  # 通知下拉（30 秒轮询、未读/已读）
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
| 登录 / 刷新 / 登出 | 后端只签发、轮换和清除 HttpOnly Cookie；响应体不返回令牌 |
| Dashboard | 四大统计卡片（产品/新闻/分类/询盘数量） |
| 产品管理 | 搜索/分类筛选、拖拽排序、新增/编辑/删除，**富文本编辑器**编辑产品详情 |
| 新闻管理 | 拖拽排序、新增/编辑/删除，**富文本编辑器**编辑内容，**发布时间编辑** |
| 分类管理 | 查看分类及产品计数 |
| 内容发布工作流 | DRAFT / SCHEDULED / PUBLISHED、发布时间校验、到期发布、版本历史、恢复和 15 分钟签名预览 |
| 询盘 CRM | 查看来源/UTM 归因，更新状态、分配负责人、记录跟进时间和跟进备注 |
| 通知中心 | 30 秒轮询新询盘、超时未跟进和 SMTP 失败通知，支持逐条或全部标记已读 |
| 媒体管理 | 图片上传、Products/News 子相册归档、查看引用位置、删除风险提示、复制 URL |
| 用户管理 | 用户列表、创建、删除和重置密码 |
| 系统设置 | 站点设置和询盘 SMTP 配置，支持普通字段回显、敏感授权码脱敏和测试发送 |
| 审计日志 | 查看管理员操作记录 |
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

## 系统设置页约定

管理后台 `/settings` 通过同源请求访问后端 `/api/v1/admin/settings`。`ga_id`、`clarity_id`、联系邮箱、SMTP 主机等普通配置会在保存后继续显示，重新进入页面或刷新页面也会从后端读取并回显；GA4 和 Clarity 只填写 ID，不要粘贴完整安装脚本。

- 表单只记录用户实际编辑过的字段，保存时只提交相对当前服务端值发生变化的字段，避免旧缓存中的空值覆盖其他设置。
- 保存成功后先同步 SWR 缓存，再异步重新读取；较早发出的读取请求不能覆盖刚保存的值。用户正在编辑的字段也不会被后台刷新结果覆盖。
- 设置读取失败时页面显示明确的错误状态，并提供“重新读取设置”操作；没有确认到最新设置时，保存按钮保持禁用。
- `smtp_password` 始终使用密码输入框。后端已保存的授权码只返回 `******` 并显示“已配置”，留空或不修改时保留原值；新授权码保存成功后也只显示掩码。

## 开发约定

- 所有页面为 `"use client"` 客户端组件
- 不读取或保存 JWT 到 `localStorage`；浏览器同源请求自动携带 HttpOnly Cookie。
- **数据获取统一用 SWR + 共享 api-client**：根布局已用 `SWRProvider` 注入全局 `fetcher`（`swrFetcher`，复用 `apiFetch` 鉴权 + 信封解包）。所有列表页（products / news / categories / inquiries / media）均已迁移为 `useSWR(path)` 拉取，本地派生用 `useMemo`，变更后 `mutate()` 重校（不再手写 `useEffect+setState` 样板）。共享类型集中在 `src/types/index.ts`。
- 媒体库（`/media`）已改为 API 驱动：通过 `GET /api/v1/admin/upload/records` 分页获取上传记录，上传仍走 `POST /api/v1/admin/upload`。
- 媒体库每条素材支持“查看使用情况”：调用 `GET /api/v1/admin/upload/{id}/usage`，展示产品图库、产品封面和新闻封面的引用数量与名称，并可跳转到对应编辑页；引用信息按素材缓存，删除前仍由后端执行引用保护。
- 产品/新闻编辑页上传封面或图库图片时，会通过 `categorize=product:{slug}` / `categorize=news:{slug}` 自动归入 `Products / {slug}` 或 `News / {slug}` 子相册。没有 slug 时进入“未分类”；相册只是管理归属，不会改写返回的媒体 URL。
- 媒体库的“同步引用图片”用于补齐历史内容中尚未建立 `UploadRecord` 的引用，“自动归类”用于按已有媒体 URL 路径整理未分类素材；两者都不会移动物理文件。
- 底层统一请求入口 `lib/api-client.ts` 的 `apiFetch<T>(path, options: ApiFetchOptions)`：统一请求同源 `/api/v1`、解包 `{code,data}` 信封、`body` 支持普通对象（自动 `JSON.stringify`）；401 时只调用一次刷新接口并重试一次。一次性调用才直接 `fetch`。
- 响应格式：`{ code: "0", msg, data }`，code 为字符串 "0" 表示成功
- 代码注释：中文
- 禁止使用 `@svgr/webpack`（本机 Turbopack webpack-loader worker 会崩溃）
- 必须保留 `postcss.config.mjs`（`@tailwindcss/postcss`，若删除则 Tailwind 原生扫描漏掉 .tsx 布局类，整页无样式）
- `proxy.ts` 的 matcher 必须排除 `/api` 和 `/uploads`（否则登录 POST 被守卫拦截）

## 环境变量

复制 `.env.example` 为 `.env.local` 后填写：

- `NEXT_PUBLIC_API_URL`：`BACKEND_PROXY_URL` 未设置时的兼容回退；后台客户端组件仍只请求同源 `/api`、`/uploads`。
- `BACKEND_PROXY_URL`：Next.js 服务端 rewrite 目标；Docker Compose 内使用 `http://backend:8000`。
- 生产公网后台入口为 `https://admin.zsaki.icu/signin`；`3001` 仅为 admin-next 应用端口和宿主机回环端口，禁止向公网开放。
- API 域名为 `https://api.zsaki.icu`；`BACKEND_PROXY_URL=http://backend:8000` 在 Compose 中保持不变。
- `JWT_SECRET`：**服务端** `proxy.ts` 读取，用于校验 `access_token` 的 HS256 签名（2026-07-28 修复，
  此前仅 base64 解码 payload，伪造 cookie 可绕过）。必须与后端 `.env` 的 `JWT_SECRET` **完全一致**，
  **切勿加 `NEXT_PUBLIC_` 前缀**（否则密钥泄露到浏览器）。生产环境必须配置；未配置时降级为仅校验
  `exp` 并输出告警（仅本地开发）。
## 当前实现补充（2026-08-13）

当前后台实现以 [`CURRENT_IMPLEMENTATION.md`](../CURRENT_IMPLEMENTATION.md) 为准：

- 通知下拉框通过 `/api/v1/admin/notifications` 每 30 秒轮询，支持新询盘、超时未跟进和 SMTP 失败，并可逐条或全部标记已读。
- 询盘页保留桌面表格，小屏切换为可操作卡片；支持国家、来源产品、落地页和 UTM 归因查看/筛选。
- 后台仍使用 Cookie-only 认证；细粒度销售/编辑 RBAC 尚未作为本轮新增能力，不应在文档中描述为已完成。
- 生产后台使用指定 GHCR 镜像，构建和迁移步骤见根目录 `deploy-guide.md`。

目录树中旧的“通知铃铛（空状态）”描述已失效：当前 `NotificationDropdown` 已接入通知 API、30 秒轮询、未读徽标和已读操作。

## 当前媒体与内容工作流约定（2026-09-01）

- 认证始终为 Cookie-only：登录/刷新响应体不包含 JWT，客户端不读取或持久化访问令牌。
- `resolveMediaUrl()` 对 `/uploads/...` 保持同源，Next.js rewrite 再根据 `BACKEND_PROXY_URL` 转发；外部绝对 URL 原样使用。组件不得拼接 `NEXT_PUBLIC_API_URL` 或 `localhost:8000`。
- 媒体列表中的“查看使用情况”是显式点击动作，引用明细来自后端 `/admin/upload/{id}/usage`；“使用中”标签显示引用数量，“未使用”状态仅表示当前未匹配产品/新闻封面或图库引用。
- 产品/新闻封面上传提示会实时显示目标子相册；产品使用 `Products / 产品 slug`，新闻使用 `News / 新闻 slug`。上传接口仍按年份/UUID 保存物理文件，子相册是 `UploadRecord.album_id` 的逻辑组织。
- 产品、新闻列表展示当前状态和计划发布时间；编辑页的 `ContentWorkflowPanel` 负责状态选择、时间校验、版本查看/恢复与预览入口。
- 草稿预览会打开官网 `/preview/[token]`，令牌短期有效且不可用于正式公开 URL；恢复历史版本后应刷新编辑数据与版本列表。
- 本地启动端口应使用 `npm run dev -- -p 3001`；若脚本未透传参数，可用 `npx next dev -p 3001`。`npm run dev -- -p 3001` 不应被写成 `npm run dev -- 3001`，后者会被 Next.js 解释为项目目录。

### 封面图与官网社交分享

- 产品主图和新闻封面不仅用于官网页面展示，也会成为公开详情页的 `og:image` 与 `twitter:image`。
- 删除或未设置内容封面时，官网会显式回退到 1200×630 的默认品牌图，不会输出空的 Twitter 图片数组。
- 修改封面、产品 SEO 字段、新闻标题或摘要后，后端会清理内容缓存并触发官网 ISR revalidation；社交 metadata 随详情页重新生成。
- 社交平台可能继续显示自己的历史抓取缓存。官网更新成功后如仍看到旧图，应使用相应平台的重新抓取工具，不要反复上传重复媒体。
