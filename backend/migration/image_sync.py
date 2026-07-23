"""迁移图片落盘同步（M6 增强）。

作用：把 WordPress 中的图片（产品相册 + 描述内嵌图）真正下载到本地磁盘，
并把库里的 URL 改写为本地静态地址，实现与 WordPress 的彻底解耦。

关系安全性（核心约束）：
- 每张图片按所属资源的 slug 建独立子目录（products/{slug} / news/{slug}），
  从根本上杜绝不同产品/资讯之间的图片串档。
- 相册逐行更新 image_url，sort_order / alt 保持不变，product_id 外键不变 →
  标题 / 图片 / 描述的从属关系原样保留。
- 描述（content_html）内的 <img> 仅就地替换 src，不改写任何其它文本。
- 下载失败（非 200 / 网络错误）时**保留原链接**，绝不写入损坏数据。
- 已为本地路径（以 media_url 开头）的链接直接跳过，保证可重复执行（幂等）。
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlparse

import httpx

from common.config import MEDIA_ROOT, settings
from common.logger import get_logger
from common.ssrf import is_safe_http_url

logger = get_logger(__name__)

# 仅从受信迁移源主机下载图片（security-audit F-03，防 SSRF）
_ALLOWED_HOSTS = settings.migration_allowed_host_list
# 允许下载的图片 Content-Type（svg/html 一律拒绝：svg 含可执行脚本，易致存储型 XSS）
_ALLOWED_IMG_CT = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp",
})
# 单张下载大小上限（防磁盘耗尽 DoS）
MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024
_img_src_re = re.compile(r'<img\b[^>]*?\ssrc=(["\'])(.*?)\1', re.IGNORECASE)
# 仅用于推断扩展名（不含 svg）
_ext_by_ct = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
}


def _is_real_image(content: bytes) -> bool:
    """按文件头魔数校验确为真实图片（security-audit F-03：拒绝 SVG/HTML 等伪装）。"""
    if not content:
        return False
    low = content[:64].lstrip().lower()
    if low.startswith(b"<?xml") or low.startswith(b"<svg") or low.startswith(b"<!doc") or low.startswith(b"<html"):
        return False
    sigs = (
        (b"\xff\xd8\xff", None),            # JPEG
        (b"\x89PNG\r\n\x1a\n", None),      # PNG
        (b"GIF87a", None), (b"GIF89a", None),  # GIF
        (b"RIFF", b"WEBP"),                 # WEBP
        (b"BM", None),                      # BMP
        (b"\x00\x00\x01\x00", None),        # ICO
        (b"II*\x00", None), (b"MM\x00*", None),  # TIFF
    )
    for sig, sub in sigs:
        if content.startswith(sig):
            if sub is not None and content[8:12] != sub:
                continue
            return True
    return False


def _safe_basename(url: str) -> str:
    """从 URL 取出安全的文件名（去掉路径遍历字符、保留扩展名）。"""
    path = urlparse(url).path.rstrip("/")
    name = path.split("/")[-1] or "image"
    # 仅保留字母数字、点、横杠、下划线，其余替换为下划线，避免文件系统/路径注入问题
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    if name.startswith("."):
        name = "img" + name
    return name


async def _download_to(url: str, subdir: str, client: httpx.AsyncClient) -> str | None:
    """把单张远程图片下载到 MEDIA_ROOT/subdir 下，返回本地静态 URL；失败返回 None。

    subdir 形如 "products/dc106"，保证不同资源图片互不串档。
    """
    # 已经是本地路径则直接跳过（幂等）
    if url.startswith(settings.media_url):
        return None
    # 只处理 http(s) 绝对地址（相对地址无法下载）
    if not url.lower().startswith(("http://", "https://")):
        return None
    # security-audit F-03：仅允许受信迁移源主机，阻断 SSRF
    if not is_safe_http_url(url, _ALLOWED_HOSTS):
        logger.warning("拒绝下载非受信主机图片（SSRF 防护）%s", url)
        return None

    try:
        resp = await client.get(url)
    except Exception as exc:  # noqa: BLE001
        logger.warning("图片下载失败（保留原链接）%s -> %s", url, exc)
        return None
    if resp.status_code != 200:
        logger.warning("图片下载非 200（保留原链接）%s -> %s", url, resp.status_code)
        return None
    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype not in _ALLOWED_IMG_CT:
        logger.warning("拒绝下载非图片类型（%s）%s", ctype, url)
        return None
    content = resp.content
    if len(content) > MAX_DOWNLOAD_BYTES:
        logger.warning("拒绝下载过大图片（%d 字节）%s", len(content), url)
        return None
    if not _is_real_image(content):
        logger.warning("拒绝下载非真实图片（魔数校验失败）%s", url)
        return None

    # 文件名：优先用 URL 基名，缺失扩展名时按 Content-Type 推断
    basename = _safe_basename(url)
    ext = os.path.splitext(basename)[1].lower()
    if not ext:
        basename += _ext_by_ct.get(ctype, ".bin")

    target_dir = MEDIA_ROOT / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / basename
    # 万一同目录同名但来自不同 URL：追加短哈希避免覆盖错乱
    if target_path.exists():
        stem, suffix = os.path.splitext(basename)
        target_path = target_dir / f"{stem}_{abs(hash(url)) & 0xFFFF}{suffix}"

    target_path.write_bytes(resp.content)
    local_url = f"{settings.media_url}/{subdir}/{target_path.name}"
    return local_url


async def download_cover(
    slug: str,
    url: str,
    client: httpx.AsyncClient,
    resource_type: str = "products",
) -> str | None:
    """把主图下载到 {resource_type}/{slug}/cover.{ext}，返回本地 URL；失败返回 None。

    主图固定文件名 cover.*，与同目录相册互不干扰；与其它资源按 resource_type/slug 子目录隔离。
    默认 resource_type="products"，以保持产品侧现有调用（download_cover(product.slug, url, client)
    与 sync_product_images）完全不变、不破坏已工作的产品主图。
    """
    if url.startswith(settings.media_url):
        return None
    if not url.lower().startswith(("http://", "https://")):
        return None
    # security-audit F-03：仅允许受信迁移源主机，阻断 SSRF
    if not is_safe_http_url(url, _ALLOWED_HOSTS):
        logger.warning("拒绝下载非受信主机主图（SSRF 防护）%s", url)
        return None
    try:
        resp = await client.get(url)
    except Exception as exc:  # noqa: BLE001
        logger.warning("主图下载失败（保留无主图）%s -> %s", url, exc)
        return None
    if resp.status_code != 200:
        logger.warning("主图下载非 200（保留无主图）%s -> %s", url, resp.status_code)
        return None
    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype not in _ALLOWED_IMG_CT:
        logger.warning("拒绝下载非图片类型主图（%s）%s", ctype, url)
        return None
    content = resp.content
    if len(content) > MAX_DOWNLOAD_BYTES:
        logger.warning("拒绝下载过大主图（%d 字节）%s", len(content), url)
        return None
    if not _is_real_image(content):
        logger.warning("拒绝下载非真实主图（魔数校验失败）%s", url)
        return None
    ext = _ext_by_ct.get(ctype, ".webp")  # WP 主图多为 webp/jpg，兜底 webp
    target_dir = MEDIA_ROOT / f"{resource_type}/{slug}"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"cover{ext}"
    target_path.write_bytes(content)
    return f"{settings.media_url}/{resource_type}/{slug}/cover{ext}"


async def _fetch_wp_products(client: httpx.AsyncClient, wp_base_url: str, per_page: int = 100) -> list[dict]:
    """分页拉取全部 WP 产品（用于主图回填时建 slug→featured_media 映射）。"""
    items: list[dict] = []
    for page in range(1, 201):
        r = await client.get(
            f"{wp_base_url}/wp/v2/product", params={"per_page": per_page, "page": page}
        )
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        items.extend(chunk)
        if len(chunk) < per_page:
            break
    return items


async def _rewrite_html_images(html: str, subdir: str, client: httpx.AsyncClient):
    """就地改写 HTML 中指向本地 WP 的 <img src>，返回 (新HTML, 是否变更)。"""
    if not html:
        return html, False

    changed = False

    def _replace(m: re.Match) -> str:
        nonlocal changed
        src = m.group(2)  # group(1) 为引号，仅用于正则回溯引用 \1，此处无需使用
        # 仅处理来自受信迁移源主机的图链（security-audit F-03）
        parsed = urlparse(src)
        if parsed.scheme not in ("http", "https") or not is_safe_http_url(src, _ALLOWED_HOSTS):
            return m.group(0)
        local = _download_to(src, subdir, client)
        if not local:
            return m.group(0)  # 下载失败保留原链
        changed = True
        return m.group(0).replace(src, local, 1)

    new_html = _img_src_re.sub(_replace, html)
    return new_html, changed


async def sync_product_images(overwrite: bool = False) -> dict:
    """下载全部产品的相册图 + 描述内嵌图，改写库内 URL。返回统计。"""
    from product.models import Product

    stats = {"products": 0, "gallery_total": 0, "gallery_synced": 0,
             "gallery_skipped": 0, "cover_synced": 0, "content_rewritten": 0, "failed": 0}
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        products = await Product.all().prefetch_related("galleries")
        for p in products:
            stats["products"] += 1
            # 1) 相册：逐行更新，sort_order / alt / product_id 全部保留
            for g in sorted(p.galleries, key=lambda x: x.sort_order):
                stats["gallery_total"] += 1
                if not overwrite and g.image_url.startswith(settings.media_url):
                    stats["gallery_skipped"] += 1
                    continue
                local = await _download_to(g.image_url, f"products/{p.slug}", client)
                if local:
                    g.image_url = local
                    await g.save(update_fields=["image_url"])
                    stats["gallery_synced"] += 1
                else:
                    stats["failed"] += 1
            # 2) 主图（cover_image）：远程则下载落盘改写；已本地则跳过
            if p.cover_image:
                if not overwrite and p.cover_image.startswith(settings.media_url):
                    pass
                else:
                    local = await download_cover(p.slug, p.cover_image, client)
                    if local:
                        p.cover_image = local
                        await p.save(update_fields=["cover_image"])
                        stats["cover_synced"] += 1
                    else:
                        stats["failed"] += 1
            # 3) 描述内嵌图
            new_html, changed = await _rewrite_html_images(
                p.content_html, f"products/{p.slug}", client
            )
            if changed:
                p.content_html = new_html
                await p.save(update_fields=["content_html"])
                stats["content_rewritten"] += 1
    return stats


async def sync_news_images(overwrite: bool = False) -> dict:
    """下载全部资讯描述内嵌图，改写库内 URL。返回统计。"""
    from news.models import News

    stats = {"news": 0, "content_rewritten": 0, "failed": 0}
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        news_list = await News.all()
        for n in news_list:
            stats["news"] += 1
            new_html, changed = await _rewrite_html_images(
                n.content_html, f"news/{n.slug}", client
            )
            if changed:
                n.content_html = new_html
                await n.save(update_fields=["content_html"])
                stats["content_rewritten"] += 1
    return stats


async def sync_all_images(overwrite: bool = False) -> dict:
    """同步产品 + 资讯的全部图片，返回汇总统计。"""
    product_stats = await sync_product_images(overwrite=overwrite)
    news_stats = await sync_news_images(overwrite=overwrite)
    return {"product": product_stats, "news": news_stats}


async def backfill_cover_images(
    wp_base_url: str = "http://localhost:10004/wp-json", overwrite: bool = False
) -> dict:
    """从 WP 拉取每个产品的 featured_media，补全 Product.cover_image 并落盘。

    用于初次迁移遗漏主图（featured_media 未捕获）的补数据场景。按 slug 与 WP 产品对应，
    绝不以数组下标臆测映射，保证主图与产品一一对应、不串档。
    """
    from product.models import Product

    stats = {"products": 0, "synced": 0, "skipped": 0, "failed": 0}
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        # 建 slug -> featured_media 映射
        wp_products = await _fetch_wp_products(client, wp_base_url)
        slug_to_fm = {p["slug"]: p.get("featured_media") for p in wp_products}
        products = await Product.all()
        for p in products:
            stats["products"] += 1
            if p.cover_image and p.cover_image.startswith(settings.media_url) and not overwrite:
                stats["skipped"] += 1
                continue
            fid = slug_to_fm.get(p.slug)
            if not fid:
                stats["failed"] += 1
                logger.warning("WP 中找不到产品 slug=%s 的主图映射", p.slug)
                continue
            try:
                mr = await client.get(f"{wp_base_url}/wp/v2/media/{fid}")
                mr.raise_for_status()
                url = mr.json().get("source_url")
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                logger.warning("主图媒体拉取失败 slug=%s media=%s -> %s", p.slug, fid, exc)
                continue
            if not url:
                stats["failed"] += 1
                continue
            local = await download_cover(p.slug, url, client)
            if local:
                p.cover_image = local
                await p.save(update_fields=["cover_image"])
                stats["synced"] += 1
            else:
                stats["failed"] += 1
    return stats


async def backfill_news_cover_images(
    wp_base_url: str = "http://localhost:10004/wp-json", overwrite: bool = False
) -> dict:
    """从 WP 拉取每篇文章的 featured_media，补全 News.cover_image 并落盘。

    与 backfill_cover_images 同构，但映射来自 wp/v2/posts、对应 News、download_cover
    使用 resource_type="news"。按 slug 与 WP 文章对应，绝不臆测数组下标，保证主图与
    资讯一一对应、不串档（与产品主图目录 products/ 完全隔离）。
    """
    from news.models import News

    stats = {"news": 0, "synced": 0, "skipped": 0, "failed": 0}
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        # 建 slug -> featured_media 映射（仅处理 WP 文章路由 wp/v2/posts）
        wp_posts: list[dict] = []
        for page in range(1, 201):
            r = await client.get(
                f"{wp_base_url}/wp/v2/posts", params={"per_page": 100, "page": page}
            )
            r.raise_for_status()
            chunk = r.json()
            if not chunk:
                break
            wp_posts.extend(chunk)
            if len(chunk) < 100:
                break
        slug_to_fm = {p["slug"]: p.get("featured_media") for p in wp_posts}
        news_list = await News.all()
        for n in news_list:
            stats["news"] += 1
            if n.cover_image and n.cover_image.startswith(settings.media_url) and not overwrite:
                stats["skipped"] += 1
                continue
            fid = slug_to_fm.get(n.slug)
            if not fid:
                stats["failed"] += 1
                logger.warning("WP 中找不到资讯 slug=%s 的主图映射", n.slug)
                continue
            try:
                mr = await client.get(f"{wp_base_url}/wp/v2/media/{fid}")
                mr.raise_for_status()
                url = mr.json().get("source_url")
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                logger.warning("主图媒体拉取失败 slug=%s media=%s -> %s", n.slug, fid, exc)
                continue
            if not url:
                stats["failed"] += 1
                continue
            local = await download_cover(n.slug, url, client, resource_type="news")
            if local:
                n.cover_image = local
                await n.save(update_fields=["cover_image"])
                stats["synced"] += 1
            else:
                stats["failed"] += 1
    return stats
