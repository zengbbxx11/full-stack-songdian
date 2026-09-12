"""PostgreSQL regression checks. Run only against a disposable QA/CI database."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from urllib.parse import urlparse

from tortoise import connections

from common.config import close_db, init_db, settings
from common.redis_client import close_redis, init_redis
from common.task_model import BackgroundJob
from common.tasks import process_jobs
from content.models import AdminUser, Role
from content_revision.models import ContentRevision
from inquiry.models import Inquiry
from inquiry.schemas import FollowNoteRequest, InquirySubmitRequest
from inquiry.services import add_follow_note, submit_inquiry
from product.models import Product, ProductCategory
from product.schemas import ProductCreateRequest, ProductUpdateRequest
from product.services import create_product, publish_due_products, update_product


async def verify() -> None:
    name = urlparse(settings.database_url).path.lstrip("/")
    if not (name.startswith("backend_qa_") or name.endswith("_ci")):
        raise RuntimeError("Use a disposable backend_qa_* or *_ci database")
    await init_redis()
    await init_db()
    try:
        from common.redis_client import get_redis, cache_key
        from common.jwt import consume_family
        import uuid
        counter = cache_key("qa", uuid.uuid4().hex)
        redis = get_redis()
        counts = await asyncio.gather(*(redis.increment_with_expiry(counter, 60) for _ in range(10)))
        assert sorted(counts) == list(range(1, 11))
        assert await redis.ttl(counter) > 0
        await redis.delete(counter)
        fid = uuid.uuid4().hex
        assert sum(await asyncio.gather(*(consume_family(fid) for _ in range(8)))) == 1
        await redis.delete(cache_key("auth", "family", fid))
        print("PASS: Redis atomic limit counter and single-use refresh family")
        role, _ = await Role.get_or_create(code="qa", defaults={"name": "QA"})
        user, _ = await AdminUser.get_or_create(
            username="qa", defaults={"role_id": role.id, "password_hash": "unused"}
        )
        category = await ProductCategory.create(
            name="QA", slug="qa-" + str(datetime.now(UTC).timestamp()).replace(".", "-")
        )
        slug = category.slug + "-product"
        item = await create_product(
            ProductCreateRequest(
                title="Camera",
                slug=slug,
                summary="Camera summary",
                content_html="<p>Camera</p>",
                category_id=category.id,
                seo_title="Camera SEO",
                tags=["OEM"],
            )
        )
        assert item.seo_title == "Camera SEO"
        await asyncio.gather(
            update_product(item.id, ProductUpdateRequest(title="New Camera")),
            update_product(item.id, ProductUpdateRequest(seo_description="Camera description")),
        )
        row = await Product.get(id=item.id)
        assert (
            row.title == "New Camera"
            and row.seo_description == "Camera description"
            and row.tags == ["OEM"]
        )
        assert (
            await ContentRevision.filter(resource_type="product", resource_id=item.id).count() == 3
        )
        vector = await connections.get("default").execute_query_dict(
            "SELECT search_vector::text AS vector FROM t_product WHERE id=$1",
            [item.id],
        )
        assert "camera" in vector[0]["vector"]
        with patch(
            "content_revision.services.record_revision",
            AsyncMock(side_effect=RuntimeError("rollback")),
        ):
            try:
                await update_product(item.id, ProductUpdateRequest(title="Must not persist"))
                raise AssertionError("Expected transaction rollback")
            except RuntimeError:
                pass
        assert (await Product.get(id=item.id)).title == "New Camera"
        await Product.filter(id=item.id).update(
            status="SCHEDULED", published_at=datetime.now(UTC) - timedelta(seconds=1)
        )
        published = await asyncio.gather(publish_due_products(), publish_due_products())
        assert sum(published) == 1
        assert (
            await ContentRevision.filter(
                resource_type="product", resource_id=item.id, change_type="PUBLISH"
            ).count()
            == 1
        )
        print("PASS: PG concurrent edits, search vectors, revision rollback and scheduled publish")

        request = InquirySubmitRequest(
            name="QA", email="qa@example.com", message="Quote", biz_req_no=slug
        )
        with patch(
            "inquiry.smtp_mailer.send_inquiry_mail",
            AsyncMock(side_effect=AssertionError("No real SMTP")),
        ):
            results = await asyncio.gather(*(submit_inquiry(request) for _ in range(8)))
        # 公开提交只返回最小回执；幂等由「同一 biz_req_no 仅一行」验证。
        assert {result.biz_req_no for result in results} == {slug}
        assert all(result.received for result in results)
        assert await Inquiry.filter(biz_req_no=slug).count() == 1
        inquiry_id = (await Inquiry.get(biz_req_no=slug)).id
        assert await BackgroundJob.filter(kind="inquiry_mail").count() >= 1
        await asyncio.gather(
            *(
                add_follow_note(inquiry_id, FollowNoteRequest(note=f"Note {i}"), user)
                for i in range(8)
            )
        )
        notes = (await Inquiry.get(id=inquiry_id)).follow_notes
        assert {note["note"] for note in notes} == {f"Note {i}" for i in range(8)}
        print("PASS: PG concurrent idempotency and follow-note preservation")

        # Two workers compete for the same lease; only one executes the job.
        from common.enums import SmtpStatus

        mail = AsyncMock(return_value=SmtpStatus.SENT)
        job_ids = await BackgroundJob.filter(kind="inquiry_mail").values_list("id", flat=True)
        with patch("inquiry.smtp_mailer.send_inquiry_mail", mail):
            await asyncio.gather(process_jobs(only_ids=job_ids), process_jobs(only_ids=job_ids))
        assert mail.await_count == len(job_ids)
        assert (await Inquiry.get(id=inquiry_id)).smtp_status == "SENT"
        print("PASS: PG worker lease contention and delivery persistence")
        from importlib import import_module
        from tortoise.transactions import in_transaction

        migration = import_module("migrations.models.16_20260908090000_backend_reliability")
        async with in_transaction() as conn:
            await conn.execute_script(await migration.downgrade(conn))
            await conn.execute_script(await migration.upgrade(conn))
            await conn.execute_script(await migration.upgrade(conn))
            assert (await Product.get(id=item.id)).title == "New Camera"
            assert len((await Inquiry.get(id=inquiry_id)).follow_notes) == 8
            assert (await AdminUser.get(id=user.id)).session_version == 0
        print("PASS: v16 upgrade on populated v15 schema preserves existing data")
    finally:
        await close_db()
        await close_redis()


if __name__ == "__main__":
    asyncio.run(verify())
