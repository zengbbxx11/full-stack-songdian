"""上传域服务（M6，T03）。

设计约束（design-admin-ui.md §1.2 缺口② / §1.4）：
- 存储抽象为 ``StorageBackend``（Protocol），当前仅 ``LocalStorageBackend``（默认）。
  未来切 OSS/COS 仅新增实现 + 改 ``settings``（见 ``get_storage_backend`` 工厂）。
- 校验：扩展名白名单（jpg/png/webp/gif）+ 魔数（magic bytes）+ mimetypes 双重校验、
  单文件 ≤ ``max_upload_mb``。
- 落盘：写入 ``MEDIA_ROOT``（复用 main.py 的 StaticFiles 挂载目录），按年份分子目录，
  返回相对 URL ``{media_url}/{year}/{uuid}.ext}``。
- 成功后写 ``UploadRecord`` 溯源（best-effort）。
"""
from __future__ import annotations

import logging
import mimetypes
import os
import re
import uuid
from datetime import UTC, datetime
from typing import Protocol

from fastapi import UploadFile
from tortoise.expressions import Q

from common.config import MEDIA_ROOT, settings
from common.exceptions import BizException, ErrorCode
from uploads.models import Album, UploadRecord

logger = logging.getLogger(__name__)

# 扩展名白名单（小写，含点）
ALLOWED_EXT: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})

# 图片魔数（magic bytes）：文件头前 N 字节 → MIME 类型，用于防扩展名伪造
_IMAGE_MAGIC: dict[bytes, str] = {
    b"\xff\xd8\xff": "image/jpeg",          # JPEG: FF D8 FF
    b"\x89PNG\r\n\x1a\n": "image/png",      # PNG: 89 50 4E 47 0D 0A 1A 0A
    b"RIFF": "image/webp",                  # WEBP: RIFF....WEBP（先匹配 RIFF 容器）
    b"GIF87a": "image/gif",                 # GIF87a
    b"GIF89a": "image/gif",                 # GIF89a
}
_ALLOWED_MIMES: frozenset[str] = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


def _validate_image_content(content: bytes, filename: str) -> str:
    """通过文件头魔数 + mimetypes 双重校验，返回确认的 MIME 类型。

    一、mimetypes 基于文件名扩展名推断 MIME 类型；
    二、魔数匹配文件头真实内容（防扩展名伪造 / 脚本伪装成图片）。
    任一步失败即抛 BizException C400001。
    """
    # 第一步：mimetypes 类型推断
    mime, _ = mimetypes.guess_type(filename)
    if mime not in _ALLOWED_MIMES:
        raise BizException(ErrorCode.C400001, f"不支持的文件类型：{mime or '未知'}")

    # 第二步：魔数校验（取文件头最多 8 字节匹配已知签名词典）
    header = content[:8]
    for magic, expected_mime in _IMAGE_MAGIC.items():
        if header.startswith(magic):
            return expected_mime
    raise BizException(ErrorCode.C400001, "文件内容与扩展名不匹配，疑似伪造")


class StorageBackend(Protocol):
    """存储后端抽象（可替换为 OSS/COS 等）。"""

    async def save(self, file: UploadFile, filename: str) -> str:
        """保存文件并返回可访问 URL（相对或绝对）。"""
        ...


class LocalStorageBackend:
    """本地磁盘存储：写入 ``MEDIA_ROOT``，返回相对 URL。"""

    def __init__(self, root=MEDIA_ROOT) -> None:
        self.root = root

    async def save(self, file: UploadFile, filename: str) -> str:
        ext = os.path.splitext(filename or "")[1].lower()
        if ext not in ALLOWED_EXT:
            raise BizException(ErrorCode.C400001, f"不支持的文件类型：{ext or '未知'}")

        content = await file.read()

        # 魔数 + mimetypes 双重校验（防扩展名伪造 / 脚本伪装成图片上传）
        _validate_image_content(content, filename)

        max_bytes = settings.max_upload_mb * 1024 * 1024
        if len(content) > max_bytes:
            raise BizException(
                ErrorCode.C400001,
                f"文件大小 {len(content) // 1024}KB 超过 {settings.max_upload_mb}MB 上限",
            )

        # 按年份分子目录，使用 uuid 避免文件名碰撞
        year = datetime.now(UTC).strftime("%Y")
        target_dir = self.root / year
        target_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{uuid.uuid4().hex}{ext}"
        (target_dir / stored_name).write_bytes(content)

        return f"{settings.media_url}/{year}/{stored_name}"


def get_storage_backend() -> StorageBackend:
    """依据配置返回存储后端实例（当前仅支持 local）。"""
    if settings.storage_backend == "local":
        return LocalStorageBackend()
    raise BizException(ErrorCode.B999001, f"未知的存储后端：{settings.storage_backend}")


