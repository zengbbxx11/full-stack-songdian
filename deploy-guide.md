# Songdian B2B 生产部署指南（1Panel + Docker Compose）

> **当前部署依据**：本文档与仓库当前 Compose、Cookie-only 管理后台认证和 `zsaki.icu` 域名配置同步。历史审计与架构方案仅作记录，不可替代本文档。

> 目标服务器：`106.53.220.184`（Ubuntu + 1Panel）
> 登录用户：`ubuntu`（家目录 `/home/ubuntu`）
> 项目根目录：`/home/ubuntu/full-stack-songdian`（即 `~`）
> 仓库：`https://github.com/zengbbxx11/full-stack-songdian`

## 推荐发布方式：CI 构建版本镜像

仓库现在提供两条 GitHub Actions 工作流：

- `.github/workflows/ci.yml`：在提交和 PR 上运行后端测试、前后台 lint/build、Compose 校验；master 分支和 `v*` 标签通过后，将 backend、frontend、admin 三个不可变版本镜像推送到 GHCR。
- `.github/workflows/deploy.yml`：手动输入完整 commit SHA 或 release tag，上传部署清单并在服务器执行备份、独立迁移、指定版本切换和健康检查。应用健康检查失败时回退到上一个已成功版本；数据库迁移不会自动降级，破坏性迁移必须采用向后兼容的分阶段策略。

首次使用前，在 GitHub `production` Environment 配置以下 Secrets：

| Secret | 用途 |
|---|---|
| `PROD_HOST` / `PROD_USER` / `PROD_PATH` | 生产服务器、SSH 用户和项目目录 |
| `PROD_SSH_KEY` / `PROD_KNOWN_HOSTS` | SSH 私钥和固定服务器主机指纹 |
| `GHCR_USERNAME` / `GHCR_TOKEN` | 服务器拉取私有 GHCR 镜像；Token 只需 packages:read |

同时在 GitHub Actions Variables（Repository 或 `production` Environment）配置前端构建变量：

| Variable | 生产值 |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.zsaki.icu` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.zsaki.icu` |
| `NEXT_PUBLIC_IMAGE_HOST` | `api.zsaki.icu` |

> 这些 `NEXT_PUBLIC_*` 值在 CI 构建镜像时写入客户端产物。只修改服务器根目录 `.env` 不会改变已发布的 GHCR 前端镜像；域名或 API 地址变化后必须重新运行 CI 并部署新镜像。

服务器的 `.env` 继续只保存在生产机，不上传 GitHub。首次自动发布前应先运行一次 `scripts/backup.sh` 并做恢复演练。

生产发布默认入口：GitHub Actions → `Deploy production` → Run workflow → 输入本次完整 commit SHA。若必须由运维人员手动发布，可按「二、获取代码」中的手动部署章节，在服务器上拉取已通过 CI 的 GHCR 镜像并执行 `scripts/deploy.sh`；不要在服务器现场构建应用镜像，除非使用文档中的备用流程。
> **数据保护**：Git 仓库只包含代码和少量随镜像发布的静态资源；线上 PostgreSQL、运营上传文件、产品和新闻数据位于 Docker 命名卷，绝不会随 `git clone` 或 `git pull` 获取。已有服务器必须先备份，严禁删除 `pg_data`、`uploads_data` 或导入 `db/` 下的开发快照。

---

## 架构总览

```
浏览器 ──https://www.zsaki.icu/────► OpenResty(:443) ──127.0.0.1:3000──► frontend 容器
浏览器 ──https://admin.zsaki.icu/──► OpenResty(:443) ──127.0.0.1:3001──► admin-next 容器
浏览器 ──https://api.zsaki.icu/────► OpenResty(:443) ──127.0.0.1:8000──► backend 容器
浏览器 ──https://zsaki.icu/────────► OpenResty(:443) ──301──────────────► www.zsaki.icu
                                                  │
                       postgres:5432 / redis:6379 ← Compose 内数据服务（与应用同网络）
```

**关键设计：**
- 应用三服务（backend / frontend / admin-next）+ 数据两层（postgres / redis）**全部由 Docker Compose 编排、构建镜像、保活**。
- PostgreSQL（**18 线**，官方 `postgres:18-bookworm`）/ Redis 用**官方镜像**直接进 Compose；生产结构由 aerich 迁移创建，不依赖开发数据库快照。
- 仅 1Panel 的 **OpenResty** 留在 Compose 之外，负责公网反代；管理后台必须使用已备案域名和 HTTPS，以支持 Secure HttpOnly 会话 Cookie。
- 不再需要「uv venv 直跑 + systemd」「1Panel 商店 PG/Redis 容器」「Node 容器 + pm2」那套。

---

## 一、服务器环境（1Panel 仅装两样）

登录 1Panel（:8090）→ 应用商店 / 容器模块，确认：

| 应用 | 用途 |
|------|------|
| OpenResty | 反向代理（host 网络模式） |
| Docker / 容器 | 提供 docker engine + docker compose 插件，用于编排本项目全部服务（含 PG/Redis） |

> 注：1Panel 自带「容器」模块可一键安装 Docker 与 compose；PG/Redis **不再经 1Panel 商店安装**，改由本 Compose 用官方镜像自建，数据落在命名卷。

---

## 二、获取代码

### 2.1 首次部署（新服务器、无业务数据）

```bash
ssh ubuntu@106.53.220.184
cd ~
git clone https://github.com/zengbbxx11/full-stack-songdian.git
cd full-stack-songdian
```

```
/home/ubuntu/full-stack-songdian/
├── docker-compose.yml   # 五服务编排（应用三 + PG + Redis）
├── .env.example         # Compose 级别环境变量模板（复制为 .env 填真实值）
├── backend/             # FastAPI（含 Dockerfile / .dockerignore）
├── frontend/            # Next.js 官网（含 Dockerfile / .dockerignore）
├── admin-next/          # Next.js 管理后台（含 Dockerfile / .dockerignore）
└── db/                  # 仅本地开发快照，禁止导入生产
```

> 数据库（库名 / 用户）由 `docker-compose.yml` 的 `postgres` 服务根据 `.env` 的 `PG_USER` / `PG_PASSWORD` / `PG_DB` 在**首次启动**时自动创建，无需手动建库。

### 2.2 更新已有服务器（保留现有产品、新闻和上传文件）

正式生产更新从 GitHub Actions 的 `Deploy production` 工作流开始：输入已经通过 CI 的完整 commit SHA 或 release tag。工作流会将版本传给服务器上的 `scripts/deploy.sh`，由脚本按顺序完成备份、拉取三组 GHCR 应用镜像、启动 PostgreSQL/Redis、执行独立迁移、以 `--no-build` 切换应用并运行冒烟检查。

服务器更新时不需要现场构建应用。自动发布由 GitHub Actions 上传最新的 Compose 文件和部署脚本；手动发布时只需将服务器 checkout 中的编排文件同步到目标版本，应用源码、前端构建变量和镜像内容仍以 CI 产出的指定版本为准。修改任意 `NEXT_PUBLIC_*` 构建变量时，应重新运行 CI 并发布新的镜像版本。

