"""一次性清理历史中文产品分类，把产品按关键词合并到 WP 迁移写回的英文分类。

背景：
- 早期 seed_data.py 曾写死 6 个**中文**产品分类（slug 为英文 mirrorless/compact/action/
  video/kids/lens，name 为中文 微单相机/卡片相机/...）。
- 后续 WP 迁移又写回了一批**英文**分类，两者并存，导致前端出现
  "Mirrorless Camera" + "微单相机" 之类的重复选项。
- 现 seed_data.py 已不再种子产品分类；本脚本负责把历史中文分类里的产品按关键词
  合并到对应英文分类，并软删（deleted=1）这些中文分类。

逻辑：
- 对每个中文 slug（mirrorless/compact/action/video/kids/lens）：
  1. 取未删除的中文分类 `cat`；不存在则跳过。
  2. 在其它未删除分类中，按 `name ILIKE keyword` 或 `slug ILIKE keyword` 找英文目标 `target`。
  3. 命中 `target`：产品改挂 `target.id`；
     未命中：先按「产品级关键词覆盖」逐产品判断，命中的产品改挂对应英文分类，
     未命中的产品才落到 `uncategorized`（未分类）。
  4. 软删中文分类 `cat`（deleted=1）。
- 主循环结束后，额外做一个 re-run-safe 收尾：扫描当前 `uncategorized` 桶里的
  存量产品，凡名/slug 命中「产品级关键词覆盖」的，统一改挂到对应英文分类。
  这样即便之前已经跑过一次 cleanup、部分产品（如 w3）已落到 uncategorized，
  再次运行也能把它们捞回正确的英文分类（如 Lens）。
- 全程不真删任何数据，仅改 `category_id` 与 `deleted`。中文分类仍软删。

产品级覆盖的原因：
- 部分产品（如 w3 镜头）当初被种子进了一个没匹配到英文目标的中文分类，
  于是整批进了 uncategorized。仅靠分类级关键词无法挽回，需要在产品名/slug 上加覆盖。

运行：``python cleanup_categories.py``（仅静态改动，不连用户 PG 也可 py_compile 自检）。
"""
from __future__ import annotations

from tortoise.expressions import Q

from common.config import close_db, init_db
from common.logger import get_logger
from product.models import Product, ProductCategory

logger = get_logger(__name__)

# key = 历史种子中文分类的 slug；value = 用于匹配英文分类的关键词。
CATEGORY_KEYWORD_MAP: dict[str, str] = {
    "mirrorless": "mirrorless",
    "compact": "compact",
    "action": "action",
    "video": "video",
    "kids": "kids",
    "lens": "lens",
}

# 产品级关键词覆盖：
# 当某款产品的 name/slug 命中某个 key（大小写不敏感子串）时，
# 无视其所在中文分类的归属，直接改挂到 value 对应的英文分类 slug。
# 用于把 w3、lens 等镜头产品正确归入 Lens（即使它们当初落到了未分类桶）。
# key = 产品名/slug 的子串；value = 目标英文分类的 slug/keyword。
PRODUCT_KEYWORD_OVERRIDES: dict[str, str] = {
    "w3": "lens",
    "lens": "lens",
}

# 覆盖目标分类创建时使用的兜底排序值（若英文分类尚不存在则创建）。
OVERRIDE_CATEGORY_SORT_ORDER = 100

UNCAT_SLUG = "uncategorized"
UNCAT_NAME = "未分类"
UNCAT_SORT_ORDER = 999


def _match_product_override(name: str, slug: str) -> str | None:
    """若产品名/slug 命中 PRODUCT_KEYWORD_OVERRIDES，返回目标分类 slug；否则返回 None。

    Args:
        name: 产品名。
        slug: 产品 slug。

    Returns:
        命中的目标英文分类 slug；未命中返回 None。
    """
    haystacks = [name or "", slug or ""]
    for key, target_slug in PRODUCT_KEYWORD_OVERRIDES.items():
        for hay in haystacks:
            if key and key.lower() in (hay or "").lower():
                return target_slug
    return None


async def _ensure_english_category(slug: str) -> ProductCategory:
    """按 slug 取/建英文目标分类（优先取未删除的；不存在则创建，便于兜底）。

    Args:
        slug: 目标英文分类 slug（如 "lens"）。

    Returns:
        已存在的或未删除优先、否则新创建的 ProductCategory 实例。
    """
    category = await ProductCategory.get_or_none(slug=slug, deleted=0)
    if category is None:
        category, _created = await ProductCategory.get_or_create(
            slug=slug,
            defaults={"name": slug.capitalize(), "sort_order": OVERRIDE_CATEGORY_SORT_ORDER},
        )
    return category


async def _rescue_from_uncategorized() -> int:
    """扫描当前 uncategorized 桶里的存量产品，命中覆盖规则的改挂对应英文分类。

    该步骤 re-run-safe：即便之前已经跑过一次 cleanup，部分产品（如 w3）已落到
    uncategorized，再次运行也能把它们捞回正确的英文分类。幂等、不真删数据。

    Returns:
        从 uncategorized 捞回（改挂英文分类）的产品数量。
    """
    uncategorized = await ProductCategory.get_or_none(slug=UNCAT_SLUG, deleted=0)
    if uncategorized is None:
        return 0

    products = await Product.filter(category_id=uncategorized.id)
    rescued = 0
    for product in products:
        target_slug = _match_product_override(product.name, product.slug)
        if target_slug is not None:
            target_cat = await _ensure_english_category(target_slug)
            product.category_id = target_cat.id
            await product.save()
            rescued += 1
            logger.info(
                "从 uncategorized 捞回产品 id=%s(name=%s) → 改挂 %s",
                product.id,
                product.name,
                target_slug,
            )
    return rescued


