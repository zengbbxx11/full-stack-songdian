"""Redis 客户端封装（Shared Kernel）。

设计约束（§5 / BD-03）：
- **优雅降级**：当 ``REDIS_URL`` 未配置、或连接失败/不可达时，自动降级为
  进程内内存字典实现，绝不因无 Redis 而导致导入失败或冒烟失败。
- 缓存/幂等/限流在无 Redis 时退化为内存实现或 no-op。

对外暴露 ``get_redis()`` 返回统一的异步接口 ``RedisLike``，
调用方无需关心底层是真实 Redis 还是内存。
"""
from __future__ import annotations

import asyncio
from typing import Any

from common.config import settings
from common.logger import get_logger

logger = get_logger(__name__)


def cache_key(*parts: str) -> str:
    """拼接缓存键，自动加环境前缀（避免多环境共用 Redis 串号）。

    用法：``cache_key("product", "detail", slug)`` →
    ``"{CACHE_KEY_PREFIX}:product:detail:{slug}"``（无前缀时省略前缀段）。
    """
    base = ":".join(str(p) for p in parts)
    prefix = settings.cache_key_prefix.strip()
    return f"{prefix}:{base}" if prefix else base


class RedisLike:
    """Redis 客户端统一异步接口（真实 Redis 与内存降级共用）。"""

    async def ping(self) -> bool: ...

    async def set(self, key: str, value: str, ex: int | None = None,
                  nx: bool = False) -> bool: ...

    async def setex(self, key: str, seconds: int, value: str) -> None: ...

    async def get(self, key: str) -> str | None: ...

    async def delete(self, *keys: str) -> int: ...

    async def exists(self, key: str) -> bool: ...

    async def incr(self, key: str) -> int: ...

    async def expire(self, key: str, seconds: int) -> bool: ...

    async def ttl(self, key: str) -> int: ...

    async def delete_prefix(self, prefix: str) -> int: ...


class MemoryBackend(RedisLike):
    """进程内内存降级实现（无 Redis 时使用）。

    注意：多进程/多副本场景下内存不共享，仅用于本地开发/测试/单机降级。
    """

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._expire_at: dict[str, float] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _now() -> float:
        # review #10：协程内必须用 get_running_loop，get_event_loop 已废弃。
        return asyncio.get_running_loop().time()

    async def _check_expire(self, key: str) -> None:
        """访问时清理单个过期键（read 路径惰性剔除）。"""
        exp = self._expire_at.get(key)
        if exp is not None and exp <= self._now():
            self._store.pop(key, None)
            self._expire_at.pop(key, None)

    async def _sweep_expired(self) -> None:
        """写时一次性清除所有已过期键（review #8）。

        避免未被访问的过期键常驻内存：仅在被访问时剔除会漏掉长期无访问的键，
        故在写路径统一回收，使内存占用有界。
        """
        now = self._now()
        expired = [k for k, exp in self._expire_at.items() if exp <= now]
        for k in expired:
            self._store.pop(k, None)
            self._expire_at.pop(k, None)

    async def ping(self) -> bool:
        return True

    async def set(self, key: str, value: str, ex: int | None = None,
                  nx: bool = False) -> bool:
        async with self._lock:
            await self._sweep_expired()
            if nx and key in self._store:
                return False
            self._store[key] = value
            if ex is not None:
                self._expire_at[key] = self._now() + ex
            else:
                self._expire_at.pop(key, None)
            return True

    async def setex(self, key: str, seconds: int, value: str) -> None:
        async with self._lock:
            await self._sweep_expired()
            self._store[key] = value
            self._expire_at[key] = self._now() + seconds

    async def get(self, key: str) -> str | None:
        async with self._lock:
            await self._check_expire(key)
            return self._store.get(key)

    async def delete(self, *keys: str) -> int:
        async with self._lock:
            count = 0
            for k in keys:
                if self._store.pop(k, None) is not None:
                    self._expire_at.pop(k, None)
                    count += 1
            return count

    async def exists(self, key: str) -> bool:
        async with self._lock:
            await self._check_expire(key)
            return key in self._store

    async def incr(self, key: str) -> int:
        async with self._lock:
            await self._check_expire(key)
            val = int(self._store.get(key, "0")) + 1
            self._store[key] = str(val)
            return val

    async def expire(self, key: str, seconds: int) -> bool:
        async with self._lock:
            if key in self._store:
                self._expire_at[key] = self._now() + seconds
                return True
            return False

    async def ttl(self, key: str) -> int:
        async with self._lock:
            exp = self._expire_at.get(key)
            if exp is None:
                return -1
            remaining = int(exp - self._now())
            return max(remaining, -2)

    async def delete_prefix(self, prefix: str) -> int:
        async with self._lock:
            keys = [key for key in self._store if key.startswith(prefix)]
            for key in keys:
                self._store.pop(key, None)
                self._expire_at.pop(key, None)
            return len(keys)


