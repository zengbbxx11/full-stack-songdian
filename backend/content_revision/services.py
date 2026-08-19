from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable

import jwt
from tortoise.functions import Max
from tortoise.exceptions import IntegrityError

from common.config import settings
from common.exceptions import BizException, ErrorCode
from content_revision.models import ContentRevision

PRODUCT_FIELDS = (
    "slug", "title", "summary", "content_html", "category_id", "sku", "price",
    "currency", "stock_status", "status", "published_at", "cover_image", "tags",
    "sort_order", "seo_title", "seo_description",
)
NEWS_FIELDS = (
    "slug", "title", "summary", "content_html", "category_id", "author",
    "published_at", "status", "cover_image", "sort_order",
)


def snapshot_model(model: Any, resource_type: str) -> dict[str, Any]:
    fields = PRODUCT_FIELDS if resource_type == "product" else NEWS_FIELDS
    result: dict[str, Any] = {}
    for name in fields:
        value = getattr(model, name, None)
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        elif resource_type == "product" and name == "price" and value is not None:
            value = str(value)
        result[name] = value
    return result


async def record_revision(model: Any, resource_type: str, change_type: str, operator: str) -> ContentRevision:
    for attempt in range(3):
        rows = await ContentRevision.filter(
            resource_type=resource_type, resource_id=model.id
        ).annotate(max_version=Max("version")).values("max_version")
        current = max((row["max_version"] or 0 for row in rows), default=0)
        try:
            return await ContentRevision.create(
                resource_type=resource_type,
                resource_id=model.id,
                version=current + 1,
                change_type=change_type,
                snapshot=snapshot_model(model, resource_type),
                created_by=operator or None,
            )
        except IntegrityError:
            if attempt == 2:
                raise
            await asyncio.sleep(0)
    raise RuntimeError("无法创建内容版本")


async def list_revisions(resource_type: str, resource_id: int) -> list[dict[str, Any]]:
    rows = await ContentRevision.filter(
        resource_type=resource_type, resource_id=resource_id
    ).order_by("-version")
    return [
        {
            "id": row.id,
            "version": row.version,
            "change_type": row.change_type,
            "created_by": row.created_by,
            "created_time": row.created_time,
            "snapshot": row.snapshot,
        }
        for row in rows
    ]


async def get_revision(resource_type: str, resource_id: int, revision_id: int) -> ContentRevision:
    revision = await ContentRevision.get_or_none(
        id=revision_id, resource_type=resource_type, resource_id=resource_id
    )
    if revision is None:
        raise BizException(ErrorCode.A010001, "内容版本不存在")
    return revision


def create_preview_token(resource_type: str, resource_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "scope": "content-preview",
        "resource_type": resource_type,
        "resource_id": resource_id,
        "iat": now,
        "exp": now.timestamp() + settings.preview_token_ttl,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def decode_preview_token(token: str) -> tuple[str, int]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
        resource_type = payload.get("resource_type")
        if payload.get("scope") != "content-preview" or resource_type not in {"product", "news"}:
            raise ValueError("invalid preview scope")
        return resource_type, int(payload["resource_id"])
    except Exception as exc:  # noqa: BLE001
        raise BizException(ErrorCode.C401001, "预览链接无效或已过期") from exc


async def scheduled_publish_loop(
    publish_due: Callable[[], Awaitable[None]], stop: asyncio.Event
) -> None:
    while not stop.is_set():
        try:
            await publish_due()
        except Exception:  # noqa: BLE001
            # 调度失败不能终止 API；下一周期会自动重试。
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(settings.scheduled_publish_interval, 5))
        except TimeoutError:
            continue
