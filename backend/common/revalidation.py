"""Best-effort Next.js cache revalidation after admin content mutations."""
from __future__ import annotations

import httpx

from common.config import settings
from common.logger import get_logger

logger = get_logger(__name__)


async def revalidate_frontend(*, tags: list[str], paths: list[str]) -> None:
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
        logger.warning("Next.js cache revalidation failed: %s", exc)
