# Songdian B2B 部署指南 · IP 无域名版

> 目标：`106.53.220.184`（Ubuntu + 1Panel）  
> 架构：OpenResty(:80) → 前端(:3000) + API(:8000)，管理后台(:3001) 直连  
> 数据与图片随仓库携带，clone 即得，无需额外传输。

---

## 总览

```
http://106.53.220.184/           → OpenResty:80 → Next.js :3000 (官网)
http://106.53.220.184/api/*      → OpenResty:80 → FastAPI :8000
http://106.53.220.184/uploads/*  → OpenResty:80 → FastAPI :8000
http://106.53.220.184:3001/      → Next.js :3001 (管理后台，直连)
```

---

## 一、服务器环境

### 1.1 1Panel 应用商店安装

| 应用 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 16+ | 主库 |
| Redis | 8+ | 缓存/限流 |
| Node.js | 24.x | 前端运行 |
| OpenResty | 最新 | 反向代理 |

### 1.2 SSH 安装 Python + uv

```bash
ssh ubuntu@106.53.220.184

sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install python3.14 python3.14-venv python3.14-dev -y

curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.cargo/env
```

---

## 二、创建数据库

1Panel → **数据库** → PostgreSQL → **创建数据库**：

| 字段 | 值 |
|------|-----|
| 库名 | `songdian_b2b` |
| 用户名 | `songdian` |
| 密码 | 随机生成（**记下来**） |

---

## 三、拉取代码

```bash
mkdir -p /opt/songdian && cd /opt/songdian
git clone https://github.com/zengbbxx11/full-stack-songdian.git .

# 目录结构
# /opt/songdian/
# ├── backend/       # FastAPI
# ├── frontend/      # Next.js 官网
# ├── admin-next/    # Next.js 管理后台
# ├── db/            # seed_data.sql
# └── docs/          # 部署文档
```

---

## 四、后端部署

### 4.1 安装依赖

```bash
cd /opt/songdian/backend
uv sync
```

### 4.2 创建 `.env`

```bash
cat > .env << 'EOF'
DATABASE_URL=postgres://songdian:你的PG密码@127.0.0.1:5432/songdian_b2b
REDIS_URL=redis://127.0.0.1:6379/0
JWT_SECRET=$(openssl rand -base64 48)
ADMIN_PASSWORD=设置你的后台密码
APP_ENV=production
HOST=0.0.0.0
PORT=8000
SEED_ON_START=true
MEDIA_ROOT=/opt/songdian/backend/uploads
MEDIA_URL=/uploads
CORS_ORIGINS=http://106.53.220.184,http://106.53.220.184:3001
TRUSTED_PROXIES=127.0.0.1
EOF
```

> ⚠️ 把 `你的PG密码` 和 `设置你的后台密码` 替换为实际值。`JWT_SECRET` 用 `openssl rand -base64 48` 生成。

### 4.3 建表 + 导入数据

```bash
# 1) aerich 建表（包括 aerich 版本记录）
uv run aerich upgrade

# 2) 导入业务数据（产品/新闻/询盘/媒体记录等）
#    忽略"already exists"错误（aerich 已建的表再建一次）
PGPASSWORD=你的PG密码 psql -h 127.0.0.1 -U songdian -d songdian_b2b \
  -v ON_ERROR_STOP=0 -f /opt/songdian/db/seed_data.sql

# 3) 验证
curl http://127.0.0.1:8000/healthz    # → {"status":"alive"}
```

### 4.4 PM2 启动

```bash
npm install -g pm2

pm2 start ".venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name songdian-backend --interpreter none

pm2 save && pm2 startup
```

---

## 五、官网前端部署

### 5.1 配置

```bash
cd /opt/songdian/frontend

# 创建环境变量
echo 'NEXT_PUBLIC_API_URL=http://106.53.220.184' > .env.local
```

> `next.config.ts` 已含 IP remotePattern，无需手动编辑。

### 5.2 构建 + 启动

```bash
npm install && npm run build

pm2 start "./node_modules/next/dist/bin/next start -p 3000" \
  --name songdian-frontend --interpreter none

pm2 save
```

---

## 六、管理后台部署

### 6.1 配置

```bash
cd /opt/songdian/admin-next

# JWT_SECRET 必须和 backend/.env 一致
echo 'NEXT_PUBLIC_API_URL=http://106.53.220.184' > .env.local
echo 'JWT_SECRET=和backend/.env里一模一样的值' >> .env.local
```

> ⚠️ 两处 `JWT_SECRET` 不一致会导致登录失败。

### 6.2 构建 + 启动

```bash
npm install && npm run build

pm2 start "./node_modules/next/dist/bin/next start -p 3001" \
  --name songdian-admin --interpreter none

pm2 save
```

---

## 七、OpenResty 反向代理

1Panel → **网站** → **创建网站** → 反向代理：

| 配置 | 值 |
|------|-----|
| 主域名 | `106.53.220.184` |
| 代理地址 | `http://127.0.0.1:3000` |

创建后 → 「网站设置」→「配置文件」→ 在 `server` 块内追加：

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

---

## 八、防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

> ⚠️ 云服务器安全组也要放行 **80** 和 **3001**。

---

## 九、验证

| 检查项 | 操作 |
|--------|------|
| 后端存活 | `curl http://127.0.0.1:8000/healthz` → `{"status":"alive"}` |
| 数据完整 | `curl -s http://127.0.0.1:8000/api/v1/products?page_size=1` |
| 官网 | 浏览器 `http://106.53.220.184` |
| 管理后台 | 浏览器 `http://106.53.220.184:3001` |
| 图片显示 | 浏览器打开某个产品页，检查图片是否加载 |
| 进程状态 | `pm2 status` |

---

## 十、常用运维

```bash
# 更新代码
cd /opt/songdian && git pull
cd backend && uv sync && uv run aerich upgrade && pm2 restart songdian-backend
cd ../frontend && npm install && npm run build && pm2 restart songdian-frontend
cd ../admin-next && npm install && npm run build && pm2 restart songdian-admin

# 查看日志
pm2 logs songdian-backend --lines 50

# 数据库备份
mkdir -p /opt/backups
pg_dump -h 127.0.0.1 -U songdian songdian_b2b > /opt/backups/db_$(date +%Y%m%d).sql
```

---

## ⚠️ 注意事项

| 项 | 说明 |
|----|------|
| 无 HTTPS | 没域名无法用 Let's Encrypt，登录走 HTTP 明文。建议花几块钱买个域名 |
| admin 端口直连 | `:3001` 直接对外，`JWT_SECRET` 必须够强（推荐 48+ 字节随机值） |
| IP 硬编码 | 换服务器 IP 需改：`backend/.env`(CORS) + `frontend/.env.local` + `admin-next/.env.local` |
| 数据导入 | `seed_data.sql` 含 aerich DDL，导入时 `ON_ERROR_STOP=0` 跳过"already exists" |
