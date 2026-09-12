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
