"""详情缓存版本校验回归测试（P2-13）。

设计：详情缓存键纳入版本号（``product:detail:{slug}:v{n}``）。写入失效时递增版本，
即"换 key"，因此「读旧数据 → 写入并失效 → 旧请求回填」的旧请求只会把数据写到
不再被读取的旧版本键，后续读取走新键，不会命中陈旧内容。
"""
from __future__ import annotations

import json
import uuid

from common.cache_version import bump_content_version, get_content_version
from common.redis_client import cache_key, get_redis
from product import services as product_services


def login(client):
    response = client.post(
        "/api/v1/admin/login", json={"username": "admin", "password": "Songdian@2026"}
    )
    assert response.json()["code"] == "0", response.text


def create_published_product(client) -> str:
    category_id = client.get("/api/v1/product-categories").json()["data"][0]["id"]
    payload = {
        "title": "Cache Version Product",
        "slug": "qa-cache-" + uuid.uuid4().hex,
        "summary": "Summary",
        "content_html": "<p>body</p>",
        "category_id": category_id,
        "status": "PUBLISHED",
    }
    response = client.post("/api/v1/admin/products", json=payload)
    assert response.json()["code"] == "0", response.text
    return response.json()["data"]["slug"]


def test_content_version_snapshot_changes_after_bump(client):
    async def check():
        before = await get_content_version("product", "qa-ver-slug")
        await bump_content_version("product", "qa-ver-slug")
        after = await get_content_version("product", "qa-ver-slug")
        assert before != after, "递增后版本快照必须变化"

    client.portal.call(check)


def test_stale_refill_is_never_served_after_version_bump(client):
    """并发旧请求把旧数据回填到旧版本键后，后续读取必须回源数据库而非命中旧键。"""
    login(client)
    slug = create_published_product(client)

    async def check():
        # 1) 旧请求开始：取得当时的版本号。
        stale_version = await get_content_version("product", slug)
        # 2) 写入发生并失效：版本递增（模拟并发写入完成）。
        await bump_content_version("product", slug)
        # 3) 旧请求回填"陈旧数据"到旧版本键。
        stale_key = cache_key("product", "detail", slug, f"v{stale_version}")
        await get_redis().setex(stale_key, 3600, json.dumps({"slug": slug, "title": "STALE"}))

        # 4) 新读取：必须走新版本键 → 未命中 → 回源数据库，绝不返回 STALE。
        vo = await product_services.get_product_detail(slug)
        assert vo.title != "STALE"
        # 5) 新版本键应已被回填。
        current_version = await get_content_version("product", slug)
        fresh = await get_redis().get(cache_key("product", "detail", slug, f"v{current_version}"))
        assert fresh is not None

    client.portal.call(check)


def test_detail_read_populates_and_serves_versioned_cache(client):
    """正向对照：版本未变化时正常回填并可从缓存命中。"""
    login(client)
    slug = create_published_product(client)

    async def check():
        first = await product_services.get_product_detail(slug)
        version = await get_content_version("product", slug)
        raw = await get_redis().get(cache_key("product", "detail", slug, f"v{version}"))
        assert raw is not None, "首次读取应回填当前版本键"

        second = await product_services.get_product_detail(slug)
        assert second.title == first.title

    client.portal.call(check)
