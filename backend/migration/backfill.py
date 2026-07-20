"""回填产品/新闻的 WP 原始发布时间（created_time / published_at）。

用途：数据库里的产品、News 创建时间应与 WP 拷贝前一致（即 WP 原始发布时刻）。
本脚本按 slug 把 WP 源的 ``date_gmt`` 回填到已迁移的本地行。

运行方式：
    WP_SOURCE_BASE_URL=https://old.example.com python -m migration.backfill
"""
from __future__ import annotations

import asyncio
import os
import sys

from common.config import close_db, init_db
from migration.etl import backfill_created_time, backfill_tags


async def _main() -> None:
    url = os.environ.get("WP_SOURCE_BASE_URL")
    if not url:
        sys.stderr.write(
            "用法: WP_SOURCE_BASE_URL=https://old.example.com python -m migration.backfill\n"
        )
        sys.exit(1)
    await init_db()
    try:
        stats = await backfill_created_time(url)
        # 在 created_time 回填之后，继续回填产品标签（tags 字段）
        tag_stats = await backfill_tags(url)
    finally:
        await close_db()
    print("回填完成：")
    print(f"  产品 更新={stats['products_updated']} 跳过={stats['products_skipped']}")
    print(f"  新闻 更新={stats['news_updated']} 跳过={stats['news_skipped']}")
    print("标签回填完成：")
    print(f"  产品标签 更新={tag_stats['products_updated']} 跳过={tag_stats['products_skipped']}")


if __name__ == "__main__":
    asyncio.run(_main())
