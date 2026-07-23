# Songdian 官网 — 腾讯云 1Panel 部署手册

> 本文档综合了完整部署过程，适用于 2G2M 腾讯云服务器 + 1Panel Linux 面板。
> 项目仓库：https://github.com/zengbbxx11/next-js-wordpress-headless-songdian.git

---

## 一、环境概览

| 项目 | 值 |
|------|-----|
| 服务器 IP | `106.53.220.184` |
| SSH 用户 | `ubuntu` |
| 面板 | 1Panel Linux 面板（端口 8090）|
| 服务器规格 | 2C2G，已加 2GB Swap |
| 前端工程 | Next.js 16 + TypeScript + Tailwind |
| 后端 CMS | WordPress（1Panel 应用商店部署）|
| 数据库 | MySQL 8.4.10，库名 `word_dNMNbP` |
| 前端运行 | PM2 保活，端口 3000 |
| Nginx 反向代理 | 1Panel OpenResty，80 端口 → 127.0.0.1:3000 |
| 项目路径 | `/home/ubuntu/songdianweb` |

---

## 二、服务器基础环境准备

### 2.1 腾讯云安全组

放行以下入站规则：

| 端口 | 用途 | 是否长期开放 |
|------|------|------------|
| 22 | SSH | ✅ |
| 80 | HTTP | ✅ |
| 443 | HTTPS | 有域名后开 |
| 8090 | 1Panel 面板 | ✅ |
| 10004 | WordPress | 按需（开放后加安全措施）|

### 2.2 1Panel 应用商店安装

1. **MySQL**（8.4.10）— 记下 root 密码，默认端口 `3306`
2. **PHP**（8.1+，实际装的是 8.5.8）— 如果后续不跑 PHP 站点，可停止此容器节省内存
3. **WordPress** — 安装时关联 MySQL，端口映射 `127.0.0.1:10004:80`；容器内 PHP 8.3.32
4. **Node.js**（22.x）
5. **OpenResty**（1.27.0.1）— 默认已装，负责反向代理

> 实际容器列表可通过 1Panel → **容器** 查看，确认状态均为 **运行中**。

### 2.3 SSH 连接与 Node 版本管理

该服务器使用 `nvm` 管理 Node 版本：

```bash
# SSH 登录
ssh ubuntu@106.53.220.184

# 切换 Node 22
nvm use 22
node -v    # 确认 v22.x

# 查看已安装版本
nvm ls

# 设置默认版本（新会话自动加载）
nvm alias default 22
```

> 每次新 SSH 登录后，如果 `node` 命令找不到，先执行 `nvm use 22`。
> 需要在 `~/.bashrc` 或 `~/.profile` 中确认有 `nvm` 的加载脚本，否则重启后 nvm 会失效。

### 2.4 添加 Swap（2G 服务器必须）

```bash
# SSH 登录
ssh ubuntu@106.53.220.184

# 创建 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 验证
free -h
```

---

## 三、WordPress 后端迁移

### 3.1 导入本地数据

1. 1Panel → **应用商店** → 已安装 → WordPress → 获取后台地址和初始账号
2. 临时开放外网访问：1Panel → **容器** → WordPress 容器 → **停止** → **编辑**
   端口映射从 `127.0.0.1:10004:80` 改为 `0.0.0.0:10004:80` → **启动**
3. 访问 `http://106.53.220.184:10004/wp-admin` 登录
4. 安装插件 **All-in-One WP Migration** → 导入 `.wpress` 备份文件
5. 导入完成后，改回 `127.0.0.1:10004:80`（如果选择按需开放策略）

### 3.2 数据库 URL 替换

进入 phpMyAdmin（1Panel → 数据库 → 管理）或直接 MySQL 命令行：

```bash
mysql -u root -p你的密码 word_dNMNbP -e "
UPDATE wp_options SET option_value = 'http://127.0.0.1:10004' WHERE option_name IN ('home', 'siteurl');
UPDATE wp_posts SET guid = REPLACE(guid, 'http://localhost:10004', 'http://127.0.0.1:10004');
UPDATE wp_posts SET post_content = REPLACE(post_content, 'http://localhost:10004', 'http://127.0.0.1:10004');
UPDATE wp_postmeta SET meta_value = REPLACE(meta_value, 'http://localhost:10004', 'http://127.0.0.1:10004');
"
```

### 3.3 WordPress 安全措施

如果选择永久开放 WordPress 外网访问（当前采用方案），建议做好以下防护：

1. **安装 WPS Hide Login 插件** — 修改默认 `/wp-admin` 登录路径（如改为 `/songdian-admin`），防止暴力破解
2. **使用强密码** — WordPress 管理员密码建议 12+ 位，大小写 + 数字 + 符号
3. **安装 Limit Login Attempts Reloaded** — 限制登录失败次数，自动封 IP
4. **定期更新** — WordPress 后台定期更新插件和主题，修补安全漏洞
5. **腾讯云安全组加白名单**（可选）— 如果你的出口 IP 固定，限制只有你的 IP 能访问 `10004` 端口

