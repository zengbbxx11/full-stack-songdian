"""询盘域模型（M4，O-07）。

设计约束（§4.2 DDL / 蓝图 §3.5）：表名 t_inquiry。
smtp_status 独立维度；biz_req_no 唯一索引作幂等兜底；无 Mixin（自行定义时间字段）。
"""
from __future__ import annotations

from tortoise import Model, fields


class Inquiry(Model):
    id = fields.BigIntField(primary_key=True)
    name = fields.CharField(max_length=50)
    email = fields.CharField(max_length=200)
    phone = fields.CharField(max_length=20, null=True)
    company = fields.CharField(max_length=100, null=True)
    country = fields.CharField(max_length=100, null=True)
    product_interest = fields.CharField(max_length=200, null=True)
    message = fields.CharField(max_length=2000)
    source_page = fields.CharField(max_length=500, null=True)
    biz_req_no = fields.CharField(max_length=100, unique=True)  # 幂等键兜底
    status = fields.CharField(max_length=30, default="NEW")  # NEW/REPLIED/ARCHIVED
    smtp_status = fields.CharField(max_length=30, default="PENDING")  # PENDING/SENT/FAILED/ERROR
    smtp_retry = fields.IntField(default=0)
    reply_note = fields.CharField(max_length=1000, null=True)
    created_time = fields.DatetimeField(auto_now_add=True, null=True)
    updated_time = fields.DatetimeField(auto_now=True, null=True)

    class Meta:
        table = "t_inquiry"
