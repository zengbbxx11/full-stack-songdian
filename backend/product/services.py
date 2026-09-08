"""产品域服务（M1，§3.2.M1 / §6.1）。

设计约束：
- 写后维护 search_vector（PG）；SQLite 自动跳过。
- 详情缓存 ``product:detail:{slug}``（300s），写后 DEL（Cache-Aside）。
- content_html 经 bleach 清洗（防存储型 XSS）。
- 软删（deleted=1）；slug 唯一约束。
"""
from __future__ import annotations

import json
import math
from datetime import UTC, datetime

from tortoise.functions import Count, Max
from tortoise.transactions import in_transaction

from common.enums import ProductStatus
from common.exceptions import BizException, ErrorCode
from common.html_cleaner import clean_html, clean_text
from common.redis_client import cache_key, get_redis
from common.tasks import enqueue, transactional_write
from common.result import PageRequest
from common.search_vector import update_search_vector
from content_revision import services as revision_services
from product.models import (
    Product,
    ProductAttribute,
    ProductCategory,
    ProductGallery,
)
from product.schemas import (
    AttributeCreateRequest,
    AttributeVO,
    CategoryCreate,
    CategoryUpdate,
    CategoryVO,
    GalleryCreateRequest,
    GalleryVO,
    ProductCreateRequest,
    ProductDetailVO,
    ProductPageVO,
    ProductUpdateRequest,
)

# 缓存 TTL（秒）
DETAIL_TTL = 3600
LIST_TTL = 300       # 列表 5 分钟
CAT_TTL = 1800        # 分类 30 分钟

# sort_order 允许范围（security-audit F-18）：拒绝 NaN/非有限/极端值
SORT_ORDER_MIN = -1_000_000.0
SORT_ORDER_MAX = 1_000_000.0


def _publishing_values(status: str, published_at: datetime | None, can_publish: bool) -> tuple[str, datetime | None]:
    if status in {ProductStatus.PUBLISHED.value, ProductStatus.SCHEDULED.value} and not can_publish:
        return ProductStatus.DRAFT.value, None
    now = datetime.now(UTC)
    if status == ProductStatus.SCHEDULED.value:
        if published_at is None or published_at <= now:
            raise BizException(ErrorCode.A010001, "定时发布时间必须晚于当前时间")
        return status, published_at
    if status == ProductStatus.PUBLISHED.value:
        return status, published_at or now
    return status, None


async def _safe_cache_get(key: str) -> str | None:
    try:
        return await get_redis().get(key)
    except Exception:
        return None


async def _cache_get_detail(slug: str) -> dict | None:
    try:
        raw = await get_redis().get(cache_key("product", "detail", slug))
        return json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001
        return None


async def _cache_set_detail(slug: str, payload: dict) -> None:
    try:
        await get_redis().setex(cache_key("product", "detail", slug), DETAIL_TTL, json.dumps(payload, default=str))
    except Exception:  # noqa: BLE001
        pass


async def _cache_del_detail(slug: str) -> None:
    try:
        await get_redis().delete(cache_key("product", "detail", slug))
    except Exception:  # noqa: BLE001
        pass


async def _invalidate_product_content(*slugs: str, categories: bool = False) -> None:
    await enqueue("content_cache", {
        "resource": "product", "slugs": sorted({s for s in slugs if s}), "categories": categories,
    })


async def list_categories() -> list[CategoryVO]:
    ck = cache_key("product", "categories")
    raw = await _safe_cache_get(ck)
    if raw:
        try:
            return [CategoryVO(**v) for v in json.loads(raw)]
        except Exception:
            pass
    cats = await ProductCategory.filter(deleted=0).order_by("sort_order", "id")
    vos = [CategoryVO.from_model(c) for c in cats]
    try:
        await get_redis().setex(ck, CAT_TTL, json.dumps([v.model_dump(mode="json") for v in vos], default=str))
    except Exception:
        pass
    return vos


