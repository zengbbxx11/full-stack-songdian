"""上传域路由（M6，T03）。

路径前缀 /api/v1。后台接口：
- ``GET /admin/upload/records``：分页查询上传记录（支持 album_id / keyword / type 筛选，media:upload）。
- ``GET /admin/upload/{id}/usage``：查询素材被内容引用次数（media:upload）。
- ``DELETE /admin/upload/{id}``：删除上传记录与文件（media:upload；被引用时需 force）。
- ``POST /admin/upload``：单文件上传（可指定 album_id / title，media:upload）。
- ``POST /admin/upload/batch``：多文件上传（media:upload）。
- ``GET /admin/albums``：相册列表（media:upload）。
- ``POST /admin/albums``：新建相册（media:upload）。
- ``PUT /admin/albums/{id}``：更新相册（media:upload）。
- ``DELETE /admin/albums/{id}``：删除相册（media:upload）。
成功后写 ``UploadRecord`` 溯源，返回 ``UploadVO`` / ``list[UploadVO]``。
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from tortoise.functions import Count

from common.audit import audit
from common.deps import require_permission
from common.exceptions import ErrorCode
from common.result import Result
from content.models import AdminUser
from uploads import services
from uploads.models import UploadRecord
from uploads.schemas import (
    AlbumCreateRequest,
    AlbumUpdateRequest,
    AlbumVO,
    UploadRecordVO,
    UploadVO,
)

router = APIRouter(prefix="/api/v1", tags=["uploads"])


@router.get("/admin/upload/records", summary="分页查询上传记录")
async def list_upload_records(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页条数"),
    album_id: Optional[int] = Query(None, description="相册 ID；0 表示未分类；不传查全部"),
    keyword: Optional[str] = Query(None, description="关键词（匹配 url / 文件名 / 标题）"),
    media_type: Optional[str] = Query(None, alias="type", description="类型筛选，如 image"),
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """返回上传记录分页列表，供媒体库页面展示已上传图片。

    需要 `media:upload` RBAC 权限。支持相册 / 关键词 / 类型筛选，按创建时间倒序。
    """
    total = await services.count_upload_records(
        album_id=album_id, keyword=keyword, media_type=media_type
    )
    records = await services.list_upload_records(
        page=page, page_size=page_size, album_id=album_id, keyword=keyword, media_type=media_type
    )
    data = {
        "list": [UploadRecordVO.from_model(r).model_dump(mode="json") for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    return Result.ok(data)


@router.get("/admin/upload/{record_id}/usage", summary="查询素材引用情况")
async def upload_usage(
    record_id: int,
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """返回某素材被产品图集 / 封面 / 新闻封面引用的明细（含产品/新闻名称），供删除前风险提示。"""
    rec = await services.get_upload_record(record_id)
    if rec is None:
        return Result.fail(ErrorCode.C404001, "上传记录不存在")
    usage_info = await services.get_upload_usage(rec.url)
    return Result.ok({"id": record_id, **usage_info})


@router.delete("/admin/upload/{record_id}", summary="删除上传记录与文件")
@audit(action="media.delete", resource="media:{record_id}")
async def delete_upload(
    record_id: int,
    force: bool = Query(False, description="被引用时是否强制删除"),
    request: Request = None,  # noqa: ARG001 - 供 @audit 解析 IP
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """删除上传记录与磁盘文件。被内容引用时需 force=true，否则拒绝。"""
    result = await services.delete_upload_record(record_id, force=force)
    return Result.ok(result)


@router.post("/admin/upload", summary="单文件上传")
@audit(action="media.upload", resource="media:{file_name}")
async def upload(
    file: UploadFile = File(..., description="待上传图片（jpg/png/webp/gif，≤ max_upload_mb）"),
    album_id: Optional[int] = Form(None, description="归属相册 ID（可选）"),
    title: Optional[str] = Form(None, description="展示标题（可选）"),
    categorize: Optional[str] = Form(None, description="归类提示，如 product:860a / news:slug（自动建相册）"),
    request: Request = None,  # noqa: ARG001 - 供 @audit 解析 IP
    current_user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    services.check_upload_limits([file])  # security-audit F-10
    backend = services.get_storage_backend()
    url = await backend.save(file, file.filename or "upload.bin")
    record = await services.record_upload(
        url=url,
        file_name=file.filename or "upload.bin",
        size=file.size or 0,
        uploaded_by=current_user.username,
        album_id=album_id,
        title=title,
        categorize_hint=categorize,
    )
    return Result.ok(UploadVO.build(record.url, record.file_name, record.size).model_dump(mode="json"))


@router.post("/admin/upload/batch", summary="多文件上传")
@audit(action="media.upload.batch", resource="media:batch")
async def upload_batch(
    files: list[UploadFile] = File(..., description="多个待上传图片"),
    album_id: Optional[int] = Form(None, description="归属相册 ID（可选）"),
    request: Request = None,  # noqa: ARG001 - 供 @audit 解析 IP
    current_user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    services.check_upload_limits(files)  # security-audit F-10
    backend = services.get_storage_backend()
    vos: list[dict] = []
    for f in files:
        url = await backend.save(f, f.filename or "upload.bin")
        record = await services.record_upload(
            url=url,
            file_name=f.filename or "upload.bin",
            size=f.size or 0,
            uploaded_by=current_user.username,
            album_id=album_id,
        )
        vos.append(UploadVO.build(record.url, record.file_name, record.size).model_dump(mode="json"))
    return Result.ok(vos)


@router.post("/admin/upload/sync", summary="同步产品/新闻引用图片到上传记录")
async def sync_missing(
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """扫描 t_product / t_product_gallery / t_news 中所有引用 URL，
    对尚未入库的自动创建 UploadRecord（文件名/大小尽力从磁盘提取）。
    返回 {found, synced}。"""
    result = await services.sync_missing_uploads()
    return Result.ok(result)


@router.post("/admin/upload/auto-categorize", summary="按 URL 路径自动归类图片到 Products/News 相册")
async def auto_categorize(
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """将未分类的图片按 URL 路径（/uploads/products/{slug}/、/uploads/news/{slug}/）
    自动归入 Products / News 对应子相册。返回 {categorized, albums_created}。"""
    result = await services.auto_categorize_uploads()
    return Result.ok(result)


# ───────────────────────── 相册 CRUD ─────────────────────────
@router.get("/admin/albums", summary="相册列表")
async def list_albums(
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """列出全部相册，并附带各相册与未分类素材数量（单条聚合查询）。"""
    albums = await services.list_albums()
    # 聚合统计：各相册素材数 + 未分类数（album_id IS NULL）
    agg = (
        await UploadRecord.all()
        .group_by("album_id")
        .annotate(total=Count("id"))
        .values("album_id", "total")
    )
    counts: dict = {}
    uncategorized = 0
    for row in agg:
        aid = row.get("album_id")
        if aid is None:
            uncategorized = row.get("total", 0)
        else:
            counts[aid] = row.get("total", 0)
    data = [AlbumVO.from_model(a, count=counts.get(a.id, 0)).model_dump(mode="json") for a in albums]
    return Result.ok({"list": data, "total": len(data), "uncategorized": uncategorized})


@router.post("/admin/albums", summary="新建相册")
async def create_album(
    body: AlbumCreateRequest,
    request: Request = None,  # noqa: ARG001 - 供将来审计使用
    current_user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    album = await services.create_album(name=body.name, slug=body.slug, parent_id=body.parent_id)
    return Result.ok(AlbumVO.from_model(album).model_dump(mode="json"))


@router.put("/admin/albums/{album_id}", summary="更新相册")
async def update_album(
    album_id: int,
    body: AlbumUpdateRequest,
    request: Request = None,  # noqa: ARG001
    current_user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    album = await services.update_album(
        album_id=album_id, name=body.name, slug=body.slug, sort_order=body.sort_order, parent_id=body.parent_id
    )
    return Result.ok(AlbumVO.from_model(album).model_dump(mode="json"))


@router.delete("/admin/albums/{album_id}", summary="删除相册")
async def delete_album(
    album_id: int,
    request: Request = None,  # noqa: ARG001
    current_user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    await services.delete_album(album_id)
    return Result.ok({"id": album_id})
