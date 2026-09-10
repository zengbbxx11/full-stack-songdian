from unittest.mock import AsyncMock

from common.settings_model import Setting
from common.task_model import BackgroundJob


def login(client):
    assert client.post("/api/v1/admin/login", json={"username": "admin", "password": "Songdian@2026"}).json()["code"] == "0"
    assert client.get("/api/v1/admin/settings").json()["code"] == "0"


def test_public_settings_refresh_after_commit_and_exclude_secrets(client, monkeypatch):
    login(client)
    seen = []

    async def revalidate(**kwargs):
        seen.append(kwargs)
        assert (await Setting.get(key="google_verification")).value == "verification-fixture"

    monkeypatch.setattr("common.revalidation.revalidate_frontend", revalidate)
    client.get("/api/v1/public/settings")  # Prime the old public cache.
    response = client.put("/api/v1/admin/settings", json={"google_verification": "verification-fixture", "smtp_password": "secret-fixture"})
    assert response.json()["code"] == "0"
    public = client.get("/api/v1/public/settings").json()["data"]
    assert public["google_verification"] == "verification-fixture"
    assert "smtp_password" not in public
    assert seen == [{"tags": ["public-settings"], "paths": ["/", "/contact", "/privacy-policy"], "strict": True}]


def test_failed_refresh_is_retained_and_single_setting_clear_retries(client, monkeypatch):
    login(client)
    monkeypatch.setattr("common.revalidation.revalidate_frontend", AsyncMock(side_effect=RuntimeError("offline")))
    assert client.put("/api/v1/admin/settings/google_verification", json={"value": ""}).json()["code"] == "0"

    async def check():
        jobs = await BackgroundJob.filter(kind="content_cache")
        assert len(jobs) == 1
        assert jobs[0].payload == {"resource": "settings"}
        assert jobs[0].attempts == 1
        assert (await Setting.get(key="google_verification")).value == ""

    client.portal.call(check)
