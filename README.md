# Songdian B2B — 工厂外贸官网

> 当前实现说明（2026-08-13）：生产发布以 GitHub Actions 构建的 GHCR 不可变镜像、独立 Aerich 迁移和健康检查为准。`db/` 中的生产数据与媒体快照不作为生产部署输入。

基于 FastAPI + Next.js 的 Songdian 工厂 B2B 外贸全栈系统，展示型官网前端（产品目录 + 询盘）与 Next.js 管理后台分离部署。

## 当前云端部署

- 公网官网入口：<https://www.zsaki.icu/>。
- 公网管理后台：<https://admin.zsaki.icu/signin>。
- API 与上传入口：<https://api.zsaki.icu/>；管理后台使用 HTTPS Secure Cookie，不支持 IP/HTTP 登录。
- Docker Compose 内部服务仍使用 `backend:8000`、`postgres:5432`、`redis:6379`，不要把容器间地址改成公网 IP。
- 生产环境的根目录 `.env` 由 `.env.example` 复制后填写真实密钥；`NEXT_PUBLIC_API_URL` 必须与公网反向代理路径一致。
- 域名变更时，更新根 `.env` 的 CORS/API/站点/图片主机变量、配置 HTTPS 反代并重建前端镜像；不需要改容器内服务地址。

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| **后端** | FastAPI + Tortoise ORM + asyncpg | Python ≥3.14 / FastAPI 0.139 / Tortoise 1.1.7 |
| **数据库** | PostgreSQL（全文检索无 zhparser 时降级 simple） | 18.4（生产 Compose 使用 18 线） |
| **缓存** | Redis（生产强依赖；本地可降级进程内内存实现） | 8.8.1 |
| **官网前端** | Next.js + React + Tailwind CSS + shadcn/ui | Next 16.3 / React 19.2 |
| **后台管理** | Next.js + React + Tailwind CSS（admin-next） | Next 16.3 / React 19.2 |
| **迁移引擎** | aerich | ≥0.9 |
| **包管理** | uv（Python）/ npm（Node） | — |

---

## 目录结构

```
full-stack-project/
├── backend/                   # FastAPI 后端
│   ├── common/                # 共享基础设施（JWT/RBAC/软删/审计/结果封装）
│   ├── content/               # 内容管理（登录/角色/权限/审计日志）
│   ├── product/               # 产品域（CRUD/分类/标签/图库/搜索向量）
│   ├── news/                  # 新闻域（同构）
│   ├── search/                # 全文检索 + 降级 LIKE 搜
│   ├── inquiry/               # 询盘表单
│   ├── uploads/               # 图片上传模块（StorageBackend 抽象）
│   ├── seed/                  # 种子数据（admin 账号等）
│   ├── tests/                 # pytest 测试套件
│   └── main.py                # 应用入口
├── frontend/                  # Next.js 官网前端（产品目录 + 搜索 + 询盘）
│   ├── app/                   # App Router 页面
│   ├── components/            # UI 组件（shadcn/ui）
│   └── lib/                   # API 客户端/类型/工具
├── admin-next/                # Next.js 管理后台（产品/新闻/分类/询盘/媒体）
│   ├── src/app/(admin)/       # App Router 管理页面
│   ├── src/components/        # UI 组件
│   └── src/layout/            # 布局（侧边栏/顶栏）
├── db/                        # 仅本地开发快照（SQL + CSV，禁止导入生产）
├── backend/docs/              # 后端架构设计与 Mermaid 图
└── frontend/docs/             # 官网集成设计与 Mermaid 图
```

---

## 环境要求

