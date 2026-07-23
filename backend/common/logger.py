"""结构化日志（Shared Kernel）。

约定（§8.2 + §5 全局数据约定）：
- 日志注入 ``traceId`` 与单租户常量 ``tenantId=songdian``。
- 严禁打印密钥（JWT_SECRET / SMTP_PASSWORD / 数据库口令）。
"""
from __future__ import annotations

import logging
import sys
import uuid
from contextvars import ContextVar

from common.config import settings

# 请求级上下文：traceId（由中间件注入），用于跨函数串联。
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="-")


def new_trace_id() -> str:
    """生成新的 traceId。"""
    return uuid.uuid4().hex


def set_trace_id(trace_id: str) -> None:
    trace_id_var.set(trace_id)


def get_trace_id() -> str:
    return trace_id_var.get()


class TraceFilter(logging.Filter):
    """为每条日志记录追加 traceId 与 tenantId。"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.traceId = get_trace_id()  # type: ignore[attr-defined]
        record.tenantId = settings.tenant_id  # type: ignore[attr-defined]
        return True


def get_logger(name: str) -> logging.Logger:
    """返回带 traceId/tenantId 上下文的 logger。"""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        fmt = (
            "%(asctime)s %(levelname)s %(name)s "
            "traceId=%(traceId)s tenantId=%(tenantId)s %(message)s"
        )
        handler.setFormatter(logging.Formatter(fmt))
        handler.addFilter(TraceFilter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger
