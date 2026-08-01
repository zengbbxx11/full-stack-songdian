# Songdian B2B 部署指南（1Panel 管理 + Docker Compose 全栈编排）

> 目标服务器：`106.53.220.184`（Ubuntu + 1Panel）
> 登录用户：`ubuntu`（家目录 `/home/ubuntu`）
> 项目根目录：`/home/ubuntu/full-stack-songdian`（即 `~`）
> 仓库：`https://github.com/zengbbxx11/full-stack-songdian`
> 数据与图片随仓库携带，`git clone` 即得，无需额外传输。

---

## 架构总览

```
浏览器 ──https://www.songdian.tech────► OpenResty(:80/443) ──127.0.0.1:3000──► frontend 容器
浏览器 ──https://admin.songdian.tech──► OpenResty(:80/443) ──127.0.0.1:3001──► admin-next 容器
浏览器 ──https://api.songdian.tech────► OpenResty(:80/443) ──127.0.0.1:8000──► backend 容器
                                                  │
                       postgres:5432 / redis:6379 ← Compose 内数据服务（与应用同网络）
```

**关键设计：**
- 应用三服务（backend / frontend / admin-next）+ 数据两层（postgres / redis）**全部由 Docker Compose 编排、构建镜像、保活**。
- PostgreSQL（**18 线**，官方 `postgres:18-bookworm`）/ Redis 用**官方镜像**直接进 Compose（**不编译自定义扩展**，见下方「中文全文检索」说明）。**PG 大版本须与 `db/seed_data.sql`（pg_dump 18 导出）一致，勿降为 16，否则种子导入失败。**
- 仅 1Panel 的 **OpenResty** 留在 Compose 之外，负责外部 HTTPS 反代；其 host 网络模式直接连宿主机回环的 8000/3000/3001。
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

## 二、拉取代码（家目录）

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
└── db/                  # seed_data.sql
```

> 数据库（库名 / 用户）由 `docker-compose.yml` 的 `postgres` 服务根据 `.env` 的 `PG_USER` / `PG_PASSWORD` / `PG_DB` 在**首次启动**时自动创建，无需手动建库。

---

## 三、配置 Compose 环境变量

```bash
cd /home/ubuntu/full-stack-songdian
cp .env.example .env
vim .env     # 至少修改 PG_PASSWORD / JWT_SECRET / ADMIN_PASSWORD / 各域名
```

`.env` 字段说明（详见 `.env.example` 注释）：

| 变量 | 说明 |
|------|------|
| `PG_USER` / `PG_PASSWORD` / `PG_DB` | Compose 内 postgres 服务初始化所用（首次建库生效；后续改此处不影响已建库） |
| `JWT_SECRET` | ≥32 字节随机值；**backend 与 admin-next 共用同一值**（admin 用它服务端校验令牌） |
| `ADMIN_PASSWORD` | 初始管理员密码（仅在 `SEED_ON_START=true` 由应用种子器使用时生效） |
| `SEED_ON_START` | `true`=冷启动即导入演示种子数据；`false`=手动导入 `seed_data.sql`（默认） |
| `CORS_ORIGINS` | 官网 + 后台公网域名，逗号分隔，**禁用通配** |
| `NEXT_PUBLIC_API_URL` | 浏览器直连的 API 地址（走 OpenResty 反代）；官网与后台共用 |

> ⚠️ `.env` 含密钥，已被根目录 `.gitignore` 忽略，绝不入库。
> 注：`DATABASE_URL` / `REDIS_URL` 由 compose 直接按服务名拼接（`postgres` / `redis`），**无需在 .env 配置**，避免暴露宿主机地址。

---

## 四、关于中文全文检索（zhparser）

本项目后端 `to_tsvector('zh', col)` 依赖 PostgreSQL 的 **zhparser** 扩展做中文分词。当前部署**未编译 zhparser**（PG 用官方纯净镜像），因此：

- 后端已内置**降级兜底**：探测不到 `zh` 配置时自动改用内置 `simple` 配置，中文关键词搜索**仍可工作**，只是分词粒度较粗（按非字母数字切分），搜索质量略低于 zhparser。
- 若未来需要生产级中文搜索，可改为「自定义 PG 镜像编译 zhparser」（构建期需联网拉源码，属可选增强，**非上线必需**）。

---

## 五、构建并启动（Docker Compose 全栈）

> ⚠️ **前端构建前置（产品 URL 规范映射）**：`frontend/proxy.ts` 依赖 `frontend/lib/generated/canonical-map.ts`。发布前在本地刷新并一并 push：
> ```bash
> cd frontend && npm run gen:map && git add lib/generated/canonical-map.ts && git commit -m "chore: refresh product canonical map" && cd ..
> git push
> ```

### 5.1 首次构建

```bash
cd /home/ubuntu/full-stack-songdian

