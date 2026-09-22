"""媒体库相册计数与筛选口径回归测试。

背景（用户反馈）：侧边栏 Products / News 这类"大类"的图片实际挂在子相册下，
而 `/admin/albums` 只统计 album_id 直系素材，导致大类恒显示 0。
修复后：count=直系、total_count=子树合计；按相册筛选素材时同样包含全部子相册。
"""
from __future__ import annotations

import re
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


def test_banner_media_is_protected_from_deletion(client):
    import json
    from common.settings_model import Setting
    from uploads.services import get_upload_usage

    _login(client)

    async def seed():
        record = await UploadRecord.create(
            url="/uploads/qa/banner-mobile.webp", file_name="banner-mobile.webp", size=1,
        )
        await Setting.update_or_create(
            defaults={"value": json.dumps([
                None,
                {"url": "", "mobileUrl": "https://cdn.example.com/uploads/qa/banner-mobile.webp?v=2", "enabled": False},
            ])},
            key="home_banners",
        )
        return record.id

    record_id = client.portal.call(seed)
    usage = client.portal.call(get_upload_usage, "/uploads/qa/banner-mobile.webp")
    assert usage["count"] == 1
    assert usage["items"][0]["type"] == "home_banner"
    response = client.delete(f"/api/v1/admin/upload/{record_id}")
    assert response.status_code == 400, response.text
    assert response.json()["data"]["conflict"] is True

    async def clear():
        await Setting.filter(key="home_banners").update(value="[]")

    client.portal.call(clear)
    assert client.portal.call(get_upload_usage, "/uploads/qa/banner-mobile.webp")["count"] == 0


# ───────────────────────── 相册层级 / 别名健壮性（2026-09-22） ─────────────────────────
# 背景：编辑弹窗选「无（根级）」时发的是 parent_id=null，但后端把 None 当作
# "不修改"，改动被静默丢弃；同时后端只挡自引用，可把相册挂到自己的子孙下成环，
# 而 buildTree 从根遍历不到环上节点 → 整棵子树从侧边栏消失。
# 别名（slug）在更新路径无唯一性校验，撞库会落到 B999001 500。


def _unique_slug(name: str) -> str:
    return f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}"


def _create_album_data(client, name: str, slug: str | None = None, parent_id: int | None = None) -> dict:
    """建相册并返回接口 data（id / slug / parent_id）。"""
    payload: dict = {"name": name, "slug": slug if slug is not None else _unique_slug(name)}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = client.post("/api/v1/admin/albums", json=payload)
    assert response.json()["code"] == "0", response.text
    return response.json()["data"]


def _album_row(client, album_id: int) -> dict:
    """直接读库核对层级、别名与排序（不完全信任接口回显）。"""

    async def read() -> dict:
        album = await Album.get(id=album_id)
        return {
            "id": album.id,
            "name": album.name,
            "slug": album.slug,
            "sort_order": album.sort_order,
            "parent_id": album.parent_id,
        }

    return client.portal.call(read)


def test_update_album_can_move_back_to_root(client):
    """显式传 parent_id=null 必须真正移回根级；不传该字段则保持原父级。"""
    _login(client)
    parent = _create_album_data(client, "QA Move Parent")["id"]
    child = _create_album_data(client, "QA Move Child", parent_id=parent)["id"]
    assert _album_row(client, child)["parent_id"] == parent

    # 显式 null → 移到根级（修复前会被静默忽略，相册永远回不到根）
    response = client.put(f"/api/v1/admin/albums/{child}", json={"parent_id": None})
    assert response.json()["code"] == "0", response.text
    assert _album_row(client, child)["parent_id"] is None
    # 排序值也跟着落到新同级最前（不沿用旧父级的数值，否则位置不可预期）
    assert _album_row(client, child)["sort_order"] < _album_row(client, parent)["sort_order"]

    # 重新挂回父级后，只改名称（不传 parent_id）不应把父级也重置
    assert client.put(f"/api/v1/admin/albums/{child}", json={"parent_id": parent}).json()["code"] == "0"
    response = client.put(f"/api/v1/admin/albums/{child}", json={"name": "QA Move Child Renamed"})
    assert response.json()["code"] == "0", response.text
    row = _album_row(client, child)
    assert row["name"] == "QA Move Child Renamed"
    assert row["parent_id"] == parent

    # 语义钉死：name / sort_order 的显式 null 是「忽略」（只有 parent_id 的 null 表示移到根级）
    response = client.put(f"/api/v1/admin/albums/{child}", json={"name": None, "sort_order": None})
    assert response.json()["code"] == "0", response.text
    row = _album_row(client, child)
    assert row["name"] == "QA Move Child Renamed"
    assert row["sort_order"] == 0
    assert row["parent_id"] == parent

    # 空 body（没有任何字段）同样不报错、不改动
    response = client.put(f"/api/v1/admin/albums/{child}", json={})
    assert response.json()["code"] == "0", response.text
    assert _album_row(client, child)["parent_id"] == parent