```bash
cd /home/ubuntu/full-stack-songdian

# 备份由 scripts/deploy.sh 在 Deploy production 工作流中自动执行

# 正式发布默认通过 GitHub Actions 的 Deploy production 工作流发布指定 SHA/tag
# 如采用手动更新，必须完整执行下方 2.3 节的 CI、SHA 核对、部署和验收流程

docker compose --env-file .env ps
```

> 禁止执行 `docker compose down -v`、`docker volume rm`、`DROP SCHEMA`，也不要以 `db/*.sql` 或 `db/*.csv` 覆盖生产库。

### 2.3 手动部署已有服务器（拉取 GHCR 版本镜像）

本节适用于 GitHub Actions 的 `CI` 工作流已经成功，且 `images (backend, backend)`、`images (frontend, frontend)`、`images (admin-next, admin)` 均已完成的情况。手动部署仍然使用仓库的 `scripts/deploy.sh`，因此会保留备份、独立迁移、健康检查和应用回滚逻辑。

#### 2.3.1 发布前确认并获取完整 commit SHA

手动更新只允许使用同一 commit 的完整 40 位 SHA。先在 GitHub Actions 打开该提交对应的 `CI` 运行记录，确认以下 job 全部成功：

- `backend`、`frontend`、`admin`、`compose`、`migration`、`e2e`。
- `images` 矩阵中的 `backend`、`frontend`、`admin-next` 三行（对应镜像名分别为 `backend`、`frontend`、`admin`）。

`images` 只会在 `master` 或 `v*` tag 的非 PR 运行中生成。如果 `images` 被跳过，不能按本节发布。

在成功的 CI 运行顶部点击短 SHA，进入 commit 详情页后点击复制按钮，获取 40 位完整 SHA；也可以从 commit 详情 URL 的 `/commit/<完整 SHA>` 部分复制。不要使用 Actions 列表中的 7 位短 SHA，也不要把 `<`、`>` 一起写入命令。

#### 2.3.2 同步部署编排文件并核对版本

服务器上的 `.env` 只保存生产密钥，不随 Git 更新。先确认 checkout 没有本地代码改动，再同步 `master` 中的 Compose 文件和部署脚本：

```bash
ssh ubuntu@106.53.220.184
cd /home/ubuntu/full-stack-songdian

# 替换为上一步从 GitHub 复制的 40 位完整 SHA；不要使用短 SHA
DEPLOY_SHA='CI 与 images 均已成功的完整 commit SHA'
if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: DEPLOY_SHA must be the 40-character lowercase commit SHA" >&2
  exit 2
fi

git status --short
# 如果这里出现未提交的业务文件，先停止并处理，不要强制覆盖。

test -z "$(git status --porcelain)" || {
  echo "ERROR: working tree is not clean; stop instead of overwriting local changes" >&2
  exit 1
}

test "$(git branch --show-current)" = "master" || {
  echo "ERROR: expected the production checkout to be on master" >&2
  exit 1
}

git fetch origin
git pull --ff-only origin master

git show -s --format='commit %H%nsubject %s' HEAD
SERVER_SHA="$(git rev-parse HEAD)"
if [ "$SERVER_SHA" != "$DEPLOY_SHA" ]; then
  echo "ERROR: server SHA $SERVER_SHA does not match target SHA $DEPLOY_SHA" >&2
  echo "Stop and use the exact CI-passed commit; do not deploy this checkout." >&2
  exit 1
fi
```

服务器代码版本确认无误后，检查生产环境文件和 Compose 配置：

```bash
test -f .env || { echo "ERROR: .env missing" >&2; exit 1; }
docker compose --env-file .env config -q
```

#### 2.3.3 登录 GHCR 并执行部署

GHCR 为私有仓库时，使用只有 `packages:read` 权限的 GitHub Token。不要把 Token 写进命令行参数或提交到文件：

```bash
export GHCR_USERNAME='你的 GitHub 用户名'
read -rsp "GHCR token: " GHCR_TOKEN
echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io \
  -u "$GHCR_USERNAME" \
  --password-stdin
unset GHCR_TOKEN GHCR_USERNAME
```

使用 2.3.2 中已经核对过的 `DEPLOY_SHA` 执行发布。不要改成另一个 SHA，也不要绕过 `scripts/deploy.sh` 直接切换应用容器：

```bash
cd /home/ubuntu/full-stack-songdian
test -n "${DEPLOY_SHA:-}" || {
  echo "ERROR: DEPLOY_SHA is not set; use the SHA verified in 2.3.2" >&2
  exit 2
}
test "$(git rev-parse HEAD)" = "$DEPLOY_SHA" || {
  echo "ERROR: current checkout no longer matches DEPLOY_SHA" >&2
  exit 1
}
IMAGE_REGISTRY='ghcr.io/zengbbxx11/full-stack-songdian' \
  bash scripts/deploy.sh "$DEPLOY_SHA"
```

`scripts/deploy.sh` 会依次执行：

1. 备份当前部署状态。
2. 拉取 backend、frontend、admin 三个指定版本镜像。
3. 等待 PostgreSQL 和 Redis 健康。
4. 执行独立数据库迁移。
5. 以 `--no-build` 切换应用容器。
6. 运行后端、官网、管理后台和搜索冒烟检查。
7. 新版本失败时回滚到上一个已记录的应用版本。

成功时应看到：

```text
Deployment <commit-sha> completed successfully.
```

#### 2.3.4 手动部署后的验证

```bash
cd /home/ubuntu/full-stack-songdian

# 五个服务状态
docker compose --env-file .env ps

# 确认运行中的三组应用镜像标签和脚本记录的版本
docker compose --env-file .env images
cat .deploy/current-version

# 确认前端容器内包含 About 页视频、poster 与默认社交图
docker compose --env-file .env exec -T frontend sh -lc \
  'test -s /app/public/Video/SongdianFactoryVideo.mp4 && \
   test -s /app/public/Video/factory-poster.webp && \
   test -s /app/public/og/og-default.jpg && \
   ls -lh /app/public/Video/SongdianFactoryVideo.mp4 \
          /app/public/Video/factory-poster.webp \
          /app/public/og/og-default.jpg'

# 通过公网反代检查 API、官网和管理后台
curl -fsS --max-time 15 https://api.zsaki.icu/readyz
curl -fsS --max-time 15 -o /dev/null -w "website: %{http_code}\n" \
  https://www.zsaki.icu/
curl -fsS --max-time 15 -o /dev/null -w "admin: %{http_code}\n" \
  https://admin.zsaki.icu/signin

# /llms.txt：应返回 200，响应类型应为 text/plain
curl -fsS --max-time 15 -D - -o /tmp/songdian-llms.txt \
  https://www.zsaki.icu/llms.txt

# 默认 OG 图：应返回 200，响应类型应为 image/jpeg
curl -fsS --max-time 15 -D - -o /dev/null \
  https://www.zsaki.icu/og/og-default.jpg

# 官网 About 页
curl -sS -o /dev/null -w "%{http_code}\n" \
  http://127.0.0.1:3000/about

# 实验性 AI 站点导览：应返回 200 与 text/plain
curl -sS -D - -o /tmp/songdian-llms.txt \
  http://127.0.0.1:3000/llms.txt

# 视频 Range 请求：应返回 206、video/mp4 和 content-range
curl -sS -D - -o /dev/null \
  -H "Range: bytes=0-1023" \
  https://www.zsaki.icu/Video/SongdianFactoryVideo.mp4
```

