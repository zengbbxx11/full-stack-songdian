"""Phase 1 admin UI + 后端3缺口 新增单元测试（QA，Edward）。

覆盖（不依赖 DB，纯函数/mock）：
1. LocalStorageBackend 扩展名白名单拒绝非法格式
2. ProductCreateRequest.tags 默认空数组
3. ProductUpdateRequest.tags 缺省覆盖行为
4. ReorderReq / CategoryCreate / CategoryUpdate DTO 校验
5. UploadVO.build 工厂方法

不触网、不依赖 DB / Redis。
"""
from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from fastapi import UploadFile

from product.schemas import (
    CategoryCreate,
    CategoryUpdate,
    ProductCreateRequest,
    ProductUpdateRequest,
    ReorderReq,
)
from uploads.schemas import UploadVO
from uploads.services import ALLOWED_EXT, LocalStorageBackend


# ───────────────── 1. LocalStorageBackend 扩展名白名单 ─────────────────

class TestLocalStorageWhitelist:
    """验证 LocalStorageBackend.save() 对非法扩展名的拒绝行为。"""

    @patch("uploads.services.settings")
    async def test_rejects_exe_extension(self, mock_settings):
        """上传 `.exe` 应被拒绝（不在白名单 {.jpg,.jpeg,.png,.webp,.gif}）。"""
        mock_settings.max_upload_mb = 10
        backend = LocalStorageBackend()

        file = UploadFile(filename="virus.exe", file=io.BytesIO(b"fake"))
        with pytest.raises(Exception) as exc_info:
            await backend.save(file, "virus.exe")
        assert "不支持的文件类型" in str(exc_info.value) or "exe" in str(exc_info.value).lower()

    @patch("uploads.services.settings")
    async def test_rejects_empty_extension(self, mock_settings):
        """上传无扩展名文件应被拒绝。"""
        mock_settings.max_upload_mb = 10
        backend = LocalStorageBackend()

        file = UploadFile(filename="noext", file=io.BytesIO(b"fake"))
        with pytest.raises(Exception) as exc_info:
            await backend.save(file, "noext")
        assert "不支持的文件类型" in str(exc_info.value)

    @patch("uploads.services.settings")
    async def test_rejects_txt_extension(self, mock_settings):
        """上传 `.txt` 应被拒绝（不在白名单）。"""
        mock_settings.max_upload_mb = 10
        backend = LocalStorageBackend()

        file = UploadFile(filename="readme.txt", file=io.BytesIO(b"hello"))
        with pytest.raises(Exception) as exc_info:
            await backend.save(file, "readme.txt")
        assert "不支持的文件类型" in str(exc_info.value)

    @patch("uploads.services.settings")
    async def test_allows_jpg_png_webp_gif(self, mock_settings):
        """验证白名单内所有扩展名均可通过扩展名与文件头校验。"""
        import tempfile
        from pathlib import Path

        mock_settings.max_upload_mb = 10
        mock_settings.media_url = "/uploads"
        valid_headers = {
            ".jpg": b"\xff\xd8\xff\xe0" + b"0" * 20,
            ".jpeg": b"\xff\xd8\xff\xe0" + b"0" * 20,
            ".png": b"\x89PNG\r\n\x1a\n" + b"0" * 20,
            ".webp": b"RIFF" + b"0" * 4 + b"WEBP" + b"0" * 20,
            ".gif": b"GIF89a" + b"0" * 20,
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            backend = LocalStorageBackend(root=root)

            for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                filename = f"photo{ext}"
                file = UploadFile(filename=filename, file=io.BytesIO(valid_headers[ext]))
                url = await backend.save(file, filename)
                assert url.startswith("/uploads/")
                assert url.endswith(ext)

    def test_whitelist_contains_expected_extensions(self):
        """白名单包含设计文档要求的 5 种扩展名。"""
        assert ALLOWED_EXT == frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})


# ───────────────── 2. ProductCreateRequest.tags 默认空数组 ─────────────────

