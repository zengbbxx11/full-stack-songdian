"""Regression tests assert persisted results, authorization and failure recovery."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from common.enums import SmtpStatus
from common.task_model import BackgroundJob
from common import tasks
from content.models import AdminUser, Role, RolePermission
from content_revision.models import ContentRevision
from inquiry.models import Inquiry


def login(client):
    response = client.post(
        "/api/v1/admin/login", json={"username": "admin", "password": "Songdian@2026"}
    )
    assert response.json()["code"] == "0", response.text


def create_content(client, resource="products", **extra):
    category = "product-categories" if resource == "products" else "news-categories"
    payload = dict(
        title="Original",
        slug="qa-" + uuid.uuid4().hex,
        summary="Summary",
        content_html="<p>body</p>",
        category_id=client.get("/api/v1/" + category).json()["data"][0]["id"],
        status="DRAFT",
    )
    payload.update(extra)
    response = client.post("/api/v1/admin/" + resource, json=payload)
    assert response.json()["code"] == "0", response.text
    return response.json()["data"]


def submit(client, **extra):
    data = dict(
        name="Buyer", email="buyer@example.com", message="Quote please", biz_req_no=uuid.uuid4().hex
    )
    data.update(extra)
    response = client.post("/api/v1/inquiries", json=data)
    assert response.json()["code"] == "0", response.text
    return response.json()["data"]


def test_seo_partial_updates_and_explicit_clear(client):
    login(client)
    item = create_content(
        client, seo_title="SEO title", seo_description="SEO description", tags=["OEM"]
    )
    url = f"/api/v1/admin/products/{item['id']}"
    assert item["seo_title"] == "SEO title"
    assert client.put(url, json={"title": "Changed"}).json()["code"] == "0"
    saved = client.get(url).json()["data"]
    assert saved["seo_description"] == "SEO description"
    assert saved["tags"] == ["OEM"]
    assert (
        client.put(url, json={"seo_title": None, "seo_description": "", "tags": []}).json()["code"]
        == "0"
    )
    saved = client.get(url).json()["data"]
    assert not saved["seo_title"] and not saved["seo_description"]
    assert saved["tags"] == []


def test_news_cover_persists_and_clears(client):
    login(client)
    item = create_content(client, "news", cover_image="/uploads/one.jpg")
    url = f"/api/v1/admin/news/{item['id']}"
    assert item["cover_image"] == "/uploads/one.jpg"
    assert client.put(url, json={"cover_image": "/uploads/two.jpg"}).json()["code"] == "0"
    assert client.get(url).json()["data"]["cover_image"] == "/uploads/two.jpg"
    client.put(url, json={"cover_image": None})
    assert client.get(url).json()["data"]["cover_image"] is None


def test_follow_notes_survive_assignment_status_and_tags(client):
    login(client)
    item = submit(client)
    url = f"/api/v1/admin/inquiries/{item['id']}"
    for note in ["First contact", "Second contact"]:
        response = client.post(url + "/follow-note", json={"note": note})
        assert response.json()["code"] == "0", response.text
    user_id = client.get("/api/v1/admin/profile").json()["data"]["id"]
    assert client.put(url + "/assign", json={"assigned_user_id": user_id}).json()["code"] == "0"
    saved = client.get(url).json()["data"]
    assert [n["note"] for n in saved["follow_notes"]][:2] == ["First contact", "Second contact"]
    assert len(saved["follow_notes"]) == 3
    assert saved["last_contact_time"]


def test_submit_enqueues_once_without_waiting_for_smtp(client, monkeypatch):
    mail = AsyncMock(return_value=SmtpStatus.SENT)
    monkeypatch.setattr("inquiry.smtp_mailer.send_inquiry_mail", mail)
    biz = uuid.uuid4().hex
    first = submit(client, biz_req_no=biz)
    second = submit(client, biz_req_no=biz)
    assert first["id"] == second["id"]
    assert first["smtp_status"] == "PENDING"
    mail.assert_not_awaited()

    async def check():
        assert await Inquiry.filter(biz_req_no=biz).count() == 1
        assert await BackgroundJob.filter(kind="inquiry_mail").count() == 1
        await tasks.process_jobs()
        assert (await Inquiry.get(id=first["id"])).smtp_status == "SENT"
        assert await BackgroundJob.filter(kind="inquiry_mail").count() == 0

    client.portal.call(check)
    assert mail.await_count == 1


def test_inquiry_rolls_back_if_job_cannot_be_saved(client, monkeypatch):
    monkeypatch.setattr(
        "inquiry.services.enqueue", AsyncMock(side_effect=RuntimeError("outbox unavailable"))
    )
    biz = uuid.uuid4().hex
    response = client.post(
        "/api/v1/inquiries", json=dict(name="B", email="b@example.com", message="Q", biz_req_no=biz)
    )
    assert response.status_code == 500

    async def check():
        assert await Inquiry.filter(biz_req_no=biz).count() == 0

    client.portal.call(check)


def test_revision_failure_rolls_back_content(client, monkeypatch):
    login(client)
    item = create_content(client)
    monkeypatch.setattr(
        "content_revision.services.record_revision",
        AsyncMock(side_effect=RuntimeError("revision unavailable")),
    )
    url = f"/api/v1/admin/products/{item['id']}"
    response = client.put(url, json={"title": "Must roll back"})
    assert response.status_code == 500
    assert client.get(url).json()["data"]["title"] == "Original"


def test_cache_failure_is_durable_and_retryable(client, monkeypatch):
    login(client)
    fail = AsyncMock(side_effect=RuntimeError("frontend offline"))
    monkeypatch.setattr("common.revalidation.revalidate_frontend", fail)
    item = create_content(client)

    async def check():
        job = await BackgroundJob.filter(kind="content_cache").first()
        assert job and job.attempts == 1 and job.status == "PENDING"
        assert item["slug"] in job.payload["slugs"]
        await BackgroundJob.filter(id=job.id).update(
            available_at=datetime.now(UTC) - timedelta(seconds=1)
        )
        monkeypatch.setattr("common.revalidation.revalidate_frontend", AsyncMock())
        await tasks.process_jobs()
        assert not await BackgroundJob.filter(id=job.id).exists()

    client.portal.call(check)


def test_mail_retry_budget_and_expired_lease(client, monkeypatch):
    item = submit(client)
    monkeypatch.setattr(
        "inquiry.smtp_mailer.send_inquiry_mail", AsyncMock(return_value=SmtpStatus.FAILED)
    )

    async def check():
        job = await BackgroundJob.filter(kind="inquiry_mail").get()
        for attempt in range(1, tasks.MAX_ATTEMPTS + 1):
            await BackgroundJob.filter(id=job.id).update(
                status="PROCESSING" if attempt == 1 else "PENDING",
                lease_token="crashed-worker",
                available_at=datetime.now(UTC) - timedelta(seconds=1),
            )
            await tasks.process_jobs()
            row = await BackgroundJob.get(id=job.id)
            assert row.attempts == attempt
        assert row.status == "FAILED"
        assert (await Inquiry.get(id=item["id"])).smtp_retry == tasks.MAX_ATTEMPTS
        assert await tasks.process_jobs() == 0

    client.portal.call(check)


@pytest.mark.parametrize("resource", ["products", "news"])
def test_operator_cannot_restore_published_or_edit_live_content(client, resource):
    login(client)
    item = create_content(client, resource, status="PUBLISHED")
    base = f"/api/v1/admin/{resource}/{item['id']}"
    revision = client.get(base + "/revisions").json()["data"][0]

    async def operator():
        role = await Role.get(code="operator")
        from common.password import hash_password

        await AdminUser.create(
            username="qa-operator", password_hash=hash_password("Operator@123"), role=role
        )

    client.portal.call(operator)
    client.cookies.clear()
    assert (
        client.post(
            "/api/v1/admin/login", json={"username": "qa-operator", "password": "Operator@123"}
        ).json()["code"]
        == "0"
    )
    assert client.put(base, json={"title": "Unauthorized"}).status_code == 403
    assert client.post(base + f"/revisions/{revision['id']}/restore").status_code == 403
    assert (
        client.post(
            "/api/v1/admin/users", json={"username": "evil", "password": "Password@123"}
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/v1/admin/users/1/reset-password", json={"new_password": "Password@123"}
        ).status_code
        == 403
    )


def test_reset_password_revokes_old_access_and_refresh(client):
    login(client)
    old_access = client.cookies.get("access_token")
    old_refresh = client.cookies.get("refresh_token")
    user_id = client.get("/api/v1/admin/profile").json()["data"]["id"]
    response = client.put(
        f"/api/v1/admin/users/{user_id}/reset-password", json={"new_password": "NewPassword@123"}
    )
    assert response.json()["code"] == "0", response.text
    client.cookies.set("access_token", old_access)
    client.cookies.set("refresh_token", old_refresh)
    assert client.get("/api/v1/admin/profile").status_code == 401
    assert client.post("/api/v1/admin/refresh").status_code == 401


def test_only_one_concurrent_refresh_succeeds(client):
    login(client)
    token = client.cookies.get("refresh_token")

    async def check():
        from content.services import refresh
        from common.exceptions import BizException

        results = await asyncio.gather(refresh(token), refresh(token), return_exceptions=True)
        assert sum(isinstance(value, BizException) for value in results) == 1
        assert sum(not isinstance(value, Exception) for value in results) == 1

    client.portal.call(check)


def test_permission_replacement_is_atomic(client, monkeypatch):
    login(client)

    async def check():
        from content.services import bind_permissions
        from content.schemas import RolePermRequest

        role = await Role.get(code="operator")
        before = set(
            await RolePermission.filter(role_id=role.id).values_list("permission_code", flat=True)
        )
        with monkeypatch.context() as patch:
            patch.setattr(
                RolePermission, "bulk_create", AsyncMock(side_effect=RuntimeError("write failure"))
            )
            with pytest.raises(RuntimeError):
                await bind_permissions(role.id, RolePermRequest(permission_codes=["product:read"]))
        assert (
            set(
                await RolePermission.filter(role_id=role.id).values_list(
                    "permission_code", flat=True
                )
            )
            == before
        )

    client.portal.call(check)


@pytest.mark.parametrize(
    "path,category", [("categories", "product-categories"), ("news-categories", "news-categories")]
)
def test_category_sort_route_is_reachable(client, path, category):
    login(client)
    ids = [row["id"] for row in client.get("/api/v1/" + category).json()["data"]]
    response = client.put("/api/v1/admin/" + path + "/sort", json={"ids": ids})
    assert response.json()["code"] == "0", response.text


def test_scheduled_publish_rolls_back_on_revision_failure(client, monkeypatch):
    login(client)
    item = create_content(
        client,
        status="SCHEDULED",
        published_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    )

    async def check():
        from product.models import Product
        from product.services import publish_due_products

        await Product.filter(id=item["id"]).update(
            published_at=datetime.now(UTC) - timedelta(seconds=1)
        )
        with monkeypatch.context() as patch:
            patch.setattr(
                "content_revision.services.record_revision",
                AsyncMock(side_effect=RuntimeError("fail")),
            )
            with pytest.raises(RuntimeError):
                await publish_due_products()
        assert (await Product.get(id=item["id"])).status == "SCHEDULED"
        assert await publish_due_products() == 1
        assert (await Product.get(id=item["id"])).status == "PUBLISHED"
        assert (
            await ContentRevision.filter(
                resource_type="product", resource_id=item["id"], change_type="PUBLISH"
            ).count()
            == 1
        )

    client.portal.call(check)


def test_search_page_sizes_and_unpublish_invalidation(client):
    login(client)
    first = create_content(client, status="PUBLISHED", title="Unique searchable camera")
    create_content(client, status="PUBLISHED", title="Unique searchable camera two")

    async def check():
        from search.services import search
        from product.services import update_product
        from product.schemas import ProductUpdateRequest

        one = await search("Unique searchable", page_size=1)
        two = await search("Unique searchable", page_size=2)
        assert len(one.items) == 1 and len(two.items) == 2
        await update_product(first["id"], ProductUpdateRequest(status="DRAFT"))
        after = await search("Unique searchable", page_size=2)
        assert after.total == 1
        assert first["id"] not in [row.id for row in after.items]

    client.portal.call(check)


def test_cache_outage_still_reads_database(client, monkeypatch):
    login(client)
    create_content(client, status="PUBLISHED")
    from common.redis_client import get_redis

    monkeypatch.setattr(get_redis(), "get", AsyncMock(side_effect=ConnectionError("cache offline")))
    assert client.get("/api/v1/products").json()["code"] == "0"
    assert client.get("/api/v1/product-categories").json()["code"] == "0"
    assert client.get("/api/v1/news").json()["code"] == "0"


def test_dashboard_aggregations_preserve_country_normalization(client):
    login(client)
    for country in [" Germany ", "Germany", None]:
        submit(client, country=country)
    response = client.get("/api/v1/admin/stats").json()
    assert response["code"] == "0", response
    data = response["data"]
    assert data["counts"]["inquiries"] == 3
    assert data["inquiry_status"] == {"NEW": 3}
    assert data["inquiry_countries"] == [
        {"country": "Germany", "count": 2},
        {"country": "Unknown", "count": 1},
    ]


def test_actual_client_ip_is_available_before_rate_limiting(client, monkeypatch):
    seen = []

    async def limiter(request):
        seen.append(request.scope.get("client_ip"))

    monkeypatch.setattr("common.middleware.api_rate_limit", limiter)
    client.get("/api/v1/products")
    assert seen == ["testclient"]


def test_upload_reads_at_most_limit_plus_one(tmp_path, monkeypatch):
    from common.config import settings
    from common.exceptions import BizException
    from uploads.services import LocalStorageBackend
    from types import SimpleNamespace

    monkeypatch.setattr(settings, "max_upload_mb", 1)
    file = SimpleNamespace(read=AsyncMock(return_value=b"x" * (1024 * 1024 + 1)))
    with pytest.raises(BizException):
        asyncio.run(LocalStorageBackend(root=tmp_path).save(file, "image.jpg"))
    file.read.assert_awaited_once_with(1024 * 1024 + 1)
    assert not list(tmp_path.iterdir())


def test_fixed_window_counter_expiry_is_atomic():
    from common.redis_client import MemoryBackend

    async def check():
        cache = MemoryBackend()
        counts = await asyncio.gather(*(cache.increment_with_expiry("key", 60) for _ in range(10)))
        assert sorted(counts) == list(range(1, 11))
        assert await cache.ttl("key") > 0

    asyncio.run(check())


def test_smtp_465_and_multiple_recipients(monkeypatch):
    from unittest.mock import MagicMock
    from inquiry.smtp_mailer import _send_sync

    ssl_factory = MagicMock()
    plain_factory = MagicMock()
    monkeypatch.setattr("inquiry.smtp_mailer.smtplib.SMTP_SSL", ssl_factory)
    monkeypatch.setattr("inquiry.smtp_mailer.smtplib.SMTP", plain_factory)
    result = _send_sync(
        dict(
            smtp_host="smtp.example.com",
            smtp_port="465",
            smtp_user="user",
            smtp_password="test",
            inquiry_email_from="from@example.com",
            inquiry_email_to="a@example.com, b@example.com",
        ),
        "Buyer",
        "buyer@example.com",
        "Quote",
        "Inquiry",
        {},
    )
    assert result == SmtpStatus.SENT
    plain_factory.assert_not_called()
    server = ssl_factory.return_value.__enter__.return_value
    assert server.sendmail.call_args.args[1] == ["a@example.com", "b@example.com"]
    server.starttls.assert_not_called()


def test_production_rejects_short_signing_key():
    from common.config import Settings
    with pytest.raises(RuntimeError, match="32"):
        Settings(_env_file=None, app_env="production", jwt_secret="too-short")


def test_missing_smtp_does_not_consume_retry_budget(client, monkeypatch):
    submit(client)
    monkeypatch.setattr("inquiry.smtp_mailer.send_inquiry_mail", AsyncMock(return_value=SmtpStatus.PENDING))
    async def check():
        await tasks.process_jobs()
        job = await BackgroundJob.filter(kind="inquiry_mail").get()
        assert job.status == "PENDING" and job.attempts == 0
        assert job.available_at > datetime.now(UTC)
    client.portal.call(check)
