# 安全审计发现修复总览（18/18）

> **历史修复记录，不作为当前部署或认证说明。** 本文保留 2026-07 审计过程；其中 Bearer、`localStorage`、双通道认证、按请求协议设置 `Secure`、1Panel 独立 PG/Redis 等表述已经被后续方案取代。当前生产依据为根目录 [CURRENT_IMPLEMENTATION.md](CURRENT_IMPLEMENTATION.md)、[README.md](README.md)、[deploy-guide.md](deploy-guide.md) 与代码。

## 当前安全状态（2026-08）

- 管理后台为 **Cookie-only JWT**：登录、刷新、登出都只使用 HttpOnly `access_token` / `refresh_token` Cookie；登录和刷新响应不返回令牌，浏览器代码不读取 JWT，也不发送 Bearer 头。
- Cookie 使用 `HttpOnly`、`SameSite=Lax`，且在 `APP_ENV=production` 启用 `Secure`；后台 API 从 `admin.zsaki.icu` 的同源 `/api` 代理访问，401 最多刷新并重试一次。
- 后台写请求会校验允许的 `Origin`；全局 `/api/v1` 限流使用 Redis，Redis 不可用时受控降级到内存限流。
- 上传路径、符号链接、文件实际格式与扩展名均由后端校验；失败时清理临时文件与孤立记录。
- 后端容器仅发布到宿主机回环；运行时自动识别 Docker 网桥可信代理。实际生产域名、HTTPS 与端口收口流程见 [部署指南](deploy-guide.md)。

---

> 对象：`full-stack-project`（backend FastAPI / frontend Next.js 16 / admin-next Next.js）
> 对应审计：`security-audit-skill` run-1（18  findings：1 CRITICAL / 5 HIGH / 7 MEDIUM / 5 LOW）
> 状态：全部代码层修复完成，后端已重启生效（:8000），`TestClient` 冒烟通过。

## 修复清单（F 编号对应审计报告）

