"""新闻域服务（M2，§3.2.M2 / §6.1）。

设计与产品域一致：写后维护 search_vector、详情缓存 ``news:detail:{slug}``（300s）、
content_html 清洗、软删、slug 唯一。
"""
from __future__ import annotations

import json
import math

from tortoise.functions import Max
from tortoise.transactions import in_transaction

from common.enums import NewsStatus
from common.exceptions import BizException, ErrorCode
from common.html_cleaner import clean_html, clean_text
from common.redis_client import get_redis
from common.result import PageRequest
from common.search_vector import update_search_vector
from news.models import News, NewsCategory
from news.schemas import (
    NewsCategoryCreate,
    NewsCategoryReorderReq,
    NewsCategoryUpdate,
    NewsCategoryVO,
    NewsCreateRequest,
    NewsDetailVO,
    NewsPageVO,
    NewsUpdateRequest,
)

# sort_order 允许范围（security-audit F-18）：拒绝 NaN/非有限/极端值
SORT_ORDER_MIN = -1_000_000.0
SORT_ORDER_MAX = 1_000_000.0

DETAIL_TTL = 300


async def _cache_get_detail(slug: str) -> dict | None:
    try:
        raw = await get_redis().get(f"news:detail:{slug}")
        return json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001
        return None


async def _cache_set_detail(slug: str, payload: dict) -> None:
    try:
        await get_redis().setex(f"news:detail:{slug}", DETAIL_TTL, json.dumps(payload, default=str))
    except Exception:  # noqa: BLE001
        pass


async def _cache_del_detail(slug: str) -> None:
    try:
        await get_redis().delete(f"news:detail:{slug}")
    except Exception:  # noqa: BLE001
        pass


async def list_categories() -> list[NewsCategoryVO]:
    cats = await NewsCategory.filter(deleted=0).order_by("sort_order", "id")
    return [NewsCategoryVO.from_model(c) for c in cats]


async def list_news(
    req: PageRequest,
    category_id: int | None = None,
    status: str | None = None,
    keyword: str | None = None,
) -> tuple[list[NewsPageVO], int]:
    q = News.filter(deleted=0)
    if category_id is not None:
        q = q.filter(category_id=category_id)
    if status is not None:
        q = q.filter(status=status)
    if keyword:
        q = q.filter(title__icontains=keyword)
    total = await q.count()
    rows = await q.order_by("sort_order", "-created_time").offset(req.offset).limit(req.limit).prefetch_related("category")
    return [NewsPageVO.from_model(r) for r in rows], total


async def get_news_detail(slug: str) -> NewsDetailVO:
    cached = await _cache_get_detail(slug)
    if cached:
        return NewsDetailVO(**cached)
    # security-audit F-02：公开详情强制仅返回已发布内容，匿名不可读 DRAFT。
    news = await News.get_or_none(slug=slug, deleted=0, status=NewsStatus.PUBLISHED.value)
    if news is None:
        raise BizException(ErrorCode.A020001)
    await news.fetch_related("category")
    vo = NewsDetailVO.from_model(news)
    await _cache_set_detail(slug, vo.model_dump(mode="json"))
    return vo


async def get_news_detail_admin(slug: str) -> NewsDetailVO:
    """后台用详情：不限制 status（含 DRAFT），不写公共缓存。

    create/update 写操作后回查用，避免 DRAFT（无发布权限时）被
    ``get_news_detail`` 的 ``status=PUBLISHED`` 过滤误判为不存在。
    """
    news = await News.get_or_none(slug=slug, deleted=0)
    if news is None:
        raise BizException(ErrorCode.A020001)
    await news.fetch_related("category")
    return NewsDetailVO.from_model(news)


async def create_news(
    data: NewsCreateRequest, operator: str = "", can_publish: bool = True
) -> NewsDetailVO:
    if await NewsCategory.get_or_none(id=data.category_id, deleted=0) is None:
        raise BizException(ErrorCode.A020001, "新闻分类不存在")
    if await News.get_or_none(slug=data.slug, deleted=0) is not None:
        raise BizException(ErrorCode.A020002)
    # security-audit F-11：无发布权限时，禁止直接置为 PUBLISHED（降级为 DRAFT）。
    status = data.status
    if status == NewsStatus.PUBLISHED.value and not can_publish:
        status = NewsStatus.DRAFT.value
    cleaned = clean_html(data.content_html)
    # security-audit F-01：标题/摘要/作者作为纯文本清洗，杜绝内嵌 HTML/脚本。
    create_kwargs = dict(
        slug=data.slug,
        title=clean_text(data.title),
        summary=clean_text(data.summary),
        content_html=cleaned,
        category_id=data.category_id,
        author=clean_text(data.author),
        status=status,
        created_by=operator or None, updated_by=operator or None,
    )
    # published_at 为 nullable=False + auto_now_add；未显式提供时省略，
    # 交由 ORM 自动填充创建时间（草稿/发布均给合理默认值）。
    if data.published_at is not None:
        create_kwargs["published_at"] = data.published_at
    news = await News.create(**create_kwargs)
    await update_search_vector("t_news", news.id, "title", "summary", "content_html")
    await _cache_del_detail(data.slug)
    return await get_news_detail_admin(data.slug)


