"""联合搜索 DTO/VO（M3，§3.2.M3.3）。

设计约束：字段与 §3.2.M3.3 / §4.4 对齐。
- SearchRequest：q（必填）、type（all/product/news）、page、page_size。
- SearchItemVO：id/kind/title/summary/slug/url/rank。
- SearchPageVO：items/total/took_ms + 降级标记（BD-01 基础检索）。
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from common.result import PageRequest


class SearchRequest(BaseModel):
    q: str = Field(..., min_length=1, max_length=100)
    type: str = "all"  # all / product / news
    page: int = 1
    page_size: int = 20

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in ("all", "product", "news"):
            raise ValueError("type 必须为 all/product/news")
        return v

    @field_validator("page_size")
    @classmethod
    def _page_size(cls, v: int) -> int:
        return min(max(v, 1), 50)


class SearchItemVO(BaseModel):
    id: int
    kind: str  # product / news
    title: str
    summary: str
    slug: str
    url: str
    rank: float = 0.0
    cover_image: str | None = None
    created_time: datetime | None = None


class SearchPageVO(BaseModel):
    items: list[SearchItemVO] = []
    total: int = 0
    took_ms: float = 0.0
    degraded: bool = False  # BD-01 基础检索标记
    note: str = ""


# 搜索请求可复用 PageRequest 的分页语义
SearchPageRequest = PageRequest
