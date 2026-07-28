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

from tortoise.functions import Max

from common.enums import ProductStatus
from common.exceptions import BizException, ErrorCode
from common.html_cleaner import clean_html, clean_text
from common.redis_client import cache_key, get_redis
from common.result import PageRequest
from common.search_vector import update_search_vector
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
    ReorderReq,
)
from tortoise.transactions import in_transaction

# sort_order 允许范围（security-audit F-18）：拒绝 NaN/非有限/极端值
SORT_ORDER_MIN = -1_000_000.0
SORT_ORDER_MAX = 1_000_000.0

DETAIL_TTL = 300  # 5min


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


async def list_categories() -> list[CategoryVO]:
    cats = await ProductCategory.filter(deleted=0).order_by("sort_order", "id")
    return [CategoryVO.from_model(c) for c in cats]


async def list_products(
    req: PageRequest,
    category_id: int | None = None,
    status: str | None = None,
    keyword: str | None = None,
) -> tuple[list[ProductPageVO], int]:
    q = Product.filter(deleted=0)
    if category_id is not None:
        q = q.filter(category_id=category_id)
    if status is not None:
        q = q.filter(status=status)
    if keyword:
        q = q.filter(title__icontains=keyword)
    total = await q.count()
    rows = await q.order_by("sort_order", "-created_time").offset(req.offset).limit(req.limit).prefetch_related("category")
    return [ProductPageVO.from_model(r) for r in rows], total


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


async def create_product(
    data: ProductCreateRequest, operator: str = "", can_publish: bool = True
) -> ProductDetailVO:
    if await ProductCategory.get_or_none(id=data.category_id, deleted=0) is None:
        raise BizException(ErrorCode.A010001, "产品分类不存在")
    if await Product.get_or_none(slug=data.slug, deleted=0) is not None:
        raise BizException(ErrorCode.A010002)
    # security-audit F-11：无发布权限时，禁止直接置为 PUBLISHED（降级为 DRAFT）。
    status = data.status
    if status == ProductStatus.PUBLISHED.value and not can_publish:
        status = ProductStatus.DRAFT.value
    cleaned = clean_html(data.content_html)
    # security-audit F-01：标题/摘要作为纯文本清洗，杜绝内嵌 HTML/脚本。
    # 创建包事务保证原子性；注意 update_search_vector 使用原生 execute_query，
    # 不能置于 in_transaction() 内（asyncpg 会重置连接），故放在事务提交之后。
    async with in_transaction():
        product = await Product.create(
            slug=data.slug,
            title=clean_text(data.title),
            summary=clean_text(data.summary),
            content_html=cleaned,
            category_id=data.category_id, sku=data.sku, price=data.price, currency=data.currency,
            stock_status=data.stock_status, status=status, tags=data.tags,
            created_by=operator or None, updated_by=operator or None,
        )
    await update_search_vector("t_product", product.id, "title", "summary", "content_html")
    await _cache_del_detail(data.slug)
    return await get_product_detail_admin(data.slug)


async def update_product(
    product_id: int, data: ProductUpdateRequest, operator: str = "", can_publish: bool = True
) -> ProductDetailVO:
    product = await Product.get_or_none(id=product_id, deleted=0)
    if product is None:
        raise BizException(ErrorCode.A010001)
    if data.category_id is not None and await ProductCategory.get_or_none(id=data.category_id, deleted=0) is None:
        raise BizException(ErrorCode.A010001, "产品分类不存在")
    if data.slug is not None and data.slug != product.slug:
        if await Product.get_or_none(slug=data.slug, deleted=0) is not None:
            raise BizException(ErrorCode.A010002)
    # security-audit F-18：sort_order 范围校验（拒绝 NaN / 非有限 / 极端值）。
    if data.sort_order is not None:
        if not isinstance(data.sort_order, (int, float)) or not math.isfinite(data.sort_order):
            raise BizException(ErrorCode.A010001, "sort_order 必须为有限数值")
        if data.sort_order < SORT_ORDER_MIN or data.sort_order > SORT_ORDER_MAX:
            raise BizException(ErrorCode.A010001, "sort_order 超出允许范围")
    for field in ["title", "summary", "slug", "category_id", "sku", "price", "currency", "stock_status", "status", "tags", "sort_order"]:
        val = getattr(data, field)
        if val is not None:
            # security-audit F-01：标题/摘要作为纯文本清洗。
            if field in ("title", "summary"):
                val = clean_text(val)
            # security-audit F-11：无发布权限时禁止改为 PUBLISHED。
            if field == "status" and val == ProductStatus.PUBLISHED.value and not can_publish:
                val = ProductStatus.DRAFT.value
            setattr(product, field, val)
    if data.content_html is not None:
        product.content_html = clean_html(data.content_html)
    product.updated_by = operator or None
    await product.save()
    await update_search_vector("t_product", product.id, "title", "summary", "content_html")
    await _cache_del_detail(product.slug)
    return await get_product_detail_admin(product.slug)


