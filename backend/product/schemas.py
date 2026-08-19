"""产品域 DTO/VO（M1，§3.2.M1.3）。

设计约束：DTO 字段与 §3.2.M1.3 / §4.2 DDL 逐字对齐。
- slug 唯一，格式 ^[a-z0-9-]+$。
- status: DRAFT/PUBLISHED；stock_status: instock/outofstock。
- VO 提供 ``from_model`` 从 Tortoise 模型装配（含预取的分类/相册/规格）。
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from common.enums import ProductStatus, StockStatus

_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


class ProductCreateRequest(BaseModel):
    title: str = Field(..., max_length=200)
    slug: str = Field(..., max_length=200)
    summary: str = Field(..., max_length=500)
    content_html: str
    category_id: int
    sku: str | None = Field(default=None, max_length=100)
    price: Decimal | None = None
    currency: str = "CNY"
    stock_status: str = StockStatus.INSTOCK.value
    status: str = ProductStatus.DRAFT.value
    published_at: datetime | None = None
    cover_image: str | None = Field(default=None, max_length=500)
    # tags：标签名数组，如 ["OEM", "4K", "Waterproof"]；缺省空数组（T04）。
    tags: list[str] = []
    # SEO 字段（可选，空则回退系统默认值）
    seo_title: str | None = Field(default=None, max_length=120, description="页面标题（推荐 ~60 字符）")
    seo_description: str | None = Field(default=None, max_length=300, description="Meta 描述（推荐 120-160 字符）")

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not _SLUG_RE.match(v):
            raise ValueError("slug 仅允许小写字母、数字与连字符")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ProductStatus.values():
            raise ValueError("status 必须为 DRAFT/SCHEDULED/PUBLISHED")
        return v

    @field_validator("stock_status")
    @classmethod
    def _stock(cls, v: str) -> str:
        if v not in StockStatus.values():
            raise ValueError("stock_status 必须为 instock/outofstock")
        return v


class ProductUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    content_html: str | None = None
    category_id: int | None = None
    sku: str | None = Field(default=None, max_length=100)
    price: Decimal | None = None
    currency: str | None = None
    stock_status: str | None = None
    status: str | None = None
    published_at: datetime | None = None
    cover_image: str | None = Field(default=None, max_length=500)
    sort_order: float | None = None
    # tags：编辑时整体覆盖（T04）。缺省空数组。
    tags: list[str] = []
    # SEO 字段（传 null / 不传则清空该字段，回退系统默认值）
    seo_title: str | None = Field(default=None, max_length=120)
    seo_description: str | None = Field(default=None, max_length=300)
    version: int | None = None  # 乐观锁占位（当前以 id 为主键）

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is not None and not _SLUG_RE.match(v):
            raise ValueError("slug 仅允许小写字母、数字与连字符")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in ProductStatus.values():
            raise ValueError("status 必须为 DRAFT/SCHEDULED/PUBLISHED")
        return v

    @field_validator("stock_status")
    @classmethod
    def _stock(cls, v: str | None) -> str | None:
        if v is not None and v not in StockStatus.values():
            raise ValueError("stock_status 必须为 instock/outofstock")
        return v


class GalleryCreateRequest(BaseModel):
    image_url: str = Field(..., max_length=500)
    alt: str | None = Field(default=None, max_length=200)
    sort_order: int = 0


class AttributeCreateRequest(BaseModel):
    name: str = Field(..., max_length=100)
    slug: str = Field(..., max_length=100)
    value: str = Field(..., max_length=500)


# ───────────────────────── VO ─────────────────────────
class CategoryVO(BaseModel):
    id: int
    name: str
    slug: str
    sort_order: float = 0.0
    product_count: int = 0

    @classmethod
    def from_model(cls, m, product_count: int = 0) -> CategoryVO:  # type: ignore[valid-type]
        return cls(id=m.id, name=m.name, slug=m.slug, sort_order=m.sort_order, product_count=product_count)


CategoryTreeVO = CategoryVO  # 分类为单级，树即扁平列表


# ───────────────────────── 分类写/排序 DTO（T02）─────────────────────────
class CategoryCreate(BaseModel):
    """创建产品分类。"""

    name: str = Field(..., max_length=100)
    slug: str = Field(..., max_length=100)
    sort_order: float | None = None  # 缺省时落到末尾


class CategoryUpdate(BaseModel):
    """更新产品分类（全字段可选）。"""

    name: str | None = None
    slug: str | None = None
    sort_order: float | None = None


class ReorderReq(BaseModel):
    """拖拽排序：按目标顺序传入分类 id 数组。"""

    ids: list[int] = Field(default_factory=list)


class GalleryVO(BaseModel):
    id: int
    image_url: str
    alt: str | None = None
    sort_order: int = 0

    @classmethod
    def from_model(cls, m) -> GalleryVO:  # type: ignore[valid-type]
        return cls(id=m.id, image_url=m.image_url, alt=m.alt, sort_order=m.sort_order)


class AttributeVO(BaseModel):
    id: int
    name: str
    slug: str
    value: str

    @classmethod
    def from_model(cls, m) -> AttributeVO:  # type: ignore[valid-type]
        return cls(id=m.id, name=m.name, slug=m.slug, value=m.value)


class ProductPageVO(BaseModel):
    id: int
    slug: str
    title: str
    summary: str
    sku: str | None = None
    price: Decimal | None = None
    currency: str = "CNY"
    stock_status: str = "instock"
    status: str = "DRAFT"
    published_at: datetime | None = None
    category: CategoryVO | None = None
    created_time: datetime | None = None
    updated_time: datetime | None = None
    cover_image: str | None = None
    sort_order: float = 0.0
    # tags: 标签名字符串数组，如 ["OEM", "4K", "Waterproof"]；与模型字段同名
    tags: list[str] = []
    # SEO 字段（2026-07-31 新增）
    seo_title: str | None = None
    seo_description: str | None = None

    @classmethod
    def from_model(cls, m) -> ProductPageVO:  # type: ignore[valid-type]
        cat = CategoryVO.from_model(m.category) if getattr(m, "category", None) else None
        return cls(
            id=m.id, slug=m.slug, title=m.title, summary=m.summary, sku=m.sku,
            price=m.price, currency=m.currency, stock_status=m.stock_status,
            status=m.status, category=cat,
            published_at=getattr(m, "published_at", None),
            created_time=m.created_time, updated_time=m.updated_time,
            cover_image=m.cover_image,
            sort_order=m.sort_order,
            # DB 为 NULL 时兜底空数组，避免向展示层返回 None
            tags=m.tags or [],
            # SEO 字段透传（NULL 即 None，前端做回退）
            seo_title=getattr(m, "seo_title", None),
            seo_description=getattr(m, "seo_description", None),
        )


class ProductDetailVO(ProductPageVO):
    content_html: str = ""
    galleries: list[GalleryVO] = []
    attributes: list[AttributeVO] = []

    @classmethod
    def from_model(cls, m, galleries=None, attributes=None) -> ProductDetailVO:  # type: ignore[valid-type]
        base = ProductPageVO.from_model(m)
        data = base.model_dump()
        data["content_html"] = m.content_html
        data["galleries"] = [GalleryVO.from_model(g) for g in (galleries or [])]
        data["attributes"] = [AttributeVO.from_model(a) for a in (attributes or [])]
        return cls(**data)


# 列表/详情统一以 ProductVO 暴露（detail 含相册与规格）
ProductVO = ProductDetailVO