# 确保有 .env（含 PG_PASSWORD / JWT_SECRET / ADMIN_PASSWORD / NEXT_PUBLIC_API_URL 等）
test -f .env || { echo "ERROR: .env missing!"; exit 1; }

# 构建全部镜像（首次约 5-10 分钟，含前端/后端 npm install + next build）
docker compose build
```

### 5.2 启动（按健康依赖顺序自动编排）

```bash
# 前台启动看日志（首次推荐，确认 aerich 建表成功）
docker compose up

# 看到以下关键日志后 Ctrl+C，改后台运行：
# ✓ backend  | ... aerich upgrade ... Success
# ✓ backend  | Uvicorn running on http://0.0.0.0:8000
# ✓ frontend | Ready in XXs

# 后台运行
docker compose up -d
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
# → {"status":"ready","database":"connected","redis":"connected"}

# 4) 产品列表（确认表已建好，数据为空）
curl -s "http://127.0.0.1:8000/api/v1/products?page_size=1" | python3 -m json.tool | head -5

# 5) 询盘 CRM 字段存在（NEW/CONTACTING/QUOTED/DEAL/LOST 五态管线已就绪）
curl -s -X POST http://127.0.0.1:8000/api/v1/inquiries \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"t@t.com","message":"deploy check","biz_req_no":"deploy-check-1"}' \
  | python3 -m json.tool | grep -E '"status"|"assigned_user_id"|"tags"'

# 6) 官网前端（容器内 localhost:3000 可达）
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
# → 200

# 7) 管理后台
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/signin
# → 200

# 8) 新端点验证（需先登录取 token）
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")

# Dashboard stats
curl -s "http://127.0.0.1:8000/api/v1/admin/stats" -H "Authorization: Bearer $TOKEN"
# → {"code":"0","data":{"counts":{...},"inquiry_countries":[...],"inquiry_status":{...}}}

# 审计日志
curl -s "http://127.0.0.1:8000/api/v1/admin/audit-logs?page_size=1" -H "Authorization: Bearer $TOKEN"
# → {"code":"0","data":{"list":[...],"total":...}}

# 用户列表
curl -s "http://127.0.0.1:8000/api/v1/admin/users/list" -H "Authorization: Bearer $TOKEN"
# → {"code":"0","data":[{"username":"admin",...}]}
```

### 5.4 启动链路说明

| 阶段 | 容器 | 动作 |
|------|------|------|
| 1 | postgres | 初始化，`pg_isready` 健康检查通过 |
| 2 | redis | 初始化，`redis-cli PING` 健康检查通过 |
| 3 | backend | 依赖 postgres+redis 均健康 → `aerich upgrade`（自动建表含 SEO/CRM 全量列）→ `uvicorn` |
| 4 | frontend | 依赖 backend `/healthz` 探活 → `next start -p 3000` |
| 5 | admin-next | 依赖 backend `/healthz` 探活 → `next start -p 3001` |

**关键：aerich upgrade 自动执行**——backend 的 `command` 为 `sh -c "aerich upgrade && uvicorn main:app ..."`。迁移文件 `9_*_add_seo_and_crm_fields.py` 含 Product（seo_title/seo_description）+ Inquiry（assigned_user/follow_notes/last_contact_time/tags）共 6 列 ADD COLUMN，首次启动自动建表。

---

## 六、导入数据（一次性）

backend 容器启动后库里**只有表结构、没有业务数据**。两种方式二选一：

### 方式 A：应用种子器（最快，推荐首次上线用）

在 `.env` 中设 `SEED_ON_START=true`（默认 `false`），然后重启 backend：

```bash
docker compose up -d backend    # 重启后 run_seed 插入演示类目/商品/管理员账号
```

> 此时管理员初始密码取 `ADMIN_PASSWORD`。适合「先跑起来看效果」的冷启动场景。

### 方式 B：导入 dev 全量数据（生产数据对齐用，**推荐**）

`db/seed_data.sql` 是 **pg_dump 18 全量导出**（含完整 DDL + 数据），**已包含 2026-08-01 全部新列**（产品 SEO 字段、询盘 CRM 字段等）。

> ⚠️ **为什么必须用完整 seed 而不是「aerich 建表 + 只导数据」**：aerich 迁移链（0-7 + 9）建的表**缺列**——本地开发库经历过多次手动 ALTER（`sort_order`、`seo_title` 等不在迁移里），迁移链覆盖不全。若只导 seed 的 data 部分，会报 `column "xxx" does not exist`。**正确做法：整个 schema 以 seed 为准**（DROP SCHEMA 后导入完整 seed），表结构与数据完全对齐。

```bash
cd /home/ubuntu/full-stack-songdian

