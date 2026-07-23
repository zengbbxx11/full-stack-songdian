"""QA 独立验证脚本：News 主图迁移补齐。

覆盖项（来自 QA 任务）：
  1) 关系正确性：主图确实属于该文章（按 slug 映射，不串档）。
  2) 目录隔离 / 产品侧不受影响。
  5) 静态访问：TestClient GET /uploads/news/{id}/cover.* 200(image/*)，999→404。

仅读取 PG + WP + 磁盘，并对 WP 原图做 sha256 同源比对。本脚本不写库。
"""
from __future__ import annotations

import hashlib
import os
import re
import sys

# 必须在导入 main 之前固定环境，避免误触 PG 种子或换库。
os.environ["SEED_ON_START"] = "false"

import asyncpg
import httpx
from fastapi.testclient import TestClient

BACKEND = os.path.dirname(os.path.abspath(__file__))
MEDIA_ROOT = os.path.join(BACKEND, "uploads")
PG_DSN = "postgres://postgres:postgres@localhost:5432/songdianB2B"
WP_BASE = "http://localhost:10004/wp-json"

COVER_RE = re.compile(r"^/uploads/news/(\d+)/cover\.[A-Za-z0-9]+$")


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _local_path(cover: str) -> str:
    """把库内 /uploads/... URL 还原为本机绝对路径（MEDIA_ROOT 已含 uploads，需剥前缀）。"""
    rel = cover
    if rel.startswith("/uploads"):
        rel = rel[len("/uploads"):].lstrip("/")
    return os.path.join(MEDIA_ROOT, rel)


async def fetch_wp_posts(client: httpx.AsyncClient) -> list[dict]:
    posts: list[dict] = []
    for page in range(1, 201):
        r = await client.get(
            f"{WP_BASE}/wp/v2/posts", params={"per_page": 100, "page": page}
        )
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        posts.extend(chunk)
        if len(chunk) < 100:
            break
    return posts


