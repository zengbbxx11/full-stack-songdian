"""抽象 Mixin（Shared Kernel，蓝图 §3.2 补文件）。

蓝图 §1 文件树漏列本文件；模型通过
``from common.mixins import TimestampedMixin, SoftDeleteMixin, AuditByMixin`` 引用。
仅对 DDL 中确实存在的列使用。单个 app 标签 ``models`` 下复用。
"""
from __future__ import annotations

from tortoise import fields, models


class TimestampedMixin(models.Model):
    """时间戳：created_time / updated_time（TIMESTAMPTZ，UTC）。"""

    created_time = fields.DatetimeField(auto_now_add=True, null=True)
    updated_time = fields.DatetimeField(auto_now=True, null=True)

    class Meta:
        abstract = True


class SoftDeleteMixin(models.Model):
    """软删除：deleted SMALLINT（0 存在 / 1 删除）。"""

    deleted = fields.SmallIntField(default=0, description="0 存在 / 1 删除")

    class Meta:
        abstract = True


class AuditByMixin(models.Model):
    """审计人：created_by / updated_by。"""

    created_by = fields.CharField(max_length=64, null=True)
    updated_by = fields.CharField(max_length=64, null=True)

    class Meta:
        abstract = True
