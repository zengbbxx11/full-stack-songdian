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
- 数据库 `songdianB2B`，超级用户 `postgres/postgres`；`.env` 设 `SEED_ON_START=true` 启动写入种子（admin 账号、角色、分类，幂等）

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
├── product/             # 产品 + 分类 + 相册 + 规格属性
├── news/                # 新闻 + 分类
├── content/             # 管理员用户 + 角色 + RBAC 权限 + 审计日志
├── inquiry/             # 询盘表单 + SMTP 邮件
├── search/              # 联合搜索（PG TSVector / 降级）
├── uploads/             # 上传管理路由
├── seed/                # 幂等种子数据
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
| `/inquiries` | 公开(POST) | 提交询盘 |
| `/admin/login` `/admin/refresh` | — | 登录/刷新令牌（**注意：路径无 `/auth` 段**） |
| `/admin/products` `/admin/news` `/admin/categories` `/admin/users` `/admin/roles` `/admin/inquiries` `/admin/upload` `/admin/settings` | JWT+RBAC | 后台 CRUD 与管理 |

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
