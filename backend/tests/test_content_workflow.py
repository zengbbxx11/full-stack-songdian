from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from common.config import settings
from common.exceptions import BizException
from content_revision.services import create_preview_token, decode_preview_token

ADMIN = {"username": "admin", "password": "Songdian@2026"}


def _login(client) -> None:
    response = client.post("/api/v1/admin/login", json=ADMIN)
    assert response.json()["code"] == "0"


def _news_category_id(client) -> int:
    return client.get("/api/v1/news-categories").json()["data"][0]["id"]


def test_scheduled_news_is_private_and_previewable(client):
    _login(client)
    slug = f"scheduled-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/admin/news",
        json={
            "title": "Scheduled preview",
            "slug": slug,
            "summary": "Private until the scheduled time",
            "content_html": "<p>preview-only-body</p>",
            "category_id": _news_category_id(client),
            "status": "SCHEDULED",
            "published_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        },
    )
    body = response.json()
    assert body["code"] == "0", body
    news_id = body["data"]["id"]

    public = client.get(f"/api/v1/news/{slug}").json()
    assert public["code"] == "A020001"

    token_body = client.post(f"/api/v1/admin/news/{news_id}/preview-token").json()
    preview = client.get(f"/api/v1/preview/{token_body['data']['token']}")
    assert preview.json()["data"]["content"]["content_html"] == "<p>preview-only-body</p>"
    assert preview.headers["cache-control"].startswith("private, no-store")
    assert preview.headers["x-robots-tag"] == "noindex, nofollow"


def test_revision_restore_creates_a_new_revision(client):
    _login(client)
    slug = f"revision-{uuid.uuid4().hex[:8]}"
    created = client.post(
        "/api/v1/admin/news",
        json={
            "title": "Version one",
            "slug": slug,
            "summary": "First summary",
            "content_html": "<p>one</p>",
            "category_id": _news_category_id(client),
            "status": "DRAFT",
        },
    ).json()
    news_id = created["data"]["id"]
    first_revision = client.get(f"/api/v1/admin/news/{news_id}/revisions").json()["data"][-1]

    client.put(f"/api/v1/admin/news/{news_id}", json={"title": "Version two"})
    restored = client.post(
        f"/api/v1/admin/news/{news_id}/revisions/{first_revision['id']}/restore"
    ).json()
    assert restored["data"]["title"] == "Version one"
    revisions = client.get(f"/api/v1/admin/news/{news_id}/revisions").json()["data"]
    assert revisions[0]["change_type"] == "RESTORE"
    assert len(revisions) == 3


def test_scheduled_time_must_be_in_the_future(client):
    _login(client)
    response = client.post(
        "/api/v1/admin/news",
        json={
            "title": "Invalid schedule",
            "slug": f"invalid-{uuid.uuid4().hex[:8]}",
            "summary": "Invalid schedule",
            "content_html": "<p>invalid</p>",
            "category_id": _news_category_id(client),
            "status": "SCHEDULED",
            "published_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
        },
    )
    assert response.json()["code"] == "A020001"


def test_preview_token_rejects_expired_signature(monkeypatch):
    monkeypatch.setattr(settings, "preview_token_ttl", -1)
    token = create_preview_token("news", 1)
    with pytest.raises(BizException):
        decode_preview_token(token)


@pytest.mark.parametrize("resource,category", [("news", "news-categories"), ("products", "product-categories")])
def test_withdrawn_content_remains_manageable_but_not_public(client, resource, category):
    # The real admin list route must exist; frontend response mocks cannot prove this.
    assert client.get(f"/api/v1/admin/{resource}").status_code in (401, 403)
    _login(client)
    slug = f"withdraw-{uuid.uuid4().hex[:10]}"
    created = client.post(f"/api/v1/admin/{resource}", json={
        "title": "Withdrawn content", "slug": slug, "summary": "Fixture",
        "content_html": "<p>Still editable</p>", "status": "PUBLISHED",
        "category_id": client.get(f"/api/v1/{category}").json()["data"][0]["id"],
    }).json()
    assert created["code"] == "0", created
    item_id = created["data"]["id"]
    path = f"/api/v1/admin/{resource}/{item_id}"
    assert client.get(f"/api/v1/{resource}/{slug}").json()["code"] == "0"
    assert client.put(path, json={"status": "DRAFT"}).json()["code"] == "0"
    listing = client.get(f"/api/v1/admin/{resource}", params={"status": "DRAFT"}).json()
    assert listing["code"] == "0", listing
    assert any(row["id"] == item_id for row in listing["data"]["list"])
    assert client.get(path).json()["data"]["content_html"] == "<p>Still editable</p>"
    assert client.get(f"/api/v1/{resource}/{slug}").json()["code"] != "0"
    assert not any(row["id"] == item_id for row in client.get(f"/api/v1/{resource}").json()["data"]["list"])
    token = client.post(path + "/preview-token").json()["data"]["token"]
    assert client.get(f"/api/v1/preview/{token}").json()["data"]["content"]["title"] == "Withdrawn content"
    assert client.delete(path).json()["code"] == "0"
    assert not any(row["id"] == item_id for row in client.get(f"/api/v1/admin/{resource}").json()["data"]["list"])
