"""系统设置模型 — key-value 存储，用于管理后台可修改的全局配置。

避免每次改 GA ID、站点名称等都要动代码或 .env。
"""
from tortoise import fields
from tortoise.models import Model


class Setting(Model):
    """键值对配置表。"""

    key = fields.CharField(max_length=100, unique=True, pk=True)  # 配置键作为主键
    value = fields.TextField(default="")  # 配置值
    label = fields.CharField(max_length=200, default="")  # 中文标签，供前端展示
    description = fields.CharField(max_length=500, default="")  # 说明文字

    class Meta:
        table = "t_setting"

    def __str__(self):
        return f"{self.key}={self.value}"
