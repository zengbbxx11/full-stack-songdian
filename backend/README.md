# 松典科技 B2B 官网重构 · 后端（FastAPI + Tortoise ORM）

产品展示（M1）、新闻动态（M2）、联合搜索（M3）、全站询盘（M4）、内容管理/RBAC（M5）
五大模块。私有化单租户部署。（数据迁移 M6 已移除：WP→PG 主迁移已完成，该 ETL 工具为一次性，日常业务不依赖）

---

## 0. 技术栈与运行环境（重要）

> ⚠️ 本文档以**真实 `pyproject.toml`** 为准。早期文档声称的版本「偏差」（Python 3.11–3.13、
> FastAPI 0.115、Tortoise 0.21、aerich 0.7）已**不再成立**——上述冻结版本现在均已可安装，
> 代码即按冻结版本落地，无需降级。

| 组件 | 版本要求 | 说明 |
| --- | --- | --- |
| Python | **>= 3.14** | `pyproject.toml` 硬性约束；推荐用 uv 按 `uv.lock` 创建环境 |
| FastAPI | >= 0.139.2 | 设计冻结版本，已真实可用 |
| Tortoise ORM | >= 1.1.7 | 设计冻结版本，已真实可用 |
| aerich | >= 0.9.3 | 迁移工具 |
| PostgreSQL | 16+（本机 envkit 18.4，可选 zhparser 中文分词） | 开发/生产统一使用；本机启动见根 README.md "本机 PostgreSQL 启动" |
| Redis | 8（可选） | 未配置自动降级内存字典 |

其余设计要素（核心业务表（M6 迁移表已随模块移除）、错误码、幂等、限流、缓存 Key、RBAC、审计、降级 BD-01~04）
**100% 沿用冻结设计，不偏离**。

---

## 1. 目录结构（节选）

```
backend/
├── pyproject.toml / aerich.ini / .env.example
├── main.py                      # 应用入口：聚合 router + 中间件 + 异常 + lifespan
├── common/                      # 公共内核（config/result/enums/exceptions/jwt/...）
│   ├── mixins.py                # TimestampedMixin/SoftDeleteMixin/AuditByMixin
│   ├── redis_client.py          # Redis 封装（无 Redis → 内存降级）
│   └── search_vector.py         # TSVectorField + update_search_vector + is_sqlite
├── product/ news/ search/ inquiry/ content/   # 五大模块（数据迁移 M6 已移除）
├── seed/seed_data.py            # 6 产品分类 + 2 新闻分类 + admin 账号（幂等）
└── tests/                       # conftest 基座 + smoke + QA 用例
```

---

## 2. 本地运行

### 2.1 依赖安装（务必 Python 3.14）

推荐直接按 `pyproject.toml` 安装（**不要手动 pin 低版本**，否则会与依赖声明冲突）：

```bash
# 方式一：uv（推荐）
cd backend
uv sync

# 方式二：pip（需 Python 3.14）
python -m venv .venv
.venv\Scripts\activate        # Windows：激活虚拟环境
pip install -e .
```

> 旧版 README 里的 `pip install "fastapi>=0.115,<0.116" ...` 手动 pin 写法**已废弃**，
> 会导致依赖与 `pyproject.toml` 不一致，请勿照用。

### 2.2 本地（SQLite + 内存 Redis 降级）

```bash
cd backend
cp .env.example .env
#   - DATABASE_URL=sqlite://./dev.db   （默认即用 SQLite，无需 PostgreSQL）
#   - REDIS_URL 留空                  （自动降级进程内内存字典）
#   - JWT_SECRET 建议显式设置：       openssl rand -base64 48

# 启动（SEED_ON_START=true 时仅幂等写入角色、权限和管理员）
uvicorn main:app --host 0.0.0.0 --port 8000
```

- SQLite 下应用启动时会通过 `generate_schemas()` **自动建全部表/列**
  （含 `Product.tags`、`t_upload_record`、`search_vector`），**无需跑 aerich 迁移**。