def test_reparent_into_own_descendant_is_rejected(client):
    """把相册挂到自己或自己的子孙下会成环（子树会从树视图消失），必须拒绝且不改库。"""
    _login(client)
    root = _create_album_data(client, "QA Cycle Root")["id"]
    child = _create_album_data(client, "QA Cycle Child", parent_id=root)["id"]
    grand = _create_album_data(client, "QA Cycle Grand", parent_id=child)["id"]

    # 自引用
    response = client.put(f"/api/v1/admin/albums/{root}", json={"parent_id": root})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"

    # 子孙（最深一层）
    response = client.put(f"/api/v1/admin/albums/{root}", json={"parent_id": grand})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"

    # 层级未被污染
    assert _album_row(client, root)["parent_id"] is None
    assert _album_row(client, child)["parent_id"] == root
    assert _album_row(client, grand)["parent_id"] == child

    # 合法移动仍然可用（孙 → 根）
    assert client.put(f"/api/v1/admin/albums/{grand}", json={"parent_id": None}).json()["code"] == "0"
    assert _album_row(client, grand)["parent_id"] is None


def test_reparent_rides_out_pre_existing_cycle(client):
    """库里已有历史环（脏数据）时，上溯校验必须收敛：放行不含自身的链，接口不能卡死。"""
    _login(client)
    first = _create_album_data(client, "QA Dirty A")["id"]
    second = _create_album_data(client, "QA Dirty B", parent_id=first)["id"]
    other = _create_album_data(client, "QA Dirty Other")["id"]

    async def make_cycle() -> None:
        # 绕过接口直写 parent_id，模拟历史脏数据形成的 first ↔ second 环
        node = await Album.get(id=first)
        node.parent_id = second
        await node.save()

    client.portal.call(make_cycle)
    # other 不在环上 → 挂到环上应放行（seen 收敛，不会一直上溯）
    response = client.put(f"/api/v1/admin/albums/{other}", json={"parent_id": first})
    assert response.json()["code"] == "0", response.text
    assert _album_row(client, other)["parent_id"] == first
    # 带环时列表接口仍能返回（子树统计与筛选都有防环收敛）
    assert client.get("/api/v1/admin/albums").json()["code"] == "0"
    assert client.get("/api/v1/admin/upload/records?page=1&page_size=10").json()["code"] == "0"


# ───────────────────────── 同级排序与新建位置（2026-09-22 第二批） ─────────────────────────
# 背景：sort_order 默认值 0 与自动归档生成的一百多个子相册撞车，并列时前端按 id 升序，
# 于是「填 0」看起来排到了最后；两级排序口径（后端 -created_time / 前端 id）也不一致。


def _sibling_order(client, parent_id: int | None) -> list[int]:
    """按接口返回顺序取某父级下的相册 id（后端排序口径即侧栏渲染口径）。"""
    rows = client.get("/api/v1/admin/albums").json()["data"]["list"]
    return [int(item["id"]) for item in rows if item["parent_id"] == parent_id]


def _order_of(client, parent_id: int | None, ids: list[int]) -> list[int]:
    """只保留关注的那几个 id，便于断言相对顺序（不受库里其他相册影响）。"""
    wanted = set(ids)
    return [album_id for album_id in _sibling_order(client, parent_id) if album_id in wanted]


