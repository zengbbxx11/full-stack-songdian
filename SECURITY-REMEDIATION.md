# 安全审计发现修复总览（18/18）

> 对象：`full-stack-project`（backend FastAPI / frontend Next.js 16 / admin-next Next.js）
> 对应审计：`security-audit-skill` run-1（18  findings：1 CRITICAL / 5 HIGH / 7 MEDIUM / 5 LOW）
> 状态：全部代码层修复完成，后端已重启生效（:8000），`TestClient` 冒烟通过。

## 修复清单（F 编号对应审计报告）

| # | 严重度 | 问题 | 修复位置 |
|---|--------|------|----------|
| F-01 | CRITICAL | 标题 `</script>` 注入 JSON-LD 致全站存储型 XSS | 后端 `common/html_cleaner.py` 新增 `clean_text`；`product/news/services.py` 写入清洗标题/摘要/作者；前端 `lib/seo.ts` 新增 `safeJsonLd`（`<`→`\u003c`），替换 3 处 `JSON.stringify` 注入 |
| F-02 | HIGH | 匿名可传 `?status=DRAFT` 读未发布内容 | `product/routers.py`、`news/routers.py` 公开列表强制 `status="PUBLISHED"`；detail 服务层强制 `status=PUBLISHED` |
| F-03 | HIGH | 迁移 ETL SSRF + 任意图片下载 | 新增 `common/ssrf.py`（仅 http/https + 受信主机白名单）；`config.py` 加 `migration_wp_host`/`migration_allowed_hosts`；`migration/schemas.py` 校验源站；`migration/image_sync.py` 仅限白名单主机、拒 svg/html（魔数 `_is_real_image` 校验）、10MB 上限。**（M6 模块已于 2026-07-27 移除，`migration/*` 相关代码已删；`common/ssrf.py` 通用 SSRF 防护基础设施保留）** |
| F-04 | HIGH | 硬编码/可空默认管理员密码 | `seed/seed_data.py` 不再默认弱密码；`ADMIN_PASSWORD` 为空则生成一次性随机密码并记录日志；空密码历史账号自动补设；`docker-compose.yml` 强 PG 密码经 `${POSTGRES_PASSWORD}` 注入 |
| F-05 | HIGH | RBAC 权限缓存未签名 | `common/deps.py` 权限缓存 `auth:perm:{uid}` 加 HMAC（密钥 `jwt_secret`），读时验签，失败回查 DB |
| F-06 | HIGH | `X-Forwarded-For` 首个段被信任 | `common/middleware.py` `get_client_ip` 仅当直连 IP 在 `trusted_proxies` 才采纳 XFF，否则用真实直连 IP |
| F-07 | HIGH | Redis 异常时 fail-open | `common/jwt.py` `is_revoked`/`is_family_revoked` 与 `content/services.py` 登录锁，Redis 异常按 `security_fail_closed`（默认 True）fail-closed |
| F-08 | HIGH | admin 无前端路由守卫 | 新增 `admin-next/src/middleware.ts`（校验 `admin_token` cookie，未登录跳 /signin）；`SignInForm` 登录写可读 cookie；`UserDropdown` 退出清除 cookie+localStorage。**后续修正**：matcher 正则排除 `/api` 和 `/uploads`，否则登录 POST 也被守卫拦截重定向到 /signin（浏览器端无法登录） |
| F-09 | MEDIUM | CORS 通配 + 凭据 | `main.py` 改显式 `cors_origin_list` + `allow_credentials=False` |
| F-10 | MEDIUM | 上传无配额 | `uploads/services.py` 加 `check_upload_limits`（数量/总大小），`uploads/routers.py` 单/批上传调用 |
| F-11 | MEDIUM | 发布无权限门禁 | `content/permissions.py` 加 `product:publish`/`news:publish`（admin 有、operator 无）；`deps.py` 加 `optional_permission`；routers 注入 `can_publish`；services 无发布权时 PUBLISHED 降级 DRAFT |
| F-12 | MEDIUM | docker 弱密码/暴露 DB 端口 | `docker-compose.yml` 强 PG 密码经 `${POSTGRES_PASSWORD}` 注入、移除 pg/redis 宿主机端口映射、backend 设 `APP_ENV=development` |
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
| F-21 | MEDIUM | 官网缺少 Cookie 同意机制，开启 GA 即构成 GDPR/ePrivacy 违规 | 新增 `frontend/components/CookieConsent.tsx`（底部横向条幅，左文案右按钮）+ `CookieSettingsTrigger.tsx`（页脚重开）；分类 Strictly necessary（始终开）/ Analytics（opt-in）；Google Analytics 改为**仅当用户接受「分析」类且配置 `NEXT_PUBLIC_GA_ID` 时才注入**，实现「同意后才加载」合规门控；偏好存 `localStorage` 键 `sd-cookie-consent`（含版本号）。后台 `admin-next` 仅用严格必要 `admin_token` Cookie，不展示此横幅 |

> 说明：run-2 的 F-19 修复的是「CSS 注入顺序」（`style` 剥离先于 `width` 剥离，提交 `3109b9c`）；本次 F-20 是新增白名单消毒层，二者互补，覆盖不同攻击向量（CSS 注入 vs. 脚本/事件注入）。

## 部署提醒

1. **JWT_SECRET**：生产必须通过环境变量注入 ≥32 字节随机值（启动守卫已拒绝占位符）。
2. **ADMIN_PASSWORD**：首次部署建议显式设置，避免生成随机临时密码（日志可见）。
3. **CORS / 受信代理**：按实际域名在 `.env` 配置 `CORS_ORIGINS`、`TRUSTED_PROXIES`。（`MIGRATION_ALLOWED_HOSTS` 等迁移主机白名单配置随 M6 模块移除已失效，可忽略。）
4. **admin-next 已重新启动**使 `middleware.ts` 与 cookie 守卫生效（含 matcher 排除 /api 和 /uploads 的修正）。
