"""Best-effort Next.js cache revalidation after admin content mutations."""
from __future__ import annotations

import httpx

from common.config import settings
from common.logger import get_logger

logger = get_logger(__name__)


async def revalidate_frontend(*, tags: list[str], paths: list[str], strict: bool = False) -> None:
    """Clear the additional Next.js cache layer without failing a CMS write."""
    if not settings.next_revalidate_url or not settings.revalidate_secret:
        return

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(
                settings.next_revalidate_url,
                headers={"Authorization": f"Bearer {settings.revalidate_secret}"},
                json={"tags": sorted(set(tags)), "paths": sorted(set(paths))},
            )
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        # 只记录异常类名（如 "HTTPStatusError"）无法区分「密钥不匹配(401)」还是
        # 「对端不可达/被代理劫持(502)」，排查成本很高。这里补上目标地址与状态码。
        # 典型场景：本地把 NEXT_REVALIDATE_URL 写成 localhost，httpx(trust_env=True)
        # 在装有系统代理的机器上会得到 502，任务只能不断退避重试，官网缓存迟迟不刷新。
        detail = settings.next_revalidate_url
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status is not None:
            detail += f" -> HTTP {status}"
        logger.warning("Next.js cache revalidation failed: %s (%s)", type(exc).__name__, detail)
        if strict:
            raise
