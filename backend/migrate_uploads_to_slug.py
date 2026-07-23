"""迁移脚本：将已落盘的图片目录从「数字 id」重命名为「slug」，并同步更新库内 URL（零网络依赖）。

背景：
    image_sync.py 早期按资源 id 建目录（uploads/products/{id}/、uploads/news/{id}/），
    对外暴露的 URL 也带数字 id，可读性差。本脚本在不重新下载的前提下，通过
    「文件系统 rename + 库内 URL 文本替换」完成已有数据的迁移；未来落盘由 image_sync.py
    直接改用 slug（见其对应修改），保持命名规则前后一致。

约束与安全性：
    - 仅依赖本地文件系统与 PostgreSQL（asyncpg），绝不访问 WordPress，零网络开销。
    - 先整目录备份 uploads -> uploads_bak_{YYYYMMDD_HHMMSS}，备份保留不删。
    - id↔slug 映射严格取自数据库字段（t_product / t_news），绝不臆测。
    - slug 理论上为英文安全字符，但仍对路径分隔符（如斜杠 / 与反斜杠）做替换保护。
    - 防重名：若目标 slug 目录已存在，打印告警、不覆盖、跳过该 rename，但仍继续更新 URL。
    - 支持 --dry-run：只打印计划与统计，不执行 rename / 不更新库。

用法：
    python migrate_uploads_to_slug.py            # 直接执行（已备份）
    python migrate_uploads_to_slug.py --dry-run  # 只打印计划，不落盘、不改库
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import shutil
from datetime import datetime

import asyncpg

# 后端根目录（本脚本位于 backend/）
BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BACKEND_ROOT, "uploads")
# PostgreSQL 连接串（与 .env 的 DATABASE_URL 一致）
DSN = "postgres://postgres:postgres@localhost:5432/songdianB2B"

# slug 中可能混入的路径分隔符（理论上为英文安全，仍加保护）
_UNSAFE_SEP_RE = re.compile(r"[/\\]+")


def sanitize_slug(slug) -> str:
    """把 slug 中的路径分隔符替换为横杠，避免 rename 时产生子目录或路径注入。"""
    if not slug:
        return ""
    return _UNSAFE_SEP_RE.sub("-", str(slug)).strip("-")


def _backup_path() -> str:
    """生成带时间戳的备份目录路径。"""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(BACKEND_ROOT, f"uploads_bak_{ts}")


async def main(dry_run: bool) -> None:
    # 1) 备份（dry-run 仅打印计划，不落盘）
    bak_dir = _backup_path()
    if os.path.isdir(bak_dir):
        print(f"[备份] 目标已存在，跳过备份：{bak_dir}")
    elif dry_run:
        print(f"[备份] (dry-run) 计划备份到：{bak_dir}")
    else:
        shutil.copytree(UPLOADS_DIR, bak_dir)
        print(f"[备份] 已备份到：{bak_dir}")

    if not os.path.isdir(UPLOADS_DIR):
        print(f"[错误] uploads 目录不存在：{UPLOADS_DIR}")
        return

    # 2) 连接 PG，读取 id↔slug 映射与待更新的 URL 字段
    conn = await asyncpg.connect(DSN)
    try:
        product_urls = await conn.fetch(
            "SELECT id, slug, cover_image FROM t_product"
        )
        gallery_urls = await conn.fetch(
            "SELECT g.id AS gid, g.product_id, g.image_url FROM t_product_gallery g"
        )
        news_urls = await conn.fetch(
            "SELECT id, slug, cover_image FROM t_news"
        )

        # id -> slug 映射（供 gallery 按 product_id 查找）
        prod_slug_by_id = {
            r["id"]: sanitize_slug(r["slug"]) for r in product_urls
        }

        stats = {
            "products": {
                "rename_ok": 0,
                "rename_skip": 0,
                "rename_nodir": 0,
                "url_cover": 0,
                "url_gallery": 0,
            },
            "news": {
                "rename_ok": 0,
                "rename_skip": 0,
                "rename_nodir": 0,
                "url_cover": 0,
            },
        }
        samples_p: list[tuple] = []
        samples_n: list[tuple] = []

        # ── products 目录重命名 ──
        prod_dir = os.path.join(UPLOADS_DIR, "products")
        for r in product_urls:
            rid = r["id"]
            slug = sanitize_slug(r["slug"])
            if len(samples_p) < 3:
                samples_p.append((rid, slug))
            src = os.path.join(prod_dir, str(rid))
            dst = os.path.join(prod_dir, slug)
            if os.path.isdir(src):
                if os.path.exists(dst):
                    # 防重名：不覆盖、跳过 rename，但仍更新 URL
                    print(
                        f"[警告][products] 目标已存在，跳过 rename（仍更新 URL）："
                        f"{rid} -> {slug}"
                    )
                    stats["products"]["rename_skip"] += 1
                else:
                    if not dry_run:
                        os.rename(src, dst)
                    stats["products"]["rename_ok"] += 1
            else:
                # 源目录不存在：仅更新 URL，保持库与命名规则一致
                stats["products"]["rename_nodir"] += 1

        # ── news 目录重命名 ──
        news_dir = os.path.join(UPLOADS_DIR, "news")
        for r in news_urls:
            rid = r["id"]
            slug = sanitize_slug(r["slug"])
            if len(samples_n) < 3:
                samples_n.append((rid, slug))
            src = os.path.join(news_dir, str(rid))
            dst = os.path.join(news_dir, slug)
            if os.path.isdir(src):
                if os.path.exists(dst):
                    print(
                        f"[警告][news] 目标已存在，跳过 rename（仍更新 URL）："
                        f"{rid} -> {slug}"
                    )
                    stats["news"]["rename_skip"] += 1
                else:
                    if not dry_run:
                        os.rename(src, dst)
                    stats["news"]["rename_ok"] += 1
            else:
                stats["news"]["rename_nodir"] += 1

        # ── products URL 更新：cover_image ──
        for r in product_urls:
            rid = r["id"]
            slug = sanitize_slug(r["slug"])
            cover = r["cover_image"] or ""
            old = f"/uploads/products/{rid}/"
            if old in cover:
                new_cover = cover.replace(old, f"/uploads/products/{slug}/")
                if not dry_run:
                    await conn.execute(
                        "UPDATE t_product SET cover_image=$1 WHERE id=$2",
                        new_cover,
                        rid,
                    )
                stats["products"]["url_cover"] += 1

        # ── products URL 更新：gallery.image_url（按 product_id 查 slug）──
        for g in gallery_urls:
            pid = g["product_id"]
            slug = prod_slug_by_id.get(pid, "")
            url = g["image_url"] or ""
            old = f"/uploads/products/{pid}/"
            if slug and old in url:
                new_url = url.replace(old, f"/uploads/products/{slug}/")
                if not dry_run:
                    await conn.execute(
                        "UPDATE t_product_gallery SET image_url=$1 WHERE id=$2",
                        new_url,
                        g["gid"],
                    )
                stats["products"]["url_gallery"] += 1

        # ── news URL 更新：cover_image ──
        for r in news_urls:
            rid = r["id"]
            slug = sanitize_slug(r["slug"])
            cover = r["cover_image"] or ""
            old = f"/uploads/news/{rid}/"
            if old in cover:
                new_cover = cover.replace(old, f"/uploads/news/{slug}/")
                if not dry_run:
                    await conn.execute(
                        "UPDATE t_news SET cover_image=$1 WHERE id=$2",
                        new_cover,
                        rid,
                    )
                stats["news"]["url_cover"] += 1

        # ── 打印统计 ──
        print("\n==== 迁移统计 ====")
        p = stats["products"]
        n = stats["news"]
        print(
            f"[products] rename成功={p['rename_ok']} 跳过(重名)={p['rename_skip']} "
            f"无源目录={p['rename_nodir']} URL(cover)={p['url_cover']} "
            f"URL(gallery)={p['url_gallery']}"
        )
        print(
            f"[news]     rename成功={n['rename_ok']} 跳过(重名)={n['rename_skip']} "
            f"无源目录={n['rename_nodir']} URL(cover)={n['url_cover']}"
        )
        print("抽样 products 映射 (id -> slug):", samples_p)
        print("抽样 news 映射 (id -> slug):", samples_n)
        if dry_run:
            print("[dry-run] 未执行任何 rename / 未更新数据库。")
    finally:
        await conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="将 uploads 目录下已落盘的图片目录从「数字 id」重命名为「slug」（零网络迁移）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印计划与统计，不执行 rename / 不更新数据库",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(main(args.dry_run))
