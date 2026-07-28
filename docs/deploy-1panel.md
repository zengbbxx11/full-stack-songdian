# Songdian B2B 全栈项目 · 1Panel Ubuntu 部署指南

> 适用：Ubuntu 22.04/24.04 + 1Panel Linux 面板  
> 架构：FastAPI 后端(:8000) + Next.js 官网(:3000) + Next.js 管理后台(:3001) + PostgreSQL + Redis
>
> ⚠️ **这是本项目唯一的部署路径**：后端已移除 Docker / docker-compose（改为 uv 虚拟环境直接运行）；
> 本地开发也是 Win10 / Linux + uv，不再依赖容器编排。PG 与 Redis 均由 1Panel 应用商店安装并管理。

---

## 一、服务器要求

| 资源 | 最低 | 推荐 |
|------|------|------|
| CPU | 2 核 | 4 核 |
| 内存 | 2 GB | 4 GB |
| 磁盘 | 20 GB | 40 GB+ |
| 系统 | Ubuntu 22.04/24.04 | 同左 |

---

## 二、环境安装（1Panel 面板操作）

### 2.1 安装运行时

在 1Panel 面板 → **应用商店** 中安装：

| 应用 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 16+ | 主数据库 |
| Redis | 8+ | 缓存/限流/会话 |
| Node.js | 24.x | 前端运行 |
| OpenResty | 最新 | 反向代理 |

### 2.2 安装 Python 3.14

```bash
# SSH 登录服务器
ssh ubuntu@你的服务器IP

# 安装 Python 3.14（推荐用 deadsnakes PPA）
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install python3.14 python3.14-venv python3.14-dev -y
```

### 2.3 安装 uv（Python 包管理）

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.cargo/env
```

---

## 三、数据库配置

### 3.1 创建数据库

在 1Panel → **数据库** → PostgreSQL → **创建数据库**：

| 字段 | 值 |
|------|-----|
| 数据库名 | `songdian_b2b` |
| 用户名 | `songdian` |
| 密码 | 生成随机强密码 |

### 3.2 安装中文分词扩展（可选）

```bash
# 1Panel 的 PostgreSQL 容器内执行
docker exec -it 1panel-postgresql-16 bash
apt update && apt install postgresql-16-zhparser -y
# 重启容器
docker restart 1panel-postgresql-16
```

> 不安装也可以——后端的搜索会自动降级为 `simple` 配置，功能正常。

---

## 四、部署代码

### 4.1 克隆项目

```bash
mkdir -p /opt/songdian
cd /opt/songdian
git clone https://github.com/你的用户名/songdian-b2b.git .
```

### 4.2 目录结构

```
/opt/songdian/
├── backend/      # FastAPI 后端
├── frontend/     # Next.js 官网
├── admin-next/   # Next.js 管理后台
└── docs/
```

---

## 五、后端部署

### 5.1 安装依赖

```bash
cd /opt/songdian/backend

# 创建虚拟环境并安装依赖
uv sync
uv sync --extra dev    # 如需要测试工具
```

### 5.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，修改以下项：

```env
# 数据库（使用 3.1 创建的数据库信息）
DATABASE_URL=postgres://songdian:你的密码@127.0.0.1:5432/songdian_b2b

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# JWT 密钥（生成命令：openssl rand -base64 48）
JWT_SECRET=换成你的随机密钥

# 管理后台初始账号
ADMIN_PASSWORD=换一个强密码

# 生产环境
APP_ENV=production
HOST=0.0.0.0
PORT=8000
SEED_ON_START=true

# 上传文件目录
MEDIA_ROOT=/opt/songdian/backend/uploads
MEDIA_URL=/uploads

# CORS（按实际域名配置）
CORS_ORIGINS=https://你的域名,https://admin.你的域名
```

### 5.3 执行数据库迁移

```bash
cd /opt/songdian/backend

# 应用迁移（创建所有表）
uv run aerich upgrade

# 种子数据（首次启动 SEED_ON_START=true 已自动执行，手动补跑一次）
uv run python -m seed.seed_data
```

### 5.4 PM2 启动

```bash
# 全局安装 PM2（如未安装）
npm install -g pm2

cd /opt/songdian/backend

# 启动
pm2 start ".venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name songdian-backend \
  --interpreter none

pm2 save
pm2 startup
```

---

## 六、官网前端部署

### 6.1 安装依赖

```bash
cd /opt/songdian/frontend
npm install
```

### 6.2 配置环境变量

创建 `.env.local`：

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SITE_URL=https://你的域名
```

### 6.3 构建并启动

```bash
# 生产构建
npm run build

# PM2 启动
pm2 start "/opt/songdian/frontend/node_modules/next/dist/bin/next start -p 3000" \
  --name songdian-frontend \
  --interpreter none

pm2 save
```

---

## 七、管理后台部署

### 7.1 安装依赖

```bash
cd /opt/songdian/admin-next
npm install
```

### 7.2 配置环境变量

创建 `.env.local`：

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

### 7.3 构建并启动

```bash
# 生产构建
npm run build

# PM2 启动
pm2 start "/opt/songdian/admin-next/node_modules/next/dist/bin/next start -p 3001" \
  --name songdian-admin \
  --interpreter none

pm2 save
```

