"""WP→PG ETL（M6，§3.2.M6 / §6.4 / §4.5.4）。

设计约束：
- WP REST 分页拉取 → ACL 清洗 → 批量写入 PG + 重建 search_vector。
- 单条失败写 ``t_migration_record(status=FAILED, error_msg)``，不中断批次。
- 校验对账（§4.5.4）：行数/内容/业务偏差；failed>0 即告警。
- 源不可达（BD-04）：暂停批次，已迁移保留，抛异常由 services 置 FAILED。
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from common.html_cleaner import clean_html
from common.logger import get_logger
from common.search_vector import update_search_vector
from migration.models import MigrationBatch, MigrationRecord
from migration.image_sync import download_cover
from migration.wp_adapter import WordPressProductAdapter
from news.models import News, NewsCategory
from product.models import (
    Product,
    ProductAttribute,
    ProductCategory,
    ProductGallery,
)

logger = get_logger(__name__)


async def _fetch_collection(client: httpx.AsyncClient, url: str, per_page: int = 50) -> list[dict[str, Any]]:
    """分页拉取某个 WP REST 集合（最多 200 页，避免死循环）。"""
    items: list[dict[str, Any]] = []
    for page in range(1, 201):
        resp = await client.get(url, params={"per_page": per_page, "page": page})
        resp.raise_for_status()
        chunk = resp.json()
        if not chunk:
            break
        items.extend(chunk)
        if len(chunk) < per_page:
            break
    return items


async def _ensure_product_category(wp_term: dict[str, Any], mapping: dict[int, int]) -> int:
    adapted = WordPressProductAdapter.adapt_category(wp_term)
    cat, _ = await ProductCategory.get_or_create(
        slug=adapted["slug"],
        defaults={"name": adapted["name"], "sort_order": 0},
    )
    mapping[wp_term.get("id")] = cat.id
    return cat.id


async def _ensure_news_category(wp_term: dict[str, Any], mapping: dict[int, int]) -> int:
    adapted = WordPressProductAdapter.adapt_category(wp_term)
    cat, _ = await NewsCategory.get_or_create(
        slug=adapted["slug"],
        defaults={"name": adapted["name"], "sort_order": 0},
    )
    mapping[wp_term.get("id")] = cat.id
    return cat.id


async def _write_product(
    wp_post: dict[str, Any],
    cat_mapping: dict[int, int],
    client: httpx.AsyncClient,
    source_base_url: str,
    wp_tag_map: dict[int, str] | None = None,
) -> int:
    meta = wp_post.get("meta", {}) or {}
    # 传入 wp_tag_map，把 WP 标签 ID 数组解析为名称字符串数组（纯函数，不触网）
    data = WordPressProductAdapter.adapt_product(wp_post, meta, wp_tag_map=wp_tag_map)
    created_time = data.pop("created_time", None)  # WP 原始发布时间（naive UTC）；None 时 Tortoise 自动填 now
    # 解析分类
    wp_cats = data.pop("wp_category_id", [])
    local_cat_id = None
    for c in wp_cats:
        cid = c.get("id") if isinstance(c, dict) else c
        if cid in cat_mapping:
            local_cat_id = cat_mapping[cid]
            break
    if local_cat_id is None:
        default_cat, _ = await ProductCategory.get_or_create(
            slug="uncategorized", defaults={"name": "未分类", "sort_order": 999}
        )
        local_cat_id = default_cat.id

    # 逐条自动提交：search_vector 现已容错（失败仅告警），不会产生孤儿行，
    # 故无需 in_transaction 包裹（其与原生 execute_query 混用会扰乱 asyncpg 事务状态）。
    product = await Product.create(
        slug=data["slug"], title=data["title"], summary=data["summary"],
        content_html=clean_html(data["content_html"]), category_id=local_cat_id,
        sku=data.get("sku"), price=data.get("price"),
        stock_status=data.get("stock_status", "instock"), status="PUBLISHED",
        created_time=created_time,
        # tags: 标签名字符串数组，普通字段，不触发 auto_now_add，无时区坑
        tags=data.get("tags", []),
    )
    for g in data.get("galleries", []):
        await ProductGallery.create(product_id=product.id, image_url=g["image_url"],
                                    alt=g.get("alt"), sort_order=g.get("sort_order", 0))
    for a in data.get("attributes", []):
        await ProductAttribute.create(product_id=product.id, name=a["name"],
                                      slug=a["slug"], value=a["value"])
    # 主图（WP featured_media）：解析媒体 URL → 本地落盘 → 写 cover_image；失败仅告警不阻断
    cover_media_id = data.pop("cover_media_id", None)
    if cover_media_id:
        try:
            mr = await client.get(f"{source_base_url}/wp/v2/media/{cover_media_id}")
            mr.raise_for_status()
            cover_url = mr.json().get("source_url")
            if cover_url:
                cover_local = await download_cover(product.slug, cover_url, client)
                if cover_local:
                    product.cover_image = cover_local
                    await product.save(update_fields=["cover_image"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("产品主图下载失败（跳过，保留无主图）slug=%s -> %s", data["slug"], exc)
    await update_search_vector("t_product", product.id, "title", "summary", "content_html")
    return product.id


async def _write_news(
    wp_post: dict[str, Any],
    cat_mapping: dict[int, int],
    client: httpx.AsyncClient,
    source_base_url: str,
) -> int:
    data = WordPressProductAdapter.adapt_news(wp_post)
    created_time = data.pop("created_time", None)  # WP 原始发布时间（naive UTC）；None 时 Tortoise 自动填 now
    wp_cats = data.pop("wp_category_id", [])
    local_cat_id = None
    for c in wp_cats:
        cid = c.get("id") if isinstance(c, dict) else c
        if cid in cat_mapping:
            local_cat_id = cat_mapping[cid]
            break
    if local_cat_id is None:
        default_cat, _ = await NewsCategory.get_or_create(
            slug="uncategorized", defaults={"name": "未分类", "sort_order": 999}
        )
        local_cat_id = default_cat.id

    # 逐条自动提交：search_vector 已容错，无需 in_transaction 包裹（避免扰乱 asyncpg 事务状态）
    news = await News.create(
        slug=data["slug"], title=data["title"], summary=data["summary"],
        content_html=clean_html(data["content_html"]), category_id=local_cat_id,
        author=data.get("author"), status="PUBLISHED",
        created_time=created_time, published_at=created_time,
    )
    # 主图（WP featured_media）：解析媒体 URL → 本地落盘 → 写 cover_image；失败仅告警不阻断
    cover_media_id = data.pop("cover_media_id", None)
    if cover_media_id:
        try:
            mr = await client.get(f"{source_base_url}/wp/v2/media/{cover_media_id}")
            mr.raise_for_status()
            cover_url = mr.json().get("source_url")
            if cover_url:
                cover_local = await download_cover(news.slug, cover_url, client, resource_type="news")
                if cover_local:
                    news.cover_image = cover_local
                    await news.save(update_fields=["cover_image"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("新闻主图下载失败（跳过，保留无主图）slug=%s -> %s", data["slug"], exc)
    await update_search_vector("t_news", news.id, "title", "summary", "content_html")
    return news.id


async def run_etl(
    batch: MigrationBatch,
    source_base_url: str,
    scope: str,
    dry_run: bool = False,
) -> None:
    """执行一次迁移批次（写库 + 重建索引 + 对账）。"""
    batch.status = "RUNNING"
    batch.started_at = datetime.now(UTC)
    await batch.save()

    total = processed = failed = 0
    product_cat_map: dict[int, int] = {}
    news_cat_map: dict[int, int] = {}
    # wp_tag_map: {wp_tag_id: name}，ETL 阶段一次性拉取 /wp/v2/tags 建立，供标签解析复用，避免 N+1
    wp_tag_map: dict[int, str] = {}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 分类法（product_cat / category）
            if scope in ("all", "product"):
                try:
                    for t in await _fetch_collection(client, f"{source_base_url}/wp/v2/product_cat"):
                        await _ensure_product_category(t, product_cat_map)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("拉取产品分类失败（跳过）：%s", exc)
            if scope in ("all", "news"):
                try:
                    for t in await _fetch_collection(client, f"{source_base_url}/wp/v2/categories"):
                        await _ensure_news_category(t, news_cat_map)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("拉取新闻分类失败（跳过）：%s", exc)

            # 产品（真实 WP 路由为单数 product，复数 products 会 404 rest_no_route）
            if scope in ("all", "product"):
                # 一次性拉取 WP 标签术语，建立 id→name 映射；失败仅告警，标签置空
                try:
                    tag_items = await _fetch_collection(client, f"{source_base_url}/wp/v2/tags", per_page=100)
                    wp_tag_map = {int(t["id"]): t.get("name", "") for t in tag_items if t.get("id") is not None}
                except Exception as exc:  # noqa: BLE001
                    logger.warning("拉取 WP 标签失败（标签置空，继续）：%s", exc)
                    wp_tag_map = {}
                posts = await _fetch_collection(client, f"{source_base_url}/wp/v2/product")
                total += len(posts)
                for p in posts:
                    try:
                        if dry_run:
                            processed += 1
                            continue
                        # 透传 wp_tag_map，让 adapter 把标签 ID 解析为名称数组
                        target_id = await _write_product(p, product_cat_map, client, source_base_url, wp_tag_map=wp_tag_map)
                        processed += 1
                        await MigrationRecord.create(
                            batch=batch, entity_type="product",
                            source_id=str(p.get("id")), target_id=target_id, status="SUCCESS",
                        )
                    except Exception as exc:  # noqa: BLE001
                        failed += 1
                        await MigrationRecord.create(
                            batch=batch, entity_type="product",
                            source_id=str(p.get("id")), target_id=None,
                            status="FAILED", error_msg=str(exc)[:1000],
                        )

            # 新闻
            if scope in ("all", "news"):
                posts = await _fetch_collection(client, f"{source_base_url}/wp/v2/posts")
                total += len(posts)
                for p in posts:
                    try:
                        if dry_run:
                            processed += 1
                            continue
                        target_id = await _write_news(p, news_cat_map, client, source_base_url)
                        processed += 1
                        await MigrationRecord.create(
                            batch=batch, entity_type="news",
                            source_id=str(p.get("id")), target_id=target_id, status="SUCCESS",
                        )
                    except Exception as exc:  # noqa: BLE001
                        failed += 1
                        await MigrationRecord.create(
                            batch=batch, entity_type="news",
                            source_id=str(p.get("id")), target_id=None,
                            status="FAILED", error_msg=str(exc)[:1000],
                        )

        # 对账（§4.5.4）：行数偏差=0；failed>0 即告警
        batch.total = total
        batch.processed = processed
        batch.failed = failed
        if failed > 0:
            batch.status = "PARTIAL"
            logger.warning("迁移批次 %s 存在失败明细 %d 条，触发告警", batch.batch_no, failed)
        else:
            batch.status = "SUCCESS"
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        # BD-04：源不可达，暂停批次，保留已迁移
        batch.status = "FAILED"
        batch.total = total
        batch.processed = processed
        batch.failed = failed
        logger.error("迁移源不可达（BD-04），批次暂停：%s", exc)
    finally:
        batch.finished_at = datetime.now(UTC)
        await batch.save()


async def backfill_created_time(source_base_url: str) -> dict:
    """回填已迁移产品/新闻的 WP 原始发布时间（created_time / published_at）。

    复用 ``_fetch_collection`` 重新拉取 WP 源，按 slug 匹配本地行，使用 ``.update()``
    直接走 SQL 写入 naive 时间，避免触发 ``auto_now_add``。orig 为 None 或本地无匹配
    时跳过，绝不写 None（新闻 published_at 非空约束）。拉取异常容错，不中断整体。
    """
    stats: dict[str, int] = {
        "products_updated": 0,
        "news_updated": 0,
        "products_skipped": 0,
        "news_skipped": 0,
    }

    products: list[dict[str, Any]] = []
    news: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                products = await _fetch_collection(client, f"{source_base_url}/wp/v2/product")
            except Exception as exc:  # noqa: BLE001
                logger.warning("回填-拉取 WP 产品失败（置空，跳过产品回填）：%s", exc)
            try:
                news = await _fetch_collection(client, f"{source_base_url}/wp/v2/posts")
            except Exception as exc:  # noqa: BLE001
                logger.warning("回填-拉取 WP 新闻失败（置空，跳过新闻回填）：%s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("回填-创建 HTTP 客户端失败（跳过全部回填）：%s", exc)
        return stats

    # 产品回填：按 slug 匹配本地行，直接 SQL 更新 created_time
    for p in products:
        orig = WordPressProductAdapter._parse_wp_date(p)
        slug = p.get("slug")
        if not slug or orig is None:
            stats["products_skipped"] += 1
            continue
        local = await Product.filter(slug=slug).first()
        if local is None:
            stats["products_skipped"] += 1
            continue
        await Product.filter(id=local.id).update(created_time=orig)
        stats["products_updated"] += 1

    # 新闻回填：按 slug 匹配本地行，SQL 更新 created_time 与 published_at
    for n in news:
        orig = WordPressProductAdapter._parse_wp_date(n)
        slug = n.get("slug")
        if not slug or orig is None:
            stats["news_skipped"] += 1
            continue
        local = await News.filter(slug=slug).first()
        if local is None:
            stats["news_skipped"] += 1
            continue
        await News.filter(id=local.id).update(created_time=orig, published_at=orig)
        stats["news_updated"] += 1

    return stats


async def backfill_tags(source_base_url: str) -> dict:
    """回填存量产品的 WP 标签（按 slug 匹配，直写 tags 字段）。

    复用 ETL 的标签解析逻辑：一次性拉取 WP 产品 + /wp/v2/tags 建立 id→name 映射，
    按 slug 匹配本地行，使用 ``.update(tags=[名称数组])`` 直接 SQL 写入。
    与 ``backfill_created_time`` 同模式：容错、按 slug 匹配、不触发 ``auto_now_add``。
    产品无标签或本地无匹配时跳过，绝不写 None。拉取异常容错，不中断整体。
    """
    stats: dict[str, int] = {
        "products_updated": 0,
        "products_skipped": 0,
    }

    products: list[dict[str, Any]] = []
    tag_items: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                tag_items = await _fetch_collection(client, f"{source_base_url}/wp/v2/tags", per_page=100)
            except Exception as exc:  # noqa: BLE001
                logger.warning("回填-拉取 WP 标签失败（标签置空，跳过产品标签回填）：%s", exc)
            try:
                products = await _fetch_collection(client, f"{source_base_url}/wp/v2/product")
            except Exception as exc:  # noqa: BLE001
                logger.warning("回填-拉取 WP 产品失败（跳过产品标签回填）：%s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("回填-创建 HTTP 客户端失败（跳过全部标签回填）：%s", exc)
        return stats

    # 建立 WP 标签 id→name 映射
    wp_tag_map: dict[int, str] = {
        int(t["id"]): t.get("name", "") for t in tag_items if t.get("id") is not None
    }

    # 产品标签回填：按 slug 匹配本地行，直接 SQL 更新 tags（名称字符串数组）
    for p in products:
        slug = p.get("slug")
        tag_ids = p.get("tags") or []
        # 解析标签 ID 为名称数组；无 map 或缺失兜底 str(id)
        tag_names: list[str] = []
        if isinstance(tag_ids, list):
            for tid in tag_ids:
                name = wp_tag_map.get(tid)
                tag_names.append(name if name is not None else str(tid))
        if not slug or not tag_names:
            stats["products_skipped"] += 1
            continue
        local = await Product.filter(slug=slug).first()
        if local is None:
            stats["products_skipped"] += 1
            continue
        # 直写 tags：普通 JSON 字段，不触发 auto_now_add，无时区坑
        await Product.filter(id=local.id).update(tags=tag_names)
        stats["products_updated"] += 1

    return stats
