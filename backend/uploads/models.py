"""上传域模型（M6，T03）。

设计约束（design-admin-ui.md §1.4 / 缺口②）：
- 表名 ``t_upload_record``；记录每次成功上传的 url / 文件名 / 大小 / 上传人，
  供审计溯源（best-effort，不阻塞主流程）。
- 仅保留 ``TimestampedMixin``（created_time 即溯源时间），不引入软删以保简单。
"""
from __future__ import annotations

from tortoise import Model, fields

from common.mixins import TimestampedMixin


class UploadRecord(TimestampedMixin, Model):
    """上传记录（图片/媒体溯源）。"""

    id = fields.BigIntField(primary_key=True)
    url = fields.CharField(max_length=500, description="相对/绝对访问 URL")
    file_name = fields.CharField(max_length=255, description="原始文件名")
    size = fields.IntField(default=0, description="字节数")
    uploaded_by = fields.CharField(max_length=64, null=True, description="上传人（管理员用户名）")

    class Meta:
        table = "t_upload_record"
