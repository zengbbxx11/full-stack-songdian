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
    sort_order = fields.FloatField(default=0.0)  # 与 Product.sort_order 统一为浮点，支持精准插入排序

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
    published_at = fields.DatetimeField(null=True)
    cover_image = fields.CharField(max_length=500, null=True)  # 产品主图（封面），迁移自 WP featured_media
    # tags: 标签名字符串数组，如 ["OEM", "4K", "Waterproof"]；PG 下为 JSONB，SQLite 降级为 TEXT
    tags = fields.JSONField(null=True, default=list)
    sort_order = fields.FloatField(default=0.0)  # 前端拖拽排序，浮点数支持精准插入
    search_vector = TSVectorField()
    # SEO 专属字段（2026-07-31 新增）：运营可为重点产品手写精修，空则回退 title/content_html
    seo_title = fields.CharField(max_length=120, null=True)          # 覆盖页面 <title>（推荐 ~60 字符）
    seo_description = fields.CharField(max_length=300, null=True)    # 覆盖 meta description（推荐 120-160 字符）

    galleries: fields.ReverseRelation[ProductGallery]
    attributes: fields.ReverseRelation[ProductAttribute]
    related_links: fields.ReverseRelation[ProductRelated]

    class Meta:
        table = "t_product"
        indexes = (("status", "published_at"),)


class ProductGallery(Model):
    id = fields.BigIntField(primary_key=True)
    product = fields.ForeignKeyField(
        "models.Product", related_name="galleries", on_delete=fields.CASCADE
    )
    image_url = fields.CharField(max_length=500)
    alt = fields.CharField(max_length=200, null=True)
    sort_order = fields.FloatField(default=0.0)  # 前端拖拽排序，浮点数支持精准插入

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


class ProductRelated(Model):
    """产品 → 关联产品（后台手选，单向，最多 4 个，按 sort_order 排序）。

    为什么用独立子表而不是 Product.tags 那样的 JSON 数组：需要外键完整性（目标产品删除时
    级联清理）、UNIQUE(product, related) 去重、以及按 sort_order 的稳定排序；写法对齐
    ProductGallery（FK CASCADE + sort_order）与 t_role_permission（联合唯一）。
    单向语义：只写「A → B」这一行，B 的产品页不会自动出现 A（见 services._replace_related）。
    """

    id = fields.BigIntField(primary_key=True)
    product = fields.ForeignKeyField(
        "models.Product", related_name="related_links", on_delete=fields.CASCADE
    )
    related = fields.ForeignKeyField(
        "models.Product", related_name="related_by_links", on_delete=fields.CASCADE
    )
    sort_order = fields.FloatField(default=0.0)  # 后台选择顺序，越小越靠前

    class Meta:
        table = "t_product_related"
        unique_together = (("product", "related"),)
        # (product, sort_order) 服务「按展示顺序读取引用列表」；
        # (related,) 单独建索引，服务「目标变化时反查引用方」（services._referrer_slugs）
        indexes = (("product", "sort_order"), ("related",))
