# 代码审查修复记录（2026-07-28）

> **历史修复记录。** 本文描述当时的缺陷与修复，不代表当前部署架构、内容工作流或认证流程；当前状态请使用根目录 [`CURRENT_IMPLEMENTATION.md`](../CURRENT_IMPLEMENTATION.md)，生产部署请使用 [`deploy-guide.md`](../deploy-guide.md)。

针对一轮代码审查的 13 项问题，逐项修复。按优先级分组：P0 致命逻辑错误、P1 安全/规范、P2 内存/兼容、P3 技术债。

| # | 优先级 | 问题 | 文件 | 修复 |
|---|--------|------|------|------|
| 1 | P0 | `update_profile` 误用 `user.password`（字段实为 `password_hash`）→ `AttributeException` / 改密静默失败 | `backend/content/services.py` | 改为 `user.password_hash` |
| 2 | P0 | 无发布权限建/改「草稿」产品/新闻后回查 `get_*_detail`（强制 `status=PUBLISHED`）→ 404 崩溃 | `backend/product/services.py`、`backend/news/services.py` | 新增 `get_product_detail_admin` / `get_news_detail_admin`（不过滤 status、不写公共缓存），4 处写操作后回查改用 |
| 3 | P0 | `BizException(message=...)` 关键字错误（应为 `msg=`）→ `TypeError` | `backend/product/services.py`（`delete_gallery`/`delete_attribute`） | `message=` → `msg=` |
| 4 | P0 | `get_client_ip` 信任反转：代理列表为空时反而信任 `X-Forwarded-For` | `backend/common/middleware.py` | 条件改为 `trusted_proxy_list and direct_ip in trusted_proxy_list` |
| 5 | P1 | `.env` 密钥无模板文档（未泄露，但缺规范） | `backend/.env.example`（新增） | 新增脱敏模板，列全量配置项 |
| 6 | P1 | HTML 清洗通配符放行 `style` → CSS 注入面 | `backend/common/html_cleaner.py` | 通配符仅保留 `class`，移除 `style` |
| 7 | P2 | 内存限流降级 `_memory_ips` 永不回收 IP 键 → 内存泄漏 | `backend/common/ratelimit.py` | 写时统一 `_memory_sweep_expired` 回收过期缓冲并剔除空键 |
| 8 | P2 | `MemoryBackend` 仅在访问时过期，未访问键常驻 | `backend/common/redis_client.py` | 新增 `_sweep_expired`，写路径（`set`/`setex`）统一回收 |
| 9 | P3 | 前端 `lib/types.ts` 残留 WordPress/WooCommerce 原始结构类型（死代码） | `frontend/lib/types.ts` | 移除 WP 核心全量类型与 `WCProductTag`/`WCProductAttribute`/`WCProduct`；保留仍被应用层类型引用的 `WCProductImage`/`WCProductCategory`/`WCAttribute` |
| 10 | P2 | `asyncio.get_event_loop()` 在协程内已废弃 | `backend/common/redis_client.py` | 全部改用 `asyncio.get_running_loop()` |
| 11 | P3 | `list_audit_logs` 直接把客户端 `order_by` 传入 Tortoise（默认 `sort_order`，`AuditLog` 无此字段）→ 500 | `backend/content/services.py` | 增加字段白名单，非法值回退 `-created_time` |
| 12 | P3 | 搜索全量拉取后在内存切片分页 | `backend/search/services.py` | 分页（LIMIT/OFFSET）与计数（COUNT）下沉到 DB；PG/SQLite 双路径改造 |
| 13 | P3 | 管理后台 `middleware.ts` 仅 base64 解码 token 校验 `exp`，伪造 cookie 可绕过 | `admin-next/src/middleware.ts`、`admin-next/package.json`（新增 `jose`）、`admin-next/env.example` | 用 `jose` 校验 HS256 签名（密钥须与后端 `JWT_SECRET` 一致）；未配置 `JWT_SECRET` 时降级并告警 |
| 14 | 清单外（验证发现） | `_next_category_sort_order` 调用 Tortoise 已移除的 `QuerySet.aggregate` → 创建分类接口每次 500 | `backend/product/services.py` | 改用 `tortoise.functions.Max` + `annotate().values()` 取全局最大 `sort_order`（逐行 `max` 兜底） |

## 验证方式

> 全部修复已在**完整启动的全栈环境**（backend:8000 / frontend:3000 / admin-next:3001，PG + Redis 均在线）下实测。

- **后端真实接口冒烟**（`_smoke.py`，已清理）：
  - #1 改密往返成功（无 500，登录态复原）；
  - #2 无发布权限建「草稿」产品 → 200 且 `status=DRAFT`（回查不 500）；
  - #3 删不存在相册 → 结构化业务错误 `A010001`（非 500，`msg=` 修复生效）；
  - #12 `GET /api/v1/search?q=测试` → `code=0` 且 `total`/`items` 由 DB 返回。
- **后端纯逻辑断言**（`_logic_check.py`，已清理）：#4 `get_client_ip` 信任反转（空 `trusted_proxies` 忽略 XFF）、#6 `style` 剥离、#7 限流内存回收、#8/#10 `MemoryBackend` 过期回收、#11 `order_by` 白名单。
- **前端类型检查**：`cd frontend && npx tsc --noEmit` 通过（EXIT 0，WP/WC 死类型移除后无悬空引用）。
- **管理后台**：`npm run dev` 起服成功，`tsc --noEmit` 通过（EXIT 0）；并**实时验证中间件**：配置与后端一致的 `JWT_SECRET` 后，合法 token 访问 `/` → 200，伪造/无 token → 307 重定向 `/signin`（jose 签名校验生效，无「JWT_SECRET 未配置」降级告警）。
- **#14 验证**：修复后创建分类接口返回 200（此前恒定 500）。

## 测试数据清理（2026-07-28）

验证过程中后端冒烟脚本写入的临时数据已清理，**不影响任何种子 / 真实业务数据**：

| 表 | 已删除 id | 内容 |
|----|-----------|------|
| `t_product_category` | 13、14 | `冒烟分类1785202601`、`冒烟分类1785202631` |
| `t_product` | 43、44 | 均 `冒烟DRAFT` / `DRAFT`，分别挂在分类 13、14 下 |

- 删除前确认 `t_product_gallery` / `t_product_attribute` 子表引用为 **0**；事务原子删除后复核残留 **0**。
- 临时验证脚本 `_smoke.py` / `_logic_check.py` 及临时日志（`_uvicorn.log` / `_nextdev.log` / `token.txt`）已删除，不进仓库。
- **`admin-next/.env.local` 保留**：含 `JWT_SECRET`（与 backend 一致，使 #13 jose 签名校验真正生效），属本地开发配置而非测试垃圾，且已 gitignore，不泄露进仓库。
