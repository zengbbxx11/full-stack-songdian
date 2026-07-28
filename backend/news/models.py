"""新闻域模型（M2，O-05~O-06）。

设计约束（§4.2 DDL / 蓝图 §3.4）：表名 t_news / t_news_category。
"""
from __future__ import annotations

from tortoise import Model, fields

from common.mixins import AuditByMixin, SoftDeleteMixin, TimestampedMixin
from common.search_vector import TSVectorField


class NewsCategory(TimestampedMixin, SoftDeleteMixin, Model):
    id = fields.BigIntField(primary_key=True)
    name = fields.CharField(max_length=100)
    slug = fields.CharField(max_length=100, unique=True)
    sort_order = fields.FloatField(default=0.0)  # 与 News.sort_order 统一为浮点，支持精准插入排序

    news: fields.ReverseRelation[News]

    class Meta:
        table = "t_news_category"


class News(TimestampedMixin, SoftDeleteMixin, AuditByMixin, Model):
    id = fields.BigIntField(primary_key=True)
    slug = fields.CharField(max_length=200, unique=True)
    title = fields.CharField(max_length=200)
    summary = fields.CharField(max_length=500)
    content_html = fields.TextField()
    category = fields.ForeignKeyField(
        "models.NewsCategory", related_name="news", on_delete=fields.RESTRICT
    )
    author = fields.CharField(max_length=100, null=True)
    published_at = fields.DatetimeField(auto_now_add=True)
    status = fields.CharField(max_length=30, default="DRAFT")  # DRAFT/PUBLISHED；默认草稿，需显式发布
    cover_image = fields.CharField(max_length=500, null=True)  # 新闻主图（封面），迁移自 WP featured_media
    sort_order = fields.FloatField(default=0.0)  # 排序权重，浮点数支持精准插入；admin 拖拽排序通过 PUT {sort_order: N} 写入
    search_vector = TSVectorField()

    class Meta:
        table = "t_news"