视频请求正常时应至少包含：

```text
HTTP/2 206
content-type: video/mp4
content-range: bytes 0-1023/<total-size>
accept-ranges: bytes
```

如果容器内缺少视频、poster 或默认 OG 图，不要手动从宿主机临时复制到容器中；应检查这些静态源码资产是否进入发布 commit、是否被 `.gitignore` 排除，以及 CI 是否确实构建了对应 frontend 镜像，再重新部署正确的 SHA。

### 2.4 手动现场构建 frontend（备用）

只有在 GHCR 镜像暂时不可用、且本次变更仅涉及 frontend 时，才使用这个备用流程。它不会替代完整生产发布流程，也不会自动完成 backend/admin 镜像切换或数据库迁移。

```bash
cd /home/ubuntu/full-stack-songdian
git fetch origin
git pull --ff-only origin master

test -s frontend/public/Video/SongdianFactoryVideo.mp4 || {
  echo "ERROR: factory video is missing" >&2
  exit 1
}

test -s frontend/public/Video/factory-poster.webp || {
  echo "ERROR: factory video poster is missing" >&2
  exit 1
}

test -s frontend/public/og/og-default.jpg || {
  echo "ERROR: default social image is missing" >&2
  exit 1
}

test -f .env || { echo "ERROR: .env missing" >&2; exit 1; }

docker compose --env-file .env build frontend
docker compose --env-file .env up -d --no-deps frontend
docker compose --env-file .env exec -T frontend sh -lc \
  'test -s /app/public/Video/SongdianFactoryVideo.mp4 && \
   test -s /app/public/Video/factory-poster.webp && \
   test -s /app/public/og/og-default.jpg'
```

如果同时修改了 backend、admin-next 或数据库迁移，不要只构建 frontend；应使用 GHCR 版本镜像配合 `scripts/deploy.sh`，或在隔离环境完整构建并验证全部服务后再发布。

---

## 三、配置 Compose 环境变量

```bash
cd /home/ubuntu/full-stack-songdian
cp .env.example .env
vim .env     # 至少修改 PG_PASSWORD / JWT_SECRET / ADMIN_PASSWORD，并填写 HTTPS 域名配置
```

`.env` 字段说明（详见 `.env.example` 注释）：

| 变量 | 说明 |
|------|------|
| `PG_USER` / `PG_PASSWORD` / `PG_DB` | Compose 内 postgres 服务初始化所用（首次建库生效；后续改此处不影响已建库） |
| `JWT_SECRET` | ≥32 字节随机值；**backend 与 admin-next 共用同一值**（admin 用它服务端校验令牌） |
| `REVALIDATE_SECRET` | ≥32 字节的另一组随机值；backend 与 frontend 共用，用于后台发布后安全清除官网 ISR 缓存 |
| `ADMIN_PASSWORD` | 初始管理员密码（仅在 `SEED_ON_START=true` 由应用种子器使用时生效） |
| `SEED_ON_START` | 首次部署临时设 `true`，仅初始化角色、权限和 admin；验证后改回 `false` |
| `SEED_CONTENT_CATEGORIES` | 生产保持 `false`；设为 `true` 才额外写入演示分类，绝不删除或覆盖现有产品、新闻及分类 |
| `CORS_ORIGINS` | 官网 + 后台公网域名，逗号分隔，**禁用通配** |
| `NEXT_PUBLIC_API_URL` | 浏览器直连的 API 地址（走 OpenResty 反代） |
| `ALLOW_LOCAL_IMAGE_OPTIMIZATION` | 仅限本地开发允许图片优化器访问 loopback/局域网地址；生产必须不设置或保持 `false`。已由 `NODE_ENV !== "production"` 硬门槛兜底：生产构建即使显式设为 `true` 也恒为 `false`，无需依赖运维纪律 |
| `TRUSTED_PROXIES` | 留空时自动识别 Docker 网桥网关；仅自定义反代拓扑时填写可信代理 IP，禁止使用通配符 |

> ⚠️ `.env` 含密钥，已被根目录 `.gitignore` 忽略，绝不入库。
> 注：`DATABASE_URL` / `REDIS_URL` 由 compose 直接按服务名拼接（`postgres` / `redis`），**无需在 .env 配置**，避免暴露宿主机地址。

---

## 四、关于中文全文检索（zhparser）

本项目后端 `to_tsvector('zh', col)` 依赖 PostgreSQL 的 **zhparser** 扩展做中文分词。当前部署**未编译 zhparser**（PG 用官方纯净镜像），因此：

- 后端已内置**降级兜底**：探测不到 `zh` 配置时自动改用内置 `simple` 配置，中文关键词搜索**仍可工作**，只是分词粒度较粗（按非字母数字切分），搜索质量略低于 zhparser。
- 若未来需要生产级中文搜索，可改为「自定义 PG 镜像编译 zhparser」（构建期需联网拉源码，属可选增强，**非上线必需**）。
- 无论使用 TSVector、PostgreSQL ILIKE 降级还是本地 SQLite LIKE，联合结果都在数据库分页前按产品分组优先；新闻排在产品后并按 `created_time DESC, id DESC`。降级提示固定为英文 `Basic search mode`。

---

## 五、构建并启动（Docker Compose 全栈）

> ℹ️ **产品 URL 规范化已改为运行时数据驱动，不再是构建前置**：`frontend/proxy.ts` 在边缘层调用后端 `GET /api/v1/products/{slug}/canonical` 解析产品**当前**分类并做 308，后台修改分类后即时生效。后端明确返回 404（未发布/不存在）时不再回退旧映射，交由页面渲染 404。
> `frontend/lib/generated/canonical-map.ts` 仅作为“后端不可达”时的过渡兜底。若确实要刷新它（例如批量调整过分类），在后端可达时手动执行即可，不是发布必做项：
> ```bash
> cd frontend && npm run gen:map && git add lib/generated/canonical-map.ts && git commit -m "chore: refresh product canonical map" && cd ..
> ```
> 注意 `scripts/gen-canonical-map.mjs` 现在按 `page_size=50` 翻页拉取全量产品（后端单页上限为 50）。

### 5.1 本地或隔离环境首次构建

```bash
cd /home/ubuntu/full-stack-songdian

# 确保有 .env（含 PG_PASSWORD / JWT_SECRET / ADMIN_PASSWORD / NEXT_PUBLIC_API_URL 等）
test -f .env || { echo "ERROR: .env missing!"; exit 1; }

# 本地首次部署可构建；正式生产优先使用 GitHub Actions 构建的 GHCR 镜像
docker compose build
```

