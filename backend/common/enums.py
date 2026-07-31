"""业务枚举（Shared Kernel）。

设计约束（§3.2.1 / §4.2）：状态枚举统一为 VARCHAR(30) 字符串，取值与设计 DDL 的
CHECK 约束一致。``BaseEnum`` 提供 ``values()`` 便捷方法。
"""
from __future__ import annotations

from enum import Enum


class BaseEnum(str, Enum):  # noqa: UP042  -- 设计为 str 枚举：值直接序列化为字符串入库/出参
    """枚举基类。"""

    @classmethod
    def values(cls) -> list[str]:
        return [e.value for e in cls]

    def __str__(self) -> str:  # 便于直接进 DB
        return self.value


class ProductStatus(BaseEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class StockStatus(BaseEnum):
    INSTOCK = "instock"
    OUTOFSTOCK = "outofstock"


class NewsStatus(BaseEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class InquiryStatus(BaseEnum):
    """询盘状态（2026-07-31 升级为 CRM 五态管线）。"""
    NEW = "NEW"
    CONTACTING = "CONTACTING"   # 已建立联系
    QUOTED = "QUOTED"           # ���报价
    DEAL = "DEAL"               # 成交
    LOST = "LOST"               # 丢单


class SmtpStatus(BaseEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    ERROR = "ERROR"


class AdminStatus(BaseEnum):
    ENABLED = "ENABLED"
    DISABLED = "DISABLED"
    LOCKED = "LOCKED"

