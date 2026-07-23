"""内容管理服务（M5，§3.2.M5 / §6.5 / §6.6）。

设计约束：
- 登录：bcrypt 校验 + 连续 5 次失败锁定 15 分钟（Redis 锁键 TTL 900s，避免改 DDL）。
- 签发 JWT（access 2h / refresh 7d）；权限缓存 ``auth:perm:{uid}``（7200s）。
- 登出：将 access ``jti`` 写入黑名单 ``auth:black:{jti}``，并吊销其令牌族 ``fid``，
  使该次登录签发的 access+refresh 全部失效。
- 刷新：校验旧 refresh 未吊销；签发新令牌族（新 ``fid``），并吊销旧 ``fid`` 实现轮换。
- RBAC：角色→权限码多对多（RolePermission）；绑定权限时清对应权限缓存。
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
from common.redis_client import get_redis
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
        await get_redis().delete(f"auth:perm:{user.id}")
    except Exception:  # noqa: BLE001
        pass


async def login(username: str, password: str, ip: str = "unknown") -> LoginVO:
    user = await AdminUser.get_or_none(username=username)
    if user is None:
        raise BizException(ErrorCode.A050001)

    # 锁定时检查 Redis 锁键是否过期
    if user.status == AdminStatus.LOCKED.value:
        try:
            locked = await get_redis().exists(f"login:lock:{username}")
        except Exception:  # noqa: BLE001
            # security-audit F-07：Redis 不可用时 fail-closed，视同仍处锁定，拒绝登录防爆破。
            locked = settings.security_fail_closed
        if not locked:
            user.status = AdminStatus.ENABLED.value
            user.login_fail = 0
            await user.save()
        else:
            raise BizException(ErrorCode.A050002, "账号已锁定，请 15 分钟后再试")

    if user.status == AdminStatus.DISABLED.value:
        raise BizException(ErrorCode.A050002, "账号已禁用")

    if not verify_password(password, user.password_hash):
        user.login_fail = (user.login_fail or 0) + 1
        if user.login_fail >= 5:
            user.status = AdminStatus.LOCKED.value
            try:
                await get_redis().setex(f"login:lock:{username}", LOGIN_LOCK_TTL, "1")
            except Exception:  # noqa: BLE001
                pass
        await user.save()
        raise BizException(ErrorCode.A050002)

    # 成功：重置失败计数与锁
    user.login_fail = 0
    user.status = AdminStatus.ENABLED.value
    user.last_login = datetime.now(UTC)
    await user.save()
    await _clear_user_perm_cache(user)

    roles, perms = await load_user_claims(user)
    # 令牌族：同一次登录签发的 access 与 refresh 共用同一 fid，以支持令牌族吊销
    fid = uuid.uuid4().hex
    access = create_access_token(user.id, user.username, roles, perms, fid=fid)
    refresh = create_refresh_token(user.id, user.username, fid=fid)
    expires_at = int(datetime.now(UTC).timestamp()) + settings.access_token_ttl
    return LoginVO(
        access_token=access, refresh_token=refresh, roles=roles,
        permissions=perms, expires_at=expires_at,
    )


async def logout(token: str) -> None:
    """登出：吊销当前 access 的 jti 以及其令牌族 fid，使该族所有令牌立即失效。

    best-effort：无法解析的令牌直接忽略，不阻断主流程。
    """
    try:
        payload = decode_token(token)
    except Exception:  # noqa: BLE001
        return
    jti = payload.get("jti")
    fid = payload.get("fid")
    # 先吊销令牌族（覆盖该次登录的全部 access+refresh），再吊销当前 access jti
    if fid:
        await revoke_family(fid)
    if jti:
        await revoke_token(jti, settings.access_token_ttl)


async def refresh(refresh_token: str) -> LoginVO:
    """无感刷新（T01）：校验旧 refresh 后签发新的 LoginVO（令牌族轮换）。

    - 仅接受 scope=refresh 的合法 token；非法/过期/算法不符一律 C401001。
    - 旧 refresh 所属令牌族若已吊销（登出/已被轮换），拒绝刷新（重用检测）。
    - 新签发的 access/refresh 使用全新 fid；签发后吊销旧 fid，使旧 refresh 立即失效。
    """
    try:
        payload = decode_token(refresh_token)
    except Exception:  # noqa: BLE001
        raise BizException(ErrorCode.C401001)
    if payload.get("scope") != "refresh":
        raise BizException(ErrorCode.C401001)

    old_fid = payload.get("fid")
    # 令牌族重用检测：旧 refresh 所属族已被吊销则拒绝（旧 refresh 不再可用）
    if old_fid and await is_family_revoked(old_fid):
        raise BizException(ErrorCode.C401001)

    user = await AdminUser.get_or_none(id=int(payload["sub"]))
    if user is None:
        raise BizException(ErrorCode.C401001)
    if user.status != AdminStatus.ENABLED.value:
        raise BizException(ErrorCode.C403001, "账号已被禁用或锁定")

    roles, perms = await load_user_claims(user)
    # 轮换：使用全新令牌族 fid 签发新令牌对
    new_fid = uuid.uuid4().hex
    access = create_access_token(user.id, user.username, roles, perms, fid=new_fid)
    new_refresh = create_refresh_token(user.id, user.username, fid=new_fid)
    # 新令牌签发完成后，吊销旧令牌族，使旧 refresh 立即失效（无感刷新安全轮换）
    if old_fid:
        await revoke_family(old_fid)
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


async def list_audit_logs(req: PageRequest) -> tuple[list[AuditPageVO], int]:
    q = AuditLog.all()
    total = await q.count()
    rows = await q.order_by(req.order_by).offset(req.offset).limit(req.limit)
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
        if not verify_password(data.current_password, user.password):
            raise BizException(ErrorCode.A050001, "当前密码不正确")
        user.password = hash_password(data.new_password)

    await user.save()
    return ProfileVO.from_model(user)