正式生产首次部署同样先由 GitHub Actions 构建并推送镜像，再运行 `Deploy production`。服务器只拉取指定版本，不把源码 checkout 当作生产构建上下文。

### 5.2 本地或隔离环境启动（按健康依赖顺序自动编排）

本节命令用于本地或隔离环境验证 Compose 启动链。正式生产无论采用 GitHub Actions 自动发布还是按 2.3 节手动发布，都应由 `scripts/deploy.sh` 负责备份、迁移、应用切换和冒烟检查；不要绕过脚本直接在生产环境启动新版本。

```bash
# 先启动数据服务，再显式迁移；迁移失败时不要启动新应用版本
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate

# 迁移成功后启动应用
docker compose up -d backend frontend admin-next
```

### 5.3 逐服务验证

```bash
# 1) 五服务状态（全部应为 Up 或 healthy）
docker compose ps

# 2) 后端存活
curl -s http://127.0.0.1:8000/healthz
# → {"status":"alive"}

# 3) 后端就绪（含 DB + Redis 探测）
curl -s http://127.0.0.1:8000/readyz
# → {"status":"ready","db":true,"redis":true}

# 4) 产品列表（确认表已建好；已有服务器应仍返回原有业务数据）
curl -s "http://127.0.0.1:8000/api/v1/products?page_size=1" | python3 -m json.tool | head -5

# 5) 询盘公开回执（最小响应：仅 biz_req_no/received/status，绝不含内部 CRM 字段）
curl -s -X POST http://127.0.0.1:8000/api/v1/inquiries \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"t@t.com","message":"deploy check","biz_req_no":"deploy-check-1"}' \
  | python3 -m json.tool | grep -E '"biz_req_no"|"received"|"status"'

# 5b) 同一业务单号提交**不同内容** → 拒绝（C400001），且不回显已有询盘内容
curl -s -X POST http://127.0.0.1:8000/api/v1/inquiries \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"t@t.com","message":"different content","biz_req_no":"deploy-check-1"}' \
  | python3 -m json.tool | grep -E '"code"'
# → "code": "C400001"

# 6) 官网前端（容器内 localhost:3000 可达）
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
# → 200

# 7) 管理后台
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/signin
# → 200

# 8) 新端点验证（登录后保存 Secure HttpOnly Cookie）
COOKIE_JAR=/tmp/songdian-admin.cookies
curl -s -c "$COOKIE_JAR" -X POST https://admin.zsaki.icu/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}"

# Dashboard stats
curl -s -b "$COOKIE_JAR" "https://admin.zsaki.icu/api/v1/admin/stats"
# → {"code":"0","data":{"counts":{...},"inquiry_countries":[...],"inquiry_status":{...}}}

# 审计日志（keyword 在分页前于数据库过滤 username/action/resource，total 为过滤后总数）
curl -s -b "$COOKIE_JAR" "https://admin.zsaki.icu/api/v1/admin/audit-logs?page_size=1&keyword=admin"
# → {"code":"0","data":{"list":[...],"total":...}}

# 用户列表
curl -s -b "$COOKIE_JAR" "https://admin.zsaki.icu/api/v1/admin/users/list"
# → {"code":"0","data":[{"username":"admin",...}]}
```

### 5.4 启动链路说明

| 阶段 | 容器 | 动作 |
|------|------|------|
| 1 | postgres | 初始化，`pg_isready` 健康检查通过 |
| 2 | redis | 初始化，`redis-cli PING` 健康检查通过 |
| 3 | migrate | 依赖 postgres+redis 均健康，作为一次性发布步骤显式运行 `aerich upgrade` |
| 4 | backend | 迁移成功后启动 `uvicorn`；应用启动过程不再隐式修改数据库 |
| 5 | frontend | 依赖 backend `/readyz` 探活 → `next start -p 3000` |
| 6 | admin-next | 依赖 backend `/readyz` 探活 → `next start -p 3001` |

**关键：aerich upgrade 独立执行**——发布脚本先备份，再通过 `docker compose --profile tools run --rm migrate` 运行迁移；只有迁移成功才切换应用镜像。backend 启动时由 `scripts/start.sh` 同步内置**图片**资源（`uploads/products|news|2026`）并清理媒体目录中残留的代码文件，然后启动 Uvicorn。不要删除 `pg_data` 或重置 schema。

---

## 六、生产初始化（一次性）

生产环境只使用 `aerich upgrade` 创建结构，再用应用最小种子创建角色、权限和首个管理员；**禁止导入** `db/seed_data.sql`、`db/songdianB2B_full.sql` 或任何 `db/*.csv`。它们是本地开发快照，含业务记录和账号密码哈希。

> 以下操作只适用于**全新、空白数据库**。已有生产数据库保持 `SEED_ON_START=false`，只运行迁移和常规更新，不能重新播种或导入快照。

```bash
cd /home/ubuntu/full-stack-songdian

# 1) .env 设置强随机 ADMIN_PASSWORD，并暂时开启最小种子
SEED_ON_START=true

# 2) 提交包含当前迁移和应用代码的版本，等待 CI 生成三组 GHCR 镜像
#    然后在 GitHub Actions 运行 Deploy production；服务器会自动备份、拉镜像、迁移并切换应用
# 以上步骤由 scripts/deploy.sh 执行；服务器不现场构建或手工切换应用镜像

# 3) 确认管理员可登录后，关闭一次性种子，并通过 Deploy production 或配置重启使其生效
#    编辑 .env：SEED_ON_START=false
docker compose up -d backend
```

已有生产数据库只通过 `Deploy production` 工作流执行备份、迁移和应用切换，绝不执行 `DROP SCHEMA`。如果只是修改 `.env` 运行时配置，可在确认影响范围后执行 `docker compose up -d` 重新注入配置；如确需迁移历史业务内容，先在隔离环境清理账号、询盘和审计数据，再以显式、可验证的数据导入脚本处理。

---

## 七、OpenResty 反向代理（1Panel）

1Panel → 网站 → 创建网站 → 反向代理：

| 配置 | 值 |
|------|-----|
| 主域名 | `www.zsaki.icu`（官网）/ `api.zsaki.icu`（API）/ `admin.zsaki.icu`（后台）；`zsaki.icu` 仅重定向到 `www` |
| 代理地址 | 官网→`http://127.0.0.1:3000`；后台→`http://127.0.0.1:3001`；API→`http://127.0.0.1:8000` |

在 1Panel 分别创建三个 HTTPS 反代站点。每个站点的 `location /` 都必须保留转发头；其中 API 站点直接代理后端根路径，使 `/healthz`、`/readyz`、`/api/*`、`/uploads/*` 全部可达。

