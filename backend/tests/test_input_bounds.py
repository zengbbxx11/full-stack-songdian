"""输入边界回归：非法分页 / 非对象请求体 / 超长上传字段必须是 4xx，而不是 500。

背景（2026-09-17 缺陷排查）：
- `PageRequest` 无边界约束 → `?page_size=-1` 得到 limit=-1（PG 报 LIMIT 错误 → 500；
  SQLite 把负 LIMIT 当无上限 → 绕过 50 条上限返回全表）。
- `/admin/settings` 直接 `await request.json()` 后 `.get()/.items()` → 空体或非对象 body → 500；
  `{"value": null}` 会触发 TextField NOT NULL 违约 → 500。
- 上传 `title` / 文件名无长度上限 → CharField 校验失败 → 500。
"""
from __future__ import annotations

import base64
import uuid

from uploads import services as upload_services

# 1×1 PNG（扩展名与魔数一致，可通过上传校验）
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII="
)


def login(client) -> None:
    body = client.post("/api/v1/admin/login", json={"username": "admin", "password": "Songdian@2026"}).json()
    assert body["code"] == "0"


def test_public_lists_reject_unsafe_pagination(client):
    for path in ("/api/v1/products", "/api/v1/news"):
        for query in ("page_size=-1", "page_size=0", "page=0", "page_size=51"):
            response = client.get(f"{path}?{query}")
            assert response.status_code == 400, (path, query, response.status_code, response.text)
    ok = client.get("/api/v1/products?page=1&page_size=20")
    assert ok.status_code == 200 and ok.json()["code"] == "0"


def test_settings_reject_non_object_body_and_null_value(client):
    login(client)
    assert client.put("/api/v1/admin/settings/ga_id", json=[]).status_code == 400
    assert client.put("/api/v1/admin/settings/ga_id", json="x").status_code == 400
    assert client.put("/api/v1/admin/settings", json=[]).status_code == 400
    # 设置行由 GET /admin/settings 惰性创建（ensure_admin_settings），先拉一次再写
    assert client.get("/api/v1/admin/settings").json()["code"] == "0"
    # {"value": null} 过去写 None 触发 NOT NULL 违约（500）；现在等价于清空
    cleared = client.put("/api/v1/admin/settings/ga_id", json={"value": None})
    assert cleared.status_code == 200 and cleared.json()["code"] == "0", cleared.text
    assert client.get("/api/v1/admin/settings").json()["data"]["ga_id"]["value"] == ""


def test_upload_truncates_long_file_name_and_rejects_long_title(client, monkeypatch):
    login(client)

    class _StubBackend:
        async def save(self, file, filename):  # noqa: ARG002 - 只需满足 StorageBackend 协议
            return "/uploads/2026/stub.png"

    monkeypatch.setattr(upload_services, "get_storage_backend", lambda: _StubBackend())

    response = client.post("/api/v1/admin/upload", files={"file": ("a" * 300 + ".png", _PNG, "image/png")})
    assert response.status_code == 200, response.text
    stored = response.json()["data"]["file_name"]
    assert len(stored) <= 255 and stored.endswith(".png")

    too_long_title = client.post(
        "/api/v1/admin/upload",
        files={"file": ("shot.png", _PNG, "image/png")},
        data={"title": "t" * 300},
    )
    assert too_long_title.status_code == 400


def test_upload_rejects_oversized_video(client, monkeypatch):
    """视频单文件上限独立于图片：超过 max_upload_video_mb 必须返回 400（而不是落盘或 500）。

    不造 50MB 文件：把上限调到 1MB，再用 1MB+1 的 mp4 头内容触发同一条分支。
    """
    login(client)
    monkeypatch.setattr(upload_services.settings, "max_upload_video_mb", 1)
    oversized = b"\x00\x00\x00\x18ftypisom" + b"0" * (1024 * 1024 + 1)
    response = client.post(
        "/api/v1/admin/upload",
        files={"file": ("clip.mp4", oversized, "video/mp4")},
    )
    assert response.status_code == 400, response.text
    assert "50MB" not in response.text


def test_attribute_slug_is_normalized_to_hyphen(client):
    """规格 slug 曾按下划线入库（video_resolution），官网 key facts 只匹配连字符 → 规格静默不显示。"""
    login(client)
    category_id = client.get("/api/v1/product-categories").json()["data"][0]["id"]
    created = client.post(
        "/api/v1/admin/products",
        json={
            "title": "QA Attr Slug",
            "slug": f"qa-attr-slug-{uuid.uuid4().hex[:8]}",
            "summary": "x",
            "content_html": "<p>x</p>",
            "category_id": category_id,
            "price": 1.0,
            "currency": "CNY",
            "stock_status": "instock",
            "status": "PUBLISHED",
        },
    ).json()
    assert created["code"] in (0, "0"), created

    added = client.post(
        f"/api/v1/admin/products/{created['data']['id']}/attributes",
        json={"name": "Video Resolution", "slug": "video_resolution", "value": "4K30"},
    ).json()
    assert added["code"] in (0, "0"), added
    assert added["data"]["slug"] == "video-resolution"


def test_truncate_file_name_keeps_extension():
    long_name = "a" * 300 + ".png"
    truncated = upload_services._truncate_file_name(long_name)
    assert len(truncated) == 255 and truncated.endswith(".png")
    assert upload_services._truncate_file_name("short.png") == "short.png"
    # 无扩展名的超长名称也必须截断到上限内
    assert len(upload_services._truncate_file_name("b" * 300)) == 255
