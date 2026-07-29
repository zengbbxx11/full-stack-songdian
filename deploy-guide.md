# Songdian B2B 部署指南（1Panel + Ubuntu · IP 无域名 · 家目录版）

> 目标服务器：`106.53.220.184`（Ubuntu + 1Panel）
> 登录用户：`ubuntu`（家目录 `/home/ubuntu`）
> 项目根目录：`/home/ubuntu/full-stack-songdian`（即 `~`）
> 仓库：`https://github.com/zengbbxx11/full-stack-songdian`
> 数据与图片随仓库携带，`git clone` 即得，无需额外传输。
> 本文为统一部署文档，原 `docs/deploy-1panel-ip.md` 已并入此处。

---

## 架构总览

```
http://106.53.220.184/           → OpenResty:80 → 官网 Next.js :3000
http://106.53.220.184/api/*      → OpenResty:80 → FastAPI :8000
http://106.53.220.184/uploads/*  → OpenResty:80 → FastAPI :8000
http://106.53.220.184:3001/      → 管理后台 Next.js :3001（直连）
```

---

## 一、服务器环境

### 1.1 1Panel 应用商店安装

登录 1Panel（:8090）→ 应用商店 → 已安装，依次安装：

| 应用 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 16+ | 主库 |
| Redis | 8+ | 缓存/限流（可选，无则后端降级内存字典） |
| **Node.js 应用** | 24.x | 前端运行环境（见下方说明） |
| OpenResty | 最新 | 反向代理 |

**Node.js 应用创建要点（关键，别踩坑）：**
- 创建「Node.js 应用」时，**启动命令填 `tail -f /dev/null`**。
- 把「项目目录 / 运行目录」指向宿主机 `/home/ubuntu/full-stack-songdian`（容器会挂载它，终端里就能访问项目文件）。
- **为什么是 `tail -f /dev/null`**：1Panel 的 Node.js 应用需要一个**前台常驻进程**才认为「运行中」。我们并不让它直接跑业务，只是借它的容器拿到 Node 24 环境和 Web 终端；真正的业务（`next` 构建/启动）由我们进入该容器终端手动完成，用 `tail -f /dev/null` 占坑保活即可。
- 如果填真实启动命令（如 `npm start`），该进程一退出或你想重启前端，1Panel 会接管/报错，反而束手束脚。

> 注：不再需要 MySQL / PHP / WordPress。装完后确认四个应用均为「运行中」。

### 1.2 SSH 安装 Python 3.14 + uv（后端用，不走容器）

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

1Panel → 数据库 → PostgreSQL → 创建数据库：

| 字段 | 值 |
|------|-----|
| 库名 | `songdian_b2b` |
| 用户名 | `songdian` |
| 密码 | 随机生成（**记下来**） |

---

## 三、拉取代码（家目录）

```bash
ssh ubuntu@106.53.220.184
cd ~
git clone https://github.com/zengbbxx11/full-stack-songdian.git
cd full-stack-songdian
```

```
/home/ubuntu/full-stack-songdian/
├── backend/       # FastAPI
├── frontend/      # Next.js 官网
├── admin-next/    # Next.js 管理后台
├── db/            # seed_data.sql
└── docs/          # 部署文档
```

---

## 四、后端部署（FastAPI，uv venv 直跑 + 1Panel 进程守护）

### 4.1 安装依赖

```bash
cd /home/ubuntu/full-stack-songdian/backend
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
MEDIA_ROOT=/home/ubuntu/full-stack-songdian/backend/uploads
MEDIA_URL=/uploads
CORS_ORIGINS=http://106.53.220.184,http://106.53.220.184:3001
TRUSTED_PROXIES=127.0.0.1
EOF
```

> ⚠️ 把 `你的PG密码` / `设置你的后台密码` 换成实际值；`JWT_SECRET` 用 `openssl rand -base64 48` 生成。

### 4.3 建表 + 导入数据

```bash
# 1) aerich 建表（含 aerich 版本记录）
uv run aerich upgrade

# 2) 导入业务数据（忽略 "already exists"，因 aerich 已建表）
PGPASSWORD=你的PG密码 psql -h 127.0.0.1 -U songdian -d songdian_b2b \
  -v ON_ERROR_STOP=0 -f /home/ubuntu/full-stack-songdian/db/seed_data.sql

# 3) 验证
curl http://127.0.0.1:8000/healthz    # → {"status":"alive"}
```

### 4.4 用 1Panel「进程守护」保活（无需主机装 pm2）

1Panel → **进程守护** → 创建：

| 字段 | 值 |
|------|-----|
| 名称 | `songdian-backend` |
| 运行目录 | `/home/ubuntu/full-stack-songdian/backend` |
| 启动命令 | `/home/ubuntu/full-stack-songdian/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000` |

保存并「启动」。这是 1Panel 原生 Supervisor，服务器重启会自动拉起，**无需在主机装 Node / PM2**（主机里本来也没有 Node）。

