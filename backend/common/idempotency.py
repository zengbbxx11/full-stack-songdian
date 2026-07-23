"""幂等去重（Shared Kernel，§3.5.2）。

设计约束：
- 写入类（POST 创建）建议用 Header ``X-Idempotency-Key``（UUID）。
- 询盘等邮件/通知类强制用业务侧 ``biz_req_no``。
- 底层用 Redis ``SETNX``（TTL 24h）占位；无 Redis 时退化为内存实现。
- ``acquire(key)`` 返回 ``True`` 表示首次（已占位），``False`` 表示重复，由调用方决定
  是抛错（创建类）还是返回首次结果（询盘类）。
"""
from __future__ import annotations

from fastapi import Header

from common.redis_client import get_redis

IDEMPOTENCY_TTL = 86400  # 24h


async def acquire_idempotency(key: str, ttl: int = IDEMPOTENCY_TTL) -> bool:
    """占位并判断是否首次。True=首次；False=重复。"""
    redis = get_redis()
    full_key = f"idem:{key}"
    try:
        return bool(await redis.set(full_key, "1", ex=ttl, nx=True))
    except Exception as exc:  # noqa: BLE001
        # Redis 异常时退化为放行（不阻断主链路）
        from common.logger import get_logger

        get_logger(__name__).warning("幂等占位失败（降级放行）：%s", exc)
        return True


async def release_idempotency(key: str) -> None:
    redis = get_redis()
    try:
        await redis.delete(f"idem:{key}")
    except Exception:  # noqa: BLE001
        pass


async def idempotency_key_dependency(
    x_idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
) -> str | None:
    """FastAPI 依赖：从 Header 读取幂等键（可选）。缺失返回 None。"""
    return x_idempotency_key