def check_upload_limits(files: list[UploadFile]) -> None:
    """批量上传配额校验（security-audit F-10）：防磁盘耗尽 DoS。"""
    if len(files) > settings.max_upload_files:
        raise BizException(
            ErrorCode.C400001,
            f"单次最多上传 {settings.max_upload_files} 个文件，当前 {len(files)} 个",
        )
    total = sum((f.size or 0) for f in files)
    max_total = settings.max_upload_total_mb * 1024 * 1024
    if total > max_total:
        raise BizException(
            ErrorCode.C400001,
            f"上传总大小超过 {settings.max_upload_total_mb}MB 上限",
        )


async def record_upload(
    url: str,
    file_name: str,
    size: int,
    uploaded_by: str | None,
    album_id: int | None = None,
    title: str | None = None,
    categorize_hint: str | None = None,
) -> UploadRecord:
    """落库上传记录（溯源）；失败抛异常由调用方统一处理。

    2026-07-29：新增 album_id, title, categorize_hint（如 "product:860a" 自动建相册并归入）。
    """
    # 如果未指定 album_id 但带了 categorize_hint，自动查/建相册
    if album_id is None and categorize_hint:
        album_id = await _resolve_categorize_hint(categorize_hint)

    return await UploadRecord.create(
        url=url,
        file_name=file_name,
        size=size,
        uploaded_by=uploaded_by,
        album_id=album_id,
        title=title,
    )


async def _resolve_categorize_hint(hint: str) -> int | None:
    """解析归类提示（如 "product:860a" / "news:songdian-xxx"），自动取或建相册。

    返回 album_id；hint 格式非法或相册创建失败则返回 None（不阻断上传）。
    """
    if ":" not in hint:
        return None
    category, slug = hint.split(":", 1)
    slug = slug.strip()
    if not slug:
        return None

    name = slug[:100]  # 截断到字段上限
    album_slug = f"{category}-{slug}"[:120]

    try:
        if category == "product":
            parent = await Album.get_or_none(slug="products", parent_id__isnull=True)
            if parent is None:
                parent = await Album.create(name="Products", slug="products", sort_order=1.0)
            album = await Album.get_or_none(parent_id=parent.id, slug=album_slug)
            if album is None:
                album = await Album.create(name=name, slug=album_slug, parent_id=parent.id, sort_order=0.0)
            return album.id

        elif category == "news":
            parent = await Album.get_or_none(slug="news", parent_id__isnull=True)
            if parent is None:
                parent = await Album.create(name="News", slug="news", sort_order=2.0)
            album = await Album.get_or_none(parent_id=parent.id, slug=album_slug)
            if album is None:
                album = await Album.create(name=name, slug=album_slug, parent_id=parent.id, sort_order=0.0)
            return album.id
    except Exception:
        logger.warning("归类提示解析失败（ignore）：hint=%s", hint, exc_info=True)
    return None


def _build_upload_filter(
    album_id: int | None,
    keyword: str | None,
    media_type: str | None,
) -> Q:
    """根据筛选条件构造 Tortoise Q 对象（空 Q 等价于全量）。"""
    q: Q = Q()
    if album_id is not None:
        # 0 表示“未分类”
        q &= Q(album_id__isnull=True) if album_id == 0 else Q(album_id=album_id)
    if keyword:
        kw = keyword.strip()
        if kw:
            q &= Q(
                Q(url__icontains=kw)
                | Q(file_name__icontains=kw)
                | Q(title__icontains=kw)
            )
    if media_type == "image":
        # 按扩展名粗略判定图片（其余类型后续可扩展）
        q &= Q(
            Q(url__iendswith=".jpg")
            | Q(url__iendswith=".jpeg")
            | Q(url__iendswith=".png")
            | Q(url__iendswith=".webp")
            | Q(url__iendswith=".gif")
            | Q(file_name__iendswith=".jpg")
            | Q(file_name__iendswith=".jpeg")
            | Q(file_name__iendswith=".png")
            | Q(file_name__iendswith=".webp")
            | Q(file_name__iendswith=".gif")
        )
    return q


async def list_upload_records(
    page: int = 1,
    page_size: int = 50,
    album_id: int | None = None,
    keyword: str | None = None,
    media_type: str | None = None,
) -> list[UploadRecord]:
    """分页查询上传记录（支持相册 / 关键词 / 类型筛选，按创建时间倒序）。"""
    q = _build_upload_filter(album_id, keyword, media_type)
    offset = (page - 1) * page_size
    return await UploadRecord.filter(q).order_by("-created_time").offset(offset).limit(page_size)


