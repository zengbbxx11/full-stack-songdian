"""媒体库相册计数与筛选口径回归测试。

背景（用户反馈）：侧边栏 Products / News 这类"大类"的图片实际挂在子相册下，
而 `/admin/albums` 只统计 album_id 直系素材，导致大类恒显示 0。
修复后：count=直系、total_count=子树合计；按相册筛选素材时同样包含全部子相册。
"""
from __future__ import annotations

import uuid

import pytest

from uploads.models import Album, UploadRecord


def _login(client):
    response = client.post(
        "/api/v1/admin/login", json={"username": "admin", "password": "Songdian@2026"}
    )
    assert response.json()["code"] == "0", response.text


def _create_album(client, name: str, parent_id: int | None = None) -> int:
    payload = {"name": name, "slug": f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}"}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = client.post("/api/v1/admin/albums", json=payload)
    assert response.json()["code"] == "0", response.text
    return response.json()["data"]["id"]


@pytest.fixture
def album_tree(client):
    """构造 Products → Action Camera → Lens 三层 + 独立 News，并放入素材。

    素材直接用 ORM 落库（不写磁盘），因为计数/筛选只依赖数据库行。
    """
    _login(client)
    root = _create_album(client, "QA Products")
    child = _create_album(client, "QA Action Camera", parent_id=root)
    leaf = _create_album(client, "QA Lens", parent_id=child)
    news = _create_album(client, "QA News")

    async def seed():
        rows = [
            ("/uploads/products/qa/leaf-1.png", leaf),
            ("/uploads/products/qa/leaf-2.png", leaf),
            ("/uploads/products/qa/child-1.png", child),
            ("/uploads/products/qa/root-1.png", root),
            ("/uploads/products/qa/root-2.png", root),
            ("/uploads/products/qa/root-3.png", root),
            ("/uploads/news/qa/news-1.png", news),
            ("/uploads/qa/uncategorized-1.png", None),
        ]
        for url, album_id in rows:
            await UploadRecord.create(
                url=url, file_name=url.rsplit("/", 1)[-1], size=1, uploaded_by="admin",
                album_id=album_id,
            )

    client.portal.call(seed)
    return {"root": root, "child": child, "leaf": leaf, "news": news}


def test_album_counts_include_descendants(client, album_tree):
    """count=直系，total_count=含全部子相册的合计。"""
    response = client.get("/api/v1/admin/albums")
    assert response.json()["code"] == "0", response.text
    data = response.json()["data"]
    by_id = {item["id"]: item for item in data["list"]}

    root = by_id[album_tree["root"]]
    child = by_id[album_tree["child"]]
    leaf = by_id[album_tree["leaf"]]
    news = by_id[album_tree["news"]]

    # Products 大类：直系 3，子树 3 + 1 + 2 = 6（修复前这里只会显示 0）
    assert root["count"] == 3
    assert root["total_count"] == 6

    # Action Camera：直系 1，子树 1 + 2 = 3
    assert child["count"] == 1
    assert child["total_count"] == 3

    # 叶子：直系 2，子树 2
    assert leaf["count"] == 2
    assert leaf["total_count"] == 2

    # 独立根相册：直系 1，子树 1
    assert news["count"] == 1
    assert news["total_count"] == 1

    # 未分类仍按 album_id IS NULL 统计
    assert data["uncategorized"] == 1


def test_record_filter_follows_album_subtree(client, album_tree):
    """按相册筛选素材时包含全部子相册，与侧边栏计数口径一致。"""
    root_id = album_tree["root"]
    child_id = album_tree["child"]
    leaf_id = album_tree["leaf"]

    def _total(album_id: int | None, extra: str = "") -> int:
        query = f"/api/v1/admin/upload/records?page=1&page_size=50{extra}"
        if album_id is not None:
            query += f"&album_id={album_id}"
        body = client.get(query).json()
        assert body["code"] == "0", body
        return body["data"]["total"]

    # 大类：6 条（自身 3 + 子 1 + 孙 2）
    assert _total(root_id) == 6
    # 中间层：3 条
    assert _total(child_id) == 3
    # 叶子：2 条
    assert _total(leaf_id) == 2
    # 未分类：album_id=0
    assert _total(0) == 1
    # 不带筛选：全部 8 条
    assert _total(None) == 8


def test_rollup_totals_match_subtree(client, album_tree):
    """rollup_album_totals 直接对模型列表计算的子树合计与接口返回一致。"""
    from uploads import services

    payload = client.get("/api/v1/admin/albums").json()["data"]
    counts = {int(item["id"]): int(item["count"]) for item in payload["list"]}
    expected = {int(item["id"]): int(item["total_count"]) for item in payload["list"]}

    async def check():
        rows = await Album.all()
        totals = services.rollup_album_totals(list(rows), counts)
        # 只校验本用例构造的相册，避免受种子/其他数据影响
        for album_id in album_tree.values():
            assert totals[int(album_id)] == expected[int(album_id)]

    client.portal.call(check)
