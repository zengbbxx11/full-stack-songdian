"""一次性脚本：为已迁移资讯补全 WordPress 主图（featured_media）。

初次迁移时 ETL 未捕获 featured_media，导致资讯没有主图。本脚本按 slug 与 WP 文章对应，
拉取每篇文章的 featured_media 并下载到本地 uploads/news/{id}/cover.*，写入 cover_image。

运行：backend 目录下 `python fix_news_cover_images.py`（需先激活 venv）。
"""
from __future__ import annotations

from common.config import init_db
from migration import image_sync


async def main() -> None:
    await init_db()
    print("开始补全资讯主图（featured_media）...")
    report = await image_sync.backfill_news_cover_images(overwrite=False)
    print("=== 资讯主图补全结果 ===")
    print(report)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