async def main() -> int:
    failures: list[str] = []

    # ── 读取 PG ──
    conn = await asyncpg.connect(PG_DSN, timeout=10)
    news_rows = await conn.fetch(
        "SELECT id, slug, cover_image FROM t_news ORDER BY id"
    )
    prod_rows = await conn.fetch(
        "SELECT id, slug, cover_image FROM t_product ORDER BY id"
    )
    await conn.close()

    # ── 读取 WP，建 slug -> featured_media 映射 ──
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0), follow_redirects=True) as client:
        wp_posts = await fetch_wp_posts(client)
        slug_to_fm = {p["slug"]: p.get("featured_media") for p in wp_posts}
        wp_slug_set = {p["slug"] for p in wp_posts}

        print("=" * 70)
        print("【验证项 1】关系正确性：主图属于该文章（不串档）")
        print("=" * 70)
        print(f"PG t_news 行数 = {len(news_rows)}；WP 文章数 = {len(wp_posts)}")
        all_slug_ok = True
        all_path_ok = True
        sampled = []
        # 挑选含不同扩展名的样本：webp / jpg / png
        for n in news_rows:
            nid = n["id"]
            slug = n["slug"]
            cover = n["cover_image"] or ""
            m = COVER_RE.match(cover)
            path_ok = bool(m)
            if not path_ok:
                all_path_ok = False
                failures.append(f"news#{nid} cover_image 格式异常: {cover!r}")
            else:
                path_id = int(m.group(1))
                if path_id != nid:
                    all_path_ok = False
                    failures.append(
                        f"news#{nid} 路径 id={path_id} 与记录 id 不一致（串档风险）"
                    )
            slug_in_wp = slug in wp_slug_set
            slug_maps = slug in slug_to_fm
            if not slug_in_wp or not slug_maps:
                all_slug_ok = False
                failures.append(f"news#{nid} slug={slug!r} 在 WP 中无对应文章")
            # 本地文件存在且字节>0
            local_path = _local_path(cover) if cover else ""
            file_ok = bool(local_path) and os.path.exists(local_path) and os.path.getsize(local_path) > 0
            if not file_ok:
                all_slug_ok = False
                failures.append(f"news#{nid} 本地文件缺失或为空: {local_path}")
            ext = os.path.splitext(local_path)[1] if local_path else "?"
            print(
                f"  news#{nid:>2} slug={slug:<40} cover={cover:<32} "
                f"path_ok={path_ok} slug_in_wp={slug_in_wp} file_ok={file_ok} ext={ext}"
            )
            # 采样不同扩展名
            if ext in (".webp", ".jpg", ".png") and len(sampled) < 3 and slug_maps:
                # 确保三种各一个
                if ext not in [s[1] for s in sampled]:
                    sampled.append((nid, ext, slug, cover))

        print(f"  -> 全部 {len(news_rows)} 篇 cover_image 格式正确: {all_path_ok}")
        print(f"  -> 全部 {len(news_rows)} 篇 slug 在 WP 命中且文件存在: {all_slug_ok}")

        # 同源 sha256 比对（3 篇样本）
        print("\n  --- 同源比对（sha256）：本地文件 vs WP featured_media 原图 ---")
        sha_all_ok = True
        for nid, ext, slug, cover in sampled:
            fid = slug_to_fm.get(slug)
            try:
                mr = await client.get(f"{WP_BASE}/wp/v2/media/{fid}")
                mr.raise_for_status()
                wp_url = mr.json().get("source_url")
                local_path = _local_path(cover)
                local_sha = _sha256_file(local_path)
                wp_resp = await client.get(wp_url)
                wp_bytes = wp_resp.content
                wp_sha = _sha256_bytes(wp_bytes)
                same = (local_sha == wp_sha) and len(wp_bytes) > 0
                sha_all_ok = sha_all_ok and same
                print(
                    f"  news#{nid} ext={ext} wp_media={fid} wp_url={wp_url}\n"
                    f"      local={local_sha[:16]}… bytes={os.path.getsize(local_path)}\n"
                    f"      wp   ={wp_sha[:16]}… bytes={len(wp_bytes)}\n"
                    f"      SAME_IMAGE={same}"
                )
                if not same:
                    failures.append(f"news#{nid} 本地主图与 WP 原图 sha256 不一致（串档/错图）")
            except Exception as e:  # noqa: BLE001
                sha_all_ok = False
                failures.append(f"news#{nid} 同源比对失败: {e!r}")

        print(f"  -> 同源比对（sha256）全部一致: {sha_all_ok}")

    # ── 验证项 2：目录隔离 / 产品侧 ──
    print("\n" + "=" * 70)
    print("【验证项 2】目录隔离 / 产品侧不受影响")
    print("=" * 70)
    # news 子目录隔离
    iso_ok = True
    for n in news_rows:
        nid = n["id"]
        d = os.path.join(MEDIA_ROOT, "news", str(nid))
        if not os.path.isdir(d):
            iso_ok = False
            failures.append(f"news 目录缺失: {d}")
            continue
        for fn in os.listdir(d):
            if not fn.startswith("cover."):
                iso_ok = False
                failures.append(f"news#{nid} 目录含非 cover 文件: {fn}（串档风险）")
    print(f"  news 各子目录仅含 cover.* 且与 products 隔离: {iso_ok}")
    print(f"  uploads 顶层: {sorted(os.listdir(MEDIA_ROOT))}")

    # 产品侧抽查
    print("  --- 产品主图未被破坏（抽查） ---")
    prod_ok = True
    checked = 0
    for p in prod_rows:
        if checked >= 3:
            break
        pid = p["id"]
        cover = p["cover_image"] or ""
        m = re.match(r"^/uploads/products/(\d+)/cover\.[A-Za-z0-9]+$", cover)
        if not m:
            prod_ok = False
            failures.append(f"product#{pid} cover_image 格式异常: {cover!r}")
            continue
        if int(m.group(1)) != pid:
            prod_ok = False
            failures.append(f"product#{pid} 路径 id 与记录 id 不一致")
        lp = _local_path(cover)
        ok = os.path.exists(lp) and os.path.getsize(lp) > 0
        if not ok:
            prod_ok = False
            failures.append(f"product#{pid} 本地主图缺失或为空: {lp}")
        print(f"  product#{pid:>2} slug={p['slug']:<30} cover={cover:<36} file_ok={ok}")
        checked += 1
    print(f"  -> 产品主图抽查全部正常: {prod_ok}（抽查 {checked} 条）")

    # ── 验证项 5：静态访问（TestClient）──
    print("\n" + "=" * 70)
    print("【验证项 5】静态访问（TestClient）")
    print("=" * 70)
    from main import app  # noqa: E402

    with TestClient(app, raise_server_exceptions=False) as c:
        r1 = c.get("/uploads/news/1/cover.webp")
        ok1 = r1.status_code == 200 and (r1.headers.get("content-type") or "").startswith("image/")
        print(f"  GET /uploads/news/1/cover.webp -> {r1.status_code} "
              f"content-type={r1.headers.get('content-type')} -> OK={ok1}")
        r2 = c.get("/uploads/news/999/cover.webp")
        ok2 = r2.status_code == 404
        print(f"  GET /uploads/news/999/cover.webp -> {r2.status_code} -> OK={ok2}")
        # 额外：png / jpg 样本可访问
        extra_ok = True
        for n in news_rows:
            nid = n["id"]
            cover = n["cover_image"] or ""
            m = COVER_RE.match(cover)
            if not m:
                continue
            rr = c.get(cover)
            if rr.status_code != 200 or not (rr.headers.get("content-type") or "").startswith("image/"):
                extra_ok = False
                failures.append(f"GET {cover} -> {rr.status_code} {rr.headers.get('content-type')}")
        print(f"  -> 全部 9 篇 news 主图静态访问 200/image/*: {extra_ok}")
    static_ok = ok1 and ok2 and extra_ok

    # ── 汇总 ──
    print("\n" + "=" * 70)
    print("【验证汇总】")
    print("=" * 70)
    print(f"  项1 关系正确性(格式+slug+文件) : {all_path_ok and all_slug_ok}")
    print(f"  项1 同源比对(sha256)           : {sha_all_ok}")
    print(f"  项2 目录隔离                   : {iso_ok}")
    print(f"  项2 产品侧未受影响             : {prod_ok}")
    print(f"  项5 静态访问                   : {static_ok}")
    if failures:
        print("\n  FAILURES:")
        for f in failures:
            print("   -", f)
        return 1
    print("\n  ALL CHECKS PASSED ✅")
    return 0


if __name__ == "__main__":
    import asyncio

    sys.exit(asyncio.run(main()))
