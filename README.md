# Songdian B2B — 数码相机 OEM/ODM 外贸官网

松典官网全栈项目，包含公开官网、FastAPI 内容与询盘后端、Next.js 管理后台，以及 PostgreSQL、Redis、CI/CD 和生产部署脚本。

生产域名：

- 官网：`https://www.zsaki.icu`
- API：`https://api.zsaki.icu`
- 管理后台：`https://admin.zsaki.icu`

当前实际交付边界以 [CURRENT_IMPLEMENTATION.md](./CURRENT_IMPLEMENTATION.md) 为准；生产操作以 [deploy-guide.md](./deploy-guide.md) 为准。README 只作为项目入口，不记录按日期追加的发布历史。

## 系统组成

| 目录 | 技术 | 职责 |
| --- | --- | --- |
| `frontend/` | Next.js 16、React 19、Tailwind CSS 4 | 官网、产品/新闻、SEO/GEO、询盘入口 |
| `backend/` | FastAPI、Tortoise ORM、Aerich | 内容 API、询盘、搜索、媒体、RBAC、审计 |
| `admin-next/` | Next.js | 产品、新闻、询盘、媒体、用户与系统设置管理 |
| `db/` | SQL/CSV 快照 | 仅用于本地开发，禁止导入生产环境 |
| `scripts/` | Bash/PowerShell | 部署、备份、冒烟检查和辅助任务 |

运行时服务由 Docker Compose 编排：PostgreSQL、Redis、backend、frontend、admin-next。生产发布使用 GitHub Actions 构建的 GHCR 镜像和完整 commit SHA，不在服务器上随意覆盖源码或数据卷。

## 环境要求

- Node.js `24.18.0`，版本见 `.node-version`
- Python `3.14+`（以 `backend/pyproject.toml` 的 `requires-python` 为准）
- `uv`
- PostgreSQL `18` 与 Redis；本地也可直接使用 Docker Compose
- Docker 与 Docker Compose，用于全栈联调和部署验证

## 快速开始

### 1. 环境变量

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
cp admin-next/.env.example admin-next/.env.local
```

不要提交 `.env`、`.env.local`、数据库凭据、SMTP 密码或生产密钥。

### 2. 启动后端

```bash
cd backend
uv sync --extra dev
uv run aerich upgrade
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

后端健康检查：`http://127.0.0.1:8000/healthz` 和 `http://127.0.0.1:8000/readyz`。

### 3. 启动官网

```bash
cd frontend
npm install
npm run dev
```

官网默认地址：`http://localhost:3000`。完整说明见 [frontend/README.md](./frontend/README.md)。

### 4. 启动管理后台

```bash
cd admin-next
npm install
npm run dev
```

管理后台默认地址：`http://localhost:3001`。

### 5. Docker Compose 联调

```bash
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d backend frontend admin-next
docker compose ps
```

迁移必须作为独立发布步骤成功完成后再切换应用。不要删除 PostgreSQL、Redis 或上传媒体数据卷来解决迁移问题。

## 常用验证

```bash
# backend
cd backend
uv run ruff check .
uv run pytest

# frontend
cd ../frontend
npm run lint
npm run verify:seo
npm run build
npm run test:e2e

# admin-next
cd ../admin-next
npm run lint
npm run build
```

## 核心数据流

- 官网产品、新闻、搜索与询盘通过 FastAPI `/api/v1` 接口访问。
- 产品与新闻正文由管理后台维护，公开页面使用 SSR/ISR；内容发布后由后端触发安全的 ISR revalidation。
- 询盘写入 PostgreSQL，由后端负责 CRM 状态、归因、审计和 SMTP 通知；不写入前端 JSON 文件。
- 运行时上传媒体位于独立数据卷，不随 Git checkout 或前端镜像覆盖。
- `db/*.sql` 与 `db/*.csv` 是本地快照，不是生产初始化源。

## 官网 SEO、GEO 与静态媒体

- 全站具有 canonical、sitemap、robots、Open Graph、Twitter Card 和结构化数据。
- 默认社交图为 `frontend/public/og/og-default.jpg`，固定 1200×630；产品和新闻详情优先使用内容图片，无图时回退到默认图。
- `/llms.txt` 是实验性的 AI 站点导览，不是正式标准，也不保证搜索排名或引用。公司事实必须与官网公开内容一致。
- About 页工厂视频使用 MP4、WebP poster、`preload="none"`；WebM 是可选增强。
- 静态社交图和视频 poster 可在 `frontend/` 中运行 `npm run generate:social-assets` 重新生成。
- `ALLOW_LOCAL_IMAGE_OPTIMIZATION=true` 只允许用于本地开发；生产环境必须关闭或不设置。

## 部署原则

正式生产发布：

1. 推送完整、可复现的 commit。
2. 等待 GitHub Actions 的 `CI` job 和同一 commit 的 `images` 矩阵全部成功；后者必须包含 backend、frontend、admin-next 三个镜像。
3. 从 GitHub commit 详情页复制 40 位完整 commit SHA，不使用 Actions 列表中的短 SHA。
4. 默认通过 `Deploy production` 发布；手动更新时，先在服务器执行 `git pull --ff-only origin master`，再用 `git rev-parse HEAD` 核对服务器 SHA 与目标 SHA 一致。
5. 使用 `scripts/deploy.sh` 发布。脚本先备份，再迁移、切换镜像并执行冒烟检查；发布后还要检查 `/readyz`、官网、后台、`/llms.txt`、OG 图和视频 Range 响应。
6. 失败时回退应用镜像；数据库回退必须基于上线前备份和单独评估。

严禁：

- 在生产环境执行 `DROP SCHEMA` 或删除 `pg_data`。
- 把 `db/` 快照导入生产数据库。
- 把公网 `3000`、`3001`、`8000` 端口直接暴露。
- 在生产启用 `dangerouslyAllowLocalIP` 对应环境变量。
- 临时向运行中的容器复制缺失静态资产来掩盖 CI 构建问题。

详细的手动更新顺序、完整 SHA 核对、OpenResty、HTTPS、备份恢复和上线检查见 [deploy-guide.md](./deploy-guide.md)。

## 文档索引

- [CURRENT_IMPLEMENTATION.md](./CURRENT_IMPLEMENTATION.md)：当前实现和交付边界
- [deploy-guide.md](./deploy-guide.md)：生产部署与运维
- [frontend/README.md](./frontend/README.md)：官网开发、数据流、SEO/GEO 和媒体资产
- [frontend/DESIGN-tesla.md](./frontend/DESIGN-tesla.md)：官网视觉系统
- [frontend/docs/class-diagram.mermaid](./frontend/docs/class-diagram.mermaid) / [sequence-diagram.mermaid](./frontend/docs/sequence-diagram.mermaid)：官网结构与调用时序
- [backend/docs/class-diagram.mermaid](./backend/docs/class-diagram.mermaid) / [sequence-diagram.mermaid](./backend/docs/sequence-diagram.mermaid)：后端结构与调用时序
- [admin-next/README.md](./admin-next/README.md)：管理后台说明

## 开发约定

- API 响应使用统一结果封装，公开接口与管理接口保持清晰边界。
- 数据库结构变化通过 Aerich 迁移交付，不靠运行时自动建表。
- 前端优先使用 Server Components；只有交互所需的最小边界使用 Client Components。
- 静态内容与公司事实优先集中到 `frontend/lib/content-data.ts`，避免多个页面分别硬编码。
- 修改 SEO、路由、媒体或公开公司资料时，同步运行相关验证并更新对应专业文档。
- 历史交付记录使用 Git history、发布记录或独立 changelog，不继续追加到 README。
