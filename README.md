# Songdian B2B — 工厂外贸官网

基于 FastAPI + Next.js 的 Songdian 工厂 B2B 外贸全栈系统，展示型官网前端（产品目录 + 询盘）与 Next.js 管理后台分离部署。

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| **后端** | FastAPI + Tortoise ORM + asyncpg | Python ≥3.14 / FastAPI 0.139 / Tortoise 1.1.7 |
| **数据库** | PostgreSQL（全文检索 zhparser/降级 simple） | 16 |
| **缓存** | Redis（降级进程内内存实现） | 8 |
| **官网前端** | Next.js + React + Tailwind CSS + shadcn/ui | Next 16.2 / React 19.2 |
| **后台管理** | Next.js + React + Tailwind CSS（admin-next） | Next 16.2 / React 19.2 |
| **迁移引擎** | aerich | ≥0.9 |
| **包管理** | uv（Python）/ pnpm（Node） | — |

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
│   ├── migration/             # 数据迁移 ETL（历史 WordPress 数据导入）
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
└── docs/                      # 架构设计文档 + Mermaid 图
```

---

## 环境要求

- **Python** ≥ 3.14 + [uv](https://docs.astral.sh/uv/)
- **PostgreSQL** 16（建议安装 zhparser 中文分词扩展；缺失时自动降级为 `simple` 配置）
- **Redis** 8（可选；未配置时降级为进程内内存实现）
- **Node.js** ≥ 24 + pnpm（前端 Next.js 16 Turbopack 需要 Node 24，Node 22 的 Web Streams 有兼容性问题）

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

# 数据库迁移
aerich init -t config.TORTOISE_ORM  # 首次
aerich migrate --name init          # 生成迁移
aerich upgrade                      # 执行迁移

# 若新增了模型（如 UploadRecord），额外生成迁移
aerich migrate --name add_uploads
aerich upgrade

# 启动开发服务器
uv run uvicorn main:app --reload --port 8000
```

后端启动后访问：
- API 文档：<http://localhost:8000/docs>
- 健康检查：<http://localhost:8000/api/v1/healthz>

### 3. 官网前端 (Next.js)

```bash
cd frontend
pnpm install
pnpm dev
```

### 4. 后台管理 (admin-next, Next.js)

```bash
cd admin-next
pnpm install
pnpm dev
```

管理后台登录：`admin / Songdian@2026`（可由 `ADMIN_PASSWORD` 环境变量覆盖）

---

## 环境变量

后端 `backend/.env`（关键项）：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgres://postgres:postgres@localhost:5432/songdianB2B` |
| `REDIS_URL` | Redis 连接串（可选） | 未配时降级内置内存缓存 |
| `PORT` | 后端监听端口 | 8000 |
| `ADMIN_PASSWORD` | 种子管理员密码（覆盖硬编码） | `Songdian@2026` |
| `MEDIA_ROOT` | 上传文件本地磁盘目录 | `backend/uploads` |
| `MEDIA_URL` | 上传文件 URL 前缀 | `/uploads` |
| `STORAGE_BACKEND` | 存储后端（当前仅 `local`） | `local` |
| `MAX_UPLOAD_MB` | 上传文件大小上限 | 10 |

前端 `admin/vite.config.ts` 中 `server.proxy` 默认指向 `http://localhost:8000`，若后端端口不同需同步修改。

---

## 默认账号

| 角色 | 用户名 | 密码 | 说明 |
|---|---|---|---|
| 管理员 | `admin` | `Songdian@2026` | 种子数据幂等创建（`seed_on_start=True`）；可通过 `ADMIN_PASSWORD` 环境变量覆盖 |

首次启动时自动种子：admin 账号 + `operator` 角色 + 全套权限码。

---

## API 概览

### 公开接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/healthz` | 存活检查 |
| GET | `/api/v1/readyz` | 就绪检查 |
| GET | `/api/v1/products` | 产品列表（分页，支持 category/keyword/order_by） |
| GET | `/api/v1/products/{slug}` | 产品详情（含相册/属性/标签） |
| GET | `/api/v1/news` | 新闻列表 |
| GET | `/api/v1/news/{slug}` | 新闻详情 |
| GET | `/api/v1/product-categories` | 产品分类（按 sort_order 排序） |
| GET | `/api/v1/news-categories` | 新闻分类（按 sort_order 排序） |
| GET | `/api/v1/search` | 全文搜索（PG TSVector，未装 zhparser 时降级 simple） |
| POST | `/api/v1/inquiries` | 提交询盘（幂等键防重） |

