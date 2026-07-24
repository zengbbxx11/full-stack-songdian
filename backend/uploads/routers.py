"""上传域路由（M6，T03）。

路径前缀 /api/v1。仅后台写接口：
- ``POST /admin/upload``：单文件上传（media:upload）。
- ``POST /admin/upload/batch``：多文件上传（media:upload）。
成功后写 ``UploadRecord`` 溯源，返回 ``UploadVO`` / ``list[UploadVO]``。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile

from common.audit import audit
from common.deps import require_permission
from common.result import Result
from content.models import AdminUser
from uploads import services
from uploads.schemas import UploadVO

router = APIRouter(prefix="/api/v1", tags=["uploads"])


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
