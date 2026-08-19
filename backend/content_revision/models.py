from __future__ import annotations

from tortoise import Model, fields


class ContentRevision(Model):
    """产品/新闻核心字段的不可变快照。"""

    id = fields.BigIntField(primary_key=True)
    resource_type = fields.CharField(max_length=20)
    resource_id = fields.BigIntField()
    version = fields.IntField()
    change_type = fields.CharField(max_length=30, default="UPDATE")
    snapshot = fields.JSONField()
    created_by = fields.CharField(max_length=100, null=True)
    created_time = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "t_content_revision"
        unique_together = (("resource_type", "resource_id", "version"),)
        indexes = (("resource_type", "resource_id", "version"),)
