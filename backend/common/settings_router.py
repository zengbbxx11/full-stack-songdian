"""系统设置路由 — 用于管理后台修改全局配置（GA ID、站点名称等）"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request

from common.audit import audit
from common.deps import get_current_user, require_permission
from common.redis_client import cache_key, get_redis
from common.result import Result
from common.settings_model import Setting
from content.models import AdminUser

router = APIRouter(prefix="/api/v1", tags=["settings"])

# 公开设置白名单：仅允许前端读取这些非敏感字段
PUBLIC_SETTING_KEYS = {
    "company_email",
    "company_phone",
    "company_whatsapp",
    "company_address",
    "company_name",
    "company_logo",
    "company_fax",
    "company_linkedin",
    "company_youtube",
    "company_facebook",
    "site_name",
    "ga_id",
}
PUBLIC_SETTINGS_TTL = 300  # 缓存 5 分钟


@router.get("/public/settings", summary="公开获取系统设置（无需认证）")
async def get_public_settings() -> Result:
    """返回白名单内的公开设置项，供官网前端获取联系信息等。

    无需认证，带 300s 缓存，仅返回白名单 key，不暴露敏感配置。
    """
    cache_key_str = cache_key("public", "settings")
    redis = get_redis()

    # 尝试从缓存读取
    try:
        cached = await redis.get(cache_key_str)
        if cached:
            return Result.ok(json.loads(cached))
    except Exception:  # noqa: BLE001
        pass

    # 查库并过滤白名单
    rows = await Setting.filter(key__in=PUBLIC_SETTING_KEYS)
    data = {r.key: r.value for r in rows}

    # 写入缓存
    try:
        await redis.setex(cache_key_str, PUBLIC_SETTINGS_TTL, json.dumps(data))
    except Exception:  # noqa: BLE001
        pass

    return Result.ok(data)


@router.get("/admin/settings", summary="获取所有系统设置")
async def list_settings(
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    """返回全部系统配置项的 key-value 字典（含 label/description 元信息）。

    供管理后台设置页初始加载使用，无需额外 RBAC 权限（仅需登录）。
    """
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
    """更新单个系统配置项的值。

    需要 `settings:update` RBAC 权限。
    从请求体 JSON 中读取 `value` 字段，写入 Setting 表对应 key 的行。
    若 key 不存在则返回 A010001 错误。
    操作会被写入审计日志（@audit 装饰器）��
    """
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
    """批量覆盖多个系统配置项。

    需要 `settings:update` RBAC 权限。
    请求体为 `{key: value, ...}` 键值对字典，仅更新已存在的 key（跳过不存在的）。
    操作写入统一审计日志条目。
    """
    body = await request.json()
    updated = 0
    for key, value in body.items():
        setting = await Setting.get_or_none(key=key)
        if setting is not None:
            setting.value = str(value)
            await setting.save()
            updated += 1
    return Result.ok(msg=f"已更新 {updated} 项配置")
