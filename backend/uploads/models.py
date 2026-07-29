"""上传域模型（M6，T03）。

设计约束（design-admin-ui.md §1.4 / 缺口②）：
- 表名 ``t_upload_record``；记录每次成功上传的 url / 文件名 / 大小 / 上传人，
  供审计溯源（best-effort，不阻塞主流程）。
- 仅保留 ``TimestampedMixin``（created_time 即溯源时间），不引入软删以保简单。
- 2026-07-29 扩展（媒体库产品化 Loop 1）：
  - ``Album``：扁平相册（无层级），供前端媒体库左侧分组。
  - ``UploadRecord.album``：归属相册（可空，删除相册不级联删文件，置空）。
  - ``UploadRecord.title``：可选展示标题，缺省回退到 file_name。
"""
from __future__ import annotations

from tortoise import Model, fields

from common.mixins import TimestampedMixin


class Album(TimestampedMixin, Model):
    """层级相册（媒体库分组，支持树形子目录）。

    - ``parent`` 可空（null = 根相册）；级联删除（删父则删全树）。
    - ``UploadRecord.album`` 为 SET NULL，父/子相册被删后素材回落到未分类。
    """

    id = fields.BigIntField(primary_key=True)
    name = fields.CharField(max_length=100, description="相册名称")
    slug = fields.CharField(max_length=120, unique=True, description="URL 友好标识（唯一）")
    sort_order = fields.FloatField(default=0.0, description="排序权重，越小越靠前")
    # 2026-07-29 扩展：层级支持
    parent = fields.ForeignKeyField(
        "models.Album",
        related_name="children",
        null=True,
        on_delete=fields.CASCADE,
        description="父相册（可空=根；级联删除子孙）",
    )

    uploads: fields.ReverseRelation["UploadRecord"]

    class Meta:
        table = "t_album"


class UploadRecord(TimestampedMixin, Model):
    """上传记录（图片/媒体溯源）。"""

    id = fields.BigIntField(primary_key=True)
    url = fields.CharField(max_length=500, description="相对/绝对访问 URL")
    file_name = fields.CharField(max_length=255, description="原始文件名")
    size = fields.IntField(default=0, description="字节数")
    uploaded_by = fields.CharField(max_length=64, null=True, description="上传人（管理员用户名）")
    # 2026-07-29 扩展：归属相册（可空）；删除相册时置空而非级联删除文件
    album = fields.ForeignKeyField(
        "models.Album",
        related_name="uploads",
        null=True,
        on_delete=fields.SET_NULL,
        description="所属相册（可空，未分类）",
    )
    # 2026-07-29 扩展：可选展示标题，前端优先显示 title，缺省回退 file_name
    title = fields.CharField(max_length=255, null=True, description="展示标题（可选）")

    class Meta:
        table = "t_upload_record"