class RealRedisBackend(RedisLike):
    """真实 Redis 后端（redis.asyncio）。任意异常透明抛出，由上层降级处理。"""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def ping(self) -> bool:
        return bool(await self._client.ping())

    async def set(self, key: str, value: str, ex: int | None = None,
                  nx: bool = False) -> bool:
        return bool(await self._client.set(key, value, ex=ex, nx=nx))

    async def setex(self, key: str, seconds: int, value: str) -> None:
        await self._client.setex(key, seconds, value)

    async def get(self, key: str) -> str | None:
        val = await self._client.get(key)
        return val.decode() if isinstance(val, bytes) else val

    async def delete(self, *keys: str) -> int:
        return int(await self._client.delete(*keys))

    async def exists(self, key: str) -> bool:
        return bool(await self._client.exists(key))

    async def incr(self, key: str) -> int:
        return int(await self._client.incr(key))

    async def expire(self, key: str, seconds: int) -> bool:
        return bool(await self._client.expire(key, seconds))

    async def ttl(self, key: str) -> int:
        return int(await self._client.ttl(key))

    async def delete_prefix(self, prefix: str) -> int:
        count = 0
        batch: list[str] = []
        async for key in self._client.scan_iter(match=f"{prefix}*", count=200):
            batch.append(str(key))
            if len(batch) >= 200:
                count += int(await self._client.delete(*batch))
                batch.clear()
        if batch:
            count += int(await self._client.delete(*batch))
        return count


# 模块级单例
_redis: RedisLike | None = None


async def init_redis() -> RedisLike:
    """初始化 Redis 客户端；连接失败/未配置时降级为内存实现。"""
    global _redis
    if _redis is not None:
        return _redis

    if not settings.redis_url:
        if settings.redis_required:
            raise RuntimeError("REDIS_REQUIRED=true，但未配置 REDIS_URL")
        logger.warning("REDIS_URL 未配置，Redis 降级为进程内内存实现（BD-03 降级）")
        _redis = MemoryBackend()
        return _redis

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        # 探测连通性
        await client.ping()
        _redis = RealRedisBackend(client)
        logger.info("Redis 连接成功：%s", _redis_host_masked())
    except Exception as exc:  # noqa: BLE001 - 任何异常都降级
        if settings.redis_required:
            try:
                await client.aclose()
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError("Redis 为生产必需依赖，但当前不可用") from exc
        logger.warning("Redis 连接失败（%s），降级为内存实现", exc)
        _redis = MemoryBackend()
    return _redis


def _redis_host_masked() -> str:
    # 仅展示主机，避免泄露口令
    try:
        from urllib.parse import urlparse

        p = urlparse(settings.redis_url)
        return f"{p.scheme}://{p.hostname}:{p.port}"
    except Exception:  # noqa: BLE001
        return "redis://(masked)"


def get_redis() -> RedisLike:
    """返回 Redis 客户端（可能尚未 init，则惰性创建内存实例）。"""
    global _redis
    if _redis is None:
        # 未调用 init_redis 时的安全兜底（如单测未显式初始化）
        _redis = MemoryBackend()
    return _redis


def redis_is_distributed() -> bool:
    """当前是否连接真实 Redis，而不是单进程内存降级后端。"""
    return isinstance(_redis, RealRedisBackend)


async def close_redis() -> None:
    """释放真实 Redis 连接（内存实现无操作）。"""
    global _redis
    if isinstance(_redis, RealRedisBackend):
        try:
            await _redis._client.aclose()  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
    _redis = None