async def list_products(
    req: PageRequest,
    category_id: int | None = None,
    status: str | None = None,
    keyword: str | None = None,
) -> tuple[list[ProductPageVO], int]:
    # Cache-Aside 读取
    ck = cache_key("product", "list", str(category_id), str(status), str(keyword or ""), str(req.offset), str(req.limit))
    raw = await _safe_cache_get(ck)
    if raw:
        try:
            data = json.loads(raw)
            vos = [ProductPageVO(**v) for v in data["items"]]
            return vos, data["total"]
        except Exception:
            pass  # 缓存损坏，回源查库

    q = Product.filter(deleted=0)
    if category_id is not None:
        q = q.filter(category_id=category_id)
    if status is not None:
        q = q.filter(status=status)
    if keyword:
        q = q.filter(title__icontains=keyword)
    total = await q.count()
    rows = await q.order_by("sort_order", "-created_time", "id").offset(req.offset).limit(req.limit).prefetch_related("category")
    vos = [ProductPageVO.from_model(r) for r in rows]

    # Cache-Aside 写入
    try:
        await get_redis().setex(ck, LIST_TTL, json.dumps({"items": [v.model_dump(mode="json") for v in vos], "total": total}, default=str))
    except Exception:
        pass

    return vos, total


async def get_product_detail(slug: str) -> ProductDetailVO:
    cached = await _cache_get_detail(slug)
    if cached:
        return ProductDetailVO(**cached)
    # security-audit F-02：公开详情强制仅返回已发布内容，匿名不可读 DRAFT。
    product = await Product.get_or_none(slug=slug, deleted=0, status=ProductStatus.PUBLISHED.value)
    if product is None:
        raise BizException(ErrorCode.A010001)
    await product.fetch_related("category", "galleries", "attributes")
    vo = ProductDetailVO.from_model(
        product, galleries=product.galleries, attributes=product.attributes
    )
    await _cache_set_detail(slug, vo.model_dump(mode="json"))
    return vo


async def get_product_detail_admin(slug: str) -> ProductDetailVO:
    """后台用详情：不限制 status（含 DRAFT），不写公共缓存。

    create/update 写操作后回查用，避免 DRAFT（无发布权限时）被
    ``get_product_detail`` 的 ``status=PUBLISHED`` 过滤误判为不存在。
    """
    product = await Product.get_or_none(slug=slug, deleted=0)
    if product is None:
        raise BizException(ErrorCode.A010001)
    await product.fetch_related("category", "galleries", "attributes")
    return ProductDetailVO.from_model(
        product, galleries=product.galleries, attributes=product.attributes
    )


@transactional_write
async def create_product(
    data: ProductCreateRequest, operator: str = "", can_publish: bool = True
) -> ProductDetailVO:
    if await ProductCategory.get_or_none(id=data.category_id, deleted=0) is None:
        raise BizException(ErrorCode.A010001, "产品分类不存在")
    if await Product.get_or_none(slug=data.slug) is not None:
        raise BizException(ErrorCode.A010002)
    # security-audit F-11：无发布权限时，禁止直接置为 PUBLISHED（降级为 DRAFT）。
    status, published_at = _publishing_values(data.status, data.published_at, can_publish)
    cleaned = clean_html(data.content_html)
    # security-audit F-01：标题/摘要作为纯文本清洗，杜绝内嵌 HTML/脚本。
    # 外层事务同时提交正文、搜索向量、版本及缓存失效任务。
    async with in_transaction():
        product = await Product.create(
            slug=data.slug,
            title=clean_text(data.title),
            summary=clean_text(data.summary),
            content_html=cleaned,
            category_id=data.category_id, sku=data.sku, price=data.price, currency=data.currency,
            stock_status=data.stock_status, status=status, published_at=published_at,
            cover_image=data.cover_image, tags=data.tags,
            seo_title=clean_text(data.seo_title), seo_description=clean_text(data.seo_description),
            created_by=operator or None, updated_by=operator or None,
        )
    await update_search_vector("t_product", product.id, "title", "summary", "content_html")
    await revision_services.record_revision(product, "product", "CREATE", operator)
    await _invalidate_product_content(data.slug)
    return await get_product_detail_admin(data.slug)