- 搜索引擎在 SQLite 下走 **LIKE 降级（BD-01）**，标注「基础检索」。
- Redis 未配置时自动降级为**进程内内存字典**，缓存/限流/幂等/权限均不报错。
- SMTP 未配置时询盘仅持久化，`smtp_status` 保持 PENDING（BD-02/MOCK）。

---

## 3. 数据库迁移（aerich，生产 PostgreSQL）

> ### ⚠️ 已知迁移漂移（已修复）
> 2026-07-21 审计发现 `Product.tags`（JSONField）、`UploadRecord` 表、`search_vector` 的 GIN 索引缺少迁移。
> 已于 `migrations/models/3_20260721141024_add_tags_upload_and_search_gin.py` 补齐，
> 合并为一个标准 aerich 迁移。在干净 PostgreSQL 上 `aerich upgrade` 即可完整建表。
>
> **GIN 索引启动自愈（2026-07-28）**：`search_vector` 是 TSVECTOR 列，GIN 索引只能以原生 SQL
> 创建（写在迁移 #3 的 `upgrade()` 里）。但本项目启动依赖 Tortoise 自动建表、**不自动执行 aerich 迁移**，
> 全新库会漏建该索引，导致搜索退化为全表顺序扫描。因此在 `common/config.py` 的 `init_db()` 中
> 调用 `common/search_vector.py:ensure_search_indexes()`，以 `CREATE INDEX IF NOT EXISTS` **幂等兜底**——
> 无论是否跑过 aerich，索引都一定存在（SQLite 无该列则跳过）。

**PG 部署步骤**：

```bash
cd backend

# 1) 执行全部迁移（含 init + cover_image + tags/upload/gin）
aerich upgrade

# 2) 种子数据（SEED_ON_START=true 启动时已自动跑，也可手动）
python -m seed.seed_data
```

---

## 3.1 运行时性能优化（2026-07-28）

- **响应压缩**：`main.py` 注册 `GZipMiddleware`（`minimum_size=500`）作为最外层中间件，
  对所有 API JSON 响应做 gzip 压缩（默认仅压缩 >500 字节、且跳过图片等已压缩类型）。
  客户端带 `Accept-Encoding: gzip` 时返回 `Content-Encoding: gzip` + `Vary: Accept-Encoding`。
- **全文检索索引自愈**：见上方 §3「GIN 索引启动自愈」。搜索命中 GIN 索引，
  数据量增大后由 PostgreSQL 规划器自动从顺序扫描切到 `Bitmap Index Scan`，无需手动干预。

> 图片优化边界：当前 `/uploads/*` 由后端 `StaticFiles` 直出原图（无 CDN / 无 `Cache-Control`
> / 无预裁剪），属下一阶段优化项，不影响上述两项已落地收益。

---

## 4. 自验证

```bash
# a. 导入自检
python -c "import main; print('import main OK')"

# b. 静态编译 / lint
python -m py_compile $(find . -name "*.py" -not -path "./.venv/*")
ruff check .

# c. 全链路冒烟（建表/种子/登录/产品/新闻/搜索降级/询盘幂等/后台读取）
python tests/smoke.py

# d. 测试基座（全量）
pytest tests/ -q
```

初始管理员用户名为 `admin`（角色 `admin`，绑定全部权限码）。
> 初始口令取环境变量 `ADMIN_PASSWORD`；若未设置，种子器会生成一次性随机密码并记录到日志，不存在硬编码默认口令。

---

## 5. 接口清单（前缀 /api/v1）

