"""依赖注入（Shared Kernel，§3.4 / §3.5 / §7.2）。

设计约束：
- ``get_current_user``：校验 ``Authorization: Bearer``，缺失/过期/黑名单/禁用 → C401001/C403001。
- ``require_permission(code)``：在已登录基础上校验 RBAC 权限码，无权限 → C403001(A050003)。
- 权限经 Redis 缓存 ``auth:perm:{uid}``（TTL=access_token_ttl），无 Redis 时直查 PG（BD-03 降级）。
- ``get_settings``：注入全局配置。
"""
from __future__ import annotations

import hashlib
import hmac
import json

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from common.config import settings
from common.exceptions import BizException, ErrorCode
from common.jwt import decode_token, is_revoked
from common.redis_client import get_redis

# 避免循环依赖：直接引用模型，不引用 content.services
from content.models import AdminUser, RolePermission

_bearer = HTTPBearer(auto_error=False)


async def get_settings():
    """注入全局 Settings。"""
    return settings


def _client_ip(request: Request) -> str:
    return request.scope.get("client_ip", "unknown")


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AdminUser:
    """解析并校验 JWT，返回当前管理员。失败抛 BizException。"""
    if creds is None or not creds.credentials:
        raise BizException(ErrorCode.C401001)
    try:
        payload = decode_token(creds.credentials)
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
    if user.status != "ENABLED":
        # 禁用/锁定账号禁止操作
        raise BizException(ErrorCode.C403001, "账号已被禁用或锁定")
    return user


# ── F-05：RBAC 权限缓存 HMAC 签名（防共享 Redis 被篡改注入权限）──
def _sign_perms(perms: list[str]) -> str:
    body = json.dumps(perms, separators=(",", ":"), ensure_ascii=False)
    key = (settings.jwt_secret or "dev-insecure-default").encode("utf-8")
    sig = hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{sig}:{body}"


def _verify_perms(signed: str) -> list[str] | None:
    try:
        sig, _, body = signed.partition(":")
        if not sig or not body:
            return None
        key = (settings.jwt_secret or "dev-insecure-default").encode("utf-8")
        expected = hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected):
            return json.loads(body)
    except Exception:  # noqa: BLE001
        return None
    return None


async def get_user_permissions(user: AdminUser) -> list[str]:
    """获取用户权限码（带 HMAC 签名缓存，security-audit F-05）。"""
    redis = get_redis()
    cache_key = f"auth:perm:{user.id}"
    try:
        cached = await redis.get(cache_key)
        if cached:
            verified = _verify_perms(cached)
            if verified is not None:
                return verified
    except Exception:  # noqa: BLE001
        pass

    role = await user.role
    if role is None:
        perms: list[str] = []
    else:
        perms = list(
            await RolePermission.filter(role_id=role.id).values_list(
                "permission_code", flat=True
            )
        )
    try:
        await redis.setex(cache_key, settings.access_token_ttl, _sign_perms(perms))
    except Exception:  # noqa: BLE001
        pass
    return perms


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
