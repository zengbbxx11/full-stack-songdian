"""WordPress 防腐层适配器（M6，§3.2.M6 / C-01/C-02 ACL）。

设计约束（§6.4 / §4.5.1）：
- ``WordPressProductAdapter`` 把 ``wp_postmeta``（_sku/_price/_stock_status/
  _product_image_gallery）清洗为 规格/相册/价格，避免 WP 模型污染本域。
- 分类法（product_cat / category）→ t_product_category / t_news_category。
- 仅做数据转换，不触库；落库由 etl.py 负责。
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


class WordPressProductAdapter:
    """WP 产品/新闻 → 本域结构化数据的 ACL 适配。"""

    @staticmethod
    def _text_field(post: dict[str, Any], field: str, fallback_key: str) -> str:
        node = post.get(field)
        if isinstance(node, dict):
            return node.get("rendered", "") or ""
        # WP REST 原始 post 字段兜底
        return post.get(fallback_key, "") or ""

    @staticmethod
    def _parse_wp_date(post: dict[str, Any]) -> datetime | None:
        """解析 WP 发布时间为 naive UTC（匹配 Tortoise naive TIMESTAMP 列）。

        WP ``date_gmt`` 本身即 UTC。本方法统一剥除时区信息返回 naive datetime，
        避免 aware datetime 写入未设 ``tz=True`` 的 ``DatetimeField(auto_now_add=True)``
        列时被 asyncpg 拒绝；存入的值即 WP 原始发布时刻，语义正确。
        """
        raw = post.get("date_gmt") or post.get("date")
        if not raw:
            return None
        if isinstance(raw, str):
            # WP REST 的 date_gmt 形如 "2024-01-02T03:04:05" 或末尾带 Z
            if raw.endswith("Z"):
                raw = raw[:-1] + "+00:00"
            try:
                dt = datetime.fromisoformat(raw)
            except (ValueError, TypeError):
                return None
        elif isinstance(raw, datetime):
            dt = raw
        else:
            return None
        # 规范化到 UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        # 关键：剥除 tzinfo，返回 naive UTC 以匹配 naive TIMESTAMP 列
        return dt.replace(tzinfo=None)

    @classmethod
    def adapt_product(
        cls,
        wp_post: dict[str, Any],
        wp_meta: dict[str, Any] | None = None,
        wp_tag_map: dict[int, str] | None = None,
    ) -> dict[str, Any]:
        """适配 WP 产品为内部产品结构。

        ``wp_tag_map`` 为 ETL 阶段一次性拉取的 ``{wp_tag_id: name}`` 映射；
        用于把 WP 产品顶层 ``tags``（标签 ID 数组）解析为名称字符串数组。
        无映射或 ID 缺失时兜底用 ``str(id)``。本方法为纯函数，不触网。

        真实 WP（自定义插件 wc-product-specs-rest.php）把 SKU/价格/库存/相册/规格
        放在**顶层字段** wc_sku/wc_price/wc_stock/wc_gallery/wc_attributes；标准
        WooCommerce 则放在 meta（_sku/_price/_stock_status/_product_image_gallery/pa_*）。
        本方法优先读顶层 wc_* 字段，回退到 meta，以兼容两种数据源。
        """
        title = cls._text_field(wp_post, "title", "post_title") or wp_post.get("slug", "")
        slug = wp_post.get("slug") or re.sub(r"[^a-z0-9-]", "-", title.lower())
        content_html = cls._text_field(wp_post, "content", "post_content")
        summary = cls._text_field(wp_post, "excerpt", "post_excerpt")

        # meta 兜底来源：显式传入的 wp_meta 或 wp_post 内嵌的 meta
        meta: dict[str, Any] = wp_meta or wp_post.get("meta", {}) or {}

        # SKU：优先真实 WP 顶层 wc_sku，回退标准 WC meta._sku（兼容）；空串按 None 处理
        sku = wp_post.get("wc_sku")
        if not sku:
            sku = meta.get("_sku")
        sku = sku or None

        # 价格：优先真实 WP 顶层 wc_price；空串/None/无法解析 → 视为无价格（存 None）。
        # 模型 price 字段为 DecimalField(null=True)，可安全存 None（OEM 无标价属正常）。
        price_raw = wp_post.get("wc_price")
        if not price_raw:
            price_raw = meta.get("_price") or meta.get("_regular_price")
        price: float | None = None
        if price_raw not in (None, ""):
            try:
                price = float(price_raw)
            except (TypeError, ValueError):
                price = None

        # 库存状态：优先 wc_stock，回退 meta._stock_status，默认 instock
        stock_status = wp_post.get("wc_stock")
        if not stock_status:
            stock_status = meta.get("_stock_status", "instock")
        stock_status = stock_status or "instock"

        # 相册：真实 WP 的 wc_gallery 是数组，元素可能是 URL 字符串，也可能是
        # {'id', 'src', 'alt'} 对象（视插件版本而定）；统一提取出 src 作为 image_url。
        # 区别于旧版逗号串 meta._product_image_gallery。
        galleries: list[dict[str, Any]] = []
        wc_gallery = wp_post.get("wc_gallery")
        if isinstance(wc_gallery, list):
            for i, item in enumerate(wc_gallery):
                if isinstance(item, dict):
                    url = item.get("src") or item.get("url") or item.get("image_url")
                    alt = item.get("alt")
                else:
                    url = item
                    alt = None
                if url:
                    galleries.append({"image_url": url, "alt": alt, "sort_order": i})
        else:
            # 兼容旧版：_product_image_gallery 为逗号分隔的媒体 ID 串
            gallery_raw = meta.get("_product_image_gallery", "")
            if gallery_raw:
                for gid in str(gallery_raw).split(","):
                    gid = gid.strip()
                    if gid:
                        galleries.append(
                            {"image_url": gid, "alt": None, "sort_order": len(galleries)}
                        )

        # 规格：真实 WP 的 wc_attributes 是 [{name, slug, value}] 列表
        attributes: list[dict[str, Any]] = []
        wc_attrs = wp_post.get("wc_attributes")
        if isinstance(wc_attrs, list):
            for a in wc_attrs:
                name = a.get("name")
                slug_a = a.get("slug")
                value = a.get("value")
                if name is not None or slug_a is not None or value is not None:
                    # 模型 ProductAttribute.value 为 CharField(max_length=500)，
                    # 真实 WP 个别规格（如长分辨率串）会超长，按现有字段上限截断，避免落库失败。
                    raw_value = "" if value is None else str(value)
                    attributes.append(
                        {
                            "name": name or slug_a or "",
                            "slug": slug_a
                            or (name or "").lower().replace(" ", "-"),
                            "value": raw_value[:500],
                        }
                    )
        else:
            # 兼容旧版：pa_ 前缀 meta 视为产品属性
            for k, v in meta.items():
                if k.startswith("pa_") and v:
                    name = k[3:].replace("_", " ").title()
                    attributes.append({"name": name, "slug": k[3:], "value": str(v)})

        # 标签：WP 产品的标签在 REST 顶层为 tags（标签 ID 数组），名称需另取
        # /wp/v2/tags。这里仅做 ID→名称解析（映射由 ETL 提供），不触网。
        # 有 map 则解析为名称数组；缺失/无 map 兜底存 str(id)，保证返回 list[str]。
        tag_ids = wp_post.get("tags") or []
        tags: list[str] = []
        if isinstance(tag_ids, list):
            for tid in tag_ids:
                name = wp_tag_map.get(tid) if wp_tag_map else None
                tags.append(name if name is not None else str(tid))

        return {
            "title": title,
            "slug": slug,
            "summary": summary[:500],
            "content_html": content_html,
            "sku": sku,
            "price": price,
            "stock_status": stock_status,
            # 产品分类：真实 WP 的 product_cat 是 WP 分类 ID 数组（如 [44]），
            # etl.py 会在 product_cat_map 中完成 (WP 分类ID → 项目 category id) 映射。
            "wp_category_id": wp_post.get("product_cat") or wp_post.get("categories", [{}]),
            "cover_media_id": wp_post.get("featured_media"),  # WP 主图（特色图）媒体 ID，由 etl 解析为 URL 并落盘
            "created_time": cls._parse_wp_date(wp_post),  # WP 原始发布时间（naive UTC）
            "galleries": galleries,
            "attributes": attributes,
            "tags": tags,  # tags: 标签名字符串数组，如 ["OEM", "4K", "Waterproof"]
        }

    @classmethod
    def adapt_news(cls, wp_post: dict[str, Any]) -> dict[str, Any]:
        """适配 WP 文章为内部新闻结构。"""
        title = cls._text_field(wp_post, "title", "post_title") or wp_post.get("slug", "")
        slug = wp_post.get("slug") or re.sub(r"[^a-z0-9-]", "-", title.lower())
        content_html = cls._text_field(wp_post, "content", "post_content")
        summary = cls._text_field(wp_post, "excerpt", "post_excerpt")
        return {
            "title": title,
            "slug": slug,
            "summary": summary[:500],
            "content_html": content_html,
            "wp_category_id": wp_post.get("categories", [{}]),
            "author": wp_post.get("author_name") or wp_post.get("_author"),
            "cover_media_id": wp_post.get("featured_media"),  # WP 主图（特色图）媒体 ID，由 etl 解析为 URL 并落盘
            "created_time": cls._parse_wp_date(wp_post),  # WP 原始发布时间（naive UTC）
        }

    @classmethod
    def adapt_category(cls, wp_term: dict[str, Any]) -> dict[str, Any]:
        """适配 WP 分类法为内部分类结构。"""
        name = wp_term.get("name", "")
        slug = wp_term.get("slug") or re.sub(r"[^a-z0-9-]", "-", name.lower())
        return {"name": name, "slug": slug}
