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
    # 2026-09-18：补充记录 id 与相册 id —— 媒体选择器上传后需要据此自动选中新素材
    # 并把浏览位置切到对应相册；缺省 None 保持对旧调用方的兼容。
    id: int | None = None
    album_id: int | None = None

    @classmethod
    def build(cls, url: str, file_name: str, size: int) -> UploadVO:
        return cls(url=url, file_name=file_name, size=size)

    @classmethod
    def from_record(cls, record) -> UploadVO:
        """从 UploadRecord ORM 模型构建（含 id / album_id）。"""
        return cls(
            id=record.id,
            url=record.url,
            file_name=record.file_name,
            size=record.size or 0,
            album_id=getattr(record, "album_id", None),
        )


class UploadRecordVO(BaseModel):
    """上传记录列表视图（含溯源信息）。"""

    id: int
    url: str
    file_name: str
    size: int = 0
    uploaded_by: str | None = None
    album_id: int | None = None
    title: str | None = None
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
            album_id=getattr(record, "album_id", None),
            title=getattr(record, "title", None),
            created_time=record.created_time,
        )


class AlbumVO(BaseModel):
    """相册视图。"""

    id: int
    name: str
    slug: str
    sort_order: float = 0.0
    parent_id: int | None = None
    # 直系素材数（仅 album_id == 本相册）。
    count: int = 0
    # 子树合计：本相册 + 所有子相册的素材数（媒体库侧边栏展示用，
    # 否则 Products / News 这类"大类"因其图片挂在子相册下会一直显示 0）。
    total_count: int = 0
    created_time: datetime | None = None

    @classmethod
    def from_model(cls, album, count: int = 0, total_count: int | None = None) -> AlbumVO:
        return cls(
            id=album.id,
            name=album.name,
            slug=album.slug,
            sort_order=album.sort_order or 0.0,
            parent_id=getattr(album, "parent_id", None),
            count=count,
            total_count=count if total_count is None else total_count,
            created_time=album.created_time,
        )


class AlbumCreateRequest(BaseModel):
    """新建相册请求。"""

    name: str = Field(..., min_length=1, max_length=100, description="相册名称")
    slug: str | None = Field(None, max_length=120, description="URL 标识（可选，缺省按名称生成）")
    parent_id: int | None = Field(None, description="父相册 ID（可选，null=根相册）")
    sort_order: float | None = Field(None, description="排序权重（可选，越小越靠前，缺省 0）")


class AlbumUpdateRequest(BaseModel):
    """更新相册请求（字段均可选）。"""

    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, max_length=120)
    sort_order: float | None = None
    parent_id: int | None = Field(None, description="父相册 ID")


class AlbumReorderRequest(BaseModel):
    """同级拖动排序请求（数组下标即目标顺序）。"""

    parent_id: int | None = Field(None, description="目标父相册（null=根级相册之间排序）")
    ids: list[int] = Field(default_factory=list, description="该父相册下相册的目标顺序（须与 parent_id 一致）")
