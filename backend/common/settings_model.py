"""系统设置模型 — key-value 存储，用于管理后台可修改的全局配置。

避免每次改 GA ID、站点名称等都要动代码或 .env。
"""
from tortoise import fields
from tortoise.models import Model


class Setting(Model):
    """键值对配置表。"""

    key = fields.CharField(max_length=100, unique=True, pk=True)  # 配置键（eg. "site_name", "ga_id"，作为主键）
    value = fields.TextField(default="")  # 配置值（文本类型，兼容数字/JSON 等）
    label = fields.CharField(max_length=200, default="")  # 中文标签，供管理后台表单展示
    description = fields.CharField(max_length=500, default="")  # 说明文字，解释该项配置的用途

    class Meta:
        table = "t_setting"

    def __str__(self):
        """调试用字符串表示：`key=value`，方便在日志和 admin 界面中查看。"""
        return f"{self.key}={self.value}"
