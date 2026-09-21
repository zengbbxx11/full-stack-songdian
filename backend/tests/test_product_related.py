"""产品「关联产品」测试（后台手选、单向、最多 4 个）。

覆盖：顺序保持 / 上限 4 / 去重 / 不允许关联自身 / 目标不存在或已删除 /
公开详情只返已发布 / 后台详情含草稿 / 未提交保留、空数组清空 / 改关联后公开详情立即刷新。

环境：SQLite + 内存 Redis 降级；每个用例由 conftest 的 _qa_isolate_state 隔离。
"""
from __future__ import annotations

import uuid

ADMIN = ("admin", "Songdian@2026")


def _login(client) -> dict:
    resp = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    assert resp.status_code == 200, resp.text
    assert resp.json().get("code") in (0, "0"), resp.text
    return {}


def _first_category_id(client) -> int:
    cats = client.get("/api/v1/product-categories").json()["data"]
    assert cats, "种子应注入产品分类"
    return cats[0]["id"]


def _create(client, headers, slug: str, *, title: str = "QA Related", status: str = "PUBLISHED",
            related: list[int] | None = None) -> dict:
    payload: dict = {
        "title": title,
        "slug": slug,
        "summary": "QA 关联产品摘要",
        "content_html": "<p>QA content</p>",
        "category_id": _first_category_id(client),
        "stock_status": "instock",
        "status": status,
    }
    if related is not None:
        payload["related_product_ids"] = related
    resp = client.post("/api/v1/admin/products", headers=headers, json=payload)
    assert resp.status_code == 200 and resp.json()["code"] in (0, "0"), resp.text
    return resp.json()["data"]


def _related_ids(vo: dict) -> list[int]:
    return [int(p["id"]) for p in vo.get("related", [])]


def test_related_order_and_limit(client):
    """按后台选择顺序返回；超过 4 个按 400 拒绝。"""
    h = _login(client)
    uid = uuid.uuid4().hex[:8]
    targets = [_create(client, h, f"qa-rel-t{i}-{uid}", title=f"QA Rel T{i}") for i in range(6)]
    ids = [t["id"] for t in targets]

    main = _create(client, h, f"qa-rel-main-{uid}", related=[ids[2], ids[0], ids[1]])
    assert _related_ids(main) == [ids[2], ids[0], ids[1]], "创建时应保持传入顺序"

    r4 = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": ids[:4]},
    )
    assert r4.json()["code"] in (0, "0"), r4.text
    assert _related_ids(r4.json()["data"]) == ids[:4]

    r5 = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": ids[:5]},
    )
    assert r5.status_code == 400, r5.text
    assert r5.json()["code"] == "C400001"
    # 被拒绝的请求不应留下部分写入
    assert _related_ids(client.get(f"/api/v1/admin/products/{main['id']}").json()["data"]) == ids[:4]


def test_related_dedupe_self_and_missing(client):
    """重复项自动去重；不允许关联自身；目标不存在/已删除一律 400。"""
    h = _login(client)
    uid = uuid.uuid4().hex[:8]
    a = _create(client, h, f"qa-rel-a-{uid}", title="QA Rel A")
    b = _create(client, h, f"qa-rel-b-{uid}", title="QA Rel B")
    main = _create(client, h, f"qa-rel-main2-{uid}")

    deduped = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": [a["id"], a["id"], b["id"]]},
    )
    assert deduped.json()["code"] in (0, "0"), deduped.text
    assert _related_ids(deduped.json()["data"]) == [a["id"], b["id"]], "重复项应去重且保序"

    self_link = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": [main["id"]]},
    )
    assert self_link.status_code == 400, self_link.text

    missing = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": [987654321]},
    )
    assert missing.status_code == 400, missing.text

    # 目标被软删（运营控制之外的状态变化）→ 静默剔除，不整体阻断保存
    assert client.delete(f"/api/v1/admin/products/{b['id']}", headers=h).json()["code"] in (0, "0")
    dropped = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": [a["id"], b["id"]]},
    )
    assert dropped.json()["code"] in (0, "0"), dropped.text
    assert _related_ids(dropped.json()["data"]) == [a["id"]], "已删除目标应被静默剔除"


