"""数据迁移域模型（M6，O-12~O-13）。

设计约束（§4.2 DDL / 蓝图 §3.7）：表名 t_migration_batch / t_migration_record。
"""
from __future__ import annotations

from tortoise import Model, fields


class MigrationBatch(Model):
    id = fields.BigIntField(primary_key=True)
    batch_no = fields.CharField(max_length=100, unique=True)
    scope = fields.CharField(max_length=30, default="all")  # all/product/news
    status = fields.CharField(max_length=30, default="PENDING")  # PENDING/RUNNING/SUCCESS/FAILED/PARTIAL
    total = fields.IntField(default=0)
    processed = fields.IntField(default=0)
    failed = fields.IntField(default=0)
    started_at = fields.DatetimeField(null=True)
    finished_at = fields.DatetimeField(null=True)

    records: fields.ReverseRelation[MigrationRecord]

    class Meta:
        table = "t_migration_batch"


class MigrationRecord(Model):
    id = fields.BigIntField(primary_key=True)
    batch = fields.ForeignKeyField(
        "models.MigrationBatch", related_name="records", on_delete=fields.CASCADE
    )
    entity_type = fields.CharField(max_length=30)  # product/news/category
    source_id = fields.CharField(max_length=100)
    target_id = fields.BigIntField(null=True)
    status = fields.CharField(max_length=30, default="SUCCESS")  # SUCCESS/FAILED/SKIP
    error_msg = fields.CharField(max_length=1000, null=True)

    class Meta:
        table = "t_migration_record"
