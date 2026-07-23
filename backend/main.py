"""应用入口（M 聚合层）。

设计约束（蓝图 §1 / §5 / §6）：
- 创建 FastAPI(app)，聚合各模块 router，注册中间件/异常/lifespan。
- 中间件：TraceMiddleware（traceId/真实IP/单租户）。CORS 由 CORSMiddleware 处理。
- 异常：register_exception_handlers 统一包成 Result。
- lifespan：启动时初始化 Redis（降级内存）→ 初始化 Tortoise → 按配置幂等种子；
  关闭时释放连接。
- 健康检查：/healthz（存活）、/readyz（探 DB+Redis）。
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from common.config import MEDIA_ROOT, close_db, init_db, settings
from common.exceptions import register_exception_handlers
from common.logger import get_logger
from common.middleware import TraceMiddleware
from common.redis_client import close_redis, init_redis
from content.routers import router as content_router
from inquiry.routers import router as inquiry_router
from migration.routers import router as migration_router
from news.routers import router as news_router
from product.routers import router as product_router
from search.routers import router as search_router
from uploads.routers import router as upload_router
from common.settings_router import router as settings_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1) Redis（未配置/不可达 → 内存降级，绝不阻断启动）
    await init_redis()
    # 2) 数据库
    await init_db()
    # 3) 首次部署幂等种子
    if settings.seed_on_start:
        try:
            from seed.seed_data import run_seed

            await run_seed()
            logger.info("种子数据写入完成（幂等）")
        except Exception as exc:  # noqa: BLE001
            logger.warning("种子数据写入失败（忽略，可手动执行）：%s", exc)
    yield
    # 关闭
    await close_db()
    await close_redis()


# security-audit F-14：仅非生产环境或显式开启时才暴露 /docs /redoc /openapi.json。
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

# 中间件
app.add_middleware(TraceMiddleware)
# security-audit F-09：显式来源白名单，禁用凭据（Bearer 鉴权无需 cookie）。
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 全局异常处理器（统一 Result）
register_exception_handlers(app)

# 路由聚合
app.include_router(product_router)
app.include_router(news_router)
app.include_router(search_router)
app.include_router(inquiry_router)
app.include_router(content_router)
app.include_router(migration_router)
app.include_router(upload_router)
app.include_router(settings_router)

# 静态媒体服务：把本地下载的图片（迁移落盘于 MEDIA_ROOT）以 /uploads 前缀对外暴露。
# 注意：必须在路由聚合之后挂载，避免拦截业务 API；目录不存在时先创建，否则 StaticFiles 报错。
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
app.mount(settings.media_url, StaticFiles(directory=str(MEDIA_ROOT)), name="uploads")


@app.get("/healthz", tags=["system"], summary="存活探针")
async def healthz() -> dict:
    return {"status": "alive"}


@app.get("/readyz", tags=["system"], summary="就绪探针（探 DB + Redis）")
async def readyz() -> dict:
    db_ok = False
    redis_ok = False
    try:
        from tortoise import connections

        await connections.get("default").execute_query("SELECT 1")
        db_ok = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("readyz DB 探活失败：%s", exc)

    try:
        from common.redis_client import get_redis

        await get_redis().ping()
        redis_ok = True
    except Exception:  # noqa: BLE001
        redis_ok = False

    status = "ready" if (db_ok and redis_ok) else "degraded"
    return {"status": status, "db": db_ok, "redis": redis_ok}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app", host=settings.host, port=settings.port, reload=False
    )
