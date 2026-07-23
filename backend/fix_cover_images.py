"""一次性脚本：为已迁移产品补全 WordPress 主图（featured_media）。

初次迁移时 ETL 未捕获 featured_media，导致产品没有主图。本脚本按 slug 与 WP 产品对应，
拉取每个产品的 featured_media 并下载到本地 uploads/products/{id}/cover.*，写入 cover_image。

运行：backend 目录下 ``python fix_cover_images.py``（需先激活 venv）。
"""
from __future__ import annotations

from common.config import init_db
from migration import image_sync


async def main() -> None:
    await init_db()
    print("开始补全产品主图（featured_media）...")
    report = await image_sync.backfill_cover_images(overwrite=False)
    print("=== 主图补全结果 ===")
    print(report)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
