"""M2 新闻服务测试（§3.2.M2）。

覆盖：列表 / 详情 / 创建 / slug 唯一冲突 A020002 /
**HTML 清洗（XSS 防护）**：提交含 <script> 的 content_html，返回内容应被清洗。

安全关键点：存储型 XSS 防护，详情与创建返回均不得含 <script> 标签。
"""
from __future__ import annotations

import uuid

ADMIN = ("admin", "Songdian@2026")


def _admin_headers(client) -> dict:
    resp = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("code") in (0, "0"), body
    return {}


def _first_category_id(client) -> int:
    cats = client.get("/api/v1/news-categories").json()["data"]
    assert cats, "种子应注入新闻分类"
    return cats[0]["id"]


def _create(client, headers, slug: str, content_html: str, title: str = "QA News", status: str = "PUBLISHED") -> object:
    payload = {
        "title": title,
        "slug": slug,
        "summary": "QA 测试新闻摘要",
        "content_html": content_html,
        "category_id": _first_category_id(client),
        "author": "QA",
        "status": status,
    }
    return client.post("/api/v1/admin/news", headers=headers, json=payload)


def test_news_list(client):
    h = _admin_headers(client)
    uid = uuid.uuid4().hex[:8]
    for i in range(2):
        _create(client, h, f"qa-news-{uid}-{i}", "<p>news</p>", title=f"QA News {i}")
    r = client.get("/api/v1/news", params={"page": 1, "page_size": 1})
    body = r.json()
    assert body["code"] in (0, "0"), body
    assert body["data"]["total"] >= 2
    assert len(body["data"]["list"]) == 1


def test_news_detail(client):
    h = _admin_headers(client)
    slug = f"qa-news-detail-{uuid.uuid4().hex[:8]}"
    _create(client, h, slug, "<p>detail body</p>", title="QA News Detail")
    r = client.get(f"/api/v1/news/{slug}")
    body = r.json()
    assert body["code"] in (0, "0"), body
    assert body["data"]["slug"] == slug


def test_news_write_invalidates_list_cache(client):
    """后台发布新闻后，公开列表不等待 TTL 即可看到新记录。"""
    h = _admin_headers(client)
    before = client.get("/api/v1/news", params={"page": 1, "page_size": 50}).json()["data"]
    slug = f"qa-news-invalidate-{uuid.uuid4().hex[:8]}"
    created = _create(client, h, slug, "<p>fresh</p>", title="Fresh News")
    assert created.json()["code"] in (0, "0")
    after = client.get("/api/v1/news", params={"page": 1, "page_size": 50}).json()["data"]
    assert after["total"] == before["total"] + 1


def test_news_html_cleaning_xss(client):
    """提交的 content_html 含 <script>，落库/返回必须被清洗（无 script 标签）。"""
    h = _admin_headers(client)
    slug = f"qa-news-xss-{uuid.uuid4().hex[:8]}"
    dirty = '<p>hello</p><script>alert("xss")</script><img src=x onerror=alert(1)>'
    r = _create(client, h, slug, dirty, title="QA XSS News")
    body = r.json()
    assert body["code"] in (0, "0"), body
    cleaned = body["data"]["content_html"]
    assert "<script" not in cleaned, f"content_html 未清洗 XSS：{cleaned}"
    assert "onerror" not in cleaned.lower(), f"事件属性未清洗：{cleaned}"
    # 详情接口同样应已清洗
    det = client.get(f"/api/v1/news/{slug}").json()
    assert "<script" not in det["data"]["content_html"], "详情接口返回未清洗"


def test_create_news_requires_login(client):
    slug = f"qa-news-auth-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/v1/admin/news",
        json={
            "title": "No Auth", "slug": slug, "summary": "x",
            "content_html": "<p>x</p>", "category_id": _first_category_id(client),
        },
    )
    assert r.status_code == 401, r.text
    assert r.json()["code"] == "C401001"


def test_create_news_slug_conflict_A020002(client):
    h = _admin_headers(client)
    slug = f"qa-news-conflict-{uuid.uuid4().hex[:8]}"
    r1 = _create(client, h, slug, "<p>first</p>")
    assert r1.json()["code"] in (0, "0")
    r2 = _create(client, h, slug, "<p>dup</p>", title="QA Dup")
    body = r2.json()
    assert r2.status_code == 200
    assert body["code"] == "A020002", body


def test_news_soft_delete(client):
    h = _admin_headers(client)
    slug = f"qa-news-del-{uuid.uuid4().hex[:8]}"
    r = _create(client, h, slug, "<p>del</p>", title="QA News Del")
    nid = r.json()["data"]["id"]
    d = client.delete(f"/api/v1/admin/news/{nid}", headers=h)
    assert d.json()["code"] in (0, "0"), d.text
    det = client.get(f"/api/v1/news/{slug}")
    assert det.status_code == 200
    assert det.json()["code"] == "A020001", det.json()