| 模块 | 方法 | 路径 |
| --- | --- | --- |
| M1 产品 | GET | /products、/products/{slug}、/product-categories |
| M1 产品 | POST/PUT/DELETE | /admin/products、/admin/products/{id}、/admin/products/{id}/gallery、/admin/products/{id}/attributes |
| M1 产品 | GET | /admin/categories（分类列表含产品计数） |
| M2 新闻 | GET | /news、/news/{slug}、/news-categories |
| M2 新闻 | POST/PUT/DELETE | /admin/news、/admin/news/{id} |
| M3 搜索 | GET | /search?q=&type=&page=&page_size= |
| M4 询盘 | POST | /inquiries |
| M4 询盘 | GET/PUT/POST/DELETE | /admin/inquiries、/admin/inquiries/{id}、状态、分配、跟进记录 |
| M5 内容 | POST | /admin/login、/admin/logout、/admin/refresh（令牌族轮换） |
| M5 内容 | GET/PUT | /admin/profile（查看/修改当前用户信息） |
| M5 内容 | GET/POST/PUT | /admin/roles、/admin/roles/{id}/permissions、/admin/audit-logs |
| M5 内容 | GET/POST/PUT/DELETE | /admin/users、/admin/users/list、/admin/stats |
| 设置 | GET/PUT/POST | /public/settings、/admin/settings、/admin/settings/smtp/test |
| 上传/媒体库 | GET/POST/PUT/DELETE | /admin/upload、/admin/upload/batch、/admin/upload/records、/admin/albums |
| 系统 | GET | /healthz、/readyz |

---

## 6. 关键设计决策

- **统一返回** `Result{code,msg,msgI18n,data,traceId,timestamp}`，成功 `code="0"`；错误码
  A/B/C 三系（见 `common/exceptions.py`）。
- **RBAC**：`t_role_permission(role_id, permission_code)` 关联表 + `content/permissions.py`
  权限码常量，**无独立权限实体表**。
- **TSVector**：自定义 `TSVectorField`；PG 下写时 `to_tsvector('zh', …)`，SQLite 下降级。
- **Redis 优雅降级**：连接失败/未配置 → 内存字典，绝不阻断启动。
- **SMTP 降级**：未配置仅持久化（BD-02）。
- **单 Tortoise app 标签 `models`**；跨模块外键 `models.Role` 形式。
- **JWT 安全（H2/H5 修复后）**：HS256，access(2h)/refresh(7d)，jti 黑名单 + 令牌族（`fid`）吊销；
  `logout` 吊销整族、`refresh` 轮换并吊销旧族（含重用检测）。
  **生产必须显式设置 `JWT_SECRET`**——生产环境未设置或仍为占位值时后端拒绝启动；
  仅开发环境会生成临时随机密钥并告警。
- **审计归因（H3 修复后）**：`@audit(action, resource)` 自动记录操作人（解析 `_user` 依赖）
  与资源（`resource.format(**kwargs)`），正确写入审计日志。

---

## 7. 环境变量（.env.example）

```
DATABASE_URL=postgres://songdian:songdian@localhost:5432/songdian_b2b   # 生产改为 1Panel PG 实际地址；或 sqlite://./dev.db
REDIS_URL=redis://localhost:6379/0                                        # 留空=内存降级
JWT_SECRET=<≥32字节随机值，如 openssl rand -base64 48>            # 生产必设
JWT_ALG=HS256
ACCESS_TOKEN_TTL=7200
REFRESH_TOKEN_TTL=604800
ADMIN_PASSWORD=<强随机初始管理员口令>                              # 留空则生成一次性随机口令
SEED_ON_START=true
HOST=0.0.0.0
PORT=8000
# SMTP_* 不填则询盘只入库不真发邮件
```

---

## 8. 运行与部署（uv + 1Panel）

**本地（Win10 / macOS / Linux，uv 虚拟环境）**

```bash
cd backend
uv sync                                   # 按 uv.lock 安装依赖（含 dev）
cp .env.example .env                      # 按需改 DATABASE_URL / JWT_SECRET
uv run uvicorn main:app --host 0.0.0.0 --port 8000
# 迁移（PG 下必须，见 §3）/ 种子
uv run aerich upgrade
uv run python -m seed.seed_data
# 探活: http://localhost:8000/healthz  /  /readyz
```

> 未配置 Redis 时自动降级内存字典；未配置 SMTP 时询盘只入库不真发邮件；
> 未装 zhparser 的 PG 下全文检索自动降级 `simple` 配置，**功能正常**。