---

## 八、反向代理配置

### 8.1 官网（1Panel → 网站 → 创建网站）

| 字段 | 值 |
|------|-----|
| 域名 | `你的域名` |
| 代理类型 | 反向代理 |
| 代理地址 | `http://127.0.0.1:3000` |

### 8.2 管理后台

| 字段 | 值 |
|------|-----|
| 域名 | `admin.你的域名` |
| 代理类型 | 反向代理 |
| 代理地址 | `http://127.0.0.1:3001` |

### 8.3 后端 API 代理（可选，如需对外暴露）

在官网的 OpenResty 配置中添加：

```nginx
# 代理 /api 到后端
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# 代理 /uploads 到后端
location /uploads/ {
    proxy_pass http://127.0.0.1:8000;
}
```

> 也可以在 1Panel 面板「网站 → 反向代理」中添加这两条规则。

### 8.4 配置受信代理（重要）

编辑 `backend/.env`，添加反向代理 IP：

```env
TRUSTED_PROXIES=127.0.0.1
```

否则客户端 IP 记录为代理 IP，影响审计日志和限流。

---

## 九、HTTPS 配置

在 1Panel → **网站** → 你的域名 → **SSL 证书**：

1. 点击"申请证书"
2. 选择 Let's Encrypt
3. 勾选域名，点击申请

1Panel 自动续期，无需手动维护。

---

## 十、PM2 进程管理

```bash
# 查看所有进程
pm2 status

# 查看日志
pm2 logs songdian-backend
pm2 logs songdian-frontend
pm2 logs songdian-admin

# 重启单个服务
pm2 restart songdian-backend

# 重启所有服务
pm2 restart all
```

---

## 十一、更新部署

```bash
cd /opt/songdian
git pull

# 后端
cd backend
uv sync
uv run aerich upgrade
pm2 restart songdian-backend

# 官网
cd ../frontend
npm install
npm run build
pm2 restart songdian-frontend

# 管理后台
cd ../admin-next
npm install
npm run build
pm2 restart songdian-admin
```

---

## 十二、防火墙

```bash
# 仅开放必要端口（反向代理已处理 80/443）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# 后端端口仅本机访问（已绑定 0.0.0.0 但防火墙不对外开放）
```

> 1Panel 面板自带防火墙管理，可在面板中配置。

---

## 十三、验证清单

| 检查项 | 验证方法 |
|--------|---------|
| 后端存活 | `curl http://127.0.0.1:8000/healthz` → `{"status":"alive"}` |
| 后端就绪 | `curl http://127.0.0.1:8000/readyz` → `db:true, redis:true` |
| 官网访问 | 浏览器打开 `https://你的域名` |
| 管理后台 | 浏览器打开 `https://admin.你的域名` |
| API 数据 | `curl http://127.0.0.1:8000/api/v1/products?page_size=1` |

---

## 十四、故障排查

| 现象 | 排查步骤 |
|------|---------|
| 后端 502 | `pm2 logs songdian-backend`，检查 DATABASE_URL / REDIS_URL |
| 前端 500 | `pm2 logs songdian-frontend`，检查 NEXT_PUBLIC_API_URL |
| 数据库连接 | `psql -h 127.0.0.1 -U songdian -d songdian_b2b` |
| 图片不显示 | 检查 `MEDIA_ROOT` 目录权限，确认 `/uploads/` 代理配置 |
| 搜索无结果 | 检查 zhparser 安装或接受 simple 降级 |

---

---
## 十五、从本地迁移数据到服务器

本地开发环境使用 PostgreSQL，数据量：42 条产品 + 9 条新闻 + 179 张图片（17MB）。

### 15.1 导出本地数据库

在本地 Windows 终端执行（Git Bash 或 PowerShell）：

```bash
PGPASSWORD=postgres pg_dump -h localhost -U postgres -d songdianB2B \
  --no-owner --no-privileges --inserts \
  > songdian_backup.sql
```

### 15.2 传到服务器

```bash
scp songdian_backup.sql ubuntu@你的IP:/opt/songdian/
scp -r backend/uploads/* ubuntu@你的IP:/opt/songdian/backend/uploads/
```

### 15.3 导入到生产数据库

SSH 进服务器后：

```bash
cd /opt/songdian/backend
uv run aerich upgrade

PGPASSWORD=你的数据库密码 psql -h 127.0.0.1 -U songdian -d songdian_b2b \
  < /opt/songdian/songdian_backup.sql

rm /opt/songdian/songdian_backup.sql
```

### 15.4 验证数据

```bash
curl -s http://127.0.0.1:8000/api/v1/products?page_size=1 | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(f'产品: {d[\"data\"][\"total\"]} 条')"
```

---

## 十六、备份建议

```bash
# 数据库备份（添加到 crontab）
pg_dump -h 127.0.0.1 -U songdian songdian_b2b > /opt/backups/db_$(date +%Y%m%d).sql

# 上传文件备份
tar -czf /opt/backups/uploads_$(date +%Y%m%d).tar.gz /opt/songdian/backend/uploads/
```

> 1Panel 面板 → 计划任务 → 添加 cron 定时执行。
