"""联合搜索服务（M3，§3.2.M3 / §6.2 / BD-01）。

设计约束：
- PG：TSVector 相关性检索，``search_vector @@ plainto_tsquery('zh', q)`` 按 ``ts_rank`` 降序。
- SQLite / 索引慢：降级 ``title LIKE '%q%'``（BD-01），rank=0 并标注「基础检索」。
- 结果缓存 ``search:q:{hash}:{type}:{page}``（60s）。
"""
from __future__ import annotations

import hashlib
import json
import time

from common.exceptions import BizException, ErrorCode
from common.redis_client import get_redis
from common.search_vector import is_sqlite, resolve_tsconfig
from news.models import News
from product.models import Product
from search.schemas import SearchItemVO, SearchPageVO
from tortoise.expressions import Q

CACHE_TTL = 60


def _cache_key(q: str, stype: str, page: int) -> str:
    h = hashlib.md5(f"{q}|{stype}".encode()).hexdigest()[:12]
    return f"search:q:{h}:{stype}:{page}"


async def _cache_get(key: str) -> SearchPageVO | None:
    try:
        raw = await get_redis().get(key)
        if raw:
            return SearchPageVO(**json.loads(raw))
    except Exception:  # noqa: BLE001
        pass
    return None


async def _cache_set(key: str, vo: SearchPageVO) -> None:
    try:
        await get_redis().setex(key, CACHE_TTL, json.dumps(vo.model_dump(mode="json"), default=str))
    except Exception:  # noqa: BLE001
        pass


async def _sqlite_search(q: str, stype: str) -> tuple[list[SearchItemVO], bool]:
    """SQLite 降级路径：title LIKE，rank=0，标注基础检索。"""
    items: list[SearchItemVO] = []
    if stype in ("all", "product"):
        rows = await Product.filter(
            deleted=0, status="PUBLISHED", title__icontains=q
        ).order_by("-created_time")
        for r in rows:
            items.append(SearchItemVO(
                id=r.id, kind="product", title=r.title, summary=r.summary,
                slug=r.slug, url=f"/products/{r.slug}", rank=0.0,
                created_time=r.created_time,
            ))
    if stype in ("all", "news"):
        rows = await News.filter(
            deleted=0, status="PUBLISHED", title__icontains=q
        ).order_by("-created_time")
        for r in rows:
            items.append(SearchItemVO(
                id=r.id, kind="news", title=r.title, summary=r.summary,
                slug=r.slug, url=f"/news/{r.slug}", rank=0.0,
                cover_image=r.cover_image,
                created_time=r.created_time,
            ))
    return items, True


async def _pg_search(q: str, stype: str) -> tuple[list[SearchItemVO], bool]:
    """PG 路径：TSVector 相关性检索。"""
    from tortoise import connections

    cfg = await resolve_tsconfig()
    parts = []
    if stype in ("all", "product"):
        parts.append(
            "SELECT id, 'product' AS kind, title, summary, slug, cover_image, created_time, "
            f"ts_rank(search_vector, plainto_tsquery('{cfg}', $1)) AS rank "
            "FROM t_product WHERE deleted=0 AND status='PUBLISHED' "
            f"AND search_vector @@ plainto_tsquery('{cfg}', $1)"
        )
    if stype in ("all", "news"):
        parts.append(
            "SELECT id, 'news' AS kind, title, summary, slug, cover_image, created_time, "
            f"ts_rank(search_vector, plainto_tsquery('{cfg}', $1)) AS rank "
            "FROM t_news WHERE deleted=0 AND status='PUBLISHED' "
            f"AND search_vector @@ plainto_tsquery('{cfg}', $1)"
        )
    if not parts:
        return [], False
    sql = " UNION ALL ".join(parts) + " ORDER BY rank DESC, created_time DESC"
    # 参数：asyncpg 复用 $1；查询词只传一次
    params = [q]
    conn = connections.get("default")
    # Tortoise 1.1.x (asyncpg 后端) 的 execute_query 返回 (rowcount, rows)，
    # 取 [0] 会拿到 int 行数导致迭代报错。改用 execute_query_dict 直接返回 list[dict]。
    rows = await conn.execute_query_dict(sql, params)
    items = [
        SearchItemVO(
            id=r["id"], kind=r["kind"], title=r["title"], summary=r["summary"] or "",
            slug=r["slug"], url=f"/{ 'products' if r['kind']=='product' else 'news' }/{r['slug']}",
            rank=float(r["rank"] or 0.0), cover_image=r["cover_image"],
            created_time=r["created_time"],
        )
        for r in rows
    ]

    # 兜底：simple 配置（未装 zhparser）下 TSVector 无法对中文/部分型号分词，
    # 退化为 ILIKE（title/summary/content_html），保证可搜到。与 SQLite 降级路径一致（BD-01）。
    degraded = False
    if not items:
        like = q
        filters = (
            Q(title__icontains=like)
            | Q(summary__icontains=like)
            | Q(content_html__icontains=like)
        )
        if stype in ("all", "product"):
            for r in await Product.filter(deleted=0, status="PUBLISHED").filter(filters).order_by(
                "-created_time"
            ):
                items.append(SearchItemVO(
                    id=r.id, kind="product", title=r.title, summary=r.summary or "",
                    slug=r.slug, url=f"/products/{r.slug}", rank=0.0, cover_image=r.cover_image,
                    created_time=r.created_time,
                ))
        if stype in ("all", "news"):
            for r in await News.filter(deleted=0, status="PUBLISHED").filter(filters).order_by(
                "-created_time"
            ):
                items.append(SearchItemVO(
                    id=r.id, kind="news", title=r.title, summary=r.summary or "",
                    slug=r.slug, url=f"/news/{r.slug}", rank=0.0, cover_image=r.cover_image,
                    created_time=r.created_time,
                ))
        degraded = True
    return items, degraded


async def search(
    q: str, stype: str = "all", page: int = 1, page_size: int = 20
) -> SearchPageVO:
    if not q or not q.strip():
        raise BizException(ErrorCode.A030001)

    key = _cache_key(q, stype, page)
    cached = await _cache_get(key)
    if cached is not None:
        return cached

    start = time.perf_counter()
    if is_sqlite():
        items, degraded = await _sqlite_search(q, stype)
    else:
        items, degraded = await _pg_search(q, stype)
    took_ms = round((time.perf_counter() - start) * 1000, 2)

    # 内存分页
    page = max(page, 1)
    page_size = min(max(page_size, 1), 50)
    total = len(items)
    start_idx = (page - 1) * page_size
    page_items = items[start_idx : start_idx + page_size]

    vo = SearchPageVO(
        items=page_items, total=total, took_ms=took_ms, degraded=degraded,
        note="基础检索（降级）" if degraded else "",
    )
    await _cache_set(key, vo)
    return vo