不改 `siteurl`，保持 `http://106.53.220.184:10004`，但需要在 `next.config.ts` 的 `remotePatterns` 中加上 `106.53.220.184`。

---

## 四、Next.js 前端部署

### 4.1 拉取代码

```bash
cd ~
mkdir songdianweb
cd songdianweb
git clone https://github.com/zengbbxx11/next-js-wordpress-headless-songdian.git .
```

### 4.2 配置环境变量

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_WORDPRESS_URL=http://127.0.0.1:10004
NEXT_PUBLIC_SITE_URL=http://106.53.220.184
NEXT_PUBLIC_ISR_REVALIDATE=60
NODE_ENV=production
WOOCOMMERCE_CONSUMER_KEY=ck_xxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxx
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=3932182720@qq.com
SMTP_PASS=pbwnuufompuyceej
EOF
```

### 4.3 配置图片远程白名单

```bash
nano next.config.ts
```

在 `images.remotePatterns` 中，根据实际情况添加以下条目（选你需要的）：

```typescript
remotePatterns: [
  { protocol: "http", hostname: "localhost", port: "10004", pathname: "/**" },
  { protocol: "http", hostname: "127.0.0.1", port: "10004", pathname: "/**" },
  // 如果 WordPress 永久开放用 IP 访问（当前采用方案）：
  { protocol: "http", hostname: "106.53.220.184", port: "10004", pathname: "/**" },
  // 如果有域名：
  // { protocol: "https", hostname: "www.your-domain.com", pathname: "/**" },
],
```

### 4.4 构建与启动

```bash
cd ~/songdianweb
npm install
npm run build

# 安装 PM2 并启动
npm install -g pm2
pm2 start npm --name songdian -- run start -- -p 3000
pm2 save
pm2 startup
```

### 4.5 配置反向代理

1Panel → **网站** → **创建网站** → **反向代理**

| 字段 | 值 |
|------|-----|
| 主域名 | `106.53.220.184` |
| 代理地址 | `http://127.0.0.1:3000` |

---

## 五、HTTPS 配置（有域名后）

### 5.1 域名解析

DNS 添加 A 记录指向 `106.53.220.184`：

```text
@   A   106.53.220.184
www A   106.53.220.184
```

### 5.2 1Panel 申请 SSL

1Panel → **网站** → 点网站 → **HTTPS** → **申请证书**

主域名填真实域名（**不能填 IP**），验证方式选 HTTP。

### 5.3 更新环境变量

```bash
cd ~/songdianweb
nano .env.local
```

更新：

```env
NEXT_PUBLIC_SITE_URL=https://你的域名
NEXT_PUBLIC_WORDPRESS_URL=https://你的域名
```

### 5.4 WordPress 切 HTTPS

```bash
mysql -u root -p你的密码 word_dNMNbP -e "
UPDATE wp_options SET option_value = 'https://你的域名' WHERE option_name IN ('home', 'siteurl');
"
```

### 5.5 重新构建

```bash
cd ~/songdianweb
npm run build
pm2 restart songdian
```

---

## 六、日常维护

### 6.1 更新前端代码

```bash
cd ~/songdianweb
git pull
npm install
npm run build
pm2 restart songdian
```

> ⚠️ `public/Video/` 目录下的视频文件（约 31MB）不在 Git 追踪中。首次部署或更新视频需手动上传（见下文）。

### 6.2 手动上传视频文件

About 页的工厂视频（`/Video/SongdianFactoryVideo.mp4`）因体积较大不进 Git。
首次部署或更换视频时：

```bash
# 在本地 PowerShell 执行
scp "C:\Users\Administrator\Desktop\Front-end project\next-js-wordpress-headless\my-app\public\Video\SongdianFactoryVideo.mp4" ubuntu@106.53.220.184:~/songdianweb/public/Video/
```

或在 1Panel → **文件** → `/home/ubuntu/songdianweb/public/Video/` → 上传。

### 6.3 查看运行状态

```bash
pm2 status               # 进程状态
pm2 logs songdian        # 实时日志
pm2 logs songdian --lines 50  # 最近 50 行
```

### 6.4 WordPress 相关命令

```bash
# 检查 WordPress 是否可访问
curl -I http://127.0.0.1:10004

# 检查 WordPress API
curl http://127.0.0.1:10004/wp-json/wp/v2/posts

# 替换数据库 URL
mysql -u root -p你的密码 word_dNMNbP -e "
UPDATE wp_posts SET guid = REPLACE(guid, '旧URL', '新URL');
"
```

### 6.5 数据库备份

> 在 1Panel 图形界面操作最方便：

1Panel → **数据库** → 点 MySQL 数据库右侧 **备份**

备份文件存储在 1Panel 的备份目录中，可在需要时恢复。

命令行备份方式：

```bash
mysqldump -u root -p你的密码 word_dNMNbP > ~/songdianweb_backup_$(date +%Y%m%d).sql
```

### 6.6 服务器重启后的恢复

服务器意外重启后，按以下顺序恢复服务：

