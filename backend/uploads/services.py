"""上传域服务（M6，T03）。

设计约束（design-admin-ui.md §1.2 缺口② / §1.4）：
- 存储抽象为 ``StorageBackend``（Protocol），当前仅 ``LocalStorageBackend``（默认）。
  未来切 OSS/COS 仅新增实现 + 改 ``settings``（见 ``get_storage_backend`` 工厂）。
- 校验：扩展名白名单（jpg/png/webp/gif）、单文件 ≤ ``max_upload_mb``。
- 落盘：写入 ``MEDIA_ROOT``（复用 main.py 的 StaticFiles 挂载目录），按年份分子目录，
  返回相对 URL ``{media_url}/{year}/{uuid}.ext}``。
- 成功后写 ``UploadRecord`` 溯源（best-effort）。
"""
from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from typing import Protocol

from fastapi import UploadFile

from common.config import MEDIA_ROOT, settings
from common.exceptions import BizException, ErrorCode
from uploads.models import UploadRecord

# 扩展名白名单（小写，含点）
ALLOWED_EXT: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})


class StorageBackend(Protocol):
    """存储后端抽象（可替换为 OSS/COS 等）。"""

    async def save(self, file: UploadFile, filename: str) -> str:
        """保存文件并返回可访问 URL（相对或绝对）。"""
        ...


class LocalStorageBackend:
    """本地磁盘存储：写入 ``MEDIA_ROOT``，返回相对 URL。"""

    def __init__(self, root=MEDIA_ROOT) -> None:
        self.root = root

    async def save(self, file: UploadFile, filename: str) -> str:
        ext = os.path.splitext(filename or "")[1].lower()
        if ext not in ALLOWED_EXT:
            raise BizException(ErrorCode.C400001, f"不支持的文件类型：{ext or '未知'}")

        content = await file.read()
        max_bytes = settings.max_upload_mb * 1024 * 1024
        if len(content) > max_bytes:
            raise BizException(
                ErrorCode.C400001,
                f"文件大小 {len(content) // 1024}KB 超过 {settings.max_upload_mb}MB 上限",
            )

        # 按年份分子目录，使用 uuid 避免文件名碰撞
        year = datetime.now(UTC).strftime("%Y")
        target_dir = self.root / year
        target_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{uuid.uuid4().hex}{ext}"
        (target_dir / stored_name).write_bytes(content)

        return f"{settings.media_url}/{year}/{stored_name}"


def get_storage_backend() -> StorageBackend:
    """依据配置返回存储后端实例（当前仅支持 local）。"""
    if settings.storage_backend == "local":
        return LocalStorageBackend()
    raise BizException(ErrorCode.B999001, f"未知的存储后端：{settings.storage_backend}")


def check_upload_limits(files: list[UploadFile]) -> None:
    """批量上传配额校验（security-audit F-10）：防磁盘耗尽 DoS。"""
    if len(files) > settings.max_upload_files:
        raise BizException(
            ErrorCode.C400001,
            f"单次最多上传 {settings.max_upload_files} 个文件，当前 {len(files)} 个",
        )
    total = sum((f.size or 0) for f in files)
    max_total = settings.max_upload_total_mb * 1024 * 1024
    if total > max_total:
        raise BizException(
            ErrorCode.C400001,
            f"上传总大小超过 {settings.max_upload_total_mb}MB 上限",
        )


async def record_upload(url: str, file_name: str, size: int, uploaded_by: str | None) -> UploadRecord:
    """落库上传记录（溯源）；失败抛异常由调用方统一处理。"""
    return await UploadRecord.create(
        url=url, file_name=file_name, size=size, uploaded_by=uploaded_by
    )