@transactional_write
async def update_product(
    product_id: int, data: ProductUpdateRequest, operator: str = "", can_publish: bool = True
) -> ProductDetailVO:
    product = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if product is None:
        raise BizException(ErrorCode.A010001)
    if product.status == "PUBLISHED" and not can_publish:
        raise BizException(ErrorCode.C403001, "修改已发布内容需要发布权限，请先由发布者撤回草稿")
    old_slug = product.slug
    if data.category_id is not None and await ProductCategory.get_or_none(id=data.category_id, deleted=0) is None:
        raise BizException(ErrorCode.A010001, "产品分类不存在")
    if data.slug is not None and data.slug != product.slug:
        if await Product.get_or_none(slug=data.slug) is not None:
            raise BizException(ErrorCode.A010002)
    # security-audit F-18：sort_order 范围校验（拒绝 NaN / 非有限 / 极端值）。
    if data.sort_order is not None:
        if not isinstance(data.sort_order, (int, float)) or not math.isfinite(data.sort_order):
            raise BizException(ErrorCode.A010001, "sort_order 必须为有限数值")
        if data.sort_order < SORT_ORDER_MIN or data.sort_order > SORT_ORDER_MAX:
            raise BizException(ErrorCode.A010001, "sort_order 超出允许范围")
    requested_status = data.status or product.status
    requested_time = data.published_at if data.published_at is not None else product.published_at
    normalized_status, normalized_time = _publishing_values(requested_status, requested_time, can_publish)
    for field in ["title", "summary", "slug", "category_id", "sku", "price", "currency", "stock_status", "cover_image", "tags", "sort_order", "seo_title", "seo_description"]:
        val = getattr(data, field)
        if field in data.model_fields_set and (val is not None or field in {"seo_title", "seo_description", "cover_image", "sku", "price"}):
            # security-audit F-01：标题/摘要作为纯文本清洗。
            if field in ("title", "summary", "seo_title", "seo_description"):
                val = clean_text(val)
            setattr(product, field, val)
    if data.status is not None or data.published_at is not None:
        product.status = normalized_status
        product.published_at = normalized_time
    if data.content_html is not None:
        product.content_html = clean_html(data.content_html)
    product.updated_by = operator or None
    await product.save()
    await update_search_vector("t_product", product.id, "title", "summary", "content_html")
    change_type = "SCHEDULE" if product.status == ProductStatus.SCHEDULED.value else "UPDATE"
    await revision_services.record_revision(product, "product", change_type, operator)
    await _invalidate_product_content(old_slug, product.slug)
    return await get_product_detail_admin(product.slug)


@transactional_write
async def delete_product(product_id: int, operator: str = "") -> None:
    product = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if product is None:
        raise BizException(ErrorCode.A010001)
    product.deleted = 1
    product.updated_by = operator or None
    await product.save()
    await _invalidate_product_content(product.slug)


@transactional_write
async def add_gallery(product_id: int, data: GalleryCreateRequest, can_publish: bool = True) -> GalleryVO:
    live = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if live is None:
        raise BizException(ErrorCode.A010001)
    if live.status == "PUBLISHED" and not can_publish:
        raise BizException(ErrorCode.C403001, "修改已发布内容需要发布权限")
    product = live
    g = await ProductGallery.create(
        product_id=product_id, image_url=data.image_url, alt=data.alt, sort_order=data.sort_order
    )
    await _invalidate_product_content(product.slug)
    return GalleryVO.from_model(g)


@transactional_write
async def delete_gallery(product_id: int, gallery_id: int, can_publish: bool = True) -> None:
    live = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if live is None:
        raise BizException(ErrorCode.A010001)
    if live.status == "PUBLISHED" and not can_publish:
        raise BizException(ErrorCode.C403001, "修改已发布内容需要发布权限")
    g = await ProductGallery.get_or_none(id=gallery_id, product_id=product_id)
    if g is None:
        raise BizException(ErrorCode.A010001, msg="相册图不存在")
    slug = live.slug
    await g.delete()
    if slug:
        await _invalidate_product_content(slug)