async def count_upload_records(
    album_id: int | None = None,
    keyword: str | None = None,
    media_type: str | None = None,
) -> int:
    """统计符合筛选条件的上传记录数。"""
    q = _build_upload_filter(album_id, keyword, media_type)
    return await UploadRecord.filter(q).count()


async def get_upload_record(record_id: int) -> UploadRecord | None:
    """按 ID 获取上传记录（不存在返回 None）。"""
    return await UploadRecord.get_or_none(id=record_id)


async def get_upload_usage(url: str) -> dict:
    """查询某素材 URL 被业务内容引用的明细（产品图集 / 封面 / 新闻封面）。

    返回 ``{count, items[{type, name, id}], in_use}``。
    """
    from news.models import News
    from product.models import Product, ProductGallery

    items: list[dict] = []
    # 产品图集
    galleries = await ProductGallery.filter(image_url=url).select_related("product")
    for g in galleries:
        if g.product:  # type: ignore[union-attr]
            items.append({"type": "product_gallery", "name": g.product.title, "id": g.product.id})  # type: ignore[union-attr]
    # 产品封面
    products = await Product.filter(cover_image=url)
    for p in products:
        items.append({"type": "product_cover", "name": p.title, "id": p.id})
    # 新闻封面
    news_items = await News.filter(cover_image=url)
    for n in news_items:
        items.append({"type": "news_cover", "name": n.title, "id": n.id})
    return {"count": len(items), "items": items, "in_use": len(items) > 0}


async def delete_upload_record(record_id: int, force: bool = False) -> dict:
    """删除上传记录（及磁盘文件）。

    - 若素材仍被内容引用且未强制删除，则拒绝（C400001）并返回引用详情。
    - 相册归属置空由 FK(SET NULL) 约束保证；此处仅删文件与记录。
    """
    rec = await UploadRecord.get_or_none(id=record_id)
    if rec is None:
        raise BizException(ErrorCode.C404001, "上传记录不存在")
    usage_info = await get_upload_usage(rec.url)
    if usage_info["count"] > 0 and not force:
        raise BizException(
            ErrorCode.C400001,
            f"该素材仍被 {usage_info['count']} 处内容引用，无法删除",
            data={"usage": usage_info["count"], "items": usage_info["items"], "conflict": True},
        )
    # 删除磁盘文件（best-effort）
    await _remove_physical_file(rec.url)
    await rec.delete()
    return {"usage": usage_info["count"]}


async def _remove_physical_file(url: str) -> None:
    """根据相对 URL 删除本地磁盘文件（best-effort，缺失不报错）。"""
    if not url or not url.startswith(settings.media_url):
        return
    rel = url[len(settings.media_url):].lstrip("/")
    if not rel:
        return
    path = MEDIA_ROOT / rel
    try:
        if path.exists():
            path.unlink()
    except Exception as exc:  # noqa: BLE001
        logger.warning("删除上传文件失败（忽略）：%s -> %s", path, exc)


def _slugify(text: str) -> str:
    """生成 URL 友好 slug（中文等非 ASCII 会被剥离，回退到随机串）。"""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return s


async def list_albums() -> list[Album]:
    """列出全部相册（按 sort_order 升序，其次创建时间倒序）。"""
    return await Album.all().order_by("sort_order", "-created_time")


async def create_album(name: str, slug: str | None = None, parent_id: int | None = None) -> Album:
    """创建相册；slug 缺省按名称生成，冲突则追加随机后缀保证唯一。

    支持指定父相册 parent_id 挂入树形结构；若父相册不存在则报错。
    """
    if parent_id is not None:
        parent = await Album.get_or_none(id=parent_id)
        if parent is None:
            raise BizException(ErrorCode.C404001, "父相册不存在")
    base = (slug or _slugify(name) or f"album-{uuid.uuid4().hex[:6]}").strip("-").lower()
    unique = base
    while await Album.filter(slug=unique).exists():
        unique = f"{base}-{uuid.uuid4().hex[:6]}"
    return await Album.create(name=name.strip(), slug=unique, sort_order=0.0, parent_id=parent_id)


async def update_album(
    album_id: int,
    name: str | None = None,
    slug: str | None = None,
    sort_order: float | None = None,
    parent_id: int | None = None,
) -> Album:
    """更新相册（名称 / slug / 排序 / 父相册）。"""
    album = await Album.get_or_none(id=album_id)
    if album is None:
        raise BizException(ErrorCode.C404001, "相册不存在")
    if parent_id is not None and parent_id != album_id:
        # 防止自引用
        parent = await Album.get_or_none(id=parent_id)
        if parent is None:
            raise BizException(ErrorCode.C404001, "父相册不存在")
        album.parent = parent
    if name is not None:
        album.name = name.strip()
    if slug is not None:
        album.slug = slug.strip().lower()
    if sort_order is not None:
        album.sort_order = sort_order
    await album.save()
    return album