```nginx
# www.zsaki.icu: proxy_pass 改为 http://127.0.0.1:3000;
# admin.zsaki.icu: proxy_pass 改为 http://127.0.0.1:3001;
# api.zsaki.icu: proxy_pass 改为 http://127.0.0.1:8000;
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

根域 `zsaki.icu` 创建独立 HTTPS 站点，不代理应用：

```nginx
return 301 https://www.zsaki.icu$request_uri;
```

> OpenResty 为 host 网络模式，其 `127.0.0.1` 即宿主机；Compose 已把三端口发布到宿主机回环，故反代目标让 OpenResty 直连容器。不要把后端端口、管理端口或 `8081` 加入公网安全组。

---

## 八、防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

> ⚠️ 云服务器安全组也要放行 **80 / 443 / 22**。Compose 发布的 3000/3001/8000 仅绑在 `127.0.0.1`，外网不可直达，无需开放；确认域名后台可登录后，删除安全组、ufw 和 1Panel 中遗留的公网 `8081` 规则。

---

## 九、验证清单

### 9.1 容器层

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 五容器运行 | `docker compose ps` | 全部 Up/healthy，无 restarting |
| 迁移命令 | `docker compose --profile tools run --rm migrate` | `aerich upgrade` 成功退出 |
| backend 日志 | `docker compose logs backend --tail 20` | `Uvicorn running` 且无循环重启 |
| 磁盘空间 | `df -h /` | 可用 >20%（容器镜像约 2-3GB） |

### 9.2 API 层（服务器内部）

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 后端存活 | `curl -s http://127.0.0.1:8000/healthz` | `{"status":"alive"}` |
| 后端就绪 | `curl -s http://127.0.0.1:8000/readyz` | 生产要求 DB 与真实 Redis 均正常；任一异常返回 503，本地内存缓存模式显示 `degraded` |
| 产品列表 | `curl -s "http://127.0.0.1:8000/api/v1/products?page_size=1"` | 返回数据 |
| SEO 字段 | 同上接口返回 JSON 含 `seo_title` / `seo_description` 键 | 字段存在（NULL 正常） |
| 搜索 | `curl -s "http://127.0.0.1:8000/api/v1/search?q=camera&type=all&page_size=50"` | 产品分组在前；新闻分组按时间倒序；降级提示无中文；产品 `url` 为规范嵌套地址 `/products/{category}/{slug}` 且带 `category_slug` |
| Dashboard stats | 携带 `admin.zsaki.icu` 的 HttpOnly 会话 Cookie 调 `GET /api/v1/admin/stats` | 返回 counts + inquiry_countries + inquiry_status |
| 审计日志 | 携带 `admin.zsaki.icu` 的 HttpOnly 会话 Cookie 调 `GET /api/v1/admin/audit-logs?page_size=1&keyword=admin` | 返回 list + total；`keyword` 在分页前过滤 username/action/resource |

### 9.3 前端层（服务器内部）

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 官网首页 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/` | 200 |
| 产品页 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/products/action-camera/860a` | 200 |
| 管理后台 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/signin` | 200 |

### 9.4 公网访问（浏览器）

| 检查项 | URL | 预期 |
|--------|-----|------|
| 官网首页 | `https://www.zsaki.icu` | 正常显示，图片加载 |
| 产品详情 | 点击任意产品 | SEO title/description 正确（前端 fallback 逻辑生效） |
| 管理后台 | `https://admin.zsaki.icu` | 用 ADMIN_PASSWORD 登录成功 |
| Dashboard | 后台首页 | 4 个计数卡片 + 询盘国家分布 + 状态分布 + 分类饼图 |
| 审计日志 | 侧边栏 → 审计日志 | 登录操作已有记录 |
| 用户管理 | 侧边栏 → Users | admin 账号在列表中，可新建/删除/重置密码 |
| 询盘 CRM | 侧边栏 → 询盘 | 五态下拉 + 分配 + 跟进时间线 + 标签 |
| 产品 SEO | 产品列表 → SEO 列 | 未设置为灰色，已设置为绿色，点击弹出编辑 |
| 批量操作 | 产品列表 → 勾选多行 | 浮现发布/隐藏/删除批量操作栏 |

---

## 十、常用运维

```bash
cd /home/ubuntu/full-stack-songdian

# ── 日常更新流程（推荐） ──
# 在 GitHub Actions 的 Deploy production 工作流中输入本次完整 commit SHA。
# 工作流调用 scripts/deploy.sh，自动执行备份、独立迁移、指定镜像切换、冒烟和应用回滚。

# 服务器只做只读状态检查
docker compose ps

# 仅更新上游配置（改了 .env 但没改代码）
docker compose up -d        # 重新注入环境变量

# ── 查看日志 ──
docker compose logs -f backend         # 后端实时日志
docker compose logs -f frontend        # 官网日志
docker compose logs -f admin-next      # 后台日志
docker compose logs --tail=50          # 所有服务最后 50 行

# ── 重启单个 ──
docker compose restart frontend        # 不改镜像快速重启

# ── 系统资源 ──
docker stats                            # 各容器 CPU/内存实时占用
docker compose ps                       # 当前状态一览
```

### 运维要点（今日新增功能）

| 功能 | 运维说明 |
|------|---------|
| **产品 SEO** | 运营在后台产品表单的 SEO 面板填��� seo_title/seo_description；空值不影响，前端自动 fallback |
| **询盘 CRM** | 五态管线：NEW→CONTACTING→QUOTED→DEAL/LOST；终态不可再流转 |
| **询盘国家分布** | 运营在后台询盘跟进对话框标记 country，Dashboard 统计才有数据 |
| **用户管理** | admin 账号不可删除；所有新账号统一 admin 权限；重置密码即时生效 |
| **审计日志** | 36 处操作自动记录，后台侧边栏 → 审计日志查看 |
| **GA4 事件** | `cta_click` / `product_view` / `contact_submit` 三个转化事件已埋点；优先在管理后台“设置”中配置 `ga_id`，`NEXT_PUBLIC_GA_ID` 仅作为兼容兜底 |
| **Redis 缓存** | 产品列表(5min) / 分类(30min) / 新闻列表(5min) 自动缓存，写操作自动失效 |
| **备份** | `scripts/backup.sh` 覆盖 PG + uploads，按批次号命名（同日多次不互相覆盖），支持 `RELEASE_ID`；配置 cron 每日凌晨 3 点执行 |

### 在线设置与回显验收

GA4、Clarity 和站点/邮件相关配置可在管理后台的“设置”页面维护。`ga_id` 和 `clarity_id` 只填写 ID，不要粘贴 Google 或 Clarity 提供的完整 `<script>`；分析工具仍受官网分析同意流程控制，留空对应 ID 可关闭该工具。

设置保存后无需重启应用。普通字段（例如 GA4 ID、Clarity 项目 ID、联系邮箱、SMTP 主机）重新进入页面或刷新后应继续明文回显；页面只提交实际修改的字段。SMTP 授权码属于敏感字段，只能看到密码框和“已配置”状态，后端返回值为 `******`，留空或不修改时保留原值。

部署后可按下列方式做人工验收：登录 `https://admin.zsaki.icu`，进入“设置”，确认已保存的普通字段仍显示，修改一个普通字段后保存并刷新确认回显，再检查授权码仍为掩码。不要把真实 GA、Clarity、SMTP 值写入部署日志、截图、命令行或提交记录。