### Admin 接口（需 JWT + RBAC）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/v1/admin/login` | — | 登录（限流） |
| POST | `/api/v1/admin/logout` | — | 登出（需 token） |
| POST | `/api/v1/admin/refresh` | — | 无感刷新令牌（令牌族轮换） |
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
| POST | `/api/v1/admin/upload` | `media:upload` | 单文件上传 |
| POST | `/api/v1/admin/upload/batch` | `media:upload` | 批量上传 |

所有写操作均带 `@audit` 审计装饰器和 RBAC 权限校验。

---

## 功能模块 & 已完成需求

| # | 需求 | 状态 | 说明 |
|---|---|---|---|
| ① | w3 → Lens 产品重新分类 | ✅ | 修改 slug + category_id |
| ② | 搜索页面美化 | ✅ | Next.js 搜索 UI 优化 |
| ③ | 产品标签恢复 | ✅ | WP tags → Product.tags JSONField；ETL 回填；前后端字段全链路 |
| ④ | 后台管理界面 (Phase 1) | ✅ | JWT 登录/刷新、产品/新闻 CRUD、分类管理、产品拖拽排序、询盘管理 |
| ⑤ | 排序管理 | ✅ | Product/News 加 sort_order，admin 拖拽排序持久化，前端图片 404 兜底 |
| ⑥ | Node 24 迁移 | ✅ | Node 22→24 解决 Next.js 16 Turbopack Web Streams 兼容性问题 |

### Phase 1 后台管理已交付清单
- JWT 登录 + 无感刷新 (`/admin/auth/refresh`)
- 产品/新闻 CRUD（创建/编辑/删除）
- 产品/新闻列表拖拽排序（sort_order 持久化到 DB）
- 分类管理页（含各分类产品计数）
- 产品编辑表单（含标签/相册/属性）
- 询盘列表与状态管理
- 图片上传（单/批，本地磁盘）
- 响应式侧边栏 + Dark Mode

### 待开发（P1/P2）

| 阶段 | 内容 |
|---|---|
| **P1** | 批量上下架/删除（T06）、上传进度 + 裁剪封装（T07） |
| **P2** | 审计日志页 + 角色/权限管理 UI（T08） |

---

## 设计文档

| 文档 | 说明 |
|---|---|
| `docs/design-admin-ui.md` | 后台管理界面系统设计 + 任务分解 |
| `docs/design-product-tags.md` | 产品标签恢复设计 |
| `docs/admin-ui-class-diagram.mermaid` | 后台管理类图 |
| `docs/admin-ui-sequence-diagram.mermaid` | 后台管理时序图 |
| `docs/class-diagram-product-tags.mermaid` | 标签恢复类图 |
| `docs/sequence-diagram-product-tags.mermaid` | 标签恢复时序图 |

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

### Docker（后端）

后端含 Dockerfile + docker-compose（含 PostgreSQL）：

```bash
cd backend/docker
docker-compose up -d
```

### 前端部署

- **官网前端**：`cd frontend && pnpm build` → 静态导出或 Node 服务
- **后台管理**：`cd admin-next && pnpm build` → 纯静态 `out/`，部署到 Nginx/CDN

---

## 开发约定

- **API 统一返回**：`Result{code, msg, msgI18n, data, traceId, timestamp}`，成功 `code="0"`（字符串）
- **分页**：`PageResponse{list, total, page, page_size}`
- **字段命名**：后端蛇形 (`content_html`)，前端驼峰 (`contentHtml`)，转换集中在 `api/*.ts` 映射层
- **软删**：`deleted` 字段标记 (0/1)，复用 `SoftDeleteMixin`
- **审计**：所有写操作加 `@audit(action, resource)`
- **搜索向量**：Tortoise 信号 `post_save` 自动更新 `search_vector`；中文分词依赖 zhparser（缺失时降级 simple）
- **代码注释**：中文
- **包管理**：Python → uv；Node → pnpm
