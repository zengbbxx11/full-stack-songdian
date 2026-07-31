"""内容管理 — 登录 / 登出 / JWT / RBAC 权限（核心业务逻辑）
────────────────────────────────────────────────
这一层是"服务层"——被 routers.py 的 API 端点调用，不直接收 HTTP 请求。
流程详见各函数内的逐步骤注释。
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from common.config import settings
from common.enums import AdminStatus
from common.exceptions import BizException, ErrorCode
from common.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    is_family_revoked,
    revoke_family,
    revoke_token,
)
from common.password import hash_password, verify_password
from common.redis_client import cache_key, get_redis
from common.result import PageRequest
from content.models import AdminUser, AuditLog, Role, RolePermission
from content.permissions import ALL_PERMISSIONS
from content.schemas import (
    AuditPageVO,
    LoginVO,
    ProfileVO,
    RoleCreateRequest,
    RolePermRequest,
    RoleVO,
    UpdateProfileRequest,
)

LOGIN_LOCK_TTL = 900  # 15 分钟


async def load_user_claims(user: AdminUser) -> tuple[list[str], list[str]]:
    """返回 (roles, permissions)。"""
    role = await user.role
    roles = [role.code] if role else []
    if role is None:
        return roles, []
    perms = list(
        await RolePermission.filter(role_id=role.id).values_list("permission_code", flat=True)
    )
    return roles, perms


async def _clear_user_perm_cache(user: AdminUser) -> None:
    try:
        await get_redis().delete(cache_key("auth", "perm", user.id))
    except Exception:  # noqa: BLE001
        pass


async def login(username: str, password: str, ip: str = "unknown") -> LoginVO:
    """用户登录 — 完整流程

    ① 根据用户名查数据库 t_admin_user 表
    ② 如果账号状态是 LOCKED（锁定）：
       - Redis 里查锁是否过期 → 过期了自动解锁，没过期拒绝登录
    ③ 如果账号状态是 DISABLED（禁用）→ 直接拒绝
    ④ 用 bcrypt 比对用户输入的密码和数据库存的哈希值
    ⑤ 密码错误 → 失败次数 +1，满了 5 次 → 锁定 15 分钟
    ⑥ 密码正确 → 清空失败计数，签发两个 JWT：
       access_token（2h） + refresh_token（7d），共享一个令牌族 ID
    返回 LoginVO（含 token、角色、权限列表）
    """
    # ① 查用户
    user = await AdminUser.get_or_none(username=username)
    if user is None:
        raise BizException(ErrorCode.A050001)

    # ② 检查账号是否被锁定
    if user.status == AdminStatus.LOCKED.value:
        try:
            # Redis 里查锁是否还在（key: login:lock:{用户名}）
            locked = await get_redis().exists(cache_key("login", "lock", username))
        except Exception:
            # Redis 挂了 → 保守起见，拒绝登录（安全优先）
            locked = settings.security_fail_closed
        if not locked:
            # 锁已过期 → 自动解锁，允许重新尝试
            user.status = AdminStatus.ENABLED.value
            user.login_fail = 0
            await user.save()
        else:
            raise BizException(ErrorCode.A050002, "账号已锁定，请 15 分钟后再试")

    # ③ 检查账号是否被禁用
    if user.status == AdminStatus.DISABLED.value:
        raise BizException(ErrorCode.A050002, "账号已禁用")

    # ④⑤ 比对密码
    if not verify_password(password, user.password_hash):
        # 密码错误：累计失败次数
        user.login_fail = (user.login_fail or 0) + 1
        if user.login_fail >= 5:
            # 失败 5 次 → 锁定账号 15 分钟（数据库 + Redis 双重保障）
            user.status = AdminStatus.LOCKED.value
            try:
                await get_redis().setex(cache_key("login", "lock", username), LOGIN_LOCK_TTL, "1")
            except Exception:
                pass  # Redis 挂了也不影响数据库锁，下次登录会被拦截
        await user.save()
        raise BizException(ErrorCode.A050002)

    # ⑥ 登录成功 — 重置失败计数，签发 JWT
    user.login_fail = 0
    user.status = AdminStatus.ENABLED.value
    user.last_login = datetime.now(UTC)
    await user.save()
    await _clear_user_perm_cache(user)  # 清除旧权限缓存，强制下次重新加载

    # 获取用户的角色和权限码
    roles, perms = await load_user_claims(user)

    # 生成令牌族 ID（fid）— 同一次登录的 access+refresh 共享
    fid = uuid.uuid4().hex
    access = create_access_token(user.id, user.username, roles, perms, fid=fid)
    refresh = create_refresh_token(user.id, user.username, fid=fid)
    expires_at = int(datetime.now(UTC).timestamp()) + settings.access_token_ttl

    return LoginVO(
        access_token=access, refresh_token=refresh, roles=roles,
        permissions=perms, expires_at=expires_at,
    )


async def logout(token: str) -> None:
    """登出 — 让当前 token 及同族 token 全部失效

    ① 解析 token 拿到 jti（token ID）和 fid（令牌族 ID）
    ② 先吊销整个令牌族（fid 进黑名单）→ 同次登录的 access+refresh 全废
    ③ 再吊销当前 token 的 jti → 防止这个 token 本身被重复使用
    """
    try:
        payload = decode_token(token)
    except Exception:
        return  # 解析不了的 token 直接忽略，不报错
    jti = payload.get("jti")  # token 的唯一 ID
    fid = payload.get("fid")  # 令牌族 ID（同次登录的 access+refresh 共享）
    # 先吊销整个族，再吊销单个 token
    if fid:
        await revoke_family(fid)
    if jti:
        await revoke_token(jti, settings.access_token_ttl)


async def refresh(refresh_token: str) -> LoginVO:
    """无感刷新 — 用 refresh_token 换一对新�� token

    前端在 access_token 快过期时调用这个接口。
    会校验 refresh_token 是否合法、有没有被吊销（登出后不可刷新）。
    成功时签发全新令牌族，旧族立刻作废——旧的 refresh_token 只能用一次。

    ① 解析 refresh_token，必须是 scope=refresh 的合法 JWT
    ② 检查这个 token 所属的令牌族有没有被吊销（被吊销=已登出/已刷新过=拒绝）
    ③ 查用户是否存在、账号是否正常
    ④ 签发全新令牌族（新 fid），旧族立即失效
    """
    # ① 解析
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise BizException(ErrorCode.C401001)
    if payload.get("scope") != "refresh":
        raise BizException(ErrorCode.C401001)

    # ② 检查旧族是否已吊销（防止重用已登出/已刷新的 refresh_token）
    old_fid = payload.get("fid")
    if old_fid and await is_family_revoked(old_fid):
        raise BizException(ErrorCode.C401001)

    # ③ 查用户
    user = await AdminUser.get_or_none(id=int(payload["sub"]))
    if user is None:
        raise BizException(ErrorCode.C401001)
    if user.status != AdminStatus.ENABLED.value:
        raise BizException(ErrorCode.C403001, "账号已被禁用或锁定")

    # ④ 轮换：签发新族，吊销旧族
    roles, perms = await load_user_claims(user)
    new_fid = uuid.uuid4().hex
    access = create_access_token(user.id, user.username, roles, perms, fid=new_fid)
    new_refresh = create_refresh_token(user.id, user.username, fid=new_fid)
    if old_fid:
        await revoke_family(old_fid)  # 旧 refresh 立刻作废，只能刷一次
    expires_at = int(datetime.now(UTC).timestamp()) + settings.access_token_ttl
    return LoginVO(
        access_token=access, refresh_token=new_refresh, roles=roles,
        permissions=perms, expires_at=expires_at,
    )


async def list_roles() -> list[RoleVO]:
    roles = await Role.all().order_by("id")
    result: list[RoleVO] = []
    for role in roles:
        perms = list(
            await RolePermission.filter(role_id=role.id).values_list("permission_code", flat=True)
        )
        result.append(RoleVO.from_model(role, perms))
    return result


async def create_role(data: RoleCreateRequest) -> RoleVO:
    if await Role.get_or_none(code=data.code) is not None:
        raise BizException(ErrorCode.C400001, "角色编码重复")
    role = await Role.create(name=data.name, code=data.code, remark=data.remark)
    return RoleVO.from_model(role, [])


async def bind_permissions(role_id: int, data: RolePermRequest) -> RoleVO:
    role = await Role.get_or_none(id=role_id)
    if role is None:
        raise BizException(ErrorCode.C404001, "角色不存在")
    # 仅接收已知权限码，忽略未知
    valid = [c for c in data.permission_codes if c in ALL_PERMISSIONS]
    await RolePermission.filter(role_id=role.id).delete()
    if valid:
        await RolePermission.bulk_create(
            [RolePermission(role_id=role.id, permission_code=c) for c in valid]
        )
    # 清该角色下所有用户的权限缓存
    users = await AdminUser.filter(role_id=role.id)
    for u in users:
        await _clear_user_perm_cache(u)
    return RoleVO.from_model(role, valid)


# 审计日志排序字段白名单（review #11）：AuditLog 无 sort_order 字段，
# 客户端传入不存在的字段会令 Tortoise order_by 抛 FieldError → 500，故必须白名单校验。
_AUDIT_ORDER_WHITELIST = {
    "id", "user_id", "username", "action", "resource", "result", "ip", "created_time",
}


async def list_audit_logs(req: PageRequest) -> tuple[list[AuditPageVO], int]:
    q = AuditLog.all()
    # 必须约束为真实存在的字段，否则 Tortoise order_by 抛 FieldError → 500。
    order_by = req.order_by or "-created_time"
    if order_by.lstrip("-") not in _AUDIT_ORDER_WHITELIST:
        order_by = "-created_time"
    total = await q.count()
    rows = await q.order_by(order_by).offset(req.offset).limit(req.limit)
    return [AuditPageVO.from_model(r) for r in rows], total


async def update_profile(user: AdminUser, data: UpdateProfileRequest) -> ProfileVO:
    """修改当前登录用户的用户名和/或密码。

    - 修改密码须提供 current_password 校验身份。
    - 修改用户名须检查唯一性。
    """
    # 修改用户名
    if data.username is not None and data.username != user.username:
        existing = await AdminUser.get_or_none(username=data.username)
        if existing is not None:
            raise BizException(ErrorCode.A010002, "用户名已存在")
        user.username = data.username

    # 修改密码
    if data.new_password is not None:
        if not data.current_password:
            raise BizException(ErrorCode.A040001, "修改密码须提供当前密码")
        if not verify_password(data.current_password, user.password_hash):
            raise BizException(ErrorCode.A050001, "当前密码不正确")
        user.password_hash = hash_password(data.new_password)

    await user.save()
    return ProfileVO.from_model(user)


async def list_admin_users() -> list[dict]:
    """列出所有启用状态的管理员账号（供询盘分配下拉等场景，2026-07-31 新增）。"""
    users = await AdminUser.filter(status=AdminStatus.ENABLED.value).only("id", "username").all()
    return [{"id": u.id, "username": u.username} for u in users]


async def list_users() -> list[dict]:
    users = await AdminUser.all().prefetch_related("role")
    return [
        {"id": u.id, "username": u.username, "email": u.email,
         "status": u.status, "role_name": u.role.name if u.role else None,
         "role_code": u.role.code if u.role else None, "created_time": u.created_time}
        for u in users
    ]


async def create_user(username: str, password: str) -> dict:
    """创建后台用户（统一管理员角色）。"""
    from common.password import hash_password
    existing = await AdminUser.get_or_none(username=username)
    if existing:
        raise BizException(ErrorCode.A010002, "Username exists")
    # 所有新用户统一分配 admin 角色
    role = await Role.get_or_none(code="admin")
    user = await AdminUser.create(
        username=username, password_hash=hash_password(password),
        role=role, status=AdminStatus.ENABLED.value,
    )
    return {"id": user.id, "username": user.username}


async def delete_user(user_id: int) -> None:
    """删除后台用户（保留 admin 账号不可删）。"""
    user = await AdminUser.get_or_none(id=user_id)
    if user is None:
        raise BizException(ErrorCode.C404001, "User not found")
    if user.username == "admin":
        raise BizException(ErrorCode.C400001, "Cannot delete admin account")
    await user.delete()


async def reset_password(user_id: int, new_password: str) -> dict:
    """重置用户密码。"""
    from common.password import hash_password
    user = await AdminUser.get_or_none(id=user_id)
    if user is None:
        raise BizException(ErrorCode.C404001, "User not found")
    user.password_hash = hash_password(new_password)
    await user.save()
    return {"id": user.id, "username": user.username}


async def get_dashboard_stats() -> dict:
    """Dashboard stats — inquiry country & status distribution."""
    from product.models import Product, ProductCategory
    from news.models import News
    from inquiry.models import Inquiry

    product_count = await Product.filter(deleted=0).count()
    news_count = await News.filter(deleted=0).count()
    category_count = await ProductCategory.filter(deleted=0).count()
    inquiries = await Inquiry.all()
    inquiry_count = len(inquiries)

    # Country distribution from filled-in country field
    country_map: dict[str, int] = {}
    for i in inquiries:
        c = (i.country or "").strip()
        if not c:
            c = "Unknown"
        country_map[c] = country_map.get(c, 0) + 1
    countries = sorted([{"country": k, "count": v} for k, v in country_map.items()],
                       key=lambda x: x["count"], reverse=True)[:10]

    # Status distribution
    status_map: dict[str, int] = {}
    for i in inquiries:
        s = i.status or ""
        status_map[s] = status_map.get(s, 0) + 1

    return {
        "counts": {"products": product_count, "news": news_count,
                   "categories": category_count, "inquiries": inquiry_count},
        "inquiry_countries": countries,
        "inquiry_status": status_map,
    }
