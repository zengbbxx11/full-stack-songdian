"""联合搜索服务（M3，§3.2.M3 / §6.2 / BD-01）。

设计约束：
- PG：TSVector 相关性检索，``search_vector @@ plainto_tsquery('zh', q)`` 按 ``ts_rank`` 降序。
- SQLite / 索引慢：降级 ``title LIKE '%q%'``（BD-01），rank=0 并标注英文说明。
- 联合结果默认产品优先；新闻排在产品后并按发布时间从新到旧。
- 结果缓存 ``search:q:{hash}:{type}:{page}``（60s）。
"""
from __future__ import annotations

import hashlib
import json
import time

from common.exceptions import BizException, ErrorCode
from common.redis_client import cache_key, get_redis
from common.search_vector import is_sqlite, resolve_tsconfig
from search.schemas import SearchItemVO, SearchPageVO

CACHE_TTL = 60


def _cache_key(q: str, stype: str, page: int, page_size: int = 20) -> str:
    h = hashlib.md5(f"{q}|{stype}".encode()).hexdigest()[:12]
    # v2：默认排序改为产品优先、新闻按时间倒序，隔离旧排序缓存。
    return cache_key("search", "v3", "q", h, stype, page, page_size)


SEARCH_ORDER_SQL = (
    "ORDER BY CASE WHEN kind='product' THEN 0 ELSE 1 END ASC, "
    "CASE WHEN kind='product' THEN rank ELSE 0 END DESC, "
    "created_time DESC, id DESC"
)


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


def _rows_to_vos(rows: list[dict]) -> list[SearchItemVO]:
    """把原始查询行（dict）映射为 SearchItemVO。

    产品直接输出**规范嵌套 URL**（/products/{category}/{slug}）；分类缺失时回退扁平地址，
    新闻始终为 /news/{slug}。避免前端再自行拼接扁平路径导致规范化 404。
    """
    items: list[SearchItemVO] = []
    for r in rows:
        kind = r["kind"]
        category_slug = r.get("category_slug")
        if kind == "product":
            url = f"/products/{category_slug}/{r['slug']}" if category_slug else f"/products/{r['slug']}"
        else:
            url = f"/news/{r['slug']}"
        items.append(
            SearchItemVO(
                id=r["id"], kind=kind, title=r["title"], summary=r["summary"] or "",
                slug=r["slug"], url=url, category_slug=category_slug,
                rank=float(r["rank"] or 0.0), cover_image=r["cover_image"],
                created_time=r["created_time"],
            )
        )
    return items


async def _sqlite_search(
    q: str, stype: str, page: int, page_size: int
) -> tuple[list[SearchItemVO], int, bool]:
    """SQLite 降级路径：title/summary/content_html LIKE，rank=0，标注基础检索。

    review #12：分页（LIMIT/OFFSET）与计数（COUNT）下沉到 DB，避免全量拉取后在内存切片。
    """
    from tortoise import connections

    offset = (page - 1) * page_size
    like = f"%{q}%"
    parts: list[str] = []
    if stype in ("all", "product"):
        parts.append(
            "SELECT p.id, 'product' AS kind, p.title, p.summary, p.slug, p.cover_image, p.created_time, "
            "c.slug AS category_slug, 0.0 AS rank "
            "FROM t_product p LEFT JOIN t_product_category c ON c.id = p.category_id "
            "WHERE p.deleted=0 AND p.status='PUBLISHED' "
            "AND (p.title LIKE ? OR p.summary LIKE ? OR p.content_html LIKE ?)"
        )
    if stype in ("all", "news"):
        parts.append(
            "SELECT id, 'news' AS kind, title, summary, slug, cover_image, created_time, "
            "NULL AS category_slug, 0.0 AS rank "
            "FROM t_news WHERE deleted=0 AND status='PUBLISHED' "
            "AND (title LIKE ? OR summary LIKE ? OR content_html LIKE ?)"
        )
    if not parts:
        return [], 0, True
    union_sql = " UNION ALL ".join(parts)
    order_sql = SEARCH_ORDER_SQL
    # 每个 union part 需要 3 个 ?（title/summary/content_html）
    params = [like, like, like] * len(parts)
    conn = connections.get("default")
    page_rows = await conn.execute_query_dict(
        f"SELECT * FROM ({union_sql}) sub {order_sql} LIMIT ? OFFSET ?",
        params + [page_size, offset],
    )
    total_rows = await conn.execute_query_dict(
        f"SELECT COUNT(*) AS c FROM ({union_sql}) sub", params
    )
    total = int(total_rows[0]["c"]) if total_rows else 0
    return _rows_to_vos(page_rows), total, True


