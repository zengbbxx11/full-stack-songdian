"""数据迁移路由（M6，§3.2.M6.2）。

路径前缀 /api/v1。
- 后台写：POST /admin/migration/run（需 migration:run + 审计）。
- 后台读：GET /admin/migration/batches、GET /admin/migration/batches/{id}（需 migration:read）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from common.audit import audit
from common.deps import require_permission
from common.result import PageRequest, PageResponse, Result
from content.models import AdminUser
from migration import services
from migration.schemas import MigrationRunRequest

router = APIRouter(prefix="/api/v1", tags=["migration"])


@router.post("/admin/migration/run", summary="发起迁移批次")
@audit(action="migration.run", resource="migration:batch")
async def run_migration(
    data: MigrationRunRequest,
    request: Request,
    _user: AdminUser = Depends(require_permission("migration:run")),
) -> Result:
    vo = await services.run_migration(data)
    return Result.ok(vo.model_dump(mode="json"))


@router.get("/admin/migration/batches", summary="迁移批次列表")
async def list_batches(
    req: PageRequest = Depends(),
    _user: AdminUser = Depends(require_permission("migration:read")),
) -> Result:
    items, total = await services.list_batches(req)
    return Result.ok(
        PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump()
    )


@router.get("/admin/migration/batches/{batch_id}", summary="迁移批次详情+校验")
async def get_batch_detail(
    batch_id: int,
    _user: AdminUser = Depends(require_permission("migration:read")),
) -> Result:
    vo = await services.get_batch_detail(batch_id)
    return Result.ok(vo.model_dump(mode="json"))
