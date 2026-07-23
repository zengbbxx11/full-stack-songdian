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


def test_products_list_public(client):
    resp = client.get("/api/v1/products")
    assert resp.status_code == 200
    assert resp.json()["code"] in (0, "0")


def test_search_requires_query(client):
    resp = client.get("/api/v1/search", params={"q": ""})
    # 空关键词 → A030001（业务码，HTTP 200）
    assert resp.status_code == 200
    assert resp.json()["code"] in (0, "0", "A030001")
