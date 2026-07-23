"""联合搜索路由（M3，§3.2.M3.2）。

路径前缀 /api/v1。公开：GET /search?q=&type=&page=&page_size=。
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from common.result import Result
from search import services

router = APIRouter(prefix="/api/v1", tags=["search"])


@router.get("/search", summary="产品+新闻联合搜索")
async def search(
    q: str = Query("", max_length=100, description="搜索关键词"),
    type: str = Query("all", pattern="^(all|product|news)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> Result:
    # 空关键词由 services.search 统一抛出业务码 A030001（HTTP 200 + Result 包裹），
    # 不在 FastAPI 校验层用 min_length 直接 400，保持统一错误封包。
    vo = await services.search(q=q, stype=type, page=page, page_size=page_size)
    return Result.ok(vo.model_dump(mode="json"))