class TestProductCreateRequestTags:
    """验证 ProductCreateRequest 的 tags 字段默认值。"""

    def test_tags_defaults_to_empty_list(self):
        """不传 tags 时，默认为 []。"""
        req = ProductCreateRequest(
            title="Test Product",
            slug="test-product",
            summary="A test product",
            content_html="<p>hello</p>",
            category_id=1,
        )
        assert req.tags == []
        assert isinstance(req.tags, list)

    def test_tags_explicit_empty_list(self):
        """显式传 [] 时保留空数组。"""
        req = ProductCreateRequest(
            title="Test",
            slug="test",
            summary="s",
            content_html="<p>x</p>",
            category_id=1,
            tags=[],
        )
        assert req.tags == []

    def test_tags_with_values(self):
        """传标签数组时保留原值。"""
        req = ProductCreateRequest(
            title="Test",
            slug="test",
            summary="s",
            content_html="<p>x</p>",
            category_id=1,
            tags=["OEM", "4K", "Waterproof"],
        )
        assert req.tags == ["OEM", "4K", "Waterproof"]

    def test_tags_not_in_model_dump_when_default(self):
        """默认 [] 在 model_dump 中仍然存在（非 None 不会被排除）。"""
        req = ProductCreateRequest(
            title="Test",
            slug="test",
            summary="s",
            content_html="<p>x</p>",
            category_id=1,
        )
        dumped = req.model_dump()
        assert "tags" in dumped
        assert dumped["tags"] == []


# ───────────────── 3. ProductUpdateRequest.tags 覆盖行为 ─────────────────

class TestProductUpdateRequestTags:
    """验证 ProductUpdateRequest 的 tags 字段（编辑时整体覆盖）。"""

    def test_tags_default_empty_overrides(self):
        """不传 tags 时默认为 []，语义上表示清除标签。"""
        req = ProductUpdateRequest(title="New Title")
        assert req.tags == []

    def test_tags_explicit_overrides(self):
        """显式传 tags 时整体覆盖。"""
        req = ProductUpdateRequest(tags=["OEM"])
        assert req.tags == ["OEM"]


# ───────────────── 4. Category DTO 校验 ─────────────────

class TestCategoryDTOs:
    """验证分类写/排序 DTO。"""

    def test_category_create_minimal(self):
        """最小必填字段创建。"""
        c = CategoryCreate(name="Foo", slug="foo")
        assert c.name == "Foo"
        assert c.slug == "foo"
        assert c.sort_order is None  # 缺省时落到末尾

    def test_category_create_with_sort_order(self):
        """指定排序值创建。"""
        c = CategoryCreate(name="Bar", slug="bar", sort_order=5)
        assert c.sort_order == 5

    def test_category_update_all_none(self):
        """全字段可选，全部留空。"""
        u = CategoryUpdate()
        d = u.model_dump(exclude_unset=True)
        assert d == {}

    def test_category_update_partial(self):
        """部分更新。"""
        u = CategoryUpdate(name="NewName")
        assert u.name == "NewName"
        assert u.slug is None

    def test_reorder_req_default_empty(self):
        """ReorderReq 默认 ids 为空。"""
        r = ReorderReq()
        assert r.ids == []

    def test_reorder_req_with_ids(self):
        """ReorderReq 携带 id 数组。"""
        r = ReorderReq(ids=[3, 1, 2])
        assert r.ids == [3, 1, 2]


# ───────────────── 5. UploadVO.build 工厂方法 ─────────────────

class TestUploadVO:
    """验证上传 VO 工厂。"""

    def test_build_returns_correct_fields(self):
        vo = UploadVO.build(url="/uploads/2026/abc.jpg", file_name="photo.jpg", size=1024)
        assert vo.url == "/uploads/2026/abc.jpg"
        assert vo.file_name == "photo.jpg"
        assert vo.size == 1024

    def test_build_zero_size(self):
        vo = UploadVO.build(url="/uploads/x.png", file_name="x.png", size=0)
        assert vo.size == 0
        assert vo.url == "/uploads/x.png"

    def test_model_dump_json_serializable(self):
        """model_dump 可正常序列化。"""
        vo = UploadVO.build(url="/u/a.jpg", file_name="a.jpg", size=512)
        d = vo.model_dump(mode="json")
        assert d == {"url": "/u/a.jpg", "file_name": "a.jpg", "size": 512}
