"""M1 产品服务测试（§3.2.M1 / 蓝图 §1）。

覆盖：列表分页 / 详情 / 创建(需登录) / slug 唯一冲突 A010002 / 软删 /
详情缓存命中不报错。

环境：SQLite + 内存 Redis 降级；每个用例由 conftest 的 _qa_isolate_state 隔离
（独立 DB 文件 + 独立内存 Redis），admin/admin 由种子注入。
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


def _first_category_id(client) -> int:
    cats = client.get("/api/v1/product-categories").json()["data"]
    assert cats, "种子应注入产品分类"
    return cats[0]["id"]


def _create(client, headers, slug: str, title: str = "QA Product", status: str = "PUBLISHED") -> dict:
    payload = {
        "title": title,
        "slug": slug,
        "summary": "QA 测试产品摘要",
        "content_html": "<p>QA <b>content</b></p>",
        "category_id": _first_category_id(client),
        "price": 1999.00,
        "currency": "CNY",
        "stock_status": "instock",
        "status": status,
    }
    resp = client.post("/api/v1/admin/products", headers=headers, json=payload)
    return resp


def test_products_list_pagination(client):
    h = _admin_headers(client)
    uid = uuid.uuid4().hex[:8]
    for i in range(3):
        _create(client, h, f"qa-pag-{uid}-{i}", title=f"QA Pag {i}")

    # 第一页 page_size=2 → 返回 2 条，total>=3
    r = client.get("/api/v1/products", params={"page": 1, "page_size": 2})
    body = r.json()
    assert body["code"] in (0, "0"), body
    data = body["data"]
    assert data["total"] >= 3
    assert len(data["list"]) == 2

    # 第二页 page_size=2 → 返回剩余（数量 = total-2 当 total<=4；否则仍为 2）
    r2 = client.get("/api/v1/products", params={"page": 2, "page_size": 2})
    d2 = r2.json()["data"]
    assert d2["total"] == data["total"], "跨页 total 应一致"
    if data["total"] <= 4:
        assert len(d2["list"]) == data["total"] - 2
    else:
        assert len(d2["list"]) == 2
    # 两页 id 不重复（分页无重叠）
    ids1 = {x["id"] for x in data["list"]}
    ids2 = {x["id"] for x in d2["list"]}
    assert ids1.isdisjoint(ids2)


def test_product_detail(client):
    h = _admin_headers(client)
    slug = f"qa-detail-{uuid.uuid4().hex[:8]}"
    _create(client, h, slug, title="QA Detail Product")
    r = client.get(f"/api/v1/products/{slug}")
    body = r.json()
    assert body["code"] in (0, "0"), body
    assert body["data"]["slug"] == slug
    assert "content_html" in body["data"]


def test_product_detail_cache_hit_no_error(client):
    """详情缓存命中（MemoryBackend 降级）不应报错，且与首次结果一致。"""
    h = _admin_headers(client)
    slug = f"qa-cache-{uuid.uuid4().hex[:8]}"
    _create(client, h, slug, title="QA Cache Product")
    first = client.get(f"/api/v1/products/{slug}").json()
    assert first["code"] in (0, "0")
    # 第二次请求走缓存命中路径
    second = client.get(f"/api/v1/products/{slug}").json()
    assert second["code"] in (0, "0"), second
    assert second["data"]["slug"] == first["data"]["slug"]
    assert second["data"]["id"] == first["data"]["id"]


def test_create_product_requires_login(client):
    slug = f"qa-auth-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/v1/admin/products",
        json={
            "title": "No Auth", "slug": slug, "summary": "x",
            "content_html": "<p>x</p>", "category_id": _first_category_id(client),
        },
    )
    assert r.status_code == 401, r.text
    assert r.json()["code"] == "C401001"


def test_create_product_success(client):
    h = _admin_headers(client)
    slug = f"qa-create-{uuid.uuid4().hex[:8]}"
    r = _create(client, h, slug, title="QA Create Product")
    body = r.json()
    assert body["code"] in (0, "0"), body
    d = body["data"]
    assert d["slug"] == slug
    assert d["title"] == "QA Create Product"
    assert d["status"] == "PUBLISHED"
    # price 为 Decimal 字段，JSON 序列化为字符串（"1999"）；按数值比较
    assert float(d["price"]) == 1999.0, d
    assert d.get("category") is not None


def test_create_product_slug_conflict_A010002(client):
    h = _admin_headers(client)
    slug = f"qa-conflict-{uuid.uuid4().hex[:8]}"
    r1 = _create(client, h, slug)
    assert r1.json()["code"] in (0, "0")
    # 重复 slug → A010002（业务码，HTTP 200）
    r2 = _create(client, h, slug, title="QA Conflict Dup")
    body = r2.json()
    assert r2.status_code == 200
    assert body["code"] == "A010002", body


def test_create_product_invalid_slug_returns_4xx_not_500(client):
    """非法 slug（含下划线，违背 ^[a-z0-9-]+$）应返回 4xx 校验错误，绝不应 500 崩溃。

    暴露源码 Bug A：common/exceptions.py 的 _validation_handler 对 pydantic
    field_validator 抛出的 ValueError，在序列化 exc.errors() 时因含 ValueError 对象
    而 TypeError → 500 崩溃。非法输入应被优雅拒绝（4xx），而非拖垮服务端。
    """
    h = _admin_headers(client)
    payload = {
        "title": "Bad Slug", "slug": "Bad_Slug_X", "summary": "x",
        "content_html": "<p>x</p>", "category_id": _first_category_id(client),
        "status": "PUBLISHED",
    }
    r = client.post("/api/v1/admin/products", headers=h, json=payload)
    assert r.status_code != 500, (
        f"非法 slug 导致服务端校验处理器 500 崩溃（源码 Bug A）：{r.text[:300]}"
    )
    assert r.status_code in (400, 422), (
        f"非法 slug 应返回 4xx 校验错误，实际 HTTP={r.status_code}：{r.text[:300]}"
    )


def test_product_soft_delete(client):
    h = _admin_headers(client)
    slug = f"qa-delete-{uuid.uuid4().hex[:8]}"
    r = _create(client, h, slug, title="QA Delete Product")
    pid = r.json()["data"]["id"]
    # 软删
    d = client.delete(f"/api/v1/admin/products/{pid}", headers=h)
    assert d.json()["code"] in (0, "0"), d.text
    # 详情应返回 A010001（已软删，deleted=1 不可见）
    det = client.get(f"/api/v1/products/{slug}")
    assert det.status_code == 200
    assert det.json()["code"] == "A010001", det.json()
