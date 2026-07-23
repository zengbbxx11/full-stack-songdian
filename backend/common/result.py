"""统一返回结构（Shared Kernel）。

设计约束（§3.2.1 / §3.5.1 / §5）：
- 所有接口返回 ``Result{code, msg, msgI18n, data, traceId, timestamp}``。
- 成功 code 统一为 ``"0"``；业务失败用 ``A0xxxxx``，客户端错误 ``C4xxxxx``，系统 ``B999001``。
- 分页用 ``PageRequest`` / ``PageResponse``。
"""
from __future__ import annotations

import builtins
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from common.logger import get_trace_id


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _trace() -> str:
    return get_trace_id()


class Result(BaseModel):
    """统一返回结构。"""
    code: str = "0"
    msg: str = "ok"
    msgI18n: dict = Field(default_factory=dict)
    data: Any | None = None
    traceId: str = ""
    timestamp: str = ""

    @classmethod
    def ok(cls, data: Any = None, msg: str = "ok") -> Result:
        return cls(
            code="0",
            msg=msg,
            data=data,
            traceId=_trace(),
            timestamp=_now_iso(),
        )

    @classmethod
    def fail(
        cls,
        code: str,
        msg: str,
        msg_i18n: dict | None = None,
        data: Any = None,
    ) -> Result:
        return cls(
            code=code,
            msg=msg,
            msgI18n=msg_i18n or {},
            data=data,
            traceId=_trace(),
            timestamp=_now_iso(),
        )


# ───────────────────────── 分页 ─────────────────────────
class PageRequest(BaseModel):
    """分页请求（查询参数绑定）。"""
    page: int = 1
    page_size: int = 20
    order_by: str = "sort_order"  # 默认按商家拖拽顺序（Tortoise order_by 仅支持单字段，如需多字段在 service 层自行拆分）

    @property
    def offset(self) -> int:
        return max(self.page - 1, 0) * self.limit

    @property
    def limit(self) -> int:
        return min(self.page_size, 50)  # 上限 50（搜索 50，列表 20）


class PageResponse(BaseModel):
    """分页响应。"""
    list: builtins.list[Any] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20

    @classmethod
    def build(cls, items: builtins.list[Any], total: int, req: PageRequest) -> PageResponse:
        return cls(list=items, total=total, page=req.page, page_size=req.limit)