| # | 严重度 | 问题 | 修复位置 |
|---|--------|------|----------|
| F-01 | CRITICAL | 标题 `</script>` 注入 JSON-LD 致全站存储型 XSS | 后端 `common/html_cleaner.py` 新增 `clean_text`；`product/news/services.py` 写入清洗标题/摘要/作者；前端 `lib/seo.ts` 新增 `safeJsonLd`（`<`→`\u003c`），替换 3 处 `JSON.stringify` 注入 |
| F-02 | HIGH | 匿名可传 `?status=DRAFT` 读未发布内容 | `product/routers.py`、`news/routers.py` 公开列表强制 `status="PUBLISHED"`；detail 服务层强制 `status=PUBLISHED` |
| F-03 | HIGH | 迁移 ETL SSRF + 任意图片下载 | 新增 `common/ssrf.py`（仅 http/https + 受信主机白名单）；`config.py` 加 `migration_wp_host`/`migration_allowed_hosts`；`migration/schemas.py` 校验源站；`migration/image_sync.py` 仅限白名单主机、拒 svg/html（魔数 `_is_real_image` 校验）、10MB 上限。**（M6 模块已于 2026-07-27 移除，`migration/*` 相关代码已删；`common/ssrf.py` 通用 SSRF 防护基础设施保留）** |
| F-04 | HIGH | 硬编码/可空默认管理员密码 | `seed/seed_data.py` 不再默认弱密码；`ADMIN_PASSWORD` 为空则生成一次性随机密码并记录日志；空密码历史账号自动补设；PG 口令强度由 1Panel/部署环境保证（不再依赖 `docker-compose.yml`） |
| F-05 | HIGH | RBAC 权限缓存未签名 | `common/deps.py` 权限缓存 `auth:perm:{uid}` 加 HMAC（密钥 `jwt_secret`），读时验签，失败回查 DB |
| F-06 | HIGH | `X-Forwarded-For` 首个段被信任 | `common/middleware.py` `get_client_ip` 仅当直连 IP 在 `trusted_proxies` 才采纳 XFF，否则用真实直连 IP |
| F-07 | HIGH | Redis 异常时 fail-open | `common/jwt.py` `is_revoked`/`is_family_revoked` 与 `content/services.py` 登录锁，Redis 异常按 `security_fail_closed`（默认 True）fail-closed |
| F-08 | HIGH | admin 无前端路由守卫 | 新增 `admin-next/src/middleware.ts`（Edge Runtime，用 `jose` 校验后端下发的 HttpOnly `access_token` cookie 的 HS256 签名，未登录跳 /signin；`JWT_SECRET` 须与后端一致，否则降级为仅校验 `exp` 并告警）；`SignInForm` 仅将令牌存入 `localStorage`（作为接口 Bearer，**不再写明文可读 cookie**，消除 XSS 窃取风险）；`UserDropdown` 退出调用 `/admin/logout`（后端清除 HttpOnly cookie）+ 清 `localStorage`。**后续修正**：matcher 正则排除 `/api` 和 `/uploads`，否则登录 POST 也被守卫拦截重定向到 /signin（浏览器端无法登录） |
| F-09 | MEDIUM | CORS 通配 + 凭据 | `main.py` 改显式 `cors_origin_list` + `allow_credentials=False` |
| F-10 | MEDIUM | 上传无配额 | `uploads/services.py` 加 `check_upload_limits`（数量/总大小），`uploads/routers.py` 单/批上传调用 |
| F-11 | MEDIUM | 发布无权限门禁 | `content/permissions.py` 加 `product:publish`/`news:publish`（admin 有、operator 无）；`deps.py` 加 `optional_permission`；routers 注入 `can_publish`；services 无发布权时 PUBLISHED 降级 DRAFT |
| F-12 | MEDIUM | docker 弱密码/暴露 DB 端口 | **已通过移除 `docker-compose.yml` 解决**：部署改为 Ubuntu + 1Panel（PG/Redis 由 1Panel 应用商店安装并管理，默认不暴露宿主机端口）；后端以 uv venv 运行，经 `.env` 注入强 `JWT_SECRET`、设 `APP_ENV=development` |
| F-13 | MEDIUM | `.env` 密钥风险 | 根 `.gitignore` 已忽略 `.env` 与 `*.db`（无 git 仓库，无已提交密钥）；`.env.example` 加轮换说明 |
| F-14 | MEDIUM | 生产暴露 /docs | `main.py` 仅非生产或显式 `openapi_docs_enabled` 才挂载 /docs/redoc/openapi.json |
| F-15 | MEDIUM | 缺安全响应头 | `common/middleware.py` 响应加 `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`/CSP/`Permissions-Policy`（覆盖 /uploads） |
| F-16 | LOW | `*.db` 未忽略 | 根 `.gitignore:12-15` 已覆盖（无代码改动） |
| F-17 | LOW | 分类排序竞态 | `product/news/services.py` `reorder_*` 包 `in_transaction()` |
| F-18 | LOW | sort_order 越界 | `product/news/services.py` create/update 校验 NaN/非有限/极端值（±1e6） |

## 验证结果

- **后端 import**：全部编辑模块 `import` 通过（含 `main`）。
- **运行时冒烟（TestClient）**：
  - `/healthz` → 200
  - 公开产品列表 → 200，且安全头 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY` 存在
  - CORS：允许源 `http://localhost:3000` 回显，非允许源 `http://evil.example.com` 不回显 ✅
  - 生产环境 `/docs` → 404（已禁用）✅
- **类型检查**：`admin-next` `tsc --noEmit` 无本次引入的新错误（`products/page.tsx` 与 `SignInForm` 的 `Input required` 报错为改造前遗留，与本次无关）；`frontend` 改动文件无错。
- **重启生效**：后端已重启（:8000，PID 19180），日志显示种子幂等完成、无报错；既有 admin 密码非空，`_seed_admin` 补设逻辑未触发（无副作用）。

## 后续加固（2026-07-27，前端渲染层纵深防御）

run-1 / run-2 的修复集中在后端。本次在**前端渲染层**补一道存储型 XSS 的纵深防御，与后端 `common/html_cleaner.py` 的白名单消毒形成双层防护：