- **Python** ≥ 3.14 + [uv](https://docs.astral.sh/uv/)
- **PostgreSQL** 18.4（本机经 envkit 安装，不随系统自启，启动命令见下文）
- **Redis** 8（本地未配置时可降级；生产 Compose 通过 `REDIS_REQUIRED=true` 强制真实 Redis）
- **Node.js** ≥ 24 + npm（前端 Next.js 16 Turbopack 需要 Node 24，Node 22 的 Web Streams 有兼容性问题）

---

## 快速开始

### 1. 克隆 & 环境变量

```bash
cd full-stack-project/backend
cp .env.example .env   # 按需修改 DATABASE_URL / REDIS_URL / ADMIN_PASSWORD 等
```

### 2. 后端

```bash
cd backend

# 安装依赖
uv sync
uv sync --extra dev          # 开发环境需额外安装 pytest/ruff

# 应用已有迁移链（开发数据库或新库）
aerich upgrade

# 仅在你修改模型并需要新增迁移时执行：
# aerich migrate --name <change-name>
# aerich upgrade

# 启动开发服务器
uv run uvicorn main:app --reload --port 8000
```

后端启动后访问：
- API 文档（仅开发环境默认开启）：<http://localhost:8000/docs>
- 存活检查：<http://localhost:8000/healthz>
- 就绪检查：<http://localhost:8000/readyz>

> 生产环境默认关闭 `/docs`、`/redoc` 和 `/openapi.json`。

### 3. 官网前端 (Next.js)

```bash
cd frontend
npm ci
# 本机启动（必须用 Node 24.18.0，Node 22 与 Turbopack Web Streams 不兼容）：
"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3000
```

### 4. 后台管理 (admin-next, Next.js)

```bash
cd admin-next
npm ci
# 本机启动（同上，Node 24）：
"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3001
```

管理后台用户名为 `admin`。初始密码取 `ADMIN_PASSWORD`；未配置时种子器会生成一次性随机密码并写入后端启动日志，生产环境不要依赖固定默认密码。

---
## 本机 PostgreSQL 启动

PostgreSQL 经 envkit 安装在 `C:\ProgramData\envkit\services\postgres\18.4\`，**不随系统自启**。机器重启后需手动拉起：

```bash
"C:/ProgramData/envkit/services/postgres/18.4/bin/pg_ctl.exe" -D "C:/ProgramData/envkit/services/postgres/18.4/data" start
```

> ⚠️ 必须用 Windows 风格路径（`C:\...`），`pg_ctl.exe` 不认 `/c/...` 形式的 Unix 路径。
> 如果后端所有接口（含公开 `/products`）都返回 `B999001 系统内部错误`，几乎一定是 PG 没起。

---

## 环境变量

后端 `backend/.env`（关键项）：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgres://postgres:postgres@localhost:5432/songdianB2B` |
| `REDIS_URL` | Redis 连接串（可选） | 未配时降级内置内存缓存 |
| `REDIS_REQUIRED` | 是否要求真实 Redis；生产必须启用 | `false`（Compose 固定为 `true`） |
| `NEXT_REVALIDATE_URL` | 后台内容变更后通知官网清理 ISR 缓存的内部地址 | 空 |
| `REVALIDATE_SECRET` | 后端与官网共享的按需刷新密钥 | 空 |
| `PORT` | 后端监听端口 | 8000 |
| `ADMIN_PASSWORD` | 种子管理员密码；留空时生成一次性随机密码 | 无固定默认值 |
| `MEDIA_ROOT` | 上传文件本地磁盘目录 | `uploads`（相对 `backend/`） |
| `MEDIA_URL` | 上传文件 URL 前缀 | `/uploads` |
| `STORAGE_BACKEND` | 存储后端（当前仅 `local`） | `local` |
| `MAX_UPLOAD_MB` | 上传文件大小上限 | 10 |

> **代理说明**：admin-next 通过 `next.config.ts` 的 `rewrites()` 代理 `/api/*` 和 `/uploads/*`；frontend 的浏览器资源使用 `NEXT_PUBLIC_API_URL`，服务端数据请求在 Docker 内使用 `INTERNAL_API_URL=http://backend:8000`。后台发布产品或新闻后，后端会通过带密钥的内部接口清除对应 Redis 与 Next.js ISR 缓存。

> **生产域名**：`zsaki.icu` 仅做 HTTPS 301 至 `www.zsaki.icu`；官网、API、后台分别使用 `www.zsaki.icu`、`api.zsaki.icu`、`admin.zsaki.icu`。完整上线清单见 [`deploy-guide.md`](deploy-guide.md)。

---

---

## 默认账号

| 角色 | 用户名 | 密码 | 说明 |
|---|---|---|---|
| 管理员 | `admin` | 取 `ADMIN_PASSWORD`；留空则随机生成 | 仅 `SEED_ON_START=true` 时运行幂等种子逻辑；随机密码见启动日志 |

本地后端模板默认启用最小种子；生产 Compose 模板默认 `SEED_ON_START=false`。只有显式启用时才创建 admin 账号和默认角色权限，且不会新增、删除或覆盖产品、新闻及其分类。`db/` 下的 SQL/CSV 快照仅限本地调试，禁止用于生产部署。

---

## API 概览

### 公开接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 存活检查 |
| GET | `/readyz` | 就绪检查 |
| GET | `/api/v1/products` | 产品列表（分页，支持 category/keyword/order_by） |
| GET | `/api/v1/products/{slug}` | 产品详情（含相册/属性/标签） |
| GET | `/api/v1/news` | 新闻列表 |
| GET | `/api/v1/news/{slug}` | 新闻详情 |
| GET | `/api/v1/product-categories` | 产品分类（按 sort_order 排序） |
| GET | `/api/v1/news-categories` | 新闻分类（按 sort_order 排序） |
| GET | `/api/v1/search` | 全文搜索（PG TSVector，未装 zhparser 时降级 simple） |
| POST | `/api/v1/inquiries` | 提交询盘（幂等键防重） |
| GET | `/api/v1/public/settings` | 公开系统设置（联系信息/社交链接，官网 Frontend 通过 ISR 拉取） |

### Admin 接口（需 JWT + RBAC）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/v1/admin/login` | — | 登录（限流） |
| POST | `/api/v1/admin/logout` | — | 从 HttpOnly Cookie 读取令牌族并吊销，同时清除 Cookie |
| POST | `/api/v1/admin/refresh` | — | 从 refresh Cookie 无感轮换会话；请求和响应均不传回令牌 |
| GET/POST/PUT/DELETE | `/api/v1/admin/products{/:id}` | `product:*` | 产品 CRUD（含 sort_order） |
| POST | `/api/v1/admin/products/{id}/gallery` | `product:update` | 添加相册图 |
| POST | `/api/v1/admin/products/{id}/attributes` | `product:update` | 添加规格属性 |
| GET | `/api/v1/admin/categories` | `product:read` | 分类列表（含各分类产品计数） |
| GET/POST/PUT/DELETE | `/api/v1/admin/news{/:id}` | `news:*` | 新闻 CRUD（含 sort_order） |
| GET | `/api/v1/admin/inquiries` | `inquiry:read` | 询盘列表 |
| PUT | `/api/v1/admin/inquiries/{id}/status` | `inquiry:update` | 更新询盘状态 |
| GET/PUT | `/api/v1/admin/profile` | — | 查看/修改当前用户信息（用户名/密码） |
| GET/POST | `/api/v1/admin/roles` | `role:*` | 角色管理 |
| GET | `/api/v1/admin/audit-logs` | `audit:read` | 审计日志 |
| GET | `/api/v1/admin/settings` | — | 系统设置列表（含 label/description） |
| PUT | `/api/v1/admin/settings/{key}` | `settings:update` | 更新单个系统设置 |
| PUT | `/api/v1/admin/settings` | `settings:update` | 批量更新系统设置 |
| POST | `/api/v1/admin/upload` | `media:upload` | 单文件上传 |
| POST | `/api/v1/admin/upload/batch` | `media:upload` | 批量上传 |
| GET | `/api/v1/admin/upload/records` | `media:upload` | 上传记录分页列表（供媒体库） |

所有写操作均带 `@audit` 审计装饰器和 RBAC 权限校验。

---

## 功能模块 & 已完成需求

| # | 需求 | 状态 | 说明 |
|---|---|---|---|
| ① | w3 → Lens 产品重新分类 | ✅ | 修改 slug + category_id |
| ② | 搜索页面美化 | ✅ | Next.js 搜索 UI 优化 |
| ③ | 产品标签恢复 | ✅ | 后台手动录入标签 → `Product.tags` JSONField；前后端字段全链路（M6 ETL 回填已移除） |
| ④ | 后台管理界面 (Phase 1) | ✅ | JWT 登录/刷新、产品/新闻 CRUD、分类管理、产品拖拽排序、询盘管理 |
| ⑤ | 排序管理 | ✅ | Product/News 加 sort_order，admin 拖拽排序持久化，前端图片 404 兜底 |
| ⑥ | Node 24 迁移 | ✅ | Node 22→24 解决 Next.js 16 Turbopack Web Streams 兼容性问题 |
| ⑦ | 前端优化与美化 | ✅ | 安全消毒/错误降级/搜索实时/清 WP 残留/可访问性/性能/美化 |

### Phase 1 后台管理已交付清单
- JWT 登录 + 无感刷新 (`/api/v1/admin/refresh`)
- 产品/新闻 CRUD（创建/编辑/删除）
- 产品/新闻列表拖拽排序（sort_order 持久化到 DB）
- 分类管理页（含各分类产品计数）
- 产品编辑表单（含标签/相册/属性）
- 询盘列表与状态管理
- 图片上传（单/批，本地磁盘）
- 响应式侧边栏 + Dark Mode
- **富文本编辑器**：零依赖 contentEditable 所见即所得编辑器，工具栏支持 H2/H3/B/I/Link/列表/引用
- **发布时间编辑**：新闻表单支持 `published_at` 日期时间编辑

### 前�� UI 完善（2026-07-24）
- 全面响应式适配：ProductCard/PostCard/列表页/文章正文/联系页加 sm/md 断点
- 文章正文字号 14px→16px，行高 1.43→1.75，h2/h3 加底部分隔线
- WordPress 残留清理：`wp-content`→`article-body` 重命名，`lib/media.ts` 去 WP URL 依赖
- HTML 清洗加固：`cleanPostContent()` 强制剥离所有内联 style，格式由 `.article-body` CSS 统一接管
- 翻页按钮宽高对齐 + 过渡动画精确化

### 前端优化与美化（2026-07-27）
- **安全消毒**：`lib/html-cleaner.ts` 在格式清洗后加 `sanitize-html` 白名单消毒，拦截 `script`/`iframe`/`on*`/`javascript:`；外链自动补 `rel="noopener noreferrer"`
- **错误降级**：产品/新闻列表 fetch 加 try/catch，后端异常时渲染「内容暂不可用 + 重试」而非整页 error
- **搜索实时化**：搜索请求改 `cache:"no-store"`，新上内容即时可搜
- **清理 WP 残留**：删除 `lib/wordpress.ts` 死代码（约 600 行）；empty 文案 WordPress/WooCommerce 改 admin panel；`next.config.ts` 移除含硬编码 IP 的废弃 WP 图床
- **可访问性**：全站 skip-link、全局 focus-visible 焦点环；Footer 外链补 rel；搜索框补 combobox/listbox ARIA
- **性能**：抽 `SafeImage` 子组件使 `ProductCard`/`PostCard` 回归 RSC；`ContactMap` 改 `next/dynamic` 按需加载（Leaflet 不进首屏）
- **美化**：Hero 重做（上浮 stagger + 渐变蒙层 + 毛玻璃徽章 + 滚动引导）；新增深色数据带 `StatsBand`（真实经营指标 + 数字滚动）；全站平滑滚动

### 后台管理优化（2026-07-28）
- **SWR 渐进式接入**：安装 `swr` (v2)，新增 `SWRProvider` 客户端 Provider 注入全局 `fetcher`；询盘列表 `inquiries` 试点改 `useSWR` 拉取 + `mutate()` 重校，删掉手写 `useEffect+setState` 样板；`apiFetch` 放宽 `body` 允许普通对象，消掉 categories/inquiries 的 `TS2322`（运行时本就 JSON 序列化）。
- **运维**：记录 `.next/dev` 缓存写冲突（双 next dev 进程抢写导致整组 `(admin)` 页面 500）的速判与三板斧修复（杀冲突进程 → 清缓存 → 单进程重起）。

### 后续规划（P1/P2）

| 阶段 | 内容 |
|---|---|
| **P1** | 批量上下架/删除（T06）、上传进度 + 裁剪封装（T07） |
| **P2** | 角色/权限管理 UI（审计日志页已完成） |

---

## 设计文档

| 文档 | 说明 |
|---|---|
| `docs/archive/ARCHITECTURE_PLAN.md` | 后端历史架构计划（归档，仅供追溯） |
| `backend/docs/class-diagram.mermaid` | 后端领域类图 |
| `backend/docs/sequence-diagram.mermaid` | 后端关键流程时序图 |
| `docs/archive/integration-plan.md` | 官网与 FastAPI 历史集成方案（归档，仅供追溯） |
| `frontend/docs/class-diagram.mermaid` | 官网集成类图 |
| `frontend/docs/sequence-diagram.mermaid` | 官网集成时序图 |

---

## 数据库迁移

项目使用 aerich 管理 Tortoise ORM 迁移：

```bash
cd backend
aerich migrate --name <描述>
aerich upgrade
```

已生成迁移记录：`backend/migrations/models/`。

---

## 测试

```bash
cd backend

# 安装开发依赖
uv sync --extra dev

# 运行全部测试（需要 PostgreSQL）
pytest tests/ -v

# 运行标签相关测试（纯函数，无需 DB）
pytest tests/test_product_tags.py -v

# 运行 Phase 1 新增单元测试
pytest tests/test_admin_phase1.py -v
```

---

## 部署

### 一键部署（Ubuntu + 1Panel，推荐）

详细步骤见 [`deploy-guide.md`](deploy-guide.md)。推荐由 GitHub CI 构建带 commit/tag 的 GHCR 镜像，再使用手动生产部署工作流执行备份、独立迁移、健康检查和应用镜像回滚；服务器不再现场构建。

本地首次启动或需要升级数据库结构时，迁移需显式执行：

```bash
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d backend frontend admin-next
```

旧的源码现场构建方式仅供本地调试，生产不要使用：

仓库包含代码、开发素材与本地调试快照；生产环境只使用迁移和最小种子：

```bash
git clone https://github.com/zengbbxx11/full-stack-songdian.git && cd full-stack-songdian
cp .env.example .env
# 设置强密码、JWT_SECRET、HTTPS 域名；首次部署临时设 SEED_ON_START=true
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d
# 验证管理员可登录后，将 SEED_ON_START 改回 false 并重新部署
```

### 前端部署

- **官网前端**：`cd frontend && npm run build` → Node 服务（SSR + ISR 模式）
- **后台管理**：`cd admin-next && npm run build` → Node 服务（SSR 模式，含中间件路由守卫）

---

## 开发约定

- **API 统一返回**：`Result{code, msg, msgI18n, data, traceId, timestamp}`，成功 `code="0"`（字符串）
- **分页**：`PageResponse{list, total, page, page_size}`
- **字段命名**：后端蛇形 (`content_html`)，前端驼峰 (`contentHtml`)，转换集中在 `api/*.ts` 映射层
- **软删**：`deleted` 字段标记 (0/1)，复用 `SoftDeleteMixin`
- **审计**：所有写操作加 `@audit(action, resource)`
- **搜索向量**：Tortoise 信号 `post_save` 自动更新 `search_vector`；中文分词依赖 zhparser（缺失时降级 simple）
- **代码注释**：中文
- **包管理**：Python → uv；Node → npm（两个 Next.js 项目均提交 `package-lock.json`）

### 关键约束（踩坑备忘）

- **Node 版本**：必须用 **Node 24.18.0**（`C:\Program Files\nodejs\node.exe`），Node 22 与 Next.js 16 Turbopack 的 Web Streams 不兼容
- **启动命令**：旧 Windows 沙箱若默认 Node 版本不正确，须直调：`"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p <port>`；正常 Node 24 环境可使用 `npm run dev`。
- **admin-next 必须保留 `postcss.config.mjs`**（`@tailwindcss/postcss`）：若删除，Turbopack 原生 Tailwind 内容扫描漏掉 `.tsx` 中的布局类（flex/grid/fixed/block），整页无样式
- **admin-next 严禁使用 `@svgr/webpack`**：本机 Turbopack 的 webpack-loader worker 进程启动即崩（exit 1），会导致所有页面 500
- **middleware matcher**：`src/proxy.ts` 的 matcher 必须显式排除 `/api` 和 `/uploads`，否则登录接口被拦截、浏览器端永远登不进去
- **Turbopack `.next/dev` 缓存写冲突**：若后台所有 `(admin)` 页面同时 500、浏览器报 `An unexpected Turbopack error`，多为两个 next dev 进程抢写同一缓存目录。修法：杀掉 3001 占用进程 → `rm -rf admin-next/.next/dev` → 单进程重起（详见 `admin-next/AGENTS.md` 雷区 ⑧，**别误杀 :3000 的 frontend**）
- **PostgreSQL 症状速判**：后端所有接口返回 `B999001 系统内部错误` → 几乎一定是 PG 没起。先 `netstat -ano | grep :5432` 确认，再用 envkit `pg_ctl` 拉起
## 当前实现补充（2026-08-13）

完整现状请先阅读 [`CURRENT_IMPLEMENTATION.md`](./CURRENT_IMPLEMENTATION.md)。本轮代码与文档同步的关键点如下：

- 生产发布使用 GitHub Actions 构建的 GHCR 不可变镜像，并通过独立 `migrate` profile 执行 Aerich 迁移；生产服务器不现场构建。
- 生产 Redis 为强依赖，`REDIS_REQUIRED=true`；只有本地开发允许内存降级，`/readyz` 会报告降级状态。
- 产品、新闻、分类写入会清理列表、详情及旧 slug 缓存；询盘增加国家、产品来源、落地页、来源页和 UTM 归因字段。
- 后台通知已覆盖新询盘、超时未跟进和 SMTP 失败，并支持按用户已读状态。
- 官网保留首页与 About 页工厂视频、浅色黑红页脚、统一圆角、压缩后的产品 Hero、胶囊面包屑和全宽询盘底栏。
- SEO 结构化数据将 Songdian Technology 标识为 digital camera manufacturer / OEM/ODM camera factory，并统一 Manufacturer `@id`。

生产数据库数据和运行时上传媒体不作为 Git 或镜像构建输入；静态工厂视频是当前前端源码资产，会随前端镜像发布。相关备份与恢复按 [`deploy-guide.md`](./deploy-guide.md) 执行。