如果设置页面显示读取失败，先使用页面的“重新读取设置”按钮；不要用空表单覆盖线上配置。保存成功但重新读取提示失败时，应保留页面显示的已保存值，待后端恢复后再重试读取。

### 自动备份（scripts/backup.sh）

项目提供 `scripts/backup.sh` 自动化备份脚本，覆盖 **PostgreSQL 全量导出** + **uploads 上传文件快照**。脚本对临时文件做原子落盘，并在写入后验证 gzip/tar 完整性；任一步失败会以非零状态退出。

```bash
# 一、首次设置
mkdir -p /home/ubuntu/backups
chmod +x scripts/backup.sh

# 二、手动执行（验证脚本可用；三个目录参数均可按环境覆盖）
COMPOSE_DIR=/home/ubuntu/full-stack-songdian \
BACKUP_DIR=/home/ubuntu/backups \
RETENTION_DAYS=7 \
bash scripts/backup.sh

# 三、加入 cron 每日凌晨 3 点自动执行
crontab -e
# 添加下行（注意替换路径）：
# 0 3 * * * cd /home/ubuntu/full-stack-songdian && BACKUP_DIR=/home/ubuntu/backups bash scripts/backup.sh >> /home/ubuntu/backups/cron.log 2>&1
```

**备份内容：**

| 数据 | 文件名格式 | 方式 |
|------|-----------|------|
| PostgreSQL | `db_YYYYmmdd_HHMMSS[_RELEASE_ID].sql.gz` | `docker compose exec -T postgres pg_dump \| gzip` |
| 上传文件 | `uploads_YYYYmmdd_HHMMSS[_RELEASE_ID].tar.gz` | `docker run` 挂载 `uploads_data` 卷 → tar |

**批次号**：数据库与媒体备份共用同一 `STAMP`（`date +%Y%m%d_%H%M%S`）。设置 `RELEASE_ID` 环境变量会在批次号后追加发布标识（非法字符会被替换为 `_`），便于把备份与某次发布对应起来：

```bash
RELEASE_ID=v1.4.2 COMPOSE_DIR=/home/ubuntu/full-stack-songdian BACKUP_DIR=/home/ubuntu/backups bash scripts/backup.sh
```

同日多次部署（例如当天第二次发布）会生成不同文件名，**不再相互覆盖**，可保留当天每次发布前的恢复点。

**保留策略**：`find -mtime +7` 删除 7 天前文件，但每月 1 号的备份**长期保留**（不自动清理）。清理规则同时匹配新命名（`db_??????01_*.sql.gz`：6 个 `?` 对应 `YYYYMM`，后两位留给 `01`）与历史遗留的旧命名（`db_??????01.sql.gz`），因此升级脚本后旧的 `db_YYYYMMDD.sql.gz` 仍按原规则处理。⚠️ 模式里的 `?` 个数必须是 **6**：写成 8 个会匹配不上任何真实文件名，导致每月 1 号的备份被当作过期删除。

> 备份脚本的上传卷名与 Compose 的 `name: songdian-b2b` 一致。若将来修改 Compose 项目名，需同步修改 `scripts/backup.sh` 内的 `COMPOSE_PROJECT`，再先手动跑一次备份验证。

**恢复：**

```bash
# PostgreSQL 恢复（文件名替换为实际批次，例如 db_20260912_031500.sql.gz）
gunzip -c /home/ubuntu/backups/db_YYYYmmdd_HHMMSS.sql.gz | docker compose exec -T postgres psql -U songdian -d songdian_b2b

# uploads 恢复（解压到卷）
docker run --rm -v songdian-b2b_uploads_data:/data alpine sh -c "cd /data && tar xzf -" < /home/ubuntu/backups/uploads_YYYYmmdd_HHMMSS.tar.gz
```

> 若同一批次的数据库与媒体都要回滚，请使用**同一个 `STAMP`**（例如 `20260912_031500`）的两个文件，避免数据库回滚到较早时点而媒体仍是较晚状态。

---

## 十一、官网静态媒体（视频、poster 与默认 OG 图）

About 页面工厂视频与 poster、全站默认社交图均为仓库源码资产，通常随前端镜像构建发布，无需另行上传：

```text
frontend/public/Video/SongdianFactoryVideo.mp4
frontend/public/Video/factory-poster.webp
frontend/public/og/og-default.jpg
```

```bash
# 默认 OG 图或 poster 变化时重新生成；替换 MP4 时保留同一路径。
cd frontend
npm run generate:social-assets
cd ..

# 确认三项资产均未被忽略并进入本次提交
git status --short --untracked-files=all -- \
  frontend/public/Video/SongdianFactoryVideo.mp4 \
  frontend/public/Video/factory-poster.webp \
  frontend/public/og/og-default.jpg
```

> 由于前端在容器内以 `next start` 运行，替换任一静态媒体后都需提交代码并由 CI 构建新的 frontend 版本镜像，再通过生产部署工作流发布。MP4 的 H.264 profile、音频编码和 fast start 应使用 `ffprobe`/`ffmpeg` 或等效工具复核；仅凭扩展名和浏览器本机可播放不能证明编码要求全部满足。

---

## 十二、正式域名 HTTPS 上线

本项目生产环境不支持 IP/HTTP 后台。请等待 `zsaki.icu` 命名审核、实名和中国大陆 ICP 备案完成后，再配置 DNS 与 HTTPS；期间不要将 `3000`、`3001`、`8000` 或旧的 `8081` 向公网开放。

#### 第一步：备案、解析与 HTTPS

1. 等待域名命名审核和实名完成；在腾讯云 ICP 备案控制台确认 `zsaki.icu` 后缀可提交备案、域名实名信息与备案主体一致。中国大陆服务器在备案通过前不应正式开放站点。
2. 备案通过后，为根域、`www`、`api`、`admin` 添加指向 `106.53.220.184` 的 A 记录，并确认 DNS 生效。
3. 在 1Panel/OpenResty 创建根域和三个 HTTPS 站点并申请证书：
   - `zsaki.icu` → `return 301 https://www.zsaki.icu$request_uri;`
   - `www` → `http://127.0.0.1:3000`
   - `api` → `http://127.0.0.1:8000`（同时代理 `/api/`、`/uploads/`）
   - `admin` → `http://127.0.0.1:3001`
4. 域名模式统一使用标准 `443`，不再要求用户访问公网 `:8081`；`3000/3001/8000` 仍只绑定回环。

#### 第二步：切换构建变量

根目录 `.env` 改为：

```dotenv
CORS_ORIGINS=https://www.zsaki.icu,https://admin.zsaki.icu
NEXT_PUBLIC_API_URL=https://api.zsaki.icu
NEXT_PUBLIC_SITE_URL=https://www.zsaki.icu
NEXT_PUBLIC_IMAGE_HOST=api.zsaki.icu
```

