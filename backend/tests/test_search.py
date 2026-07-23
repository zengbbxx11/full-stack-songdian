"""M3 联合搜索测试（§3.2.M3 / BD-01 降级）。

覆盖：
- 空 q → 返回 A030001（HTTP 200 包裹 Result）。
- 有数据时走 LIKE 降级路径：返回结果、rank=0、标注「基础检索」。
- type 过滤（product / news）。

注：本地无 PG / 无 zhparser，搜索固定走 SQLite 降级 LIKE（is_sqlite() 为真），
这是本地唯一可测的搜索实现（PG TSVector 路径本地不可测，已在注释声明）。
"""
from __future__ import annotations

import uuid

ADMIN = ("admin", "Songdian@2026")


def _admin_headers(client) -> dict:
    resp = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("code") in (0, "0"), body
    return {"Authorization": f"Bearer {body['data']['access_token']}"}


def _first_prod_cat(client) -> int:
    return client.get("/api/v1/product-categories").json()["data"][0]["id"]


def _first_news_cat(client) -> int:
    return client.get("/api/v1/news-categories").json()["data"][0]["id"]


def _make_product(client, h, slug: str, title: str, cat: int) -> None:
    client.post(
        "/api/v1/admin/products",
        headers=h,
        json={
            "title": title, "slug": slug, "summary": "s", "content_html": "<p>x</p>",
            "category_id": cat, "status": "PUBLISHED",
        },
    )


def _make_news(client, h, slug: str, title: str, cat: int) -> None:
    client.post(
        "/api/v1/admin/news",
        headers=h,
        json={
            "title": title, "slug": slug, "summary": "s", "content_html": "<p>x</p>",
            "category_id": cat, "status": "PUBLISHED",
        },
    )


def test_search_empty_query_A030001(client):
    # 显式空 q
    r = client.get("/api/v1/search", params={"q": ""})
    assert r.status_code == 200
    assert r.json()["code"] == "A030001", r.json()
    # 完全不带 q（Query 默认 ""）→ 同样 A030001
    r2 = client.get("/api/v1/search")
    assert r2.status_code == 200
    assert r2.json()["code"] == "A030001", r2.json()


def test_search_degraded_like_returns_results(client):
    h = _admin_headers(client)
    uid = uuid.uuid4().hex[:8]
    _make_product(client, h, f"qa-srch-p-{uid}", f"QAModelCamera {uid}", _first_prod_cat(client))
    _make_news(client, h, f"qa-srch-n-{uid}", f"QAModelNews {uid}", _first_news_cat(client))

    r = client.get("/api/v1/search", params={"q": "QAModel"})
    body = r.json()
    assert body["code"] in (0, "0"), body
    data = body["data"]
    # BD-01 降级：degraded=True，rank 全为 0，标注基础检索
    assert data["degraded"] is True, data
    assert data["total"] >= 1
    assert data["note"], f"降级应标注说明，实际：{data}"
    for it in data["items"]:
        assert it["rank"] == 0.0, it
        assert it["kind"] in ("product", "news")
        assert it["url"].startswith("/products/") or it["url"].startswith("/news/")


def test_search_type_filter(client):
    h = _admin_headers(client)
    uid = uuid.uuid4().hex[:8]
    _make_product(client, h, f"qa-type-p-{uid}", f"QATypeCam {uid}", _first_prod_cat(client))
    _make_news(client, h, f"qa-type-n-{uid}", f"QATypeNews {uid}", _first_news_cat(client))

    rp = client.get("/api/v1/search", params={"q": "QAType", "type": "product"}).json()["data"]
    assert rp["total"] >= 1
    assert all(it["kind"] == "product" for it in rp["items"]), rp

    rn = client.get("/api/v1/search", params={"q": "QAType", "type": "news"}).json()["data"]
    assert rn["total"] >= 1
    assert all(it["kind"] == "news" for it in rn["items"]), rn
