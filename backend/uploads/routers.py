"""上传域路由（M6，T03）。

路径前缀 /api/v1。后台接口：
- ``GET /admin/upload/records``：分页查询上传记录（media:upload）。
- ``POST /admin/upload``：单文件上传（media:upload）。
- ``POST /admin/upload/batch``：多文件上传（media:upload）。
成功后写 ``UploadRecord`` 溯源，返回 ``UploadVO`` / ``list[UploadVO]``。
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile

from common.audit import audit
from common.deps import require_permission
from common.result import Result
from content.models import AdminUser
from uploads import services
from uploads.schemas import UploadRecordVO, UploadVO

router = APIRouter(prefix="/api/v1", tags=["uploads"])


@router.get("/admin/upload/records", summary="分页查询上传记录")
async def list_upload_records(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页条数"),
    _user: AdminUser = Depends(require_permission("media:upload")),
) -> Result:
    """返回上传记录分页列表，供媒体库页面展示已上传图片。

    需要 `media:upload` RBAC 权限。按创建时间倒序排列。
    """
    total = await services.count_upload_records()
    records = await services.list_upload_records(page=page, page_size=page_size)
    data = {
        "list": [UploadRecordVO.from_model(r).model_dump(mode="json") for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    return Result.ok(data)


@router.post("/admin/upload", summary="单文件上传")
@audit(action="media.upload", resource="media:{file_name}")
async def upload(
    file: UploadFile = File(..., description="待上传图片（jpg/png/webp/gif，≤ max_upload_mb）"),
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
    )
    return Result.ok(UploadVO.build(record.url, record.file_name, record.size).model_dump(mode="json"))


@router.post("/admin/upload/batch", summary="多文件上传")
@audit(action="media.upload.batch", resource="media:batch")
async def upload_batch(
    files: list[UploadFile] = File(..., description="多个待上传图片"),
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
        )
        vos.append(UploadVO.build(record.url, record.file_name, record.size).model_dump(mode="json"))
    return Result.ok(vos)