# 1) 把 seed 完整文件拷进 postgres 容器（psql 的 \i 读不到宿主机路径）
docker compose exec -T postgres sh -c 'cat > /tmp/seed_full.sql' < db/seed_data.sql

# 2) 重置 schema（清掉 aerich 建的不完整表；首次部署可省略 aerich 流程）
docker compose exec -T postgres psql -U postgres -d songdian_b2b -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3) 导入完整 seed（DDL + 数据一起；禁外键绕开字母序 FK 问题）
#    用户/库名按 .env 实际 PG_USER / PG_DB 替换（示例 postgres / songdian_b2b）
docker compose exec -T postgres psql -U postgres -d songdian_b2b -v ON_ERROR_STOP=0 <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT conname, conrelid::regclass AS tbl FROM pg_constraint WHERE contype='f') LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER ALL', r.tbl);
  END LOOP;
END $$;
\i /tmp/seed_full.sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT conname, conrelid::regclass AS tbl FROM pg_constraint WHERE contype='f') LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER ALL', r.tbl);
  END LOOP;
END $$;
SQL

# 4) 验证
curl -s "http://127.0.0.1:8000/api/v1/products?page_size=1" | head -c 200
```

> ⚠️ 若同时用「方式 B 导入全量」又开着 `SEED_ON_START=true`，会重复插入。二者取一。
> ⚠️ **seed 更新方法**：本地开发库有新增列/数据后，重新导出并提交：
> ```bash
> # 本地 Windows（PG 18 环境变量按实际）
> PGPASSWORD=<本地密码> "C:/ProgramData/envkit/services/postgres/18.4/bin/pg_dump.exe" -U postgres -d songdianB2B -f ../db/seed_data.sql
> git add db/seed_data.sql && git commit -m "chore: refresh seed_data.sql"
> ```

---

## 七、OpenResty 反向代理（1Panel）

1Panel → 网站 → 创建网站 → 反向代理：

| 配置 | 值 |
|------|-----|
| 主域名 | `www.songdian.tech`（官网）/ `api.songdian.tech`（API）/ `admin.songdian.tech`（后台） |
| 代理地址 | 官网→`http://127.0.0.1:3000`；后台→`http://127.0.0.1:3001`；API→`http://127.0.0.1:8000` |

创建后 → 网站设置 → 配置文件 → 在 API 站点的 `server` 块内追加：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /uploads/ {
    proxy_pass http://127.0.0.1:8000;
}
```

> OpenResty 为 host 网络模式，其 `127.0.0.1` 即宿主机；Compose 已把三端口发布到宿主机回环，故反代目标让 OpenResty 直连容器。

---

## 八、防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

> ⚠️ 云服务器安全组也要放行 **80 / 443 / 22**。Compose 发布的 3000/3001/8000 仅绑在 `127.0.0.1`，外网不可直达，无需开放。

---

## 九、验证清单

### 9.1 容器层

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 五容器运行 | `docker compose ps` | 全部 Up/healthy，无 restarting |
| backend 日志 | `docker compose logs backend --tail 20` | `aerich upgrade ... Success` + `Uvicorn running` |
| 磁盘空间 | `df -h /` | 可用 >20%（容器镜像约 2-3GB） |

### 9.2 API 层（服务器内部）

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 后端存活 | `curl -s http://127.0.0.1:8000/healthz` | `{"status":"alive"}` |
| 后端就绪 | `curl -s http://127.0.0.1:8000/readyz` | `{"status":"ready","database":"connected","redis":"connected"}` |
| 产品列表 | `curl -s "http://127.0.0.1:8000/api/v1/products?page_size=1"` | 返回数据 |
| SEO 字段 | 同上接口返回 JSON 含 `seo_title` / `seo_description` 键 | 字段存在（NULL 正常） |
| 搜索 | `curl -s "http://127.0.0.1:8000/api/v1/search?q=camera"` | 返回匹配产品 |
| Dashboard stats | 带 token 调 `GET /api/v1/admin/stats` | 返回 counts + inquiry_countries + inquiry_status |
| 审计日志 | 带 token 调 `GET /api/v1/admin/audit-logs?page_size=1` | 返回 list + total |

### 9.3 前端层（服务器内部）

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 官网首页 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/` | 200 |
| 产品页 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/products/action-camera/860a` | 200 |
| 管理后台 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/signin` | 200 |

### 9.4 公网访问（浏览器）

| 检查项 | URL | 预期 |
|--------|-----|------|
| 官网首页 | `https://www.songdian.tech` | 正常显示，图片加载 |
| 产品详情 | 点击任意产品 | SEO title/description 正确（前端 fallback 逻辑生效） |
| 管理后台 | `https://admin.songdian.tech` | 用 ADMIN_PASSWORD 登���成功 |
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

# ── 日常更新流程 ──
# 改代码后本地 push，服务器上：
git pull                    # 拉最新代码
docker compose build        # 重新构建（前端需 next build，约 3min）
docker compose up -d        # 新老容器无缝替换

# 仅更新后端（改了 Python 代码，~30s）
docker compose up -d --build backend

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
| **GA4 事件** | `cta_click` / `product_view` / `contact_submit` 三个转化事件已埋点；需配置 `NEXT_PUBLIC_GA_ID` |
| **Redis 缓存** | 产品列表(5min) / 分类(30min) / 新闻列表(5min) 自动缓存，写操作自动失效 |
| **备份** | `scripts/backup.sh` 覆盖 PG + uploads，配置 cron 每日凌晨 3 点执行 |
docker compose restart admin-next
```

### 自动备份（scripts/backup.sh）

项目提供 `scripts/backup.sh` 自动化备份脚本，覆盖 **PostgreSQL 全量导出** + **upload 上传文件快照**，保留 7 天滚动清理。

```bash
# 一、首次设置
mkdir -p /home/ubuntu/backups
chmod +x scripts/backup.sh

# 二、手动执行（验证脚本可用）
bash scripts/backup.sh

# 三、加入 cron 每日凌晨 3 点自动执行
crontab -e
# 添加下行（注意替换路径）：
# 0 3 * * * cd /home/ubuntu/full-stack-songdian && bash scripts/backup.sh >> /home/ubuntu/backups/cron.log 2>&1
```

**备份内容：**

| 数据 | 文件名格式 | 方式 |
|------|-----------|------|
| PostgreSQL | `db_YYYYMMDD.sql.gz` | `docker compose exec -T postgres pg_dump \| gzip` |
| 上传文件 | `uploads_YYYYMMDD.tar.gz` | `docker run` 挂载 `uploads_data` 卷 → tar |

**保留策略**：`find -mtime +7` 删除 7 天前文件，但每月 1 号的备份**长期保留**（不自动清理）。

**恢复：**

```bash
# PostgreSQL 恢复
gunzip -c /home/ubuntu/backups/db_YYYYMMDD.sql.gz | docker compose exec -T postgres psql -U songdian -d songdian_b2b

# uploads 恢复（解压到卷）
docker run --rm -v songdian-b2b_uploads_data:/data alpine sh -c "cd /data && tar xzf -" < /home/ubuntu/backups/uploads_YYYYMMDD.tar.gz
```

---

## 十一、静态资源补充（视频文件）

About 页面工厂视频（约 31MB）不在 Git 仓库中，需手动上传到前端 public：

```bash
# 本地执行
scp Video/SongdianFactoryVideo.mp4 ubuntu@106.53.220.184:/home/ubuntu/full-stack-songdian/frontend/public/Video/
```

> 由于前端改为容器内 `next start` 运行，视频放宿主机 `frontend/public/Video/` 后需重新 `docker compose build frontend && docker compose up -d frontend` 才能进镜像；或改用对象存储/CDN 外链更省事。

---

## 十二、无域名部署（仅 IP：106.53.220.184）

如果暂时没有域名，使用 **IP + 路径反代** 模式。改动集中在一处（`.env`），OpenResty 配置简单。

### 12.1 架构差异

```
有域名模式：                      仅 IP 模式（端口分工，见下）：
www.songdian.tech → :3000         106.53.220.184        → OpenResty:80 → frontend:3000
admin.songdian.tech → :3001       106.53.220.184:8081   → OpenResty:8081 → admin-next:3001
api.songdian.tech    → :8000      106.53.220.184/api/   → OpenResty:80 → backend:8000
                                  106.53.220.184/uploads/→ backend:8000
