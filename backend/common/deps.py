"""依赖注入（Shared Kernel，§3.4 / §3.5 / §7.2）。

设计约束：
- ``get_current_user``：校验 HttpOnly ``access_token`` Cookie，缺失/过期/黑名单/禁用 → C401001/C403001。
- ``require_permission(code)``：在已登录基础上校验 RBAC 权限码，无权限 → C403001(A050003)。
- 权限从数据库读取，避免撤权与缓存回填竞争导致旧权限复活。
- ``get_settings``：注入全局配置。
"""
from __future__ import annotations

from fastapi import Depends, Request

from common.config import settings
from common.exceptions import BizException, ErrorCode
from common.jwt import decode_token, is_revoked

# 避免循环依赖：直接引用模型，不引用 content.services
from content.models import AdminUser, RolePermission

async def get_settings():
    """注入全局 Settings。"""
    return settings


def _client_ip(request: Request) -> str:
    return request.scope.get("client_ip", "unknown")


async def get_current_user(
    request: Request,
) -> AdminUser:
    """解析并校验 HttpOnly access Cookie，返回当前管理员。"""
    token = request.cookies.get("access_token")
    if not token:
        raise BizException(ErrorCode.C401001)
    try:
        payload = decode_token(token)
    except Exception:  # noqa: BLE001
        # 不向上透出原始解码错误（避免泄露 token 细节），统一为未鉴权。
        raise BizException(ErrorCode.C401001) from None

    if payload.get("scope") != "access":
        raise BizException(ErrorCode.C401001)
    jti = payload.get("jti")
    fid = payload.get("fid")
    # 同时检查 jti 黑名单与令牌族黑名单（登出/刷新轮换后该族令牌立即失效）
    if jti and await is_revoked(jti, fid):
        raise BizException(ErrorCode.C401001)

    user = await AdminUser.get_or_none(id=int(payload["sub"]))
    if user is None:
        raise BizException(ErrorCode.C401001)
    if payload.get("sv", 0) != user.session_version:
        raise BizException(ErrorCode.C401001)
    if user.status != "ENABLED":
        # 禁用/锁定账号禁止操作
        raise BizException(ErrorCode.C403001, "账号已被禁用或锁定")
    return user


async def get_user_permissions(user: AdminUser) -> list[str]:
    """Read current grants from DB: revocations cannot race with cached permission fills."""
    return list(await RolePermission.filter(role_id=user.role_id).values_list("permission_code", flat=True))


def require_permission(code: str):
    """依赖工厂：要求当前用户具备指定权限码。"""

    async def _dep(user: AdminUser = Depends(get_current_user)) -> AdminUser:
        perms = await get_user_permissions(user)
        if code not in perms:
            raise BizException(ErrorCode.C403001, "无权限操作")
        return user

    return _dep


def optional_permission(code: str):
    """依赖工厂：返回当前用户是否具备某权限（不抛异常，供发布门禁等降级判断，F-11）。"""
    async def _dep(user: AdminUser = Depends(get_current_user)) -> bool:
        return code in await get_user_permissions(user)
    return _dep


async def get_client_ip_dep(request: Request) -> str:
    """路由依赖：返回真实客户端 IP。"""
    return _client_ip(request)
