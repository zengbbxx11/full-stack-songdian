"""限流（Shared Kernel，§3.5.3）。

设计约束（阈值读 config）：
- 全局 QPS 500 / 单 IP 60 / 单用户 30；重保接口（登录）单 IP 10 次/分钟。
- 触发返回 C429001。无 Redis 时降级为进程内内存滑动窗口（仍可限流，仅不跨进程）。
- 全局限流用轻量内存滑动窗口（不依赖 Redis，避免主链路阻塞）。
"""
from __future__ import annotations

import asyncio
import time

from fastapi import Request

from common.config import settings
from common.exceptions import BizException, ErrorCode
from common.logger import get_logger
from common.redis_client import get_redis

logger = get_logger(__name__)


def _client_ip(request: Request) -> str:
    return request.scope.get("client_ip", "unknown")


# ── 全局内存滑动窗口 ──
class SlidingWindow:
    def __init__(self, max_count: int, window: float = 1.0) -> None:
        self.max = max_count
        self.window = window
        self.ts: list[float] = []
        self.lock = asyncio.Lock()

    async def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        async with self.lock:
            self.ts = [t for t in self.ts if t > cutoff]
            if len(self.ts) >= self.max:
                return False
            self.ts.append(now)
            return True


# 全局限流器单例
_global_limiter = SlidingWindow(settings.rate_global_qps)


async def global_rate_limit(request: Request) -> None:
    """全局 QPS 限流依赖（内存滑动窗口）。"""
    if not await _global_limiter.allow():
        raise BizException(ErrorCode.C429001)


async def ip_rate_limit(request: Request, limit: int | None = None) -> None:
    """单 IP 滑动窗口限流（Redis 计数降级内存）。"""
    ip = _client_ip(request)
    key = f"rl:ip:{ip}"
    max_count = limit or settings.rate_ip_qps
    redis = get_redis()
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 1)
        if count > max_count:
            raise BizException(ErrorCode.C429001)
    except BizException:
        raise
    except Exception as exc:  # noqa: BLE001
        # Redis 不可用时用内存兜底（仅单进程）
        logger.warning("IP 限流降级内存：%s", exc)
        await _memory_ip_allow(ip, max_count)


_memory_ips: dict[str, list[float]] = {}
_memory_lock = asyncio.Lock()


def _memory_sweep_expired(now: float) -> None:
    """回收所有过期缓冲并剔除空键（review #7）。IP 窗口 1s，登录窗口 60s。

    仅在被访问时剔除会漏掉长期无访问的 IP 键，故在写路径统一回收，
    避免 ``_memory_ips`` 随唯一 IP 数无限增长（内存泄漏）。
    """
    for k in list(_memory_ips.keys()):
        window = 60.0 if k.startswith("login:") else 1.0
        buf = _memory_ips[k]
        buf[:] = [t for t in buf if t > now - window]
        if not buf:
            _memory_ips.pop(k, None)


async def _memory_ip_allow(ip: str, max_count: int) -> None:
    now = time.monotonic()
    async with _memory_lock:
        # review #7：写时统一回收所有过期缓冲并剔除空键。
        _memory_sweep_expired(now)
        buf = _memory_ips.setdefault(ip, [])
        if len(buf) >= max_count:
            raise BizException(ErrorCode.C429001)
        buf.append(now)


async def login_rate_limit(request: Request) -> None:
    """登录重保限流：单 IP 10 次/分钟（Redis 计数，降级内存）。"""
    ip = _client_ip(request)
    key = f"login:rl:{ip}"
    redis = get_redis()
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 60)
        if count > settings.rate_login_per_min:
            raise BizException(ErrorCode.C429001)
    except BizException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("登录限流降级内存：%s", exc)
        await _memory_login_allow(ip)


async def _memory_login_allow(ip: str) -> None:
    now = time.monotonic()
    async with _memory_lock:
        # review #7：写时统一回收所有过期缓冲并剔除空键。
        _memory_sweep_expired(now)
        buf = _memory_ips.setdefault(f"login:{ip}", [])
        if len(buf) >= settings.rate_login_per_min:
            raise BizException(ErrorCode.C429001)
        buf.append(now)