def test_reorder_albums_writes_index_order(client):
    """同级重排：数组下标即 sort_order，接口顺序与传入一致（根级与子级都适用）。"""
    _login(client)
    first = _create_album_data(client, "QA Sort A")["id"]
    second = _create_album_data(client, "QA Sort B")["id"]
    third = _create_album_data(client, "QA Sort C")["id"]
    # 新建默认排同级最前 → 初始顺序是「越晚建的越靠前」
    assert _order_of(client, None, [first, second, third]) == [third, second, first]

    response = client.put("/api/v1/admin/albums/sort", json={"parent_id": None, "ids": [first, third, second]})
    assert response.json()["code"] == "0", response.text
    assert _order_of(client, None, [first, second, third]) == [first, third, second]
    assert [_album_row(client, album_id)["sort_order"] for album_id in (first, third, second)] == [0, 1, 2]

    # 子级同样按数组下标回写
    child_a = _create_album_data(client, "QA Sort Child A", parent_id=first)["id"]
    child_b = _create_album_data(client, "QA Sort Child B", parent_id=first)["id"]
    assert _sibling_order(client, first) == [child_b, child_a]
    response = client.put(
        "/api/v1/admin/albums/sort", json={"parent_id": first, "ids": [child_a, child_b]}
    )
    assert response.json()["code"] == "0", response.text
    assert _sibling_order(client, first) == [child_a, child_b]
    assert [_album_row(client, album_id)["sort_order"] for album_id in (child_a, child_b)] == [0, 1]


def test_reorder_albums_rejects_foreign_parent(client):
    """跨父级排序被拒（父子关系必须走更新接口），且不写库。"""
    _login(client)
    parent = _create_album_data(client, "QA Foreign A")["id"]
    outsider = _create_album_data(client, "QA Foreign B")["id"]
    child = _create_album_data(client, "QA Foreign Child", parent_id=parent)["id"]

    response = client.put("/api/v1/admin/albums/sort", json={"parent_id": parent, "ids": [child, outsider]})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"
    assert _album_row(client, child)["parent_id"] == parent
    assert _album_row(client, outsider)["parent_id"] is None

    # 不存在的相册同样被拒
    response = client.put("/api/v1/admin/albums/sort", json={"parent_id": None, "ids": [99999999]})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"


def test_reorder_albums_rejects_duplicates_and_empty(client):
    """重复 id / 空列表被拒（避免写出一组互相覆盖的顺序）。"""
    _login(client)
    album = _create_album_data(client, "QA Dup A")["id"]
    response = client.put("/api/v1/admin/albums/sort", json={"parent_id": None, "ids": [album, album]})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"

    response = client.put("/api/v1/admin/albums/sort", json={"parent_id": None, "ids": []})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"


def test_create_album_defaults_to_front_of_siblings(client):
    """缺省排序 = 同级最前（不再是会与自动归档相册撞车的 0）；显式传值仍按传入值。"""
    _login(client)
    parent = _create_album_data(client, "QA Front Parent")["id"]
    first = _create_album_data(client, "QA Front 1", parent_id=parent)["id"]
    second = _create_album_data(client, "QA Front 2", parent_id=parent)["id"]
    assert _album_row(client, first)["sort_order"] == 0     # 同级为空 → 0
    assert _album_row(client, second)["sort_order"] == -1   # 之后每次再往前一格
    assert _order_of(client, parent, [first, second]) == [second, first]

    # 显式传 sort_order 仍按传入值（API 兼容；前端弹窗已不再传该字段）
    explicit = _create_album_data(client, "QA Front 3", parent_id=parent)["id"]
    assert _album_row(client, explicit)["sort_order"] == -2
    assert client.put(f"/api/v1/admin/albums/{explicit}", json={"sort_order": 7}).json()["code"] == "0"
    assert _album_row(client, explicit)["sort_order"] == 7


def test_reorder_albums_partial_subset_keeps_unlisted_values(client):
    """只传部分同级时未列出的保持原值（UI 始终传全量；API 语义在此钉死，避免误以为会整体归一化）。"""
    _login(client)
    first = _create_album_data(client, "QA Subset A")["id"]
    second = _create_album_data(client, "QA Subset B")["id"]
    third = _create_album_data(client, "QA Subset C")["id"]
    # 初始（新建排同级最前）：first=0, second=-1, third=-2
    assert [_album_row(client, i)["sort_order"] for i in (first, second, third)] == [0, -1, -2]

    response = client.put("/api/v1/admin/albums/sort", json={"parent_id": None, "ids": [first, second]})
    assert response.json()["code"] == "0", response.text
    assert [_album_row(client, i)["sort_order"] for i in (first, second, third)] == [0, 1, -2]
    assert _order_of(client, None, [first, second, third]) == [third, first, second]


