"""新闻域 DTO/VO（M2，§3.2.M2.3）。

设计约束：字段与 §3.2.M2.3 / §4.2 DDL 对齐；content_html 经 bleach 清洗；
slug 唯一（^[a-z0-9-]+$）；status DRAFT/PUBLISHED。
"""
from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from common.enums import NewsStatus

_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


class NewsCreateRequest(BaseModel):
    title: str = Field(..., max_length=200)
    slug: str = Field(..., max_length=200)
    summary: str = Field(..., max_length=500)
    content_html: str
    category_id: int
    author: str | None = Field(default=None, max_length=100)
    published_at: datetime | None = None
    status: str = NewsStatus.PUBLISHED.value

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not _SLUG_RE.match(v):
            raise ValueError("slug 仅允许小写字母、数字与连字符")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in NewsStatus.values():
            raise ValueError("status 必须为 DRAFT/PUBLISHED")
        return v


class NewsUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    content_html: str | None = None
    category_id: int | None = None
    author: str | None = Field(default=None, max_length=100)
    published_at: datetime | None = None
    status: str | None = None
    sort_order: float | None = None
    cover_image: str | None = None
    version: int | None = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is not None and not _SLUG_RE.match(v):
            raise ValueError("slug 仅允许小写字母、数字与连字符")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in NewsStatus.values():
            raise ValueError("status 必须为 DRAFT/PUBLISHED")
        return v


class NewsCategoryVO(BaseModel):
    id: int
    name: str
    slug: str
    sort_order: int = 0

    @classmethod
    def from_model(cls, m) -> NewsCategoryVO:  # type: ignore[valid-type]
        return cls(id=m.id, name=m.name, slug=m.slug, sort_order=m.sort_order)


CategoryTreeVO = NewsCategoryVO


# ───────────────────────── 新闻分类写/排序 DTO（T02）─────────────────────────
class NewsCategoryCreate(BaseModel):
    """创建新闻分类。"""

    name: str = Field(..., max_length=100)
    slug: str = Field(..., max_length=100)
    sort_order: int | None = None  # 缺省时落到末尾


class NewsCategoryUpdate(BaseModel):
    """更新新闻分类（全字段可选）。"""

    name: str | None = None
    slug: str | None = None
    sort_order: int | None = None


class NewsCategoryReorderReq(BaseModel):
    """拖拽排序：按目标顺序传入新闻分类 id 数组。"""

    ids: list[int] = Field(default_factory=list)


class NewsPageVO(BaseModel):
    id: int
    slug: str
    title: str
    summary: str
    author: str | None = None
    category: NewsCategoryVO | None = None
    published_at: datetime | None = None
    status: str = "PUBLISHED"
    created_time: datetime | None = None
    cover_image: str | None = None
    sort_order: float = 0.0  # 排序权重，越小越靠前

    @classmethod
    def from_model(cls, m) -> NewsPageVO:  # type: ignore[valid-type]
        cat = NewsCategoryVO.from_model(m.category) if getattr(m, "category", None) else None
        return cls(
            id=m.id, slug=m.slug, title=m.title, summary=m.summary, author=m.author,
            category=cat, published_at=m.published_at, status=m.status,
            created_time=m.created_time, cover_image=m.cover_image, sort_order=m.sort_order,
        )


class NewsDetailVO(NewsPageVO):
    content_html: str = ""

    @classmethod
    def from_model(cls, m) -> NewsDetailVO:  # type: ignore[valid-type]
        base = NewsPageVO.from_model(m)
        data = base.model_dump()
        data["content_html"] = m.content_html
        return cls(**data)


NewsVO = NewsDetailVO
