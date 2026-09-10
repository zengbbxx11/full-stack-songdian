"""Leased database jobs. SMTP is at-least-once, never exactly-once."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from functools import wraps
from contextvars import ContextVar

from tortoise.transactions import in_transaction

from common.logger import get_logger
from common.task_model import BackgroundJob

logger = get_logger(__name__)
_pending_cache_jobs: ContextVar[list[int] | None] = ContextVar("cache_jobs", default=None)
MAX_ATTEMPTS = 5
LEASE_SECONDS = 300


async def enqueue(kind: str, payload: dict) -> BackgroundJob:
    job = await BackgroundJob.create(kind=kind, payload=payload, available_at=datetime.now(UTC))
    pending = _pending_cache_jobs.get()
    if kind == "content_cache" and pending is not None:
        pending.append(job.id)
    return job


def transactional_write(func):
    """Commit business data, revisions and outbox together; I/O runs after commit."""

    @wraps(func)
    async def wrapped(*args, **kwargs):
        pending: list[int] = []
        token = _pending_cache_jobs.set(pending)
        try:
            async with in_transaction():
                result = await func(*args, **kwargs)
        finally:
            _pending_cache_jobs.reset(token)
        if pending:
            try:
                await process_jobs(limit=len(pending), only_ids=pending)
            except Exception:
                logger.exception("Immediate cache invalidation deferred to worker")
        return result

    return wrapped


async def _execute(job: BackgroundJob) -> bool:
    if job.kind == "inquiry_mail":
        from common.enums import SmtpStatus
        from inquiry.models import Inquiry
        from inquiry.smtp_mailer import send_inquiry_mail

        row = await Inquiry.get_or_none(id=job.payload["inquiry_id"])
        if row is None or row.smtp_status == SmtpStatus.SENT.value:
            return True
        extra = {
            name: getattr(row, name) or ""
            for name in (
                "company",
                "country",
                "phone",
                "product_interest",
                "source_page",
                "landing_page",
                "source_product",
                "referrer",
                "utm_source",
                "utm_medium",
                "utm_campaign",
            )
        }
        status = await send_inquiry_mail(row.name, row.email, row.message, extra=extra)
        if status == SmtpStatus.PENDING:
            return False  # No SMTP configured: defer without consuming retry budget.
        await Inquiry.filter(id=row.id).update(
            smtp_status=status.value,
            smtp_retry=job.attempts + (status == SmtpStatus.FAILED),
            updated_time=datetime.now(UTC),
        )
        if status != SmtpStatus.SENT:
            raise RuntimeError("SMTP delivery failed")
        return True
    if job.kind == "content_cache":
        from common.redis_client import cache_key, get_redis
        from common.revalidation import revalidate_frontend

        redis = get_redis()
        resource = job.payload["resource"]
        if resource == "settings":
            await redis.delete(cache_key("public", "settings"))
            await revalidate_frontend(tags=["public-settings"], paths=["/", "/contact", "/privacy-policy"], strict=True)
            return True
        slugs = job.payload["slugs"]
        await redis.delete_prefix(cache_key(resource, "list", ""))
        await redis.delete_prefix(cache_key("search", ""))
        # Category names are embedded in detail and list responses.
        if job.payload["categories"]:
            await redis.delete_prefix(cache_key(resource, "detail", ""))
            await redis.delete(cache_key(resource, "categories"))
        else:
            for slug in slugs:
                await redis.delete(cache_key(resource, "detail", slug))
        plural = "products" if resource == "product" else "news"
        tags = [plural, *(f"{resource}:{slug}" for slug in slugs)]
        if job.payload["categories"]:
            tags.append(f"{resource}-categories")
        await revalidate_frontend(tags=tags, paths=["/", f"/{plural}", "/sitemap.xml"], strict=True)
        return True
    raise ValueError("Unknown background job kind")


async def process_jobs(limit: int = 20, only_ids: list[int] | None = None) -> int:
    now = datetime.now(UTC)
    # PROCESSING jobs become eligible again after their lease expires (crash recovery).
    query = BackgroundJob.filter(
        status__in=["PENDING", "PROCESSING"],
        available_at__lte=now,
    )
    if only_ids is not None:
        query = query.filter(id__in=only_ids)
    jobs = await query.order_by("available_at", "id").limit(limit)
    processed = 0
    for job in jobs:
        token = uuid.uuid4().hex
        claimed = await BackgroundJob.filter(
            id=job.id,
            status__in=["PENDING", "PROCESSING"],
            available_at__lte=now,
        ).update(
            status="PROCESSING",
            lease_token=token,
            available_at=datetime.now(UTC) + timedelta(seconds=LEASE_SECONDS),
        )
        if not claimed:
            continue
        owned = BackgroundJob.filter(id=job.id, lease_token=token)
        try:
            done = await _execute(job)
            if done:
                await owned.delete()
            else:
                await owned.update(
                    status="PENDING",
                    lease_token=None,
                    available_at=datetime.now(UTC) + timedelta(minutes=5),
                )
        except Exception as exc:
            attempts = job.attempts + 1
            if job.kind == "inquiry_mail":
                from inquiry.models import Inquiry

                await Inquiry.filter(id=job.payload["inquiry_id"]).update(
                    smtp_status="FAILED",
                    smtp_retry=attempts,
                    updated_time=datetime.now(UTC),
                )
            # Never store exception text: SMTP/HTTP errors can contain credentials or URLs.
            error = type(exc).__name__
            logger.error(
                "Background job failed id=%s kind=%s attempt=%s error=%s",
                job.id,
                job.kind,
                attempts,
                error,
            )
            await owned.update(
                attempts=attempts,
                status="FAILED" if attempts >= MAX_ATTEMPTS else "PENDING",
                lease_token=None,
                last_error=error,
                available_at=datetime.now(UTC) + timedelta(seconds=min(30 * 2**attempts, 1800)),
            )
        processed += 1
    return processed


async def job_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await process_jobs()
        except Exception:
            logger.exception("Background job poll failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            pass