def test_album_sort_order_must_be_finite_and_in_range(client):
    """显式 sort_order 必须是有限数值且在允许范围内（F-18 口径，NaN 会让前端排序彻底错乱）。"""
    _login(client)
    album = _create_album_data(client, "QA Range")["id"]

    response = client.put(f"/api/v1/admin/albums/{album}", json={"sort_order": 1e9})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"
    # 裸 NaN 不能走 json= 序列化（httpx 拒绝），但手写 body 时 Python 的 JSON 解析器会接受，
    # 落库后前端 `a.sort_order - b.sort_order` 会变成 NaN 让排序彻底错乱 → 必须挡住
    response = client.put(
        f"/api/v1/admin/albums/{album}",
        content='{"sort_order": NaN}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"
    # 越界被拒后原值不变
    assert _album_row(client, album)["sort_order"] == 0
    # 允许范围内仍然可用
    assert client.put(f"/api/v1/admin/albums/{album}", json={"sort_order": -999999}).json()["code"] == "0"
    assert _album_row(client, album)["sort_order"] == -999999


def test_list_albums_tie_break_by_id(client):
    """sort_order 并列时按 id 升序（与前端 buildTree 的 `sort_order asc || id asc` 口径一致）。"""
    _login(client)
    older = _create_album_data(client, "QA Tie Older")["id"]
    newer = _create_album_data(client, "QA Tie Newer")["id"]
    for album_id in (older, newer):
        assert client.put(f"/api/v1/admin/albums/{album_id}", json={"sort_order": 5}).json()["code"] == "0"
    assert _order_of(client, None, [older, newer]) == [older, newer]


def test_update_album_slug_conflict_returns_friendly_error(client):
    """别名撞车返回 C400001 友好提示，而不是 slug 唯一约束抛出的 500。"""
    _login(client)
    first = _create_album_data(client, "QA Slug First")
    second = _create_album_data(client, "QA Slug Second")

    response = client.put(f"/api/v1/admin/albums/{second['id']}", json={"slug": first["slug"]})
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["code"] == "C400001"
    assert "占用" in body["msg"], body
    # 原别名与数据未被改动
    assert _album_row(client, second["id"])["slug"] == second["slug"]

    # 提交自己的别名（值未变化）不算冲突
    response = client.put(f"/api/v1/admin/albums/{second['id']}", json={"slug": second["slug"]})
    assert response.json()["code"] == "0", response.text


def test_album_slug_format_is_validated(client):
    """非法别名（中文等会被剥成空串）返回友好错误；纯中文名可回退到随机别名。"""
    _login(client)
    # 显式传入无法归一化的别名 → 拒绝，避免落库不可读 slug
    response = client.post("/api/v1/admin/albums", json={"name": "中文别名相册", "slug": "中文别名"})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"

    # 纯中文名称、未指定别名 → 回退随机别名（保持可创建，不回退成空字符串）
    response = client.post("/api/v1/admin/albums", json={"name": "中文名相册"})
    assert response.json()["code"] == "0", response.text
    created = response.json()["data"]
    assert re.fullmatch(r"album-[0-9a-f]{6}", created["slug"]), created

    # 更新时同样拒绝非法别名，且原值不变
    response = client.put(f"/api/v1/admin/albums/{created['id']}", json={"slug": "中文"})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "C400001"
    assert _album_row(client, created["id"])["slug"] == created["slug"]
    # 合法别名照常生效
    assert client.put(f"/api/v1/admin/albums/{created['id']}", json={"slug": "qa-renamed-ok"}).json()["code"] == "0"
    assert _album_row(client, created["id"])["slug"] == "qa-renamed-ok"


def test_create_album_normalizes_uppercase_slug(client):
    """别名大小写/分隔符按同一规则归一化（与自动生成口径一致）。"""
    _login(client)
    created = _create_album_data(client, "QA Normalize", slug="QA_Normalize Slug")
    assert created["slug"] == "qa-normalize-slug", created