@transactional_write
async def add_attribute(product_id: int, data: AttributeCreateRequest, can_publish: bool = True) -> AttributeVO:
    live = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if live is None:
        raise BizException(ErrorCode.A010001)
    if live.status == "PUBLISHED" and not can_publish:
        raise BizException(ErrorCode.C403001, "修改已发布内容需要发布权限")
    product = live
    a = await ProductAttribute.create(
        product_id=product_id, name=data.name, slug=data.slug, value=data.value
    )
    await _invalidate_product_content(product.slug)
    return AttributeVO.from_model(a)


@transactional_write
async def delete_attribute(product_id: int, attr_id: int, can_publish: bool = True) -> None:
    live = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if live is None:
        raise BizException(ErrorCode.A010001)
    if live.status == "PUBLISHED" and not can_publish:
        raise BizException(ErrorCode.C403001, "修改已发布内容需要发布权限")
    a = await ProductAttribute.get_or_none(id=attr_id, product_id=product_id)
    if a is None:
        raise BizException(ErrorCode.A010001, msg="属性不存在")
    slug = live.slug
    await a.delete()
    if slug:
        await _invalidate_product_content(slug)


# ───────────────── 分类写/排序（T02）─────────────────

async def list_categories_page(req: PageRequest) -> tuple[list[CategoryVO], int]:
    """后台分类分页列表（已按 sort_order 排序），含产品计数。"""
    q = ProductCategory.filter(deleted=0)
    total = await q.count()
    rows = await q.order_by("sort_order", "id").offset(req.offset).limit(req.limit)

    # 统计每个分类下的产品数（已发布 + 未软删）
    category_ids = [r.id for r in rows]
    from tortoise.expressions import Q
    product_counts: dict[int, int] = {}
    if category_ids:
        products = await Product.filter(
            Q(category_id__in=category_ids), deleted=0, status="PUBLISHED"
        ).group_by("category_id").annotate(total=Count("id")).values("category_id", "total")
        product_counts = {row["category_id"]: row["total"] for row in products}


    return [CategoryVO.from_model(r, product_count=product_counts.get(r.id, 0)) for r in rows], total


async def _next_category_sort_order() -> int:
    """返回新分类的默认排序值（当前最大 + 1，空表为 0）。

    验证期发现：Tortoise 1.x 已移除 ``QuerySet.aggregate``，改用
    ``functions.Max`` + ``annotate``/``values`` 取全局最大值（逐行取 max 兜底）。
    """
    rows = await ProductCategory.filter(deleted=0).annotate(m=Max("sort_order")).values("m")
    max_order = max((r["m"] for r in rows), default=None)
    return (-1 if max_order is None else max_order) + 1


@transactional_write
async def create_category(data: CategoryCreate, operator: str = "") -> CategoryVO:
    if await ProductCategory.get_or_none(slug=data.slug) is not None:
        raise BizException(ErrorCode.A010001, "分类别名重复")
    sort_order = data.sort_order if data.sort_order is not None else await _next_category_sort_order()
    cat = await ProductCategory.create(name=data.name, slug=data.slug, sort_order=sort_order)
    await _invalidate_product_content(categories=True)
    return CategoryVO.from_model(cat)


@transactional_write
async def update_category(category_id: int, data: CategoryUpdate, operator: str = "") -> CategoryVO:
    cat = await ProductCategory.get_or_none(id=category_id, deleted=0)
    if cat is None:
        raise BizException(ErrorCode.A010001, "分类不存在")
    if data.slug is not None and data.slug != cat.slug:
        if await ProductCategory.get_or_none(slug=data.slug) is not None:
            raise BizException(ErrorCode.A010001, "分类别名重复")
    for field in ["name", "slug", "sort_order"]:
        val = getattr(data, field)
        if val is not None:
            setattr(cat, field, val)
    await cat.save()
    await _invalidate_product_content(categories=True)
    return CategoryVO.from_model(cat)


