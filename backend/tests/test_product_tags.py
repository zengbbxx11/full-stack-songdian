"""恢复 WP 产品标签（product tags）纯函数单测（QA，Edward）。

覆盖本次标签改动的两个纯函数入口：
- migration/wp_adapter.py: WordPressProductAdapter.adapt_product 的 tags 解析
  （含 wp_tag_map 命中 / wp_tag_map=None 兜底 / 缺 id 兜底 / 空标签 /
   无 tags 键；以及「新增 tags 解析不得破坏既有 wc_* 处理逻辑」）。
- product/schemas.py: ProductPageVO.from_model 的 tags 装配
  （None→[]、列表原样、空列表、其余字段完好）。

设计说明（重要）：
- adapt_product 的返回 dict 按设计（docs/design-product-tags.md）**不含** wc_ 前缀键；
  wc_sku/wc_price/wc_stock/wc_attributes 等 WP 源字段会被转换为
  sku/price/stock_status/attributes 等内部干净字段后返回。因此「wc_* 不被破坏」
  应理解为：wc_* 输入仍被正确转换为对应输出字段，而非返回 dict 仍带 wc_ 前缀键。
  本测试据此断言「输出不含 wc_ 前缀键（符合设计契约）」+「wc_* 输入被正确转换」。

不触网、不依赖 DB / Redis；用 --noconftest 隔离，避免加载应用 TestClient 基座。
"""
from __future__ import annotations

from migration.wp_adapter import WordPressProductAdapter
from product.schemas import ProductPageVO


class _FakeModel:
    """最小替身：仅提供 from_model 读取到的属性。"""

    def __init__(self, **kwargs: object) -> None:
        self.id = kwargs.get("id", 1)
        self.slug = kwargs.get("slug", "fake-slug")
        self.title = kwargs.get("title", "Fake")
        self.summary = kwargs.get("summary", "summary")
        self.sku = kwargs.get("sku", None)
        self.price = kwargs.get("price", None)
        self.currency = kwargs.get("currency", "CNY")
        self.stock_status = kwargs.get("stock_status", "instock")
        self.status = kwargs.get("status", "DRAFT")
        self.category = kwargs.get("category", None)
        self.created_time = kwargs.get("created_time", None)
        self.updated_time = kwargs.get("updated_time", None)
        self.cover_image = kwargs.get("cover_image", None)
        self.tags = kwargs.get("tags", None)


def _minimal_wp_post(tags, **extra: object) -> dict:
    post: dict = {"slug": "demo-product", "title": "Demo"}
    if tags is not None:
        post["tags"] = tags
    post.update(extra)
    return post


# ───────────────── wp_adapter.adapt_product ─────────────────


def test_adapt_product_resolves_tag_ids_to_names():
    wp_post = _minimal_wp_post([1, 2])
    wp_tag_map = {1: "OEM", 2: "4K"}
    result = WordPressProductAdapter.adapt_product(wp_post, None, wp_tag_map=wp_tag_map)
    assert result["tags"] == ["OEM", "4K"]


def test_adapt_product_no_tag_map_falls_back_to_str_id():
    wp_post = _minimal_wp_post([1, 2])
    result = WordPressProductAdapter.adapt_product(wp_post, None, wp_tag_map=None)
    assert result["tags"] == ["1", "2"]


def test_adapt_product_missing_id_falls_back_to_str():
    wp_post = _minimal_wp_post([1, 2])
    result = WordPressProductAdapter.adapt_product(wp_post, None, wp_tag_map={1: "OEM"})
    assert result["tags"] == ["OEM", "2"]


def test_adapt_product_empty_tags_returns_empty_list():
    wp_post = _minimal_wp_post([])
    result = WordPressProductAdapter.adapt_product(wp_post, None, wp_tag_map={1: "OEM"})
    assert result["tags"] == []


def test_adapt_product_missing_tags_key_returns_empty_list():
    wp_post = _minimal_wp_post(None)  # 不传 tags 键
    result = WordPressProductAdapter.adapt_product(wp_post, None, wp_tag_map={1: "OEM"})
    assert result["tags"] == []


def test_adapt_product_preserves_wc_field_processing():
    """新增 tags 解析不得破坏既有 wc_* 处理逻辑：wc_sku/wc_price/wc_stock/wc_attributes
    应正确映射为 sku/price/stock_status/attributes；且 tags 与既有字段共存。
    按设计，返回 dict 不含 wc_ 前缀键（wc_* 是 WP 源字段，已被转换为内部干净字段）。
    """
    wp_post = _minimal_wp_post(
        [1, 2],
        wc_sku="SKU-100",
        wc_price="1999.0",
        wc_stock="instock",
        wc_attributes=[{"name": "Sensor", "slug": "sensor", "value": "CMOS"}],
    )
    wp_tag_map = {1: "OEM", 2: "4K"}
    result = WordPressProductAdapter.adapt_product(wp_post, None, wp_tag_map=wp_tag_map)

    # wc_* 输入被正确转换为内部字段（既有逻辑未被破坏）
    assert result["sku"] == "SKU-100"
    assert result["price"] == 1999.0
    assert result["stock_status"] == "instock"
    assert result["attributes"][0]["name"] == "Sensor"

    # tags 解析与 wc_* 处理共存
    assert result["tags"] == ["OEM", "4K"]

    # 返回 dict 不含 wc_ 前缀键（符合设计契约：wc_* 是源字段，已转换）
    assert all(not k.startswith("wc_") for k in result.keys())


# ───────────────── product/schemas.py ProductPageVO.from_model ─────────────────


def test_from_model_tags_list_passthrough():
    m = _FakeModel(tags=["OEM", "4K"])
    vo = ProductPageVO.from_model(m)
    assert vo.tags == ["OEM", "4K"]


def test_from_model_tags_none_becomes_empty():
    m = _FakeModel(tags=None)
    vo = ProductPageVO.from_model(m)
    assert vo.tags == []


def test_from_model_tags_empty_list():
    m = _FakeModel(tags=[])
    vo = ProductPageVO.from_model(m)
    assert vo.tags == []


def test_from_model_other_fields_intact_with_tags():
    m = _FakeModel(tags=["OEM"], title="X", slug="y", sku="SKU-1")
    vo = ProductPageVO.from_model(m)
    assert vo.title == "X"
    assert vo.slug == "y"
    assert vo.sku == "SKU-1"
    assert vo.tags == ["OEM"]
