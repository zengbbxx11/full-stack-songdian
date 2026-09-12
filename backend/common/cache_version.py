"""内容缓存版本号（P2-13）。

问题：详情读采用「查库后回填缓存」，写采用「提交后删除缓存」，两者无版本检查。
旧请求可能在删除完成后才回填旧数据，导致撤回/修改后的内容仍被公开（产品详情 TTL 1h）。

方案：读取详情前取版本快照，构造 VO 后复读版本；版本变化则放弃回填。
写入失效时递增版本：
- slug 级：单个内容变更；
- 资源级：分类变更等影响全部详情的批次失效。

版本号仅用于优化一致性，Redis 不可用时静默退化为"无版本校验"，绝不阻断业务。
"""
from __future__ import annotations

from common.redis_client import cache_key, get_redis

_VERSION_TTL = 24 * 3600


def _slug_key(resource: str, slug: str) -> str:
    return cache_key(resource, "ver", "detail", slug or "")


def _resource_key(resource: str) -> str:
    return cache_key(resource, "ver", "all")


async def _read(key: str) -> str:
    try:
        return await get_redis().get(key) or "0"
    except Exception:  # noqa: BLE001
        return "0"


async def _bump(key: str) -> None:
    try:
        await get_redis().increment_with_expiry(key, _VERSION_TTL)
    except Exception:  # noqa: BLE001
        # 版本号属优化项：Redis 不可用时退化为无版本校验，不影响写入。
        pass


async def get_content_version(resource: str, slug: str) -> str:
    """返回「资源级 + slug 级」版本组合快照，用于回填前的一致性校验。"""
    return f"{await _read(_resource_key(resource))}:{await _read(_slug_key(resource, slug))}"


async def bump_content_version(resource: str, slug: str) -> None:
    """单个内容变更：递增 slug 级版本，使并发旧请求放弃回填。"""
    await _bump(_slug_key(resource, slug))


async def bump_resource_version(resource: str) -> None:
    """批次变更（如分类调整）：递增资源级版本，覆盖该资源下全部详情缓存。"""
    await _bump(_resource_key(resource))