**生产（腾讯云轻量服务器 + Docker Compose + 1Panel OpenResty）**

生产域名为 `www.zsaki.icu`（官网）、`api.zsaki.icu`（API）和 `admin.zsaki.icu`（后台），根域
`zsaki.icu` 重定向至 `www`。PostgreSQL、Redis、backend、frontend、admin-next 均由根目录
`docker-compose.yml` 编排；仅 1Panel OpenResty 位于 Compose 外负责公网反代。
完整步骤以根目录 [`deploy-guide.md`](../deploy-guide.md) 为准。

> **生产必须显式设置 `JWT_SECRET`**（≥32 字节随机值），未设置或仍为占位值时应用会拒绝启动。

## 9. 代码审查修复记录

2026-07-28 一轮代码审查发现的 13 项问题已全部修复，详见
[`CODE_REVIEW_REMEDIATION.md`](./CODE_REVIEW_REMEDIATION.md)。要点：

- 改密码接口误用 `user.password` → 已改为 `user.password_hash`；
- 草稿态产品/新闻回查不再因 `status=PUBLISHED` 过滤而 500；
- `BizException` 关键字 `message=` 误用 → 统一 `msg=`；
- `X-Forwarded-For` 仅受信代理的直连 IP 才被采纳；
- 新增 `.env.example` 模板（脱敏）；
- HTML 清洗通配符移除 `style`（防 CSS 注入）；
- 内存限流/缓存降级增加过期键回收，避免内存泄漏；
- 审计日志 `order_by` 增加字段白名单；
- 搜索分页（LIMIT/OFFSET + COUNT）下沉到数据库。

2026-08 安全审计加固（认证 + 迁移 + 后台回归）：登录和刷新仅通过 HttpOnly
`access_token`/`refresh_token` Cookie 签发或轮换（响应体不返回令牌；生产环境 `Secure`，`SameSite=Lax`，
以 `APP_ENV=production` 决定）；`t_*_category.sort_order` 改为 double precision、`t_news.status` 默认 `DRAFT`、清理
WP 迁移残留表（迁移 `4_20260728150403_update`）；修复 admin-next 两处致全站 500 的回归
（`ToastContext` TDZ、`categories` 页 Modal 具名导入）。详见
[`SECURITY-REMEDIATION.md`](../SECURITY-REMEDIATION.md)「补充加固（2026-07-28）」一节。
## 当前实现补充（2026-08-13）

当前运行方式以仓库根目录 [`CURRENT_IMPLEMENTATION.md`](../CURRENT_IMPLEMENTATION.md) 和 [`deploy-guide.md`](../deploy-guide.md) 为准：

- 生产使用 PostgreSQL 18 线和 Redis 8.8.1；生产 Redis 必须真实可用（`REDIS_REQUIRED=true`），本地 SQLite/开发环境才允许进程内内存降级。
- 产品、新闻、分类的列表与详情缓存会在写入后失效，slug 变更会清理旧 slug；`/readyz` 会区分真实 Redis 与降级缓存。
- `inquiry` 已支持 `country`、`region`、`landing_page`、`source_product`、`referrer` 和 `utm_*` 归因字段；后台可按来源产品、国家和 UTM 查询。
- `content` 中的 `NotificationReadState` 支持后台新询盘、超时未跟进、SMTP 失败通知的用户级已读状态。
- 迁移由部署阶段独立执行，应用容器启动命令不再隐式执行 Aerich；当前新增字段/表见 `backend/migrations/models/11_20260813090000_add_inquiry_attribution.py`。

### 与旧版段落的更正

- “Redis 可选、未配置即视为正常”的旧说明仅适用于本地开发；生产必须配置真实 Redis，并由 `REDIS_REQUIRED=true` 阻止误部署。
- SQLite + 内存 Redis 章节是本地测试路径，不是生产架构；生产数据库为 PostgreSQL 18。