其中 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_IMAGE_HOST` 都是构建期变量，
这些变量由 CI 作为 build args 传给 Next.js 镜像；切换后需重新运行 CI 并部署新版本：

```bash
# 推送代码后等待 CI 生成新版本镜像，再运行 Deploy production 工作流
```

#### 第三步：验证、回滚与收口

```bash
curl -I https://zsaki.icu/
curl -I https://www.zsaki.icu/
curl -s https://api.zsaki.icu/readyz
curl -I https://admin.zsaki.icu/signin
```

- 确认根域返回 301、登录、询盘、图片、sitemap、canonical URL 均使用 HTTPS 域名后，再停止旧 IP 站点。
- 确认后台域名稳定后，关闭腾讯云安全组、ufw 和 1Panel 中的公网 `8081`；容器端口继续仅绑定回环。
- 回滚只恢复上一版镜像与域名 `.env`，不要删除 PostgreSQL、Redis 或上传卷。

---

## ⚠️ 注意事项

| 项 | 说明 |
|----|------|
| 保活方式 | 全部由 Docker Compose 管理（`restart: unless-stopped`），不再依赖 1Panel 进程守护或容器内 pm2 |
| PG/Redis 位置 | 由本 Compose 用官方镜像自建（postgres / redis 服务），与应用同网络、经服务名互访；数据落命名卷 |
| PG 版本 | 锁定 **18 线**（`postgres:18-bookworm`，官方镜像、无 zhparser） |
| ⚠️ **PG18 卷挂载点** | 卷必须挂 `/var/lib/postgresql`（内部按 major 版本分子目录）。挂旧路径 `/var/lib/postgresql/data` 会报「18+ images require...」启动失败（postgres:18 镜像新约定） |
| ⚠️ **uploads 代码/数据分离** | `uploads/` 是**代码模块**（Album/UploadRecord 模型，须进镜像）；上传文件数据在 **`uploads_data/`**（`MEDIA_ROOT=uploads_data`，卷 `uploads_data` 挂 `/app/backend/uploads_data`）。**不要**把卷挂到 `uploads/`——Docker 卷会遮住镜像里的 `uploads/models.py` 导致 `Module not found` |
| 图片自动同步 | backend 启动脚本 `scripts/start.sh` **只**把 `uploads/products`、`uploads/news`、`uploads/2026` 图片目录 `cp -rn` 到 `uploads_data/`（`-n` 不覆盖运营上传文件，幂等），再清理媒体根目录残留的 `.py` / `.env` / `.sh` 等代码与配置文件；git 里的种子图片随镜像进，启动自动同步到卷；运营新上传直接写卷。⚠️ 同步逻辑必须放在脚本文件内，**不要写进 compose 的字符串 command**——compose 对 `$` 与括号做插值/shlex 处理，转义在多层 shell 传递中会被吞掉（曾导致容器 `sh: 1: Syntax error: "(" unexpected`）；也**不得改回整体复制 `uploads/.`**——`uploads/` 同时是代码模块目录，整体复制会把 `models.py` 等源码暴露到公开的 `/uploads/` 路径 |
| 媒体目录后缀防线 | 即使媒体卷中残留在代码文件，`backend/main.py` 的 `_MediaStaticFiles` 也会对 `.py` / `.pyc` / `.env` / `.sh` / `.toml` / `.sql` / `.log` / `.md` 等后缀统一返回 404，避免源码经 `/uploads/` 被下载 |
| 域名变更 | `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_IMAGE_HOST` 是**构建期内联**变量，改域名需重建 frontend/admin-next 镜像（非仅改 env） |
| 图片域名 | `frontend/next.config.ts` 生产环境默认仅允许 `api.zsaki.icu` 的 HTTPS 上传资源；API 域名变更时需同步修改并重建 |
| admin 校验 | `admin-next` 与 `backend` 的 `JWT_SECRET` 必须一致，否则后台登录失败 |
| HTTPS | 管理后台必须配置域名和 Let’s Encrypt 证书；生产 Secure Cookie 不支持 IP/HTTP 登录 |
| 数据导入 | 新环境见「六、生产初始化」：只运行迁移和最小种子；开发 SQL/CSV 快照禁止导入生产 |
| 迁移链说明 | aerich 迁移 0-16；10 号迁移收敛历史重复外键，11 号增加询盘归因与通知已读状态，12 号增加内容状态/发布时间/版本记录，13、14 号规范公开文案，15 号补齐产品/新闻排序字段，16 号增加持久化后台任务表与账户 `session_version`。已有云库不重放已记录版本，禁止删除 `pg_data` 或执行 `DROP SCHEMA` |
| 后端镜像 PATH | Dockerfile 里 `ENV PATH="/app/backend/.venv/bin:$PATH"`——新版 uv 的 `uv sync` 默认装进 `.venv`（`--system` 已移除），不加 PATH 则 `aerich`/`uvicorn` not found |
| 数据库 URL | compose 里 `DATABASE_URL` 用 **`postgres://`** 前缀——Tortoise-ORM(asyncpg) 不认 `postgresql://`，会报 `Unknown DB scheme` |
| 构建无需后端在线 | frontend 首页 `NewsSection` 已加 `.catch()` 兜底：`docker compose build` 时后端未启动也**不会**因预渲染 404 失败（降级为空数据，运行时正常拉取） |
| 数据库升级 | 升 PG 大版本时注意迁移 `pg_data` 卷（先备份再升）；Redis 升级注意 `redis_data` 兼容 |
| 前端 URL 规范映射 | 运行时由 `frontend/proxy.ts` 调后端 `GET /api/v1/products/{slug}/canonical` 解析产品**当前**分类后 308，后台改分类即时生效、**无需重建镜像**；`frontend/lib/generated/canonical-map.ts` 仅作为后端不可达时的兜底，可按需 `npm run gen:map` 刷新（脚本按 `page_size=50` 翻页取全量产品） |
| postcss 构建报错 | 若 `next build` 报 `Module not found: Can't resolve 'postcss'`，是 `node_modules/postcss` 被装成空目录所致；`rm -rf node_modules/postcss && npm install` 补全即可（本地 dev/CI 均可能遇到） |
| Next 16.3 构建 | `next.config.ts` **不要写 `eslint: {}`**（Next 16 已移除该键，type check 报错）；`useSearchParams()` 页面必须包 `<Suspense>`，否则静态生成报 CSR bailout |
| 询盘邮件通知 | SMTP 配置可**在线改**：管理后台 → 设置 →「邮件通知（询盘 SMTP）」分组（`t_setting` 表存储，保存即生效，无需重启）。字段：smtp_host/port/user/password（脱敏 `******`）/发件人/收件人；「测试发送」按钮可校验。旧 `.env` 的 `SMTP_*` 仍兼容（库值非空时优先）。⚠️ **SMTP key 惰性创建**：`GET /admin/settings` 时 `ensure_smtp_settings()` 自动 `get_or_create`——与 `SEED_ON_START` 开关**解耦**（生产 `SEED_ON_START=false` 时 key 也能出现；**勿依赖 run_seed 创建**，否则设置页无 SMTP 面板） |
| HTTP 询盘兼容 | 官网询盘在 HTTP（非 HTTPS）环境 `crypto.randomUUID()` 不可用——已加 fallback（`inq-时间戳-随机串`），无需处理 |

