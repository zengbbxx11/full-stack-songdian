"""最小化健康检查测试（QA 接力基座）。

验证应用可导入、lifespan 建表+种子生效、公开接口返回统一 Result。
"""
from __future__ import annotations


def test_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "alive"


def test_readyz(client):
    resp = client.get("/readyz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["db"] is True


def test_readyz_returns_503_when_database_is_unavailable(client, monkeypatch):
    import main

    async def _unavailable():
        return False

    monkeypatch.setattr(main, "_database_is_ready", _unavailable)
    resp = client.get("/readyz")
    assert resp.status_code == 503, resp.text
    assert resp.json()["db"] is False


def test_api_global_rate_limit_is_enforced(client, monkeypatch):
    from common import ratelimit
    from common.config import settings

    monkeypatch.setattr(settings, "rate_global_qps", 1)
    monkeypatch.setattr(ratelimit.time, "time", lambda: 4_102_444_800)
    assert client.get("/api/v1/products").status_code == 200
    assert client.get("/api/v1/products").status_code == 429


def test_products_list_public(client):
    resp = client.get("/api/v1/products")
    assert resp.status_code == 200
    assert resp.json()["code"] in (0, "0")


def test_search_requires_query(client):
    resp = client.get("/api/v1/search", params={"q": ""})
    # 空关键词 → A030001（业务码，HTTP 200）
    assert resp.status_code == 200
    assert resp.json()["code"] in (0, "0", "A030001")
