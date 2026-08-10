"""请求中间件（Shared Kernel，§8.2 / §3.5.5）。

设计约束：
- 注入/透传 ``traceId``（来自 traceparent / X-Request-Id，缺失则生成）。
- 解析真实客户端 IP（X-Forwarded-For，TLS 已在 OpenResty 终结）。
- 单租户常量 ``tenantId=songdian`` 透传至日志上下文。
- CORS 由 ``main.py`` 的 CORSMiddleware 负责，本中间件只做 trace/IP。
"""
from __future__ import annotations

import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from common.config import settings
from common.exceptions import BizException, ErrorCode
from common.logger import get_logger, new_trace_id, set_trace_id
from common.ratelimit import api_rate_limit
from common.result import Result

logger = get_logger(__name__)

_TRACE_PARENT_RE = re.compile(r"^([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{16})")


def get_client_ip(request: Request) -> str:
    """取真实客户端 IP。

    security-audit F-06：仅当直连来源位于 ``trusted_proxies`` 受信代理列表时，
    才采纳 ``X-Forwarded-For`` 的首个 IP；否则忽略 XFF，使用真实直连 IP，
    避免客户端伪造 XFF 绕过 IP 限流/审计。
    """
    direct_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return direct_ip
    # 仅当直连来源位于受信代理列表时，才采纳 XFF 首个 IP；否则使用真实直连 IP。
    if settings.trusted_proxy_list and direct_ip in settings.trusted_proxy_list:
        return forwarded.split(",")[0].strip()
    return direct_ip


class TraceMiddleware(BaseHTTPMiddleware):
    """为每次请求设置 traceId 与客户端 IP。"""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # 1) 解析 traceId
        trace_id = (
            request.headers.get("traceparent")
            or request.headers.get("X-Request-Id")
            or request.headers.get("x-trace-id")
        )
        if not trace_id or not _TRACE_PARENT_RE.match(trace_id):
            trace_id = new_trace_id()
        set_trace_id(trace_id)

        # 2) 透传真实 IP 到 scope，供 deps/audit 使用
        request.scope["client_ip"] = get_client_ip(request)
        request.scope["tenant_id"] = settings.tenant_id

        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        response.headers["X-Tenant-Id"] = settings.tenant_id
        # security-audit F-15：基础安全响应头（含 /uploads 静态资源）。
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline'; script-src 'self'"
        )
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


class ApiSecurityMiddleware(BaseHTTPMiddleware):
    """在路由前执行 API 限流，并拒绝不受信任来源的后台写请求。"""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/v1/"):
            try:
                await api_rate_limit(request)
            except BizException as exc:
                return JSONResponse(
                    status_code=429,
                    content=Result.fail(exc.code, exc.msg).model_dump(mode="json"),
                )

        # 浏览器对跨站 unsafe 请求会携带 Origin；缺失 Origin 保留给同机运维与测试客户端。
        if path.startswith("/api/v1/admin/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if origin and origin not in settings.cors_origin_list:
                return JSONResponse(
                    status_code=403,
                    content=Result.fail(ErrorCode.C403001, "不受信任的请求来源").model_dump(mode="json"),
                )
        return await call_next(request)