```

> ⚠️ **后台公网端口用 8081，不用 3001**：admin-next 容器已把 3001 发布到宿主机 `127.0.0.1:3001`（安全设计，外网不可直连），OpenResty（host 网络）无法再监听 3001（端口冲突，nginx 配置不生效）。所以 OpenResty 用 **8081** 做公网入口，反代到容器内网 `127.0.0.1:3001`。

### 12.2 修改 .env（构建前必须）

```bash
# 编辑 .env，改以下两行：
CORS_ORIGINS=http://106.53.220.184,http://106.53.220.184:8081
NEXT_PUBLIC_API_URL=http://106.53.220.184
```

> ⚠️ `NEXT_PUBLIC_API_URL` 是**构建期内联**变量，改后必须 `docker compose build` 重建镜像。

### 12.3 OpenResty 配置（1Panel）

**官网站点**（1Panel → 网站 → 创建网站 → 静态网站）：

| 配置 | 值 |
|------|-----|
| 域名 | `106.53.220.184` |
| 端口 | `80` |
| 代号 | `songdian-web` |

**后台站点**（同上再创建一个）：

| 配置 | 值 |
|------|-----|
| 域名 | `106.53.220.184` |
| 端口 | `8081`（⚠️ 不要用 3001，被容器占用；创建时若报端口占用，先选 8082 创建成功后再改回 8081） |
| 代号 | `songdian-admin`（⚠️ 必须与官网代号不同，否则报「代号已存在」） |

创建后 → 配置两个站点的配置文件：

```nginx
# ── 官网站点（106.53.220.184.conf，server 块内）──
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /uploads/ {
    proxy_pass http://127.0.0.1:8000;
}

