"""上传域 DTO/VO（M6，T03）。

设计约束（design-admin-ui.md §1.2 缺口②）：
- ``UploadVO``：返回给前端的轻量视图，仅含 ``url / file_name / size``。
- ``UploadRecordVO``：上传记录列表视图，含 ``id / created_time / uploaded_by``。
- ``url`` 为相对路径，形如 ``/uploads/2026/xx.jpg``（同源经 vite proxy 访问；
  切对象存储时返回完整 URL）。
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class UploadVO(BaseModel):
    """上传结果视图。"""

    url: str
    file_name: str
    size: int = 0

    @classmethod
    def build(cls, url: str, file_name: str, size: int) -> UploadVO:
        return cls(url=url, file_name=file_name, size=size)


class UploadRecordVO(BaseModel):
    """上传记录列表视图（含溯源信息）。"""

    id: int
    url: str
    file_name: str
    size: int = 0
    uploaded_by: str | None = None
    created_time: datetime | None = None

    @classmethod
    def from_model(cls, record) -> UploadRecordVO:
        """从 UploadRecord ORM 模型构建 VO。"""
        return cls(
            id=record.id,
            url=record.url,
            file_name=record.file_name,
            size=record.size or 0,
            uploaded_by=record.uploaded_by,
            created_time=record.created_time,
        )
