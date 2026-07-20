"""产品域模型（M1，O-01~O-04）。

设计约束（§4.2 DDL / 蓝图 §3.3）：表名 t_product / t_product_category /
t_product_gallery / t_product_attribute；单一 app 标签 ``models``；外键用
``'models.XXX'`` 形式；search_vector 为自定义 TSVectorField（PG 用，SQLite 降级 TEXT）。
"""
from __future__ import annotations

from tortoise import Model, fields

from common.mixins import AuditByMixin, SoftDeleteMixin, TimestampedMixin
from common.search_vector import TSVectorField


class ProductCategory(TimestampedMixin, SoftDeleteMixin, Model):
    id = fields.BigIntField(primary_key=True)
    name = fields.CharField(max_length=100)
    slug = fields.CharField(max_length=100, unique=True)
    sort_order = fields.IntField(default=0)

    products: fields.ReverseRelation[Product]

    class Meta:
        table = "t_product_category"


class Product(TimestampedMixin, SoftDeleteMixin, AuditByMixin, Model):
    id = fields.BigIntField(primary_key=True)
    slug = fields.CharField(max_length=200, unique=True)
    title = fields.CharField(max_length=200)
    summary = fields.CharField(max_length=500)
    content_html = fields.TextField()
    category = fields.ForeignKeyField(
        "models.ProductCategory", related_name="products", on_delete=fields.RESTRICT
    )
    sku = fields.CharField(max_length=100, null=True)
    price = fields.DecimalField(max_digits=12, decimal_places=2, null=True)
    currency = fields.CharField(max_length=10, default="CNY")
    stock_status = fields.CharField(max_length=20, default="instock")  # instock/outofstock
    status = fields.CharField(max_length=30, default="DRAFT")  # DRAFT/PUBLISHED
    cover_image = fields.CharField(max_length=500, null=True)  # 产品主图（封面），迁移自 WP featured_media
    # tags: 标签名字符串数组，如 ["OEM", "4K", "Waterproof"]；PG 下为 JSONB，SQLite 降级为 TEXT
    tags = fields.JSONField(null=True, default=list)
    search_vector = TSVectorField()

    galleries: fields.ReverseRelation[ProductGallery]
    attributes: fields.ReverseRelation[ProductAttribute]

    class Meta:
        table = "t_product"


class ProductGallery(Model):
    id = fields.BigIntField(primary_key=True)
    product = fields.ForeignKeyField(
        "models.Product", related_name="galleries", on_delete=fields.CASCADE
    )
    image_url = fields.CharField(max_length=500)
    alt = fields.CharField(max_length=200, null=True)
    sort_order = fields.IntField(default=0)

    class Meta:
        table = "t_product_gallery"


class ProductAttribute(Model):
    id = fields.BigIntField(primary_key=True)
    product = fields.ForeignKeyField(
        "models.Product", related_name="attributes", on_delete=fields.CASCADE
    )
    name = fields.CharField(max_length=100)
    slug = fields.CharField(max_length=100)
    value = fields.CharField(max_length=500)

    class Meta:
        table = "t_product_attribute"
