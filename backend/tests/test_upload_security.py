"""上传内容与路径安全回归测试。"""
from __future__ import annotations

import asyncio

import pytest
from starlette.exceptions import HTTPException

from common.exceptions import BizException
from main import _MediaStaticFiles
from uploads import services


def test_rejects_image_content_with_mismatched_extension():
    with pytest.raises(BizException):
        services._validate_image_content(b"\x89PNG\r\n\x1a\ncontent", "photo.jpg")


def test_rejects_riff_container_that_is_not_webp():
    with pytest.raises(BizException):
        services._validate_image_content(b"RIFF\x00\x00\x00\x00WAVE", "audio.webp")


def test_safe_media_path_rejects_traversal_and_symlink(tmp_path, monkeypatch):
    root = tmp_path / "uploads"
    image = root / "2026" / "ok.jpg"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"ok")
    monkeypatch.setattr(services, "MEDIA_ROOT", root)

    assert services._safe_media_path("/uploads/2026/ok.jpg") == image.resolve()
    assert services._safe_media_path("/uploads/../../outside.txt") is None
    assert services._safe_media_path("/uploads/2026") is None


def test_media_static_directory_never_exposes_code_files(tmp_path):
    """纵深防御：媒体静态目录必须拒绝对代码/配置文件的公开访问（P2-4）。"""
    (tmp_path / "secret.py").write_text("print('leaked')", encoding="utf-8")
    (tmp_path / "config.env").write_text("SECRET=1", encoding="utf-8")
    (tmp_path / "photo.txt").write_text("ok", encoding="utf-8")

    static = _MediaStaticFiles(directory=str(tmp_path))
    scope = {"method": "GET", "type": "http", "headers": []}
    for blocked in ("secret.py", "config.env"):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(static.get_response(blocked, scope))
        assert exc.value.status_code == 404

    # 非黑名单后缀仍可正常作为静态资源返回（未被误伤）。
    assert asyncio.run(static.get_response("photo.txt", scope)).status_code == 200

def test_media_cache_headers_preserve_conditional_and_range_requests(tmp_path):
    from starlette.applications import Starlette
    from starlette.routing import Mount
    from starlette.testclient import TestClient

    (tmp_path / "photo.jpg").write_bytes(b"0123456789")
    app = Starlette(routes=[Mount("/uploads", app=_MediaStaticFiles(directory=str(tmp_path)))])
    with TestClient(app) as client:
        response = client.get("/uploads/photo.jpg")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "public, max-age=3600"
        assert response.headers["etag"]
        unchanged = client.get("/uploads/photo.jpg", headers={"If-None-Match": response.headers["etag"]})
        assert unchanged.status_code == 304
        assert unchanged.content == b""
        assert unchanged.headers["cache-control"] == "public, max-age=3600"
        partial = client.get("/uploads/photo.jpg", headers={"Range": "bytes=0-3"})
        assert partial.status_code == 206
        assert partial.content == b"0123"
        assert partial.headers["cache-control"] == "public, max-age=3600"
        missing = client.get("/uploads/missing.jpg")
        assert missing.status_code == 404
        assert "cache-control" not in missing.headers
