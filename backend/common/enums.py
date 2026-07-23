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
    NEW = "NEW"
    REPLIED = "REPLIED"
    ARCHIVED = "ARCHIVED"


class SmtpStatus(BaseEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    ERROR = "ERROR"


class AdminStatus(BaseEnum):
    ENABLED = "ENABLED"
    DISABLED = "DISABLED"
    LOCKED = "LOCKED"


class MigrationBatchStatus(BaseEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"


class MigrationRecordStatus(BaseEnum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    SKIP = "SKIP"


class MigrationScope(BaseEnum):
    ALL = "all"
    PRODUCT = "product"
    NEWS = "news"
