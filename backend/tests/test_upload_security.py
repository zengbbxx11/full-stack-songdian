"""上传内容与路径安全回归测试。"""
from __future__ import annotations

import pytest

from common.exceptions import BizException
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