---

## 五、官网前端部署（1Panel Node.js 应用容器）

进入 **1Panel → 应用商店 → 已安装 → 你的 Node.js 应用 → 终端**（即 1.1 里创建的那个，启动命令 `tail -f /dev/null`）。

### 5.1 配置 `.env.local`

```bash
cd /home/ubuntu/full-stack-songdian/frontend
echo 'NEXT_PUBLIC_API_URL=http://106.53.220.184' > .env.local
```

> `next.config.ts` 已含该 IP 的 `remotePatterns`，无需手动改。

### 5.2 构建

```bash
npm install && npm run build
```

### 5.3 容器内切 pm2 保活

```bash
npm install -g pm2
pm2 start "./node_modules/next/dist/bin/next start -p 3000" \
  --name songdian-frontend --interpreter none
pm2 save
```

> 容器重启后需重新进终端执行 `pm2 resurrect`。也可把该 Node.js 应用的「启动命令」直接改为 `pm2 resurrect`（二选一，本文采用 `tail -f /dev/null` + 手动 pm2 的方式，更直观）。

---

## 六、管理后台部署（同容器）

仍在 Node.js 应用终端里操作：

```bash
cd /home/ubuntu/full-stack-songdian/admin-next

# JWT_SECRET 必须和 backend/.env 完全一致
echo 'NEXT_PUBLIC_API_URL=http://106.53.220.184' > .env.local
echo 'JWT_SECRET=和backend.env里一模一样的值' >> .env.local

npm install && npm run build

pm2 start "./node_modules/next/dist/bin/next start -p 3001" \
  --name songdian-admin --interpreter none
pm2 save
```

> ⚠️ 两处 `JWT_SECRET` 不一致会导致后台登录失败。

---

## 七、OpenResty 反向代理

1Panel → 网站 → 创建网站 → 反向代理：

| 配置 | 值 |
|------|-----|
| 主域名 | `106.53.220.184` |
| 代理地址 | `http://127.0.0.1:3000` |

创建后 → 网站设置 → 配置文件 → 在 `server` 块内追加：

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

## 九、验证清单

| 检查项 | 操作 |
|--------|------|
| 后端存活 | `curl http://127.0.0.1:8000/healthz` → `{"status":"alive"}` |
| 数据完整 | `curl -s http://127.0.0.1:8000/api/v1/products?page_size=1` |
| 官网 | 浏览器 `http://106.53.220.184` |
| 管理后台 | 浏览器 `http://106.53.220.184:3001` |
| 图片显示 | 打开某产品页，确认图片加载 |
| 进程状态 | 容器内 `pm2 status` / 1Panel 进程守护列表 |

---

## 十、常用运维

```bash
# 更新代码
cd /home/ubuntu/full-stack-songdian && git pull
cd backend && uv sync && uv run aerich upgrade && \
  # 后端在 1Panel 进程守护里点“重启”
cd ../frontend && npm install && npm run build && pm2 restart songdian-frontend
cd ../admin-next && npm install && npm run build && pm2 restart songdian-admin

# 查看后端日志：1Panel → 进程守护 → 日志
# 查看前端日志（容器内终端）：pm2 logs songdian-frontend --lines 50

# 数据库备份
mkdir -p /home/ubuntu/backups
pg_dump -h 127.0.0.1 -U songdian songdian_b2b > /home/ubuntu/backups/db_$(date +%Y%m%d).sql
```

---

## 十一、静态资源补充（视频文件）

About 页面工厂视频（约 31MB）不在 Git 仓库中，需手动上传到前端 public：

```bash
# 本地执行
scp Video/SongdianFactoryVideo.mp4 ubuntu@106.53.220.184:/home/ubuntu/full-stack-songdian/frontend/public/Video/
```

或在 1Panel → 文件管理，上传到该目录。

---

## ⚠️ 注意事项

| 项 | 说明 |
|----|------|
| Node.js 应用保活 | 启动命令 `tail -f /dev/null` 仅为占坑，业务由容器内 pm2 跑；容器重启后需 `pm2 resurrect` |
| 后端保活 | 用 1Panel 进程守护，不要在主机的全局 pm2 里跑（主机无 node） |
| 无 HTTPS | 没域名无法用 Let's Encrypt，登录走 HTTP 明文。建议花几块钱买个域名 |
| admin 端口直连 | `:3001` 直接对外，`JWT_SECRET` 必须够强（48+ 字节随机值） |
| IP 硬编码 | 换服务器 IP 需改：`backend/.env`(CORS) + `frontend/.env.local` + `admin-next/.env.local` |
| 数据导入 | `seed_data.sql` 含 aerich DDL，导入时 `ON_ERROR_STOP=0` 跳过 "already exists" |

---

*最后更新：2026-07-29（家目录 / 1Panel Node.js 应用容器方案）*