@transactional_write
async def delete_category(category_id: int, operator: str = "") -> None:
    # 软删（复用 SoftDeleteMixin 的 deleted 标记），与产品/新闻一致。
    cat = await ProductCategory.get_or_none(id=category_id, deleted=0)
    if cat is None:
        raise BizException(ErrorCode.A010001, "分类不存在")
    cat.deleted = 1
    await cat.save()
    await _invalidate_product_content(categories=True)


@transactional_write
async def reorder_category(ids: list[int]) -> None:
    """按目标顺序数组回写 sort_order（数组索引即排序顺序）。

    security-audit F-17：包入事务，避免并发重排产生重复 sort 值。
    """
    async with in_transaction():
        for idx, cid in enumerate(ids):
            await ProductCategory.filter(id=cid, deleted=0).update(sort_order=idx)
    await _invalidate_product_content(categories=True)


# ───────────────── 后台按 ID 详情（T04）─────────────────

async def get_product_by_id(product_id: int) -> ProductDetailVO:
    """后台按 ID 详情：绕过软删过滤，admin 可读取/编辑已软删项。"""
    product = await Product.get_or_none(id=product_id)
    if product is None:
        raise BizException(ErrorCode.A010001)
    await product.fetch_related("category", "galleries", "attributes")
    return ProductDetailVO.from_model(
        product, galleries=product.galleries, attributes=product.attributes
    )


async def list_product_revisions(product_id: int) -> list[dict]:
    if await Product.get_or_none(id=product_id) is None:
        raise BizException(ErrorCode.A010001)
    return await revision_services.list_revisions("product", product_id)


@transactional_write
async def restore_product_revision(product_id: int, revision_id: int, operator: str, can_publish: bool = False) -> ProductDetailVO:
    product = await Product.filter(id=product_id, deleted=0).select_for_update().first()
    if product is None:
        raise BizException(ErrorCode.A010001)
    revision = await revision_services.get_revision("product", product_id, revision_id)
    old_slug = product.slug
    snapshot = dict(revision.snapshot)
    if snapshot.get("status") in {"PUBLISHED", "SCHEDULED"} and not can_publish:
        raise BizException(ErrorCode.C403001, "恢复已发布或定时版本需要发布权限")
    category_id = snapshot.get("category_id")
    if category_id and await ProductCategory.get_or_none(id=category_id, deleted=0) is None:
        raise BizException(ErrorCode.A010001, "历史版本关联的产品分类不存在")
    for field in revision_services.PRODUCT_FIELDS:
        if field in snapshot:
            value = snapshot[field]
            if field == "published_at" and value:
                value = datetime.fromisoformat(value)
            setattr(product, field, value)
    product.updated_by = operator or None
    await product.save()
    await update_search_vector("t_product", product.id, "title", "summary", "content_html")
    await revision_services.record_revision(product, "product", "RESTORE", operator)
    await _invalidate_product_content(old_slug, product.slug)
    return await get_product_detail_admin(product.slug)


async def get_product_preview(product_id: int) -> ProductDetailVO:
    product = await Product.get_or_none(id=product_id, deleted=0)
    if product is None:
        raise BizException(ErrorCode.A010001)
    await product.fetch_related("category", "galleries", "attributes")
    return ProductDetailVO.from_model(product, product.galleries, product.attributes)


@transactional_write
async def publish_due_products() -> int:
    now = datetime.now(UTC)
    due = await Product.filter(
        deleted=0, status=ProductStatus.SCHEDULED.value, published_at__lte=now
    ).order_by("id").limit(100).values_list("id", "slug")
    published = 0
    for product_id, slug in due:
        changed = await Product.filter(
            id=product_id, deleted=0, status=ProductStatus.SCHEDULED.value, published_at__lte=now
        ).update(status=ProductStatus.PUBLISHED.value)
        if changed:
            product = await Product.get(id=product_id)
            await revision_services.record_revision(product, "product", "PUBLISH", "scheduler")
            await _invalidate_product_content(slug)
            published += 1
    return published