async def delete_product(product_id: int, operator: str = "") -> None:
    product = await Product.get_or_none(id=product_id, deleted=0)
    if product is None:
        raise BizException(ErrorCode.A010001)
    product.deleted = 1
    product.updated_by = operator or None
    await product.save()
    await _cache_del_detail(product.slug)


async def add_gallery(product_id: int, data: GalleryCreateRequest) -> GalleryVO:
    product = await Product.get_or_none(id=product_id, deleted=0)
    if product is None:
        raise BizException(ErrorCode.A010001)
    g = await ProductGallery.create(
        product_id=product_id, image_url=data.image_url, alt=data.alt, sort_order=data.sort_order
    )
    await _cache_del_detail(product.slug)
    return GalleryVO.from_model(g)


async def delete_gallery(product_id: int, gallery_id: int) -> None:
    """按 ID 删除相册图并清除缓存。"""
    g = await ProductGallery.get_or_none(id=gallery_id, product_id=product_id)
    if g is None:
        raise BizException(ErrorCode.A010001, msg="相册图不存在")
    product = await Product.get_or_none(id=product_id)
    slug = product.slug if product else None
    await g.delete()
    if slug:
        await _cache_del_detail(slug)


async def add_attribute(product_id: int, data: AttributeCreateRequest) -> AttributeVO:
    product = await Product.get_or_none(id=product_id, deleted=0)
    if product is None:
        raise BizException(ErrorCode.A010001)
    a = await ProductAttribute.create(
        product_id=product_id, name=data.name, slug=data.slug, value=data.value
    )
    await _cache_del_detail(product.slug)
    return AttributeVO.from_model(a)


async def delete_attribute(product_id: int, attr_id: int) -> None:
    """按 ID 删除产品属性并清除缓存。"""
    a = await ProductAttribute.get_or_none(id=attr_id, product_id=product_id)
    if a is None:
        raise BizException(ErrorCode.A010001, msg="属性不存在")
    product = await Product.get_or_none(id=product_id)
    slug = product.slug if product else None
    await a.delete()
    if slug:
        await _cache_del_detail(slug)


# ───────────────── 分类写/排序（T02）─────────────────

async def list_categories_page(req: PageRequest) -> tuple[list[CategoryVO], int]:
    """后台分类分页列表（已按 sort_order 排序）。"""
    q = ProductCategory.filter(deleted=0)
    total = await q.count()
    rows = await q.order_by("sort_order", "id").offset(req.offset).limit(req.limit)
    return [CategoryVO.from_model(r) for r in rows], total


async def _next_category_sort_order() -> int:
    """返回新分类的默认排序值（当前最大 + 1，空表为 0）。

    验证期发现：Tortoise 1.x 已移除 ``QuerySet.aggregate``，改用
    ``functions.Max`` + ``annotate``/``values`` 取全局最大值（逐行取 max 兜底）。
    """
    rows = await ProductCategory.filter(deleted=0).annotate(m=Max("sort_order")).values("m")
    max_order = max((r["m"] for r in rows), default=None)
    return (max_order or -1) + 1


async def create_category(data: CategoryCreate, operator: str = "") -> CategoryVO:
    if await ProductCategory.get_or_none(slug=data.slug, deleted=0) is not None:
        raise BizException(ErrorCode.A010001, "分类别名重复")
    sort_order = data.sort_order if data.sort_order is not None else await _next_category_sort_order()
    cat = await ProductCategory.create(name=data.name, slug=data.slug, sort_order=sort_order)
    return CategoryVO.from_model(cat)


async def update_category(category_id: int, data: CategoryUpdate, operator: str = "") -> CategoryVO:
    cat = await ProductCategory.get_or_none(id=category_id, deleted=0)
    if cat is None:
        raise BizException(ErrorCode.A010001, "分类不存在")
    if data.slug is not None and data.slug != cat.slug:
        if await ProductCategory.get_or_none(slug=data.slug, deleted=0) is not None:
            raise BizException(ErrorCode.A010001, "分类别名重复")
    for field in ["name", "slug", "sort_order"]:
        val = getattr(data, field)
        if val is not None:
            setattr(cat, field, val)
    await cat.save()
    return CategoryVO.from_model(cat)


async def delete_category(category_id: int, operator: str = "") -> None:
    # 软删（复用 SoftDeleteMixin 的 deleted 标记），与产品/新闻一致。
    cat = await ProductCategory.get_or_none(id=category_id, deleted=0)
    if cat is None:
        raise BizException(ErrorCode.A010001, "分类不存在")
    cat.deleted = 1
    await cat.save()


async def reorder_category(ids: list[int]) -> None:
    """按目标顺序数组回写 sort_order（数组索引即排序顺序）。

    security-audit F-17：包入事务，避免并发重排产生重复 sort 值。
    """
    async with in_transaction():
        for idx, cid in enumerate(ids):
            await ProductCategory.filter(id=cid, deleted=0).update(sort_order=idx)


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
