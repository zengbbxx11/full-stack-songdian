"""系统设置路由 — 用于管理后台修改全局配置（GA ID、站点名称等）"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from common.audit import audit
from common.deps import get_current_user, require_permission
from common.result import Result
from common.settings_model import Setting
from content.models import AdminUser

router = APIRouter(prefix="/api/v1", tags=["settings"])


@router.get("/admin/settings", summary="获取所有系统设置")
async def list_settings(
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    rows = await Setting.all()
    data = {r.key: {"value": r.value, "label": r.label, "description": r.description} for r in rows}
    return Result.ok(data)


@router.put("/admin/settings/{key}", summary="更新系统设置")
@audit(action="settings.update", resource="setting:{key}")
async def update_setting(
    key: str,
    request: Request,
    _user: AdminUser = Depends(require_permission("settings:update")),
) -> Result:
    # 从请求体读取 value
    body = await request.json()
    value = body.get("value", "")
    setting = await Setting.get_or_none(key=key)
    if setting is None:
        return Result(code="A010001", msg="配置项不存在", data=None)
    setting.value = value
    await setting.save()
    return Result.ok(msg="保存成功")


@router.put("/admin/settings", summary="批量更新系统设置")
@audit(action="settings.batch_update", resource="settings")
async def batch_update_settings(
    request: Request,
    _user: AdminUser = Depends(require_permission("settings:update")),
) -> Result:
    body = await request.json()
    updated = 0
    for key, value in body.items():
        setting = await Setting.get_or_none(key=key)
        if setting is not None:
            setting.value = str(value)
            await setting.save()
            updated += 1
    return Result.ok(msg=f"已更新 {updated} 项配置")