| # | 严重度 | 问题 | 修复位置 |
|---|--------|------|----------|
| F-20 | HIGH | 详情页 `dangerouslySetInnerHTML` 仅做格式清洗未白名单消毒，存在存储型 XSS 入口 | `frontend/lib/html-cleaner.ts` 在格式清洗后新增 `sanitize-html` 白名单消毒层（拦截 `script`/`iframe`/`on*`/`javascript:`，外链自动补 `rel="noopener noreferrer"`）；新增 `sanitize-html` 依赖 |
| F-21 | MEDIUM | 官网缺少 Cookie 同意机制，开启 GA 即构成 GDPR/ePrivacy 违规 | 新增 `frontend/components/CookieConsent.tsx`（底部横向条幅，左文案右按钮）+ `CookieSettingsTrigger.tsx`（页脚重开）；分类 Strictly necessary（始终开）/ Analytics（opt-in）；Google Analytics 改为**仅当用户接受「分析」类且配置 `NEXT_PUBLIC_GA_ID` 时才注入**，实现「同意后才加载」合规门控；偏好存 `localStorage` 键 `sd-cookie-consent`（含版本号）。后台 `admin-next` 仅用严格必要 `access_token` HttpOnly Cookie，不展示此横幅 |

> 说明：run-2 的 F-19 修复的是「CSS 注入顺序」（`style` 剥离先于 `width` 剥离，提交 `3109b9c`）；本次 F-20 是新增白名单消毒层，二者互补，覆盖不同攻击向量（CSS 注入 vs. 脚本/事件注入）。

## 部署提醒

1. **JWT_SECRET**：生产必须通过环境变量注入 ≥32 字节随机值（启动守卫已拒绝占位符）。
2. **ADMIN_PASSWORD**：首次部署建议显式设置，避免生成随机临时密码（日志可见）。
3. **CORS / 受信代理**：按实际域名在 `.env` 配置 `CORS_ORIGINS`、`TRUSTED_PROXIES`。（`MIGRATION_ALLOWED_HOSTS` 等迁移主机白名单配置随 M6 模块移除已失效，可忽略。）
4. **admin-next 已重新启动**使 `middleware.ts` 与 cookie 守卫生效（含 matcher 排除 /api 和 /uploads 的修正）。

---

## 补充加固（2026-07-28，认证 Cookie 双重通道 + 数据迁移）

### 1. 登录下发 HttpOnly Cookie（XSS 纵深防御，F-08 相关）

此前令牌仅存 `localStorage` 并随接口以 `Bearer` 发送，JS 可读，一旦遭遇 XSS 即被窃取。
本轮在 `/api/v1/admin/login` 同时下发 `access_token` / `refresh_token` 两个 **HttpOnly; SameSite=lax** Cookie：

- 浏览器自动随同域请求携带、JS 不可读，降低 XSS 窃取令牌风险（前端仍以 `localStorage` 的 Bearer 为主，Cookie 为纵深防御）。
- `Secure` 标志**按请求协议判定**：`request.url.scheme == "https"` 或反向代理下发的 `X-Forwarded-Proto: https` 才置 `Secure`。`http://localhost` 开发环境下不置 `Secure`，否则浏览器拒绝存储该 Cookie → 守卫读不到 → 登录后无法进入后台。
- `/api/v1/admin/logout` 由后端下发过期 Cookie 清除二者（`HttpOnly` 无法用 `document.cookie` 清除）。
- 后端 `common/deps.py::get_current_user` 同时接受 `Bearer` 与 `access_token` Cookie 两种凭证，二者等价。

> 命名区分：前端 `localStorage` 键名为 `admin_token`（接口 Bearer 用）；后端下发的守卫 Cookie 名为 `access_token`（HttpOnly）。二者承载同一 JWT，勿混淆。

### 2. 数据迁移 `4_20260728150403_update`（aerich）

- `t_product_category.sort_order` / `t_news_category.sort_order` 由 `INT` 改为 `DOUBLE PRECISION`，支持小数排序（与 ORM 模型 `FloatField` 对齐）。
- `t_news.status` 默认约束由 `PUBLISHED` 改为 `DRAFT`（草稿态新闻不再因回查过滤而 500）。
- 清理 WordPress 迁移残留表 `t_migration_record` / `t_migration_batch`（M6 模块已于 2026-07-27 移除）。
- 新增 `t_setting` 键值配置表（`IF NOT EXISTS` 幂等）。

### 3. 管理后台（admin-next）两处会致全站 500 的回归修复

- `src/context/ToastContext.tsx`：`ToastProvider` 在 `addToast` 这个 `const` 声明**之前**于 `useEffect` 依赖数组中引用它 → TDZ 报错，整页 500；已将 effect 移到声明之后。
- `src/app/(admin)/categories/page.tsx`：`import Modal from "@/components/ui/modal"`（默认导入），而该模块为**具名导出** `Modal` → 整页 500；已改为 `import { Modal }`。
