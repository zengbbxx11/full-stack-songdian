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

> ⚠️ **前端构建前置（产品 URL 规范映射）**：`frontend/proxy.ts` 在边缘层做产品 URL 规范化的 308 重定向，依赖 `frontend/lib/generated/canonical-map.ts`（由 `npm run gen:map` 生成，已随仓库提交）。该文件在 `docker compose build` 期**不会**重新生成（构建期后端尚未启动、不可达），所以构建前请在**本地后端可达**时刷新并提交：
> ```bash
> cd frontend && npm run gen:map && git add lib/generated/canonical-map.ts && git commit -m "chore: refresh product canonical map" && cd ..
> git push
> ```
> 否则生产环境的 308 重定向会用旧映射（新增 / 改分类的产品落不到规范地址）。

```bash
cd /home/ubuntu/full-stack-songdian

# 1) 构建全部镜像（backend / frontend / admin-next；PG·Redis 用官方镜像直接拉取）
docker compose build

# 2) 启动（postgres→redis→backend(aerich 建表)→frontend/admin，按健康依赖顺序起）
docker compose up -d

# 3) 查看状态与日志
docker compose ps
docker compose logs -f backend      # 关注 aerich upgrade 是否成功、/healthz 是否 200
```

**启动链路说明：**
- `postgres` / `redis` 先起并通过 healthcheck；`backend` 等二者健康后再起，`command` 为 `aerich upgrade && uvicorn ...`。
- `frontend` / `admin-next` 通过 `depends_on: backend.healthy` 等待后端探活后再启动。
- 上传文件挂载在命名卷 `uploads_data`；PG 数据在 `pg_data`、Redis 在 `redis_data`，容器重建不丢。

---

## 六、导入数据（一次性）

backend 容器启动后库里**只有表结构、没有业务数据**。两种方式二选一：

### 方式 A：应用种子器（最快，推荐首次上线用）

在 `.env` 中设 `SEED_ON_START=true`（默认 `false`），然后重启 backend：

```bash
docker compose up -d backend    # 重启后 run_seed 插入演示类目/商品/管理员账号
```

> 此时管理员初始密码取 `ADMIN_PASSWORD`。适合「先跑起来看效果」的冷启动场景。

### 方式 B：导入 dev 全量数据（生产数据对齐用）

`db/seed_data.sql` 是 **pg_dump 18** 全量导出（含 DDL + 数据），直接 `\i` 会因外键顺序 / DDL 与 aerich 已建表冲突而失败。采用「拆分 data 部分 + 禁用外键」：（⚠️ Compose 内 PG 已锁定 **18 线**，与种子同版本；若误用 16 会导入报错）

```bash
cd /home/ubuntu/full-stack-songdian

# 1) 拆出纯数据部分（跳过 CREATE TABLE / ALTER / INDEX 等 DDL）
awk '
  /^--/ { next }
  /^(CREATE|ALTER|SET|SELECT.*setval|COMMENT)/ { in_schema=1 }
  /^(COPY|INSERT|\\copy)/ { in_schema=0 }
  { if (!in_schema) print }
' db/seed_data.sql > /tmp/seed_data_only.sql

# 2) 通过 compose exec 连 PG（按 .env 的 PG_USER/PG_DB；下面以 songdian 为例，请替换为实际值）
#    先用 DO 块禁用全部外键触发器，导入后再启用（绕开 t_product / t_product_category 顺序问题）
docker compose exec -T postgres psql -U songdian -d songdian_b2b -v ON_ERROR_STOP=0 <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT conname, conrelid::regclass AS tbl FROM pg_constraint WHERE contype='f') LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER ALL', r.tbl);
  END LOOP;
END $$;
\i /tmp/seed_data_only.sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT conname, conrelid::regclass AS tbl FROM pg_constraint WHERE contype='f') LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER ALL', r.tbl);
  END LOOP;
END $$;
SQL
```

> ⚠️ 若同时用「方式 B 导入全量」又开着 `SEED_ON_START=true`，会重复插入。二者取一。
> ⚠️ 导入前确保 backend 已 `aerich upgrade` 建好表（即 `docker compose up -d` 已成功跑过一次）。
> ⚠️ 上面 `songdian` 用户 / 库名请替换为你 `.env` 中实际的 `PG_USER` / `PG_DB`。

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

| 检查项 | 操作 |
|--------|------|
| 容器状态 | `docker compose ps`（五服务均为 healthy/Up） |
| 后端存活 | `curl http://127.0.0.1:8000/healthz` → `{"status":"alive"}` |
| 数据完整 | `curl -s http://127.0.0.1:8000/api/v1/products?page_size=1` |
| 搜索 | `curl -s "http://127.0.0.1:8000/api/v1/products?keyword=相机"`（simple 分词下仍可命中） |
| 官网 | 浏览器 `https://www.songdian.tech` |
| 管理后台 | 浏览器 `https://admin.songdian.tech` |
| 图片显示 | 打开某产品页，确认 `api.songdian.tech/uploads/...` 图片加载 |
| 进程状态 | `docker compose ps` / `docker compose logs` |

---

## 十、常用运维

```bash
cd /home/ubuntu/full-stack-songdian

# 更新代码并重新构建发布
git pull
docker compose build
docker compose up -d

# 仅更新后端（改了 Python 代码）
docker compose up -d --build backend

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend

# 重启单个服务
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

## ⚠️ 注意事项

| 项 | 说明 |
|----|------|
| 保活方式 | 全部由 Docker Compose 管理（`restart: unless-stopped`），不再依赖 1Panel 进程守护或容器内 pm2 |
| PG/Redis 位置 | 由本 Compose 用官方镜像自建（postgres / redis 服务），与应用同网络、经服务名互访；数据落命名卷 |
| PG 版本 | 锁定 **18 线**（`postgres:18-bookworm`，官方镜像、无 zhparser），与 `db/seed_data.sql` 的 pg_dump 18 同版本；**勿降为 16**，否则种子导入失败 |
| 域名变更 | `NEXT_PUBLIC_API_URL` 等是**构建期内联**变量，改域名需 `docker compose build` 重新构建镜像（非仅改 env） |
| 图片域名 | `frontend/next.config.ts` 的 `remotePatterns` 默认含 `api.songdian.tech`；若 API 域名不同，需同步改该配置并重建 |
| admin 校验 | `admin-next` 与 `backend` 的 `JWT_SECRET` 必须一致，否则后台登录失败 |
| 无 HTTPS | 没域名时 OpenResty 用 IP 反代、登录走 HTTP 明文；建议买域名 + Let's Encrypt（1Panel 一键） |
| 数据导入 | 见「六、导入数据」：aerich 已建表，导入 `seed_data.sql` 须拆 data 部分 + 禁外键，避免 FK 顺序报错 |
| 数据库升级 | 升 PG 大版本时注意迁移 `pg_data` 卷（先备份再升）；Redis 升级注意 `redis_data` 兼容 |
| 前端 URL 规范映射 | `frontend/lib/generated/canonical-map.ts` 由 `npm run gen:map` 生成并随仓库提交；产品/分类变动后需重新生成+提交，再 `docker compose build`，否则产品 308 重定向用旧映射 |
| postcss 构建报错 | 若 `next build` 报 `Module not found: Can't resolve 'postcss'`，是 `node_modules/postcss` 被装成空目录所致；`rm -rf node_modules/postcss && npm install` 补全即可（本地 dev/CI 均可能遇到） |

---

*最后更新：2026-07-31（补充前端构建前置 `npm run gen:map`：产品 URL 规范映射需构建前生成并提交，否则生产 308 重定向用旧映射；记录 postcss 构建报错修复）*
