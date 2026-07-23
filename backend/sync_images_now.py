"""一次性脚本：把已迁移数据的 WordPress 图片下载到本地并改写库内 URL。

运行：在 backend 目录下 ``python sync_images_now.py``（需先激活 venv）。
仅改写 URL / 落盘文件，不触碰标题、描述文本结构，保证产品-图片从属关系不变。
"""
from __future__ import annotations

from common.config import MEDIA_ROOT, init_db, settings
from migration import image_sync


async def main() -> None:
    print(f"媒体存储根目录: {MEDIA_ROOT}")
    await init_db()
    print("开始同步产品 / 资讯图片 ...")
    report = await image_sync.sync_all_images(overwrite=False)
    print("=== 同步结果 ===")
    print("产品:", report["product"])
    print("资讯:", report["news"])
    print(f"落盘目录示例: {MEDIA_ROOT}")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
