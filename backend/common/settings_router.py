"""系统设置路由 — 用于管理后台修改全局配置（GA ID、站点名称等）"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request

from common.audit import audit
from common.tasks import enqueue, transactional_write
from common.deps import get_current_user, get_user_permissions, require_permission
from common.enums import SmtpStatus
from common.exceptions import BizException, ErrorCode, resolve_error
from common.redis_client import cache_key, get_redis
from common.result import Result
from common.settings_model import Setting
from content.models import AdminUser
from inquiry.smtp_mailer import send_test_mail

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
    "clarity_id",
    "google_verification",
    # 官网首页轮播图：JSON 数组字符串，由设置页「首页轮播」面板管理
    "home_banners",
}
PUBLIC_SETTINGS_TTL = 300  # 缓存 5 分钟

# SMTP 密码占位符：GET 脱敏返回、PUT 传回时保留原值
SMTP_PASSWORD_MASK = "******"


def _fail(code: str) -> Result:
    """按错误码注册表构造失败结果。

    直接 ``Result.fail(code, msg)`` 需要手写文案，容易与注册表漂移；
    这里统一经 ``resolve_error`` 取 (msg, msgI18n)，并让 ``Result.fail`` 自动补 traceId/timestamp。
    """
    _status, msg, i18n = resolve_error(code)
    return Result.fail(code, msg, i18n)


# SMTP 配置 key 的默认元信息（惰性创建：不依赖 SEED_ON_START，保证设置页始终有邮件通知面板）
_SMTP_DEFAULTS = [
    ("smtp_host", "", "SMTP 服务器", "如 smtp.qq.com；留空使用部署环境配置，均未配置时不发送邮件"),
    ("smtp_port", "587", "SMTP 端口", "常用 587（STARTTLS）或 465"),
    ("smtp_user", "", "SMTP 账号", "如 3932182720@qq.com"),
    ("smtp_password", "", "SMTP 授权码", "QQ 邮箱授权码（非登录密码）；显示为 ******，留空不修改"),
    ("inquiry_email_from", "", "发件人地址", "与 SMTP 账号一致"),
    ("inquiry_email_to", "", "收件人地址", "询盘通知发给谁（可逗号分隔多个）"),
]

_GENERAL_DEFAULTS = [
    ("ga_id", "", "Google Analytics ID", "GA4 测量 ID，格式 G-XXXXXXXXXX"),
    ("clarity_id", "", "Microsoft Clarity 项目 ID", "填写安装代码中的项目 ID（仅字母和数字），不要粘贴整段脚本；留空关闭"),
    ("google_verification", "", "Google Search Console 验证码", "用于站点所有权验证"),
    ("home_banners", "[]", "首页轮播", "官网首页轮播图，由设置页轮播面板管理"),
]


async def _invalidate_public_settings_cache() -> None:
    """与配置同事务记录刷新任务，提交后清理 Redis 和官网缓存。"""
    await enqueue("content_cache", {"resource": "settings"})


async def ensure_admin_settings() -> None:
    """惰性初始化后台可编辑的系统设置，且不覆盖已有值。

    独立于 SEED_ON_START：生产最小种子不写业务或配置数据，但设置页始终可用。
    """
    for key, value, label, desc in [*_GENERAL_DEFAULTS, *_SMTP_DEFAULTS]:
        await Setting.get_or_create(key=key, defaults={"value": value, "label": label, "description": desc})


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
    user: AdminUser = Depends(get_current_user),
) -> Result:
    """返回系统配置项的 key-value 字典（含 label/description 元信息）。

    供管理后台设置页初始加载使用：仅需登录即可调用，但**读取范围随权限收缩** ——
    不具备 `settings:update` 的账号只会拿到公开白名单项（`PUBLIC_SETTING_KEYS`），
    避免低权/外部账号读到内部 SMTP 主机与账号、业务收发件箱（真正多出来的敏感项，
    其余如 ga_id / clarity_id / google_verification / company_* 本就在匿名可读的公开接口里）。
    对具备权限者，smtp_password 非空时脱敏为 ******，避免授权码回显到前端。
    """
    await ensure_admin_settings()
    rows = await Setting.all()
    data = {r.key: {"value": r.value, "label": r.label, "description": r.description} for r in rows}

    # 每次请求查库取当前授权（权限回收即时生效，见 common/deps.py get_user_permissions）
    perms = await get_user_permissions(user)
    if "settings:update" not in perms:
        # 默认拒绝 + 白名单裁剪 key（不做逐字段掩码：设置页保存逻辑只对 smtp_password 的
        # ****** 做"不修改"跳过，其它字段会把页面上的值原样提交，掩码会被误写进真实配置）
        data = {key: value for key, value in data.items() if key in PUBLIC_SETTING_KEYS}
    elif data.get("smtp_password", {}).get("value"):
        data["smtp_password"]["value"] = SMTP_PASSWORD_MASK
    return Result.ok(data)


async def _json_object_body(request: Request) -> dict:
    """读取请求体并要求必须是 JSON 对象。

    过去直接 `await request.json()` + `body.get(...)`：空体/非法 JSON 抛 JSONDecodeError、
    `[]` 或 `"x"` 抛 AttributeError，都落到兜底处理器变成 500。这里统一按 400（C400001）返回。
    """
    try:
        body = await request.json()
    except ValueError as exc:  # 空请求体 / 非法 JSON
        raise BizException(ErrorCode.C400001, "请求体必须是 JSON 对象") from exc
    if not isinstance(body, dict):
        raise BizException(ErrorCode.C400001, "请求体必须是 JSON 对象")
    return body


def _normalize_setting_value(value: object) -> str:
    """把设置值收敛为字符串。

    Setting.value 是 NOT NULL 的 TextField：写入 None 会触发数据库 NOT NULL 违约（500），
    这里统一把 null 视为「清空」写成空串；数字/对象则按旧行为转为字符串。
    """
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


@router.put("/admin/settings/{key}", summary="更新系统设置")
@audit(action="settings.update", resource="setting:{key}")
@transactional_write
async def update_setting(
    key: str,
    request: Request,
    _user: AdminUser = Depends(require_permission("settings:update")),
) -> Result:
    """更新单个系统配置项的值。

    需要 `settings:update` RBAC 权限。
    从请求体 JSON 中读取 `value` 字段，写入 Setting 表对应 key 的行。
    若 key 不存在则返回 A070001 错误。
    操作会被写入审计日志（@audit 装饰器）。
    """
    # 从请求体读取 value（必须是 JSON 对象，否则 400；null 等价于清空）
    body = await _json_object_body(request)
    value = _normalize_setting_value(body.get("value", ""))
    setting = await Setting.get_or_none(key=key)
    if setting is None:
        return _fail(ErrorCode.A070001)
    # SMTP 密码：前端回传掩码时保留原值（未修改授权码）
    if key == "smtp_password" and value in ("", SMTP_PASSWORD_MASK):
        value = setting.value
    setting.value = value
    await setting.save()
    if key in PUBLIC_SETTING_KEYS:
        await _invalidate_public_settings_cache()
    return Result.ok(msg="保存成功")


@router.put("/admin/settings", summary="批量更新系统设置")
@audit(action="settings.batch_update", resource="settings")
@transactional_write
async def batch_update_settings(
    request: Request,
    _user: AdminUser = Depends(require_permission("settings:update")),
) -> Result:
    """批量覆盖多个系统配置项。

    需要 `settings:update` RBAC 权限。
    请求体为 `{key: value, ...}` 键值对字典，仅更新已存在的 key（跳过不存在的）。
    操作写入统一审计日志条目。
    """
    # 请求体必须是 JSON 对象（非对象 / 空体过去会 500，现在按 400 返回）
    body = await _json_object_body(request)
    updated = 0
    public_settings_changed = False
    for key, raw_value in body.items():
        setting = await Setting.get_or_none(key=key)
        if setting is not None:
            value = _normalize_setting_value(raw_value)
            # SMTP 密码：前端回传掩码时保留原值（未修改授权码）
            if key == "smtp_password" and value in ("", SMTP_PASSWORD_MASK):
                value = setting.value
            setting.value = value
            await setting.save()
            updated += 1
            public_settings_changed = public_settings_changed or key in PUBLIC_SETTING_KEYS
    if public_settings_changed:
        await _invalidate_public_settings_cache()
    return Result.ok(msg=f"已更新 {updated} 项配置")


@router.post("/admin/settings/smtp/test", summary="SMTP 配置测试发送")
@audit(action="settings.smtp_test", resource="settings")
async def test_smtp(
    _user: AdminUser = Depends(require_permission("settings:update")),
) -> Result:
    """用当前已保存的 SMTP 配置发一封测试邮件，校验配置是否可用。

    返回 SENT（成功）/ FAILED（失败，msg 含原因）/ PENDING（未配置）。
    """
    status = await send_test_mail()
    if status == SmtpStatus.SENT:
        return Result.ok(msg="测试邮件已发送，请查收收件箱")
    if status == SmtpStatus.PENDING:
        # 经统一错误码解析返回，保证 traceId/timestamp 与语义一致（不再复用产品错误码）。
        return _fail(ErrorCode.A070002)
    return _fail(ErrorCode.A070003)
