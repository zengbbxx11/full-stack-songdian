# Songdian B2B — 1Panel + Ubuntu 服务器部署手册

> 适用于腾讯云/阿里云 Ubuntu 服务器 + 1Panel Linux 面板。
> 仓库地址：https://github.com/zengbbxx11/full-stack-songdian

---

## 一、服务器要求

| 项目 | 最低配置 | 推荐 |
|------|---------|------|
| CPU | 2 核 | 4 核 |
| 内存 | 2 GB + 2 GB Swap | 4 GB |
| 系统 | Ubuntu 22.04 / 24.04 | — |
| 面板 | 1Panel（端口 8090） | — |
| 项目路径 | `/home/ubuntu/full-stack-songdian` | — |

---

## 二、安全组 / 防火墙

在腾讯云控制台放行以下端口：

| 端口 | 用途 |
|------|------|
| 22 | SSH |
| 80 | HTTP（官网 + 后台） |
| 443 | HTTPS（有域名后开） |
| 8090 | 1Panel 面板 |
| 8000 | 后端 API（仅内网，不开放公网） |

---

## 三、1Panel 应用商店安装

登录 1Panel → 应用商店，依次安装：

| 应用 | 版本建议 | 说明 |
|------|---------|------|
| PostgreSQL | 16+ | 记下 root 密码，创建数据库 `songdianB2B` |
| **Node.js** | 24.x | Next.js 16 需要 Node 24 |
| **OpenResty** | 最新 | Nginx 反向代理 |
| **PM2** | 最新 | Node 进程保活 |

> 注：不再需要 MySQL、PHP、WordPress。
> 1Panel 容器列表确认以上四个应用状态均为**运行中**。

---

## 四、克隆代码并导入数据

### 4.1 克隆仓库

```bash
cd ~
git clone https://github.com/zengbbxx11/full-stack-songdian.git
cd full-stack-songdian
```

仓库已包含全部代码、图片和数据库备份，无需额外迁移。

### 4.2 创建数据库

在 1Panel → 数据库 → PostgreSQL → 创建数据库：

- 数据库名：`songdianB2B`
- 用户名：`songdian`
- 密码：自定（记下来，后续配 `.env`）

### 4.3 导入数据

```bash
PGPASSWORD=你的密码 psql -h 127.0.0.1 -U songdian -d songdianB2B < db/songdianB2B_full.sql
```

导入后验证：

```bash
PGPASSWORD=你的密码 psql -h 127.0.0.1 -U songdian -d songdianB2B -c "SELECT count(*) FROM t_product;"
# 应输出 42
```

---

## 五、后端部署（FastAPI + Python）

### 5.1 安装 Python 和依赖

服务器上安装 Python 3.14+ 和 uv 包管理器：

```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.cargo/env

# 安装依赖
cd ~/full-stack-songdian/backend
uv sync
```

### 5.2 配置环境变量

```bash
cp .env.example .env
nano .env
```

关键配置：

```env
DATABASE_URL=postgres://songdian:你的密码@127.0.0.1:5432/songdianB2B
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<openssl rand -base64 48 生成>
ADMIN_PASSWORD=Songdian@2026
SEED_ON_START=true
HOST=0.0.0.0
PORT=8000
APP_ENV=production
CORS_ORIGINS=http://你的域名或IP
```

### 5.3 启动后端（PM2 保活）

```bash
pm2 start ".venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name songdian-backend \
  --interpreter none
pm2 save
```

---

## 六、前端部署（Next.js 官网 + 管理后台）

### 6.1 安装依赖并构建

```bash
# 官网前端（端口 3000）
cd ~/full-stack-songdian/frontend
npm install
npm run build

# 管理后台（端口 3001）
cd ~/full-stack-songdian/admin-next
npm install
npm run build
```

### 6.2 配置环境变量

```bash
cd ~/full-stack-songdian/frontend
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SITE_URL=http://你的域名或IP
EOF
```

### 6.3 启动（PM2 保活）

```bash
cd ~/full-stack-songdian/frontend
pm2 start npm --name songdian-frontend -- run start -- -p 3000

cd ~/full-stack-songdian/admin-next
pm2 start npm --name songdian-admin -- run start -- -p 3001

pm2 save
pm2 startup   # 开机自启
```

---

## 七、Nginx 反向代理（1Panel OpenResty）

1Panel → 网站 → 创建网站 → 反向代理：

### 官网（端口 80 → 3000）

| 字段 | 值 |
|------|-----|
| 主域名 | `你的IP` 或 `你的域名` |
| 代理地址 | `http://127.0.0.1:3000` |

### 管理后台（可选，推荐加路径前缀）

为管理后台添加一条 location 规则，点击网站的 **配置文件**：

```nginx
location /admin/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

或者直接映射到另一个域名/端口。

---

## 八、上传视频文件

About 页面工厂视频（31MB）不在 Git 仓库中，需手动上传：

```bash
# 本地执行
scp Video/SongdianFactoryVideo.mp4 ubuntu@你的IP:~/full-stack-songdian/frontend/public/Video/
```

或在 1Panel → 文件管理 → 上传到对应目录。

---

## 九、日常维护

### 查看运行状态

```bash
pm2 status
pm2 logs
pm2 logs songdian-backend --lines 50
```

### 更新代码

```bash
cd ~/full-stack-songdian
git pull

# 后端
cd backend && uv sync && pm2 restart songdian-backend

# 前端
cd ../frontend && npm install && npm run build && pm2 restart songdian-frontend
cd ../admin-next && npm install && npm run build && pm2 restart songdian-admin
```

### 数据库备份

```bash
PGPASSWORD=你的密码 pg_dump -h 127.0.0.1 -U songdian songdianB2B > ~/backup_$(date +%Y%m%d).sql
```

### 服务器重启后恢复

```bash
# 1Panel 容器默认自动启动（PostgreSQL/Node/OpenResty）
# 确认 PM2 进程恢复
pm2 resurrect
pm2 status
```

---

## 十、故障排查

| 症状 | 排查 |
|------|------|
| 后端 502 | `pm2 logs songdian-backend` 看是否报错；确认 PostgreSQL 容器运行中 |
| 前端 500 | 构建时是否环境变量正确；`pm2 logs songdian-frontend` |
| 图片 404 | 确认 `backend/.env` 中 `MEDIA_ROOT` 路径存在且有读写权限 |
| 登录失败 | 确认数据库导入成功；`ADMIN_PASSWORD` 环境变量设置 |

---

*最后更新：2026-07-24*
