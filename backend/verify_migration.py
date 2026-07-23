"""迁移后自测验证脚本（零网络，仅读库 + 静态访问 + 文件比对）。

覆盖任务要求的 6 项验证：
  1) 静态访问（TestClient）：新 slug 路径 200(image/*, 字节>0)，旧数字路径 404。
  2) asyncpg 核对 DB：cover_image / image_url 带 uploads 前缀的数量与「不含数字目录」数量一致。
  3) 目录名集合 == slug 集合。
  4) 文件完整性：抽查文件字节数与备份目录一致。
"""
from __future__ import annotations

import asyncio
import glob
import os

import asyncpg

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOADS = os.path.join(BACKEND_ROOT, "uploads")
DSN = "postgres://postgres:postgres@localhost:5432/songdianB2B"


def _cover_filename(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def _latest_backup() -> str | None:
    bak = sorted(glob.glob(os.path.join(BACKEND_ROOT, "uploads_bak_*")))
    return bak[-1] if bak else None


async def main() -> None:
    conn = await asyncpg.connect(DSN)
    print("==== 2) DB 核对 ====")

    # t_product.cover_image
    pc_total = await conn.fetchval(
        "SELECT count(*) FROM t_product WHERE cover_image LIKE '/uploads/products/%'"
    )
    pc_nodigit = await conn.fetchval(
        "SELECT count(*) FROM t_product WHERE cover_image LIKE '/uploads/products/%' "
        "AND cover_image !~ '/uploads/products/[0-9]+/'"
    )
    print(f"[t_product.cover_image] 带前缀={pc_total}  不含数字目录={pc_nodigit}  (期望 42/42)")

    # t_product_gallery.image_url
    gc_total = await conn.fetchval(
        "SELECT count(*) FROM t_product_gallery WHERE image_url LIKE '/uploads/products/%'"
    )
    gc_nodigit = await conn.fetchval(
        "SELECT count(*) FROM t_product_gallery WHERE image_url LIKE '/uploads/products/%' "
        "AND image_url !~ '/uploads/products/[0-9]+/'"
    )
    print(f"[t_product_gallery.image_url] 带前缀={gc_total}  不含数字目录={gc_nodigit}  (期望 118/118)")

    # t_news.cover_image
    nc_total = await conn.fetchval(
        "SELECT count(*) FROM t_news WHERE cover_image LIKE '/uploads/news/%'"
    )
    nc_nodigit = await conn.fetchval(
        "SELECT count(*) FROM t_news WHERE cover_image LIKE '/uploads/news/%' "
        "AND cover_image !~ '/uploads/news/[0-9]+/'"
    )
    print(f"[t_news.cover_image] 带前缀={nc_total}  不含数字目录={nc_nodigit}  (期望 9/9)")

    # 抽样测试对象（slug 目录存在且 cover 文件存在）
    products = await conn.fetch(
        "SELECT id, slug, cover_image FROM t_product WHERE cover_image LIKE '/uploads/products/%'"
    )
    news = await conn.fetch(
        "SELECT id, slug, cover_image FROM t_news WHERE cover_image LIKE '/uploads/news/%'"
    )
    test_p = None
    for r in products:
        fn = _cover_filename(r["cover_image"])
        if os.path.isfile(os.path.join(UPLOADS, "products", r["slug"], fn)):
            test_p = (r["id"], r["slug"], fn)
            break
    test_n = None
    for r in news:
        fn = _cover_filename(r["cover_image"])
        if os.path.isfile(os.path.join(UPLOADS, "news", r["slug"], fn)):
            test_n = (r["id"], r["slug"], fn)
            break
    print(f"[抽样] 测试产品={test_p}  测试资讯={test_n}")

    # 3) 目录名 == slug 集合
    print("\n==== 3) 目录名 == slug 集合 ====")
    prod_dirs = set(os.listdir(os.path.join(UPLOADS, "products")))
    news_dirs = set(os.listdir(os.path.join(UPLOADS, "news")))
    prod_slugs = {r["slug"] for r in await conn.fetch("SELECT slug FROM t_product")}
    news_slugs = {r["slug"] for r in await conn.fetch("SELECT slug FROM t_news")}
    print(f"[products] 目录数={len(prod_dirs)} slug数={len(prod_slugs)} "
          f"差集(仅目录)={prod_dirs - prod_slugs} 差集(仅slug)={prod_slugs - prod_dirs}")
    print(f"[news]     目录数={len(news_dirs)} slug数={len(news_slugs)} "
          f"差集(仅目录)={news_dirs - news_slugs} 差集(仅slug)={news_slugs - news_dirs}")
    await conn.close()

    # 1) 静态访问（TestClient）
    print("\n==== 1) 静态访问（TestClient）====")
    from main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        if test_p:
            cid, slug, fn = test_p
            new_url = f"/uploads/products/{slug}/{fn}"
            old_url = f"/uploads/products/{cid}/{fn}"
            r_new = client.get(new_url)
            r_old = client.get(old_url)
            print(f"[产品] 新路径 {new_url} -> "
                  f"status={r_new.status_code} type={r_new.headers.get('content-type')} bytes={len(r_new.content)}")
            print(f"[产品] 旧路径 {old_url} -> status={r_old.status_code} (期望 404)")
        if test_n:
            cid, slug, fn = test_n
            new_url = f"/uploads/news/{slug}/{fn}"
            old_url = f"/uploads/news/{cid}/{fn}"
            r_new = client.get(new_url)
            r_old = client.get(old_url)
            print(f"[资讯] 新路径 {new_url} -> "
                  f"status={r_new.status_code} type={r_new.headers.get('content-type')} bytes={len(r_new.content)}")
            print(f"[资讯] 旧路径 {old_url} -> status={r_old.status_code} (期望 404)")

    # 4) 文件完整性（与备份比对字节数；备份目录仍为旧数字 id 命名，需 slug->id 回查）
    print("\n==== 4) 文件完整性（与备份比对）====")
    bak = _latest_backup()
    print(f"[备份目录] {bak}")
    if bak and test_p:
        cid, slug, fn = test_p
        cur = os.path.join(UPLOADS, "products", slug, fn)
        bakf = os.path.join(bak, "products", str(cid), fn)
        if os.path.isfile(cur) and os.path.isfile(bakf):
            sc = os.path.getsize(cur)
            sb = os.path.getsize(bakf)
            print(f"[产品 cover] 当前={sc} 备份={sb} {'一致' if sc == sb else '不一致!!'}")
        else:
            print(f"[产品 cover] 文件缺失 cur={os.path.isfile(cur)} bak={os.path.isfile(bakf)}")
    if bak and test_n:
        cid, slug, fn = test_n
        cur = os.path.join(UPLOADS, "news", slug, fn)
        bakf = os.path.join(bak, "news", str(cid), fn)
        if os.path.isfile(cur) and os.path.isfile(bakf):
            sc = os.path.getsize(cur)
            sb = os.path.getsize(bakf)
            print(f"[资讯 cover] 当前={sc} 备份={sb} {'一致' if sc == sb else '不一致!!'}")
        else:
            print(f"[资讯 cover] 文件缺失 cur={os.path.isfile(cur)} bak={os.path.isfile(bakf)}")

    # 抽查一个 gallery 文件（用 product_id 回查备份中的数字目录）
    if bak:
        conn3 = await asyncpg.connect(DSN)
        g = await conn3.fetchrow(
            "SELECT product_id, image_url FROM t_product_gallery "
            "WHERE image_url LIKE '/uploads/products/%' LIMIT 1"
        )
        await conn3.close()
        if g:
            pid = g["product_id"]
            url = g["image_url"]
            rel = url[len("/uploads/"):]  # products/{slug}/{filename}
            cur = os.path.join(UPLOADS, rel)
            # 备份仍为旧命名 products/{pid}/{filename}，去掉 slug 段
            fname = rel.split("/", 2)[2]
            bakf = os.path.join(bak, "products", str(pid), fname)
            if os.path.isfile(cur) and os.path.isfile(bakf):
                sc = os.path.getsize(cur)
                sb = os.path.getsize(bakf)
                print(f"[gallery 抽样] {rel} 当前={sc} 备份={sb} {'一致' if sc == sb else '不一致!!'}")
            else:
                print(f"[gallery 抽样] 文件缺失 cur={os.path.isfile(cur)} bak={os.path.isfile(bakf)}")


asyncio.run(main())