async def update_news(
    news_id: int, data: NewsUpdateRequest, operator: str = "", can_publish: bool = True
) -> NewsDetailVO:
    news = await News.get_or_none(id=news_id, deleted=0)
    if news is None:
        raise BizException(ErrorCode.A020001)
    if data.category_id is not None and await NewsCategory.get_or_none(id=data.category_id, deleted=0) is None:
        raise BizException(ErrorCode.A020001, "新闻分类不存在")
    if data.slug is not None and data.slug != news.slug:
        if await News.get_or_none(slug=data.slug, deleted=0) is not None:
            raise BizException(ErrorCode.A020002)
    # security-audit F-18：sort_order 范围校验（拒绝 NaN / 非有限 / 极端值）。
    if data.sort_order is not None:
        if not isinstance(data.sort_order, (int, float)) or not math.isfinite(data.sort_order):
            raise BizException(ErrorCode.A020001, "sort_order 必须为有限数值")
        if data.sort_order < SORT_ORDER_MIN or data.sort_order > SORT_ORDER_MAX:
            raise BizException(ErrorCode.A020001, "sort_order 超出允许范围")
    for field in ["title", "summary", "slug", "category_id", "author", "published_at", "status", "sort_order"]:
        val = getattr(data, field)
        if val is not None:
            # security-audit F-01：标题/摘要/作者作为纯文本清洗。
            if field in ("title", "summary", "author"):
                val = clean_text(val)
            # security-audit F-11：无发布权限时禁止改为 PUBLISHED。
            if field == "status" and val == NewsStatus.PUBLISHED.value and not can_publish:
                val = NewsStatus.DRAFT.value
            setattr(news, field, val)
    if data.content_html is not None:
        news.content_html = clean_html(data.content_html)
    news.updated_by = operator or None
    await news.save()
    await update_search_vector("t_news", news.id, "title", "summary", "content_html")
    await _cache_del_detail(news.slug)
    return await get_news_detail_admin(news.slug)


async def delete_news(news_id: int, operator: str = "") -> None:
    news = await News.get_or_none(id=news_id, deleted=0)
    if news is None:
        raise BizException(ErrorCode.A020001)
    news.deleted = 1
    news.updated_by = operator or None
    await news.save()
    await _cache_del_detail(news.slug)


# ───────────────── 新闻分类写/排序（T02）─────────────────

async def list_news_categories_page(req: PageRequest) -> tuple[list[NewsCategoryVO], int]:
    """后台新闻分类分页列表（已按 sort_order 排序）。"""
    q = NewsCategory.filter(deleted=0)
    total = await q.count()
    rows = await q.order_by("sort_order", "id").offset(req.offset).limit(req.limit)
    return [NewsCategoryVO.from_model(r) for r in rows], total


async def _next_news_category_sort_order() -> int:
    """返回新分类的默认排序值（当前最大 + 1，空表为 0）。"""
    agg = await NewsCategory.filter(deleted=0).aggregate(max_order=Max("sort_order"))
    return (agg.get("max_order") or -1) + 1


async def create_news_category(data: NewsCategoryCreate, operator: str = "") -> NewsCategoryVO:
    if await NewsCategory.get_or_none(slug=data.slug, deleted=0) is not None:
        raise BizException(ErrorCode.A020001, "分类别名重复")
    sort_order = data.sort_order if data.sort_order is not None else await _next_news_category_sort_order()
    cat = await NewsCategory.create(name=data.name, slug=data.slug, sort_order=sort_order)
    return NewsCategoryVO.from_model(cat)


async def update_news_category(news_category_id: int, data: NewsCategoryUpdate, operator: str = "") -> NewsCategoryVO:
    cat = await NewsCategory.get_or_none(id=news_category_id, deleted=0)
    if cat is None:
        raise BizException(ErrorCode.A020001, "分类不存在")
    if data.slug is not None and data.slug != cat.slug:
        if await NewsCategory.get_or_none(slug=data.slug, deleted=0) is not None:
            raise BizException(ErrorCode.A020001, "分类别名重复")
    for field in ["name", "slug", "sort_order"]:
        val = getattr(data, field)
        if val is not None:
            setattr(cat, field, val)
    await cat.save()
    return NewsCategoryVO.from_model(cat)


async def delete_news_category(news_category_id: int, operator: str = "") -> None:
    # 软删（复用 SoftDeleteMixin 的 deleted 标记），与新闻一致。
    cat = await NewsCategory.get_or_none(id=news_category_id, deleted=0)
    if cat is None:
        raise BizException(ErrorCode.A020001, "分类不存在")
    cat.deleted = 1
    await cat.save()


async def reorder_news_category(ids: list[int]) -> None:
    """按目标顺序数组回写 sort_order（数组索引即排序顺序）。

    security-audit F-17：包入事务，避免并发重排产生重复 sort 值。
    """
    async with in_transaction():
        for idx, cid in enumerate(ids):
            await NewsCategory.filter(id=cid, deleted=0).update(sort_order=idx)


# ───────────────── 后台按 ID 详情（T04）─────────────────

async def get_news_by_id(news_id: int) -> NewsDetailVO:
    """后台按 ID 详情：绕过软删过滤，admin 可读取/编辑已软删项。"""
    news = await News.get_or_none(id=news_id)
    if news is None:
        raise BizException(ErrorCode.A020001)
    await news.fetch_related("category")
    return NewsDetailVO.from_model(news)