async def _pg_search(
    q: str, stype: str, page: int, page_size: int
) -> tuple[list[SearchItemVO], int, bool]:
    """PG 路径：TSVector 相关性检索（review #12：分页与计数下沉到 DB）。"""
    from tortoise import connections

    cfg = await resolve_tsconfig()
    offset = (page - 1) * page_size
    parts: list[str] = []
    if stype in ("all", "product"):
        parts.append(
            "SELECT p.id, 'product' AS kind, p.title, p.summary, p.slug, p.cover_image, p.created_time, "
            "c.slug AS category_slug, "
            f"ts_rank(p.search_vector, plainto_tsquery('{cfg}', $1)) AS rank "
            "FROM t_product p LEFT JOIN t_product_category c ON c.id = p.category_id "
            "WHERE p.deleted=0 AND p.status='PUBLISHED' "
            f"AND p.search_vector @@ plainto_tsquery('{cfg}', $1)"
        )
    if stype in ("all", "news"):
        parts.append(
            "SELECT id, 'news' AS kind, title, summary, slug, cover_image, created_time, "
            "NULL AS category_slug, "
            f"ts_rank(search_vector, plainto_tsquery('{cfg}', $1)) AS rank "
            "FROM t_news WHERE deleted=0 AND status='PUBLISHED' "
            f"AND search_vector @@ plainto_tsquery('{cfg}', $1)"
        )
    if not parts:
        return [], 0, False
    union_sql = " UNION ALL ".join(parts)
    order_sql = SEARCH_ORDER_SQL
    conn = connections.get("default")
    params = [q, page_size, offset]
    page_rows = await conn.execute_query_dict(
        f"SELECT * FROM ({union_sql}) sub {order_sql} LIMIT $2 OFFSET $3", params
    )
    total_rows = await conn.execute_query_dict(
        f"SELECT COUNT(*) AS c FROM ({union_sql}) sub", [q]
    )
    total = int(total_rows[0]["c"]) if total_rows else 0

    # 兜底：simple 配置（未装 zhparser）下 TSVector 无法对中文分词，
    # 退化为 ILIKE（参数化防注入），保证可搜到。与 SQLite 降级路径一致（BD-01）。
    degraded = False
    if total == 0:
        like_parts: list[str] = []
        if stype in ("all", "product"):
            like_parts.append(
                "SELECT p.id, 'product' AS kind, p.title, p.summary, p.slug, p.cover_image, p.created_time, "
                "c.slug AS category_slug, 0.0 AS rank "
                "FROM t_product p LEFT JOIN t_product_category c ON c.id = p.category_id "
                "WHERE p.deleted=0 AND p.status='PUBLISHED' "
                "AND (p.title ILIKE '%'||$1||'%' OR p.summary ILIKE '%'||$1||'%' OR p.content_html ILIKE '%'||$1||'%')"
            )
        if stype in ("all", "news"):
            like_parts.append(
                "SELECT id, 'news' AS kind, title, summary, slug, cover_image, created_time, "
                "NULL AS category_slug, 0.0 AS rank "
                "FROM t_news WHERE deleted=0 AND status='PUBLISHED' "
                "AND (title ILIKE '%'||$1||'%' OR summary ILIKE '%'||$1||'%' OR content_html ILIKE '%'||$1||'%')"
            )
        like_union = " UNION ALL ".join(like_parts)
        page_rows = await conn.execute_query_dict(
            f"SELECT * FROM ({like_union}) sub {order_sql} LIMIT $2 OFFSET $3", params
        )
        total_rows = await conn.execute_query_dict(
            f"SELECT COUNT(*) AS c FROM ({like_union}) sub", [q]
        )
        total = int(total_rows[0]["c"]) if total_rows else 0
        degraded = True

    return _rows_to_vos(page_rows), total, degraded


async def search(
    q: str, stype: str = "all", page: int = 1, page_size: int = 20
) -> SearchPageVO:
    if not q or not q.strip():
        raise BizException(ErrorCode.A030001)

    page = max(page, 1)
    page_size = min(max(page_size, 1), 50)

    key = _cache_key(q.strip(), stype, page, page_size)
    cached = await _cache_get(key)
    if cached is not None:
        return cached

    start = time.perf_counter()
    if is_sqlite():
        items, total, degraded = await _sqlite_search(q, stype, page, page_size)
    else:
        items, total, degraded = await _pg_search(q, stype, page, page_size)
    took_ms = round((time.perf_counter() - start) * 1000, 2)

    vo = SearchPageVO(
        items=items, total=total, took_ms=took_ms, degraded=degraded,
        note="Basic search mode" if degraded else "",
    )
    await _cache_set(key, vo)
    return vo