def test_related_public_hides_unpublished_and_admin_keeps_all(client):
    """公开详情只含已发布目标（防草稿泄漏）；后台详情返回全部已保存目标供回填。"""
    h = _login(client)
    uid = uuid.uuid4().hex[:8]
    live = _create(client, h, f"qa-rel-live-{uid}", title="QA Rel Live", status="PUBLISHED")
    draft = _create(client, h, f"qa-rel-draft-{uid}", title="QA Rel Draft", status="DRAFT")
    main = _create(client, h, f"qa-rel-main3-{uid}")

    updated = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": [live["id"], draft["id"]]},
    )
    assert updated.json()["code"] in (0, "0"), updated.text

    admin_vo = client.get(f"/api/v1/admin/products/{main['id']}").json()["data"]
    assert _related_ids(admin_vo) == [live["id"], draft["id"]]

    public_vo = client.get(f"/api/v1/products/{main['slug']}").json()["data"]
    assert _related_ids(public_vo) == [live["id"]], "草稿关联不应出现在公开详情"


def test_related_omit_keeps_existing_and_empty_clears(client):
    """未提交 related_product_ids 保留原值；显式空数组清空（与 tags 语义一致）。"""
    h = _login(client)
    uid = uuid.uuid4().hex[:8]
    target = _create(client, h, f"qa-rel-keep-{uid}")
    main = _create(client, h, f"qa-rel-main4-{uid}", related=[target["id"]])

    kept = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h, json={"title": "QA Renamed"}
    ).json()
    assert kept["code"] in (0, "0"), kept
    assert kept["data"]["title"] == "QA Renamed"
    assert _related_ids(kept["data"]) == [target["id"]], "未提交该字段时应保留原关联"

    cleared = client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h, json={"related_product_ids": []}
    ).json()
    assert cleared["code"] in (0, "0"), cleared
    assert _related_ids(cleared["data"]) == []


def test_related_change_invalidates_public_detail_cache(client):
    """先命中详情缓存，再改关联，公开详情必须立刻反映新关联（缓存失效链路）。"""
    h = _login(client)
    uid = uuid.uuid4().hex[:8]
    target = _create(client, h, f"qa-rel-cache-t-{uid}", title="QA Rel Cache T")
    main = _create(client, h, f"qa-rel-cache-m-{uid}")

    first = client.get(f"/api/v1/products/{main['slug']}").json()["data"]
    assert _related_ids(first) == []

    assert client.put(
        f"/api/v1/admin/products/{main['id']}", headers=h,
        json={"related_product_ids": [target["id"]]},
    ).json()["code"] in (0, "0")

    second = client.get(f"/api/v1/products/{main['slug']}").json()["data"]
    assert _related_ids(second) == [target["id"]], "改关联后旧详情缓存不得继续命中"


def test_related_target_change_invalidates_referrer_cache(client):
    """目标产品被下架/删除后，**引用方**产品页缓存也必须失效（否则前台残留死链卡片）。

    关联是反向依赖：只失效目标自身的缓存不够，必须反查引用方（services._referrer_slugs）。
    """
    h = _login(client)
    uid = uuid.uuid4().hex[:8]
    target = _create(client, h, f"qa-rel-ref-t-{uid}", title="QA Rel Ref T")
    main = _create(client, h, f"qa-rel-ref-m-{uid}", related=[target["id"]])

    first = client.get(f"/api/v1/products/{main['slug']}").json()["data"]
    assert _related_ids(first) == [target["id"]]  # 此时 main 的详情缓存已被填充

    # 目标下架 → 引用页立即少显示一条（不能继续命中旧缓存）
    assert client.put(
        f"/api/v1/admin/products/{target['id']}", headers=h, json={"status": "DRAFT"}
    ).json()["code"] in (0, "0")
    assert _related_ids(client.get(f"/api/v1/products/{main['slug']}").json()["data"]) == [], \
        "目标下架后引用页不应继续缓存关联卡片"

    # 目标重新上架 → 再次出现
    assert client.put(
        f"/api/v1/admin/products/{target['id']}", headers=h, json={"status": "PUBLISHED"}
    ).json()["code"] in (0, "0")
    assert _related_ids(client.get(f"/api/v1/products/{main['slug']}").json()["data"]) == [target["id"]]

    # 目标被删除 → 引用页同样立即刷新（不留死链）
    assert client.delete(f"/api/v1/admin/products/{target['id']}", headers=h).json()["code"] in (0, "0")
    assert _related_ids(client.get(f"/api/v1/products/{main['slug']}").json()["data"]) == []
