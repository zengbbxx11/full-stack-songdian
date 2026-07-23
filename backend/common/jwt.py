"""JWT 工具（Shared Kernel，CRED-02 / §7.2.1）。

设计约束：
- 签发/校验 access(2h)/refresh(7d)，HS256，含 ``jti`` 与 ``fid``（令牌族）。
- 黑名单查 ``auth:black:{jti}``（登出后短期失效）；令牌族黑名单查 ``auth:family:{fid}``
  （登出/刷新轮换时使该族全部令牌失效）。
- 禁用 ``alg=none``（仅允许配置的 HS256）。
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import jwt

from common.config import settings
from common.logger import get_logger
from common.redis_client import get_redis

logger = get_logger(__name__)


def _now() -> int:
    return int(datetime.now(UTC).timestamp())


def _create_token(
    subject: str,
    scope: str,
    ttl: int,
    extra: dict[str, Any] | None = None,
    fid: str | None = None,
) -> str:
    """生成 JWT。

    Args:
        subject: 主题（通常是用户 id 字符串）。
        scope: 令牌用途（access / refresh）。
        ttl: 有效期（秒）。
        extra: 额外载荷（如 username / roles / permissions）。
        fid: 令牌族 id；不传则自动生成。同一次登录/刷新签发的
             access 与 refresh 共用同一 ``fid``，以支持令牌族吊销。
    """
    now = _now()
    token_fid = fid or uuid.uuid4().hex
    payload: dict[str, Any] = {
        "sub": subject,
        "scope": scope,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + ttl,
        "fid": token_fid,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def create_access_token(
    user_id: int,
    username: str,
    roles: list[str],
    permissions: list[str],
    fid: str | None = None,
) -> str:
    """签发 access token（2h）。``fid`` 与对应 refresh 共用以支持令牌族吊销。"""
    return _create_token(
        subject=str(user_id),
        scope="access",
        ttl=settings.access_token_ttl,
        extra={"username": username, "roles": roles, "permissions": permissions},
        fid=fid,
    )


def create_refresh_token(
    user_id: int,
    username: str,
    fid: str | None = None,
) -> str:
    """签发 refresh token（7d）。``fid`` 与对应 access 共用以支持令牌族吊销。"""
    return _create_token(
        subject=str(user_id),
        scope="refresh",
        ttl=settings.refresh_token_ttl,
        extra={"username": username},
        fid=fid,
    )


def decode_token(token: str) -> dict[str, Any]:
    """校验并解析 token；非法/过期/算法不符均抛 ``jwt`` 异常。"""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_alg],  # 仅允许配置算法，禁用 none
    )


async def revoke_token(jti: str, ttl: int) -> None:
    """将 jti 加入黑名单（登出）。"""
    redis = get_redis()
    try:
        await redis.setex(f"auth:black:{jti}", ttl, "1")
    except Exception as exc:  # noqa: BLE001
        logger.warning("写入 JWT 黑名单失败（降级忽略）：%s", exc)


async def revoke_family(fid: str, ttl: int | None = None) -> None:
    """将令牌族 fid 加入黑名单（登出/刷新轮换），使该族全部令牌失效。

    Redis 不可用时降级忽略（与 revoke_token 行为一致），不阻断主流程。
    """
    if not fid:
        return
    redis = get_redis()
    expire = ttl if ttl is not None else settings.refresh_token_ttl
    try:
        await redis.setex(f"auth:family:{fid}", expire, "1")
    except Exception as exc:  # noqa: BLE001
        logger.warning("写入令牌族黑名单失败（降级忽略）：%s", exc)


async def is_revoked(jti: str, fid: str | None = None) -> bool:
    """jti 是否已在黑名单；若提供 fid 则同时检查令牌族（任一命中即视为吊销）。"""
    redis = get_redis()
    try:
        if fid and await redis.exists(f"auth:family:{fid}"):
            return True
        return bool(await redis.exists(f"auth:black:{jti}"))
    except Exception:  # noqa: BLE001
        # security-audit F-07：Redis 不可用时按安全策略 fail-closed（默认拒绝已吊销校验）。
        return settings.security_fail_closed


async def is_family_revoked(fid: str) -> bool:
    """令牌族 fid 是否已被吊销（刷新轮换/登出后旧 refresh 立即失效）。"""
    if not fid:
        return False
    redis = get_redis()
    try:
        return bool(await redis.exists(f"auth:family:{fid}"))
    except Exception:  # noqa: BLE001
        # security-audit F-07：Redis 不可用时 fail-closed，拒绝刷新轮换。
        return settings.security_fail_closed


def get_jti(token: str) -> str | None:
    """从 token 中读出 jti（不校验签名，用于登出）。"""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_alg], options={"verify_exp": False}
        )
        return payload.get("jti")
    except Exception:  # noqa: BLE001
        return None