async def delete_album(album_id: int) -> None:
    """删除相册；子孙级联删除（parent_id ON DELETE CASCADE），
    其下上传记录 album_id 由 FK(SET NULL) 自动回落到未分类。"""
    album = await Album.get_or_none(id=album_id)
    if album is None:
        raise BizException(ErrorCode.C404001, "相册不存在")
    await album.delete()


async def sync_missing_uploads() -> dict:
    """扫描产品/新闻中引用的所有图片 URL，对未入库的创建 UploadRecord。

    返回 ``{"found": N, "synced": M}``：N 个唯一引用 URL，M 个新入库。
    文件名和大小尽力从磁盘提取；磁盘文件缺失时仍创建记录（URL 保留）。
    """
    from news.models import News
    from product.models import Product, ProductGallery

    urls: set[str] = set()

    # 产品图集
    gallery_urls = await ProductGallery.all().values_list("image_url", flat=True)
    urls.update(u for u in gallery_urls if u)

    # 产品封面
    product_urls = await Product.filter(cover_image__not_isnull=True).values_list("cover_image", flat=True)
    urls.update(u for u in product_urls if u)

    # 新闻封面
    news_urls = await News.filter(cover_image__not_isnull=True).values_list("cover_image", flat=True)
    urls.update(u for u in news_urls if u)

    urls.discard("")  # 空字符串不计数

    if not urls:
        return {"found": 0, "synced": 0}

    # 已有记录
    existing = await UploadRecord.filter(url__in=list(urls)).values_list("url", flat=True)
    existing_set = set(existing)

    synced = 0
    for url in urls - existing_set:
        # 从 URL 路径提取文件名
        file_name = url.rsplit("/", 1)[-1] if "/" in url else url
        # 尝试从磁盘获取文件大小（best-effort）
        size = 0
        if url.startswith(settings.media_url):
            rel = url[len(settings.media_url):].lstrip("/")
            if rel:
                path = MEDIA_ROOT / rel
                if path.exists():
                    size = path.stat().st_size
        await UploadRecord.create(url=url, file_name=file_name, size=size, uploaded_by="sync")
        synced += 1

    return {"found": len(urls), "synced": synced}


async def auto_categorize_uploads() -> dict:
    """按 URL 路径自动归类未分类的图片到 Products / News 相册。

    - ``/uploads/products/{slug}/...`` → 父 "Products" → 子 "{slug}"
    - ``/uploads/news/{slug}/...``    → 父 "News"    → 子 "{slug}"
    - 已分类的不重复处理。

    返回 ``{"categorized": N, "albums_created": M}``。
    """
    created_albums = 0

    async def _get_or_create_child(parent_id: int, name: str, slug: str) -> int:
        """取或建子相册，返回 album_id。name/slug 截断到字段上限。"""
        nonlocal created_albums
        name = name[:100]
        slug = slug[:120]
        album = await Album.get_or_none(parent_id=parent_id, slug=slug)
        if album is None:
            album = await Album.create(name=name, slug=slug, parent_id=parent_id, sort_order=0.0)
            created_albums += 1
        return album.id

    # 确保一级相册存在
    products_parent = await Album.get_or_none(slug="products", parent_id__isnull=True)
    if products_parent is None:
        products_parent = await Album.create(name="Products", slug="products", sort_order=1.0)
        created_albums += 1
    news_parent = await Album.get_or_none(slug="news", parent_id__isnull=True)
    if news_parent is None:
        news_parent = await Album.create(name="News", slug="news", sort_order=2.0)
        created_albums += 1

    categorized = 0
    records = await UploadRecord.filter(album_id__isnull=True).all()

    for rec in records:
        url: str = rec.url or ""
        if not url:
            continue

        # 匹配 /uploads/products/{slug}/ 或 /uploads/news/{slug}/
        parts = url.lstrip("/").split("/")
        if len(parts) < 3 or parts[0] != "uploads":
            continue

        if parts[1] == "products" and len(parts) >= 3:
            slug = parts[2]
            child_id = await _get_or_create_child(products_parent.id, slug, f"products-{slug}")
            rec.album_id = child_id
            await rec.save()
            categorized += 1
        elif parts[1] == "news" and len(parts) >= 3:
            slug = parts[2]
            child_id = await _get_or_create_child(news_parent.id, slug, f"news-{slug}")
            rec.album_id = child_id
            await rec.save()
            categorized += 1

    return {"categorized": categorized, "albums_created": created_albums}