---

*最后更新：2026-09-02（固化同一 commit SHA 的 CI/images 门禁、服务器版本核对与发布后公网验收流程）*
## 本轮实现补充（2026-08-13）

部署前请以仓库根目录 [`CURRENT_IMPLEMENTATION.md`](./CURRENT_IMPLEMENTATION.md) 为现状索引：

- CI 构建并推送 GHCR 镜像后，生产默认通过 `Deploy production` 工作流，或按「2.3 手动部署已有服务器」在服务器执行 `scripts/deploy.sh`，使用完整 commit SHA/tag 发布；现场 `docker compose build` 仅作为「2.4」所述的 frontend 备用流程。
- 迁移通过 `docker compose --profile tools run --rm migrate` 单独执行，再启动应用容器；应用启动不会隐式迁移。
- `/readyz` 同时检查数据库和真实 Redis。生产 Redis 不可用时应停止发布并恢复 Redis，不要把内存降级视为生产可用状态。
- 发布冒烟至少覆盖官网产品详情、产品 CTA 询盘、后台登录、通知下拉框和询盘归因字段；回滚使用上一个已记录的镜像 SHA。
- 生产数据库和运行时上传媒体不由 Git checkout 或镜像构建覆盖；工厂展示视频属于前端静态源码资产，会随前端镜像发布。备份和恢复必须针对 PostgreSQL/上传媒体卷单独执行。

本文件早期示例中的 `aerich 迁移 0-10` 已由当前迁移链 `0-16` 取代；11 号迁移包含询盘归因字段和通知已读状态表，12 号迁移包含产品/新闻发布状态、`published_at` 与 `ContentRevision`，13、14 号迁移纠正公开文案，15 号迁移补齐产品/新闻 `sort_order` 字段，16 号迁移新增后台任务表 `t_background_job` 与账户 `session_version`。更新已有环境时只执行 `aerich upgrade`，不要删除 `pg_data`、上传卷或导入 `db/` 快照。

## 2026-08-19 内容工作流发布补充

### 构建与运行时地址

| 服务 | 变量 | 本地开发 | Compose / 生产 |
|---|---|---|---|
| 官网浏览器 | `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | `https://api.zsaki.icu` |
| 官网服务端 | `INTERNAL_API_URL` | `http://127.0.0.1:8000` | `http://backend:8000` |
| 管理后台代理 | `BACKEND_PROXY_URL` | `http://127.0.0.1:8000` | `http://backend:8000` |

`NEXT_PUBLIC_API_URL` 会进入前端构建产物，修改后必须重建镜像；另外两个变量只用于服务端内部访问。`.env.local` 不得复制进镜像或提交到 Git。后台媒体应使用同源 `/uploads/...`，由 rewrite 转发到后端。

### 新增生产参数

- `PREVIEW_TOKEN_TTL=900`：草稿预览令牌默认 15 分钟有效。
- `SCHEDULED_PUBLISH_INTERVAL=30`：调度器默认每 30 秒发布到期产品/新闻。
- `NEXT_REVALIDATE_URL=http://frontend:3000/api/revalidate` 与 `REVALIDATE_SECRET`：内容发布、恢复或到期发布后用于清理官网 ISR；URL 应只指向内部可信地址，密钥由 backend 与 frontend 共享。

### 上线顺序与检查

1. 确认发布 commit 包含迁移 12、`backend/content_revision/`、后台工作流组件、官网预览路由及其测试，避免只提交已跟踪文件造成残缺镜像。
2. 备份 PostgreSQL 和 `uploads_data`，启动 PostgreSQL/Redis，再通过独立 `migrate` profile 运行一次 `aerich upgrade`。
3. 切换 backend、frontend、admin-next 镜像，确认 `/healthz`、`/readyz`、官网产品详情、后台登录与 `/uploads/...` 图片均正常。
4. 创建草稿并验证短期预览，再创建数分钟后的定时内容，确认到期前不公开、到期后进入公开 API 且官网缓存刷新。
5. 应用启动失败可回退到上一组镜像；数据库迁移不会自动降级。若必须执行数据库回退，应先恢复上线前备份并评估新版本写入的数据。

## 2026-08-25 搜索、内容纠错与官网体验发布补充

### 本次数据库影响

- 迁移 13 修正产品分类、新闻摘要、产品摘要/HTML 和产品属性中的确定性拼写与格式错误；迁移 14 清理产品文案中孤立的全角右括号；迁移 15 补齐 `t_product.sort_order` 与 `t_news.sort_order`。
- 两个迁移都不创建、删除或改变表/列/索引，不修改产品状态、价格、库存、关联关系或上传文件，属于低风险内容更新。
- 两个迁移的 downgrade 有意为空：错误文案不应在应用镜像回滚时恢复。正式发布仍须先备份；如业务方要求恢复旧文本，应从上线前备份中定向恢复内容字段，而不是删除数据库卷。
- `db/*.sql`、`db/*.csv` 已同步修正仅用于本地重建；生产环境禁止导入这些快照，云端只运行 `aerich upgrade`。

### 本次应用行为

- 联合搜索默认产品在前、新闻在后；新闻按发布时间从新到旧。排序发生在数据库分页前，三个搜索路径行为一致。
- 搜索降级提示为英文 `Basic search mode`，前端另有英文兜底；搜索缓存版本升级后不会命中旧排序。
- 官网包含新的横滑提示/sticky 行为、首图预加载、结构匹配骨架、最终值统计、触屏反馈和 reduced-motion 降级，因此必须部署新的 frontend 镜像，不能只发布 backend。
- `scripts/smoke-deploy.sh` 会额外验证搜索分组、新闻时间顺序和英文降级提示，默认使用宿主机 `python3` 解析 JSON；特殊环境可通过 `PYTHON_BIN` 指定解释器。`scripts/deploy.sh` 会把当前 `PROD_PATH` 显式传给备份脚本，避免自定义路径时备份错误实例。

### 上线前检查

1. 发布 commit 必须包含当前迁移链、对应测试与 CI 校验、前端修改、部署脚本和本文档；先用 `git status --short` 确认没有遗漏的未跟踪文件。
2. 等待 CI 的 backend、frontend、admin、compose、migration、e2e 和 images 全部成功；不要部署仅完成部分 job 的 SHA。
3. 确认 GitHub Actions Variables 中三个 `NEXT_PUBLIC_*` 仍是生产 HTTPS 域名，再以完整 commit SHA 运行 `Deploy production`。
4. 发布脚本应依次完成备份、拉取三镜像、启动 PostgreSQL/Redis、执行迁移、切换三应用和搜索冒烟。任一步失败都停止发布；不要手工跳过迁移或健康检查。
5. 发布后浏览器验证 `/search?q=417&type=all` 为 Product → News，`/search?q=417&type=news` 无中文提示，并检查产品页横滑、FAQ sticky、移动菜单与底部询盘条。