async def cleanup_categories() -> dict:
    """软删历史中文产品分类，并把产品按关键词合并到英文分类。

    当某中文分类找不到英文目标时，先按产品级关键词覆盖逐产品改挂，
    未命中的产品才落未分类；最后再对未分类桶做 re-run-safe 收尾。

    Returns:
        汇总 dict，含每个 slug 的处理结果、合并产品数、从未分类捞回的产品数等，
        便于打印总览。
    """
    total_products_reassigned = 0
    total_products_overridden = 0
    details: list[dict] = []
    zh_categories_found = 0

    for slug, keyword in CATEGORY_KEYWORD_MAP.items():
        # 1. 取未删除的中文分类；不存在则跳过。
        cat = await ProductCategory.get_or_none(slug=slug, deleted=0)
        if cat is None:
            details.append(
                {
                    "slug": slug,
                    "found": False,
                    "target": None,
                    "target_type": None,
                    "products_moved": 0,
                    "products_overridden": 0,
                    "deleted": False,
                }
            )
            continue

        zh_categories_found += 1

        # 2. 在其它未删除分类里，按 name/slug 关键词匹配英文目标分类。
        target = (
            await ProductCategory.filter(
                Q(name__icontains=keyword) | Q(slug__icontains=keyword),
                deleted=0,
            )
            .exclude(id=cat.id)
            .first()
        )

        # 3. 命中则改挂英文目标；未命中则先走产品级覆盖，再兜底未分类。
        if target is not None:
            target_slug = target.slug
            target_type = "english_category"
            moved = await Product.filter(category_id=cat.id).update(
                category_id=target.id
            )
            overridden = 0
        else:
            uncategorized, _created = await ProductCategory.get_or_create(
                slug=UNCAT_SLUG,
                defaults={"name": UNCAT_NAME, "sort_order": UNCAT_SORT_ORDER},
            )
            target_slug = uncategorized.slug
            target_type = "uncategorized"

            # 3a. 逐产品判断是否命中产品级关键词覆盖。
            #      命中的改挂对应英文分类；未命中的留待进入未分类桶。
            products = await Product.filter(category_id=cat.id)
            uncat_ids: list[int] = []
            overridden = 0
            for product in products:
                override_slug = _match_product_override(product.name, product.slug)
                if override_slug is not None:
                    target_cat = await _ensure_english_category(override_slug)
                    product.category_id = target_cat.id
                    await product.save()
                    overridden += 1
                else:
                    uncat_ids.append(product.id)

            # 3b. 未命中的产品整批进入未分类桶。
            if uncat_ids:
                moved = await Product.filter(id__in=uncat_ids).update(
                    category_id=uncategorized.id
                )
            else:
                moved = 0

        # 4. 软删中文分类（deleted=1）。
        cat.deleted = 1
        await cat.save()

        total_products_reassigned += moved + overridden
        total_products_overridden += overridden
        details.append(
            {
                "slug": slug,
                "found": True,
                "target": target_slug,
                "target_type": target_type,
                "products_moved": moved,
                "products_overridden": overridden,
                "deleted": True,
            }
        )
        logger.info(
            "已清理中文分类 slug=%s：产品 %d 个并入 %s(%s)，其中 %d 个走产品级覆盖，中文分类已软删",
            slug,
            moved,
            target_slug,
            target_type,
            overridden,
        )

    # 5. re-run-safe 收尾：把已落入 uncategorized 的存量产品按覆盖规则捞回英文分类。
    rescued_from_uncategorized = await _rescue_from_uncategorized()
    total_products_reassigned += rescued_from_uncategorized

    summary = {
        "total_zh_categories_found": zh_categories_found,
        "total_products_reassigned": total_products_reassigned,
        "total_products_overridden": total_products_overridden,
        "rescued_from_uncategorized": rescued_from_uncategorized,
        "details": details,
    }
    return summary


if __name__ == "__main__":
    import asyncio

    from common.config import close_db, init_db

    async def _main() -> None:
        await init_db()
        try:
            summary = await cleanup_categories()
        finally:
            await close_db()

        print("=" * 60)
        print("历史中文产品分类清理完成")
        print("-" * 60)
        print(f"发现历史中文分类数：{summary['total_zh_categories_found']}")
        print(f"合并/迁移产品总数：{summary['total_products_reassigned']}")
        print(f"其中走产品级关键词覆盖的产品数：{summary['total_products_overridden']}")
        print(
            f"从 uncategorized 捞回（改挂英文分类）的产品数："
            f"{summary['rescued_from_uncategorized']}"
        )
        print("-" * 60)
        for d in summary["details"]:
            if not d["found"]:
                status = "未找到（跳过）"
            else:
                status = (
                    f"→ 并入 {d['target']}({d['target_type']})，"
                    f"移动 {d['products_moved']} 个"
                )
                if d["products_overridden"]:
                    status += f"，其中 {d['products_overridden']} 个走产品级覆盖"
                status += "，已软删"
            print(f"  {d['slug']:>10}: {status}")
        print("=" * 60)

    asyncio.run(_main())
