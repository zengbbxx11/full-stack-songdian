"""审计装饰器（Shared Kernel，§3.4 / §7.2 / §8.2）。

设计约束：关键写操作经 ``@audit(action, resource)`` 异步写 ``t_audit_log``
（who/when/what/result/ip）。best-effort：审计写入失败不影响主流程。
"""
from __future__ import annotations

import functools
import inspect
import typing

from common.logger import get_logger

logger = get_logger(__name__)


def _resolve_user(kwargs: dict) -> tuple[int, str]:
    # 兼容各 router 对鉴权依赖的命名：current_user / user / _user（如 content/routers.py）。
    user = kwargs.get("current_user") or kwargs.get("user") or kwargs.get("_user")
    if user is not None:
        return getattr(user, "id", 0) or 0, getattr(user, "username", "anonymous") or "anonymous"
    return 0, "anonymous"


def _resolve_ip(kwargs: dict) -> str | None:
    request = kwargs.get("request") or kwargs.get("req") or kwargs.get("http_request")
    if request is not None:
        return request.scope.get("client_ip", "unknown")
    return "unknown"


def audit(action: str, resource: str):
    """装饰异步函数：执行后写审计日志。失败也记 FAIL。"""

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            user_id, username = _resolve_user(kwargs)
            ip = _resolve_ip(kwargs)
            result = "SUCCESS"
            try:
                retval = await func(*args, **kwargs)
                return retval
            except Exception as exc:  # noqa: BLE001
                result = "FAIL"
                raise exc
            finally:
                try:
                    # 资源描述支持 {name} 占位符，用端点参数格式化（如 role:{code}）；
                    # 占位符无法解析时保留原始模板字符串，不阻断审计写入。
                    formatted_resource = resource
                    try:
                        formatted_resource = resource.format(**kwargs)
                    except (KeyError, IndexError, ValueError):  # noqa: BLE001
                        pass
                    from content.models import AuditLog

                    await AuditLog.create(
                        user_id=user_id,
                        username=username,
                        action=action,
                        resource=formatted_resource,
                        result=result,
                        ip=ip,
                    )
                except Exception as log_exc:  # noqa: BLE001
                    logger.warning("审计日志写入失败（忽略）：%s", log_exc)

        # 关键：@audit 定义在本模块（common/audit.py），而端点定义在其它模块。
        # 若端点文件使用 ``from __future__ import annotations``，其注解为字符串，
        # FastAPI 经 __wrapped__ 解析注解时会到本模块全局变量查找（找不到 ProductCreateRequest
        # 等），从而把请求体/Request 误判为 query 参数。这里用端点自身的 __globals__
        # 解析真实注解并固化到 wrapper.__signature__，使 FastAPI 直接拿到真实类型。
        try:
            hints = typing.get_type_hints(func)
            sig = inspect.signature(func)
            new_params = [
                inspect.Parameter(
                    p.name,
                    p.kind,
                    annotation=hints.get(p.name, p.annotation),
                    default=p.default,
                )
                for p in sig.parameters.values()
            ]
            wrapper.__signature__ = inspect.Signature(
                new_params,
                return_annotation=hints.get("return", sig.return_annotation),
            )
        except Exception as sig_exc:  # noqa: BLE001
            logger.debug("固化审计装饰器签名失败（回退默认）：%s", sig_exc)

        return wrapper

    return decorator