```bash
# 1. 检查各容器是否自动启动（1Panel 容器默认自动重启）
# 2. 确认 Node 版本
nvm use 22

# 3. 恢复 PM2 进程
pm2 resurrect      # 从 pm2 save 的 dump 恢复
# 或重新启动：
pm2 start npm --name songdian -- run start -- -p 3000
pm2 save

# 4. 确认 Nginx 反向代理正常
# 1Panel 容器也会自动重启，OpenResty 恢复后反向代理自动生效
```

> 如果重启后 `pm2 resurrect` 无效，重新执行 `pm2 start` 并 `pm2 save`。

### 6.7 git pull 冲突处理

更新代码时若遇到 git pull 冲突：

```bash
cd ~/songdianweb

# 先看看改了哪些文件
git status

# 放弃本地修改（谨慎：会丢失所有本地改动）
git stash
git pull
# 或保留本地修改
git stash pop   # 恢复被暂存的改动，手动解决冲突
```

### 6.8 服务器资源监控

```bash
free -h       # 内存 + swap
df -h         # 磁盘
pm2 status    # 进程
docker stats  # 各容器实时资源占用（需 sudo）
```

### 6.9 资源优化建议（2G 服务器）

当前各容器内存占用参考（来自 `docker stats`）：

- WordPress: ~16%
- MySQL: ~7%
- OpenResty: ~0.5%
- PHP-FPM（songdian-test）: ~0.2%（闲置，可停止）

**建议**：如果不需要 PHP 站点，可以停止 `songdian-test`（PHP-FPM）容器以释放约 0.2% 内存。操作：1Panel → **容器** → 勾选 → **停止**。

---

## 七、本地开发与构建

### 7.1 项目位置

```text
C:\Users\Administrator\Desktop\Front-end project\next-js-wordpress-headless\my-app
```

### 7.2 本地构建说明

如果需要在本地构建（例如本地 WordPress 在跑）：

1. 确保本地 WordPress 已启动（当前在 `http://localhost:10004`）
2. 确认 `.env.local` 中的 `NEXT_PUBLIC_WORDPRESS_URL` 指向本地 WordPress
3. 在项目目录执行：

```bash
cd "C:\Users\Administrator\Desktop\Front-end project\next-js-wordpress-headless\my-app"
npm run build
```

> 如果本地 WordPress 没启动，构建时预渲染新闻和产品页会报 `Request timed out`。
> 
> **解决方案**：先将 `.env.local` 中的 `NEXT_PUBLIC_WORDPRESS_URL` 临时改为 `http://106.53.220.184:10004`（指向服务器），构建完再改回来。

### 7.3 本地开发

```bash
npm run dev
```

启动后访问 `http://localhost:3000`。修改代码会自动热更新。

### 7.4 提交代码更新

```bash
git add .
git commit -m "改了什么内容"
git push
```

推送后，服务器上执行 `git pull && npm install && npm run build && pm2 restart songdian` 即可上线。

---

## 八、常见问题

### 8.1 图片 400 Bad Request

- 检查 `next.config.ts` 的 `remotePatterns` 是否包含了当前 WordPress 的 hostname
- 检查数据库 `wp_options` 的 `home` 和 `siteurl` 是否匹配实际访问地址
- 修改后重新 `npm run build && pm2 restart songdian`

### 8.2 构建内存不足（OOM）

```bash
# 加 Swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 8.3 图片裂了但路径没问题

检查 `node_modules` 里的 `sharp` 是否安装正常：

```bash
cd ~/songdianweb
npm rebuild sharp
```

### 8.4 WordPress 后台打不开

1Panel → **容器** → 检查 WordPress 容器是否运行
1Panel → **应用商店** → 已安装 → 检查 MySQL 是否运行
检查端口映射是否为 `127.0.0.1:10004:80`

---

## 九、目录结构与关键文件

```
/home/ubuntu/songdianweb/      # 前端项目
├── .env.local                 # 环境变量
├── next.config.ts             # Next.js 配置（含图片白名单）
├── .next/                     # 构建产物（PM2 读取）

1Panel 容器：
├── 1Panel-wordpress-qddy          # WordPress（php:8.3.32）
│   ├── 端口 0.0.0.0:10004 → 80    # 可从外网访问
│   └── 内存 ~16%
├── 1Panel-mysql-IZKF              # MySQL 8.4.10
│   ├── 端口 0.0.0.0:3306 → 3306
│   └── 内存 ~7%
├── 1Panel-openresty-rWln          # OpenResty（Nginx 反向代理）
│   ├── 端口 0.0.0.0:80 → 80
│   ├── 端口 0.0.0.0:443 → 443（HTTPS 预留）
│   └── 内存 ~0.5%
└── songdian-test                   # PHP-FPM 8.5.8（闲置，可停止）
    ├── 端口 127.0.0.1:9000 → 9000
    └── 内存 ~0.2%

PM2 进程：
├── songdian       → npm run start -p 3000
```

---

*最后更新：2026-07-13*
