# Songdian B2B — 后端 API（FastAPI）

> AGENTS.md — 新会话快速上手指南。聚焦「启动命令 + 模块结构 + 雷区踩坑 + 常用修改路径」。

---

## 项目定位

松典科技 B2B 官网的**后端 API**，服务 `../frontend/`（:3000 官网）与 `../admin-next/`（:3001 管理后台）。
FastAPI + Tortoise ORM + PostgreSQL + Redis，单租户，JWT 鉴权 + RBAC。

---

## 本地启动

```bash
# 必须用项目 venv 的 python（含所有依赖）
cd backend
.venv/Scripts/python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

> ⚠️ **PostgreSQL 经 envkit 安装，不随系统自启**。机器重启/会话结束后后端所有接口会报 `B999001 系统内部错误`（ConnectionRefusedError）。先确认再拉起：
> ```bash
> # 用 Windows 路径（pg_ctl 不认 /c/ 形式）
> "C:/ProgramData/envkit/services/postgres/18.4/bin/pg_ctl.exe" -D "C:/ProgramData/envkit/services/postgres/18.4/data" start
> ```

- 文档页：`/docs`（仅非 production 环境开启，由 `OPENAPI_DOCS_ENABLED` / `APP_ENV` 控制）
- 存活/就绪探针：`/healthz`、`/readyz`
- 本地数据库可使用 `songdianB2B`；生产数据库由 Compose 的 `PG_*` 环境变量创建。`.env` 设 `SEED_ON_START=true` 时仅幂等创建 admin、角色和权限；`SEED_CONTENT_CATEGORIES=true` 才会额外写入演示分类，生产始终保持 `false`。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | FastAPI（`fastapi[standard]` ≥ 0.139.2）+ Uvicorn |
| ORM | Tortoise ORM 1.1.x（`[asyncpg]`）+ aerich 迁移 |
| 数据库 | PostgreSQL（asyncpg 驱动） |
| 缓存 | Redis 8（**未连自动降级为进程内内存字典，不阻断启动**） |
| 鉴权 | PyJWT（access 2h / refresh 7d）+ jti 黑名单 + bcrypt 密码 |
| 配置 | pydantic-settings（`.env`） |
| 消毒 | bleach（`common/html_cleaner.py`，与前端 sanitize-html 形成双层防护） |
| Python | ≥ 3.14（注意：Windows 下需 `tzdata` 提供时区数据） |

---

## 目录结构

业务模块按文件夹划分，每个模块统一含 `models.py` / `routers.py` / `services.py`：

```
backend/
├── main.py              # 应用入口：lifespan 初始化、路由注册、静态挂载、异常处理
├── common/              # 配置/异常/Redis/日志/中间件/HTML 消毒/设置路由
├── product/             # 产品 + 分类 + 相册 + 规格属性（含 SEO 字段 seo_title/seo_description）
├── news/                # 新闻 + 分类
├── content/             # 管理员用户 + 角色 + RBAC 权限 + 审计日志
├── inquiry/             # 询盘 CRM（五态管线 NEW→CONTACTING→QUOTED→DEAL/LOST + 分配/跟进/标签）
├── search/              # 联合搜索（PG TSVector / 降级）
├── uploads/             # 上传管理（扩展名白名单 + mimetypes + magic bytes 三重校验）
├── seed/                # 幂等种子数据
├── scripts/             # ../scripts/backup.sh — 生产自动备份脚本
└── tests/               # pytest 测试
```

---

## 路由总览（均前缀 `/api/v1`）

| 路由 | 鉴权 | 说明 |
|------|------|------|
| `/products` `/product-categories` | 公开 | 产品列表/分类（分页、筛选、搜索） |
| `/products/{slug}` | 公开 | 产品详情 |
| `/news` `/news-categories` | 公开 | 新闻列表/分类 |
| `/news/{slug}` | 公开 | 新闻详情 |
| `/search` | 公开 | 联合全文搜索 |
| `/inquiries` | 公开(POST) | 提交询盘（幂等 biz_req_no + IP 限流） |
| `/admin/inquiries/{id}/assign` | JWT+RBAC | 分配/取消分配销售人员（2026-07 CRM 新增） |
| `/admin/inquiries/{id}/follow-note` | JWT+RBAC | 追加跟进记录（2026-07 CRM 新增） |
| `/admin/login` `/admin/refresh` | — | 登录/刷新令牌（**注意：路径无 `/auth` 段**） |
| `/admin/products` `/admin/news` `/admin/categories` `/admin/users` `/admin/users/list` `/admin/roles` `/admin/inquiries` `/admin/upload` `/admin/settings` `/admin/stats` `/admin/audit-logs` | JWT+RBAC | 后台 CRUD 与管理 |

---

## ⚠️ 雷区 / 关键约定

1. **PG 不随系统自启** → 接口全报 `B999001`，先拉 PG（见上）。
2. **原生 SQL 用 `$1` 占位符**（asyncpg），不是 psycopg2 的 `%s`，否则报语法错。
3. **Tortoise 1.1.x + 测试**：lifespan 跑在后台任务、请求在另一任务，需 `Tortoise.init(_enable_global_fallback=True)` 才能在请求里取到 context（官方 `RegisterTortoise` 默认开）。
4. **`tzdata` 必需**：Windows / Python 3.14 无系统 tz 数据，写带时区字段会因 `ZoneInfo('UTC')` 失败（种子被吞 → admin 建不出）。
5. **富文本消毒**：所有入库 HTML 经 `common/html_cleaner.py`（bleach 白名单），与前端 `html-cleaner.ts`（sanitize-html）双层防护，堵存储型 XSS。
6. **全局异常** → 统一转 `{"code":"B999001","msg":"系统内部错误"}` 信封，前端按 code 处理。
7. **Redis 可选**：没它后端降级内存，功能可用但限流/缓存失效。

---

## 常用修改路径

| 需求 | 操作 |
|------|------|
| 改产品/新闻/询盘逻辑 | 对应模块 `services.py` / `routers.py` |
| 改数据模型 | 模块 `models.py`（Tortoise 字段）→ aerich 生成迁移 |
| 改 JWT/权限 | `common/` 鉴权相关 + `content/` RBAC |
| 改全局配置 | `.env` + `common/config.py` |
| 加新业务模块 | 新建模块文件夹（models/routers/services）→ 在 `main.py` `include_router` |
| 写测试 | `tests/`（pytest，注意 `_enable_global_fallback`） |

---

## 代码审查修复（2026-07-28）

13 项审查问题已修复，详见 `CODE_REVIEW_REMEDIATION.md`。涉及后端的要点：
- `content/services.py` 改密用 `user.password_hash`；
- `product`/`news` services 新增 `_admin` 详情变体，草稿回查不再被 `PUBLISHED` 过滤；
- `BizException` 统一用 `msg=` 关键字；
- `common/middleware.py` 的 `get_client_ip` 仅受信代理才采纳 XFF；
- `common/html_cleaner.py` 通配符去除 `style`；
- `common/ratelimit.py` / `common/redis_client.py` 增加过期键回收；
- `asyncio.get_event_loop()` → `get_running_loop()`；
- `content/list_audit_logs` 的 `order_by` 加白名单；
- `search/services.py` 分页下沉到 DB。

## 审计修复（2026-07-31）

P0 级审计修复（详见 `../audit_verification_report.md`）：
- **P0.1 上传安全**：`uploads/services.py` 新增 mimetypes + magic bytes 双重校验，防扩展名伪造攻击。
- **P0.3 产品 SEO**：`product/models.py` 新增 `seo_title`(VARCHAR 120) / `seo_description`(VARCHAR 300)，运营可为重点产品手动精修 SEO 元数据。前端优先读取这两个字段，空则回退原有的 title/content_html 截取。
- **P0.4 询盘 CRM**：`inquiry/` 模块全面升级——状态三态→五态管线（NEW→CONTACTING→QUOTED→DEAL/LOST）；新增 `assigned_user`(FK→AdminUser)、`follow_notes`(JSONB 时间线)、`last_contact_time`、`tags`(JSONB)；新增 `PUT .../assign` + `POST .../follow-note` 端点。迁移含历史数据自动兼容（REPLIED→CONTACTING, ARCHIVED→LOST）。
- **P0.7 后台 SEO 管理**：`product-form` 新增 SEO 元数据面板（seo_title / seo_description + 字数计数器），产品列表页新增 SEO 列 + 快速编辑弹窗。
- **产品列表缓存**：`product/services.py` 产品列表（5min TTL）+ 产品分类（30min TTL）Cache-Aside Redis 缓存。`news/services.py` 新闻列表同模式。
- **Dashboard 统计**：`content/services.py` 新增 `get_dashboard_stats()`，返回产品/新闻/分类计数 + 询盘国家分布 + 询盘状态分布。路由 `GET /admin/stats`。
- **用户管理**：`content/services.py` 新增 `list_users` / `create_user`（统一 admin 角色）/ `delete_user`（admin 账号受保护）/ `reset_password`。路由 `GET/POST/DELETE /admin/users` + `PUT .../reset-password`。
- **审计日志**：`content/routers.py` 已有 `GET /admin/audit-logs`（分页+搜索）。
- **admin 产品端点**：`product/routers.py` 新增 `GET /admin/products`（不过滤状态，含草稿）。
- **后台系统设置**：询盘邮件配置从 `.env` 迁移到 `t_setting` 表——`inquiry/smtp_mailer.py` 的 `load_smtp_config()` 库优先（**非空才覆盖**环境变量兜底）；`common/settings_router.py` 对 `smtp_password` 脱敏（GET 返回 `******`、PUT 回传掩码保留原值）+ 新增 `POST /admin/settings/smtp/test` 测试端点。⚠️ **惰性创建**：`ensure_admin_settings()` 在 `GET /admin/settings` 时 `get_or_create` 邮件、GA 与站点验证配置项，**不依赖 `SEED_ON_START`**，也不会覆盖已有配置。
- **迁移**：迁移 8/9 保留历史兼容；迁移 10 统一 `assigned_user_id` 为 BIGINT，并收敛为单一 `fk_t_inquiry_assigned_user` 外键。生产由 backend `command` 的 `aerich upgrade` 自动执行。
- ⚠️ **生产初始化**：生产只运行迁移和最小种子（角色、权限、首个管理员）。`db/seed_data.sql`、完整 SQL 和 CSV 是本地开发快照，含业务数据与密码哈希，禁止导入生产。