# ── 后台站点（songdian-admin.conf，整个 server 块替换）──
server {
    listen 8081;
    server_name 106.53.220.184;
    access_log /www/sites/songdian-admin/log/access.log main;
    error_log /www/sites/songdian-admin/log/error.log;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> ⚠️ `location` 必须写在 `server { }` **花括号内部**（`error_page` 之后、最后 `}` 之前），否则 nginx 报 `"location" directive is not allowed here`。

### 12.4 防火墙放行（两层都要）

**① 服务器 ufw**：

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 22/tcp && sudo ufw allow 8081/tcp && sudo ufw enable
# 检查：sudo ufw status 应有 8081
```

**② 腾讯云控制台防火墙**（轻量服务器「防火墙」入口，不是 1Panel）：

| 协议 | 端口 | 来源 |
|------|------|------|
| TCP | 80 | 0.0.0.0/0 |
| TCP | 8081 | 0.0.0.0/0 |
| TCP | 22 | 0.0.0.0/0 |

> ⚠️ 两层都要放行：1Panel 面板防火墙 ≠ 腾讯云控制台防火墙 ≠ 服务器 ufw。外部访问不了时先 `ss -tlnp | grep 端口` 看监听地址，再逐层排查。

### 12.5 访问方式

| 服务 | 地址 |
|------|------|
| 官网 | `http://106.53.220.184` |
| 管理后台 | `http://106.53.220.184:8081/signin` |
| API | `http://106.53.220.184/api/v1/products` |

### 12.6 注意事项

| 项 | 说明 |
|----|------|
| HTTP 明文 | 无域名无法申请 Let's Encrypt 证书，登录走 HTTP 明文（IP 无法签发可信证书） |
| 管理后台端口 | 公网入口 **8081**（OpenResty 反代到容器 3001）；容器 3000/3001/8000 仅绑 127.0.0.1 不外露 |
| 图片域名 | `frontend/next.config.ts` 已包含 `106.53.220.184` 和 `localhost` 的 remotePatterns，IP 模式直接可用 |
| 切换域名 | 买域名后只需改 `.env` 的 `CORS_ORIGINS` / `NEXT_PUBLIC_API_URL` 并 `docker compose build`，再加 OpenResty 的 443 站点即可 |

---

## ⚠️ 注意事项

| 项 | 说明 |
|----|------|
| 保活方式 | 全部由 Docker Compose 管理（`restart: unless-stopped`），不再依赖 1Panel 进程守护或容器内 pm2 |
| PG/Redis 位置 | 由本 Compose 用官方镜像自建（postgres / redis 服务），与应用同网络、经服务名互访；数据落命名卷 |
| PG 版本 | 锁定 **18 线**（`postgres:18-bookworm`，官方镜像、无 zhparser），与 `db/seed_data.sql` 的 pg_dump 18 同版本；**勿降为 16**，否则种子导入失败 |
| ⚠️ **PG18 卷挂载点** | 卷必须挂 `/var/lib/postgresql`（内部按 major 版本分子目录）。挂旧路径 `/var/lib/postgresql/data` 会报「18+ images require...」启动失败（postgres:18 镜像新约定） |
| ⚠️ **uploads 代码/数据分离** | `uploads/` 是**代码模块**（Album/UploadRecord 模型，须进镜像）；上传文件数据在 **`uploads_data/`**（`MEDIA_ROOT=uploads_data`，卷 `uploads_data` 挂 `/app/backend/uploads_data`）。**不要**把卷挂到 `uploads/`——Docker 卷会遮住镜像里的 `uploads/models.py` 导致 `Module not found` |
| 图片自动同步 | backend 启动命令 `cp -rn uploads/. uploads_data/`（`-n` 不覆盖运营上传文件，幂等）：git 里的种子图片随镜像进，启动自动同步到卷；运营新上传直接写卷 |
| 域名变更 | `NEXT_PUBLIC_API_URL` 等是**构建期内联**变量，改域名需 `docker compose build` 重新构建镜像（非仅改 env） |
| 图片域名 | `frontend/next.config.ts` 的 `remotePatterns` 默认含 `api.songdian.tech` + `106.53.220.184` + `localhost`；若 API 域名不同，需同步改该配置并重建 |
| admin 校验 | `admin-next` 与 `backend` 的 `JWT_SECRET` 必须一致，否则后台登录失败 |
| 无 HTTPS | 没域名时 OpenResty 用 IP 反代、登录走 HTTP 明文；建议买域名 + Let's Encrypt（1Panel 一键） |
| 数据导入 | 见「六、导入数据」：**必须完整 seed 导入**（DROP SCHEMA → \i 完整 seed → 禁外键）。⚠️ 勿用「aerich 建表 + 只导 data」——迁移链缺列（`sort_order`/`seo_title` 等不在迁移里），会报 `column does not exist` |
| 迁移链说明 | aerich 迁移 0-7 + 9（无 8）。迁移 9 已改为**幂等**（`ADD IF NOT EXISTS` / `DROP IF EXISTS` / DO 块 FK），全新库与本地库都能过；backup 首次建表由 backend `command` 的 `aerich upgrade` 自动执行 |
| 后端镜像 PATH | Dockerfile 里 `ENV PATH="/app/backend/.venv/bin:$PATH"`——新版 uv 的 `uv sync` 默认装进 `.venv`（`--system` 已移除），不加 PATH 则 `aerich`/`uvicorn` not found |
| 数据库 URL | compose 里 `DATABASE_URL` 用 **`postgres://`** 前缀——Tortoise-ORM(asyncpg) 不认 `postgresql://`，会报 `Unknown DB scheme` |
| 构建无需后端在线 | frontend 首页 `NewsSection` 已加 `.catch()` 兜底：`docker compose build` 时后端未启动也**不会**因预渲染 404 失败（降级为空数据，运行时正常拉取） |
| 数据库升级 | 升 PG 大版本时注意迁移 `pg_data` 卷（先备份再升）；Redis 升级注意 `redis_data` 兼容 |
| 前端 URL 规范映射 | `frontend/lib/generated/canonical-map.ts` 由 `npm run gen:map` 生成并随仓库提交；产品/分类变动后需重新生成+提交，再 `docker compose build`，否则产品 308 重定向用旧映射 |
| postcss 构建报错 | 若 `next build` 报 `Module not found: Can't resolve 'postcss'`，是 `node_modules/postcss` 被装成空目录所致；`rm -rf node_modules/postcss && npm install` 补全即可（本地 dev/CI 均可能遇到） |
| Next 16.2 构建 | `next.config.ts` **不要写 `eslint: {}`**（16.2 已移除该键，type check 报错）；`useSearchParams()` 页面必须包 `<Suspense>`，否则静态生成报 CSR bailout |

---

*最后更新：2026-08-01（实战上线：PG18 卷挂载点 `/var/lib/postgresql`；uploads 代码/数据分离 + 自动同步；完整 seed 导入（勿拆 data）；后台公网端口 8081（容器占 3001 冲突）；腾讯云防火墙 + ufw 双层放行；迁移 9 幂等；uv sync .venv PATH；postgres:// scheme；Next16.2 构建修复）*
