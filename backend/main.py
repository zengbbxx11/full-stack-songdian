"""应用入口 — FastAPI 启动文件
────────────────────────────────────────────────
这个文件是后端的"总开关"。你运行 `uvicorn main:app` 时，
就是从这里的 `app = FastAPI(...)` 开始启动整个服务。

启动流程（按顺序）：
  ① 连 Redis（连不上就降级到内存，不会崩）
  ② 连 PostgreSQL + 创建/更新数据库表
  ③ 如果 .env 里 SEED_ON_START=true → 自动写入种子数据（admin 账号等）
  ④ 注册所有 API 路由（产品/新闻/搜索/询盘/登录/上传...）
  ⑤ 挂载静态文件服务（/uploads/ 下的图片）
  ⑥ 监听 8000 端口，等待请求

关闭流程：
  ① 断开数据库连接
  ② 断开 Redis 连接
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from common.config import MEDIA_ROOT, close_db, init_db, settings
from common.exceptions import register_exception_handlers
from common.logger import get_logger
from common.middleware import ApiSecurityMiddleware, TraceMiddleware
from common.redis_client import close_redis, init_redis
from content.routers import router as content_router
from inquiry.routers import router as inquiry_router
from news.routers import router as news_router
from product.routers import router as product_router
from search.routers import router as search_router
from uploads.routers import router as upload_router
from content_revision.routers import router as preview_router
from common.settings_router import router as settings_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化服务，关闭时释放资源。"""

    # ── 启动阶段 ──
    # 1. Redis：先尝试连接。如果 Redis 没装或挂了，自动降级为"进程内内存字典"，
    #    缓存/限流/幂等全部用内存替代，绝不因此阻断启动。
    await init_redis()

    # 2. 数据库：连接 PostgreSQL，自动建表/加列（如果缺少）。
    #    用的是 Tortoise ORM，它会根据 models.py 中的定义自动同步表结构。
    await init_db()

    # 3. 种子数据：如果 .env 里设置了 SEED_ON_START=true，
    #    自动写入初始数据（管理员账号 admin、两个默认角色、产品/新闻分类）。
    #    每次启动都跑，但用了"幂等"逻辑——已存在的数据不会重复插入。
    if settings.seed_on_start:
        try:
            from seed.seed_data import run_seed
            await run_seed()
            logger.info("种子数据写入完成（幂等）")
        except Exception as exc:
            logger.warning("种子数据写入失败（忽略，可手动执行）：%s", exc)

    from content_revision.services import scheduled_publish_loop
    from news.services import publish_due_news
    from product.services import publish_due_products

    async def publish_due_content() -> None:
        await publish_due_products()
        await publish_due_news()

    scheduler_stop = asyncio.Event()
    scheduler_task = asyncio.create_task(
        scheduled_publish_loop(publish_due_content, scheduler_stop),
        name="scheduled-content-publisher",
    )

    # yield 之后是关闭阶段
    yield

    # ── 关闭阶段 ──
    scheduler_stop.set()
    await scheduler_task
    await close_db()
    await close_redis()


# 生产环境下自动隐藏 /docs API 文档页面（安全考虑）
# 非生产环境（开发/测试）默认开启，方便调试
docs_enabled = settings.openapi_docs_enabled or settings.app_env.strip().lower() != "production"

app = FastAPI(
    title="Songdian B2B Portal API",
    version="1.0.0",
    description="松典科技 B2B 官网重构后端（FastAPI + Tortoise ORM）",
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

# ── 中间件（请求 → 中间件处理 → 路由处理 → 返回）──

# GZipMiddleware：压缩 API JSON 响应（默认仅压缩 >500 字节、且非已压缩类型如图片）。
# 放在最外层，确保所有响应（含异常处理器返回的 JSON）都被压缩，省带宽。
app.add_middleware(GZipMiddleware, minimum_size=500)

# TraceMiddleware：给每个请求注入 traceId（用于日志追踪），
#   解析客户端真实 IP（而不是代理 IP），设置单租户标识
app.add_middleware(TraceMiddleware)
app.add_middleware(ApiSecurityMiddleware)

# CORS 跨域：只允许 .env 里配置的前端域名访问 API。
#   管理后台使用 HttpOnly Cookie，会话请求只允许明确的可信来源并携带凭据。
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # .env 里的 CORS_ORIGINS
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# 全局异常处理：把代码中任何未捕获的异常统一转成
#   {"code": "B999001", "msg": "系统内部错误", ...} 格式返回给前端
register_exception_handlers(app)

# ── 路由注册：七大业务模块 + 系统设置路由 ──
app.include_router(product_router)    # /api/v1/products（产品 CRUD + 分类）
app.include_router(news_router)       # /api/v1/news（新闻 CRUD + 分类）
app.include_router(search_router)     # /api/v1/search（全文搜索）
app.include_router(inquiry_router)    # /api/v1/inquiries（询盘表单）
app.include_router(content_router)    # /api/v1/admin/login（登录/角色/权限）
app.include_router(upload_router)     # /api/v1/admin/upload（图片上传）
app.include_router(settings_router)   # /api/v1/admin/settings（系统设置）
app.include_router(preview_router)    # /api/v1/preview/{token}（短期签名草稿预览）

# ── 静态文件服务：让前端能通过 /uploads/xxx.jpg 访问后端存的产品/新闻图片 ──
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
app.mount(settings.media_url, StaticFiles(directory=str(MEDIA_ROOT)), name="uploads")


async def _database_is_ready() -> bool:
    """Return whether the application can execute a minimal database query."""
    try:
        from tortoise import connections

        await connections.get("default").execute_query("SELECT 1")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("readyz database probe failed: %s", exc)
        return False


@app.get("/healthz", tags=["system"], summary="存活探针")
async def healthz() -> dict:
    """存活检查 — 只要 Python 进程还活着就返回 ok。
    用于健康检查/编排平台（如 1Panel）判断"进程是否在运行"（不检查数据库）。"""
    return {"status": "alive"}


@app.get("/readyz", tags=["system"], summary="就绪探针（探 DB + Redis）")
async def readyz(response: Response) -> dict:
    """就绪检查 — 检查数据库和 Redis 是否可用。
    用于健康检查/编排平台（如 1Panel）判断"是否可以接流量"。
    返回 ready（都正常）或 degraded（部分不可用）。"""
    db_ok = False
    redis_ok = False

    # 试连数据库：执行 SELECT 1 看能不能通
    try:
        db_ok = await _database_is_ready()
    except Exception as exc:
        logger.warning("readyz DB 探活失败：%s", exc)

    # 试连 Redis：执行 PING 看能不能通
    try:
        from common.redis_client import get_redis, redis_is_distributed
        await get_redis().ping()
        redis_ok = redis_is_distributed()
    except Exception:
        redis_ok = False

    # PostgreSQL 始终必要；生产可通过 redis_required 把真实 Redis 也纳入就绪门槛。
    if not db_ok or (settings.redis_required and not redis_ok):
        response.status_code = 503
    status = "ready" if (db_ok and redis_ok) else "degraded"
    return {"status": status, "db": db_ok, "redis": redis_ok}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app", host=settings.host, port=settings.port, reload=False
    )
