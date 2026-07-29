"""询盘域路由（M4，§3.2.M4.2）。

路径前缀 /api/v1。
- 公开：POST /inquiries（IP 限流 + 幂等）。
- 后台：GET /admin/inquiries、GET /admin/inquiries/{id}、PUT /admin/inquiries/{id}/status，
  需 RBAC（inquiry:read / inquiry:update）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from common.audit import audit
from common.deps import require_permission
from common.ratelimit import ip_rate_limit
from common.result import PageRequest, PageResponse, Result
from content.models import AdminUser
from inquiry import services
from inquiry.schemas import (
    InquiryStatusRequest,
    InquirySubmitRequest,
)

router = APIRouter(prefix="/api/v1", tags=["inquiry"])


@router.post("/inquiries", summary="提交询盘")
async def submit(
    data: InquirySubmitRequest,
    request: Request,
    _rl=Depends(ip_rate_limit),
) -> Result:
    vo = await services.submit_inquiry(data)
    return Result.ok(vo.model_dump(mode="json"))


@router.get("/admin/inquiries", summary="询盘分页列表")
async def list_inquiries(
    req: PageRequest = Depends(),
    status: str | None = Query(default=None),
    _user: AdminUser = Depends(require_permission("inquiry:read")),
) -> Result:
    items, total = await services.list_inquiries(req, status)
    return Result.ok(
        PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump()
    )


@router.get("/admin/inquiries/{inquiry_id}", summary="询盘详情")
async def get_inquiry(
    inquiry_id: int,
    _user: AdminUser = Depends(require_permission("inquiry:read")),
) -> Result:
    vo = await services.get_inquiry(inquiry_id)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/inquiries/{inquiry_id}/status", summary="更新询盘处理状态")
@audit(action="inquiry.status.update", resource="inquiry:{inquiry_id}")
async def update_status(
    inquiry_id: int,
    data: InquiryStatusRequest,
    request: Request,
    _user: AdminUser = Depends(require_permission("inquiry:update")),
) -> Result:
    vo = await services.update_status(inquiry_id, data)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/inquiries/{inquiry_id}", summary="删除询盘")
@audit(action="inquiry.delete", resource="inquiry:{inquiry_id}")
async def delete_inquiry(
    inquiry_id: int,
    request: Request,
    _user: AdminUser = Depends(require_permission("inquiry:update")),
) -> Result:
    await services.delete_inquiry(inquiry_id)
    return Result.ok({"id": inquiry_id})
