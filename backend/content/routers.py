"""内容管理路由（M5，§3.2.M5.2）。

路径前缀 /api/v1。
- 公开：/admin/login、/admin/refresh。
- 需登录：/admin/logout、/admin/roles、/admin/roles/{id}/permissions、/admin/audit-logs，
  并按 RBAC 权限码校验（role:read / role:create / role:update / audit:read）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from common.audit import audit
from common.config import settings
from common.deps import get_current_user, require_permission
from common.ratelimit import login_rate_limit
from common.result import PageRequest, PageResponse, Result
from content import services
from content.models import AdminUser
from content.schemas import (
    LoginRequest,
    LoginVO,
    ProfileVO,
    RoleCreateRequest,
    RolePermRequest,
    UpdateProfileRequest,
    CreateUserRequest,
    ResetPasswordRequest,
)

router = APIRouter(prefix="/api/v1", tags=["content"])

def _set_session_cookies(response: Response, request: Request, session) -> None:
    """仅通过同源 HttpOnly Cookie 下发令牌，生产环境强制 HTTPS Cookie。"""
    secure = settings.app_env.strip().lower() == "production"
    common = {"httponly": True, "secure": secure, "samesite": "lax", "path": "/"}
    response.set_cookie(
        "access_token", session.access_token, max_age=settings.access_token_ttl, **common
    )
    response.set_cookie(
        "refresh_token", session.refresh_token, max_age=settings.refresh_token_ttl, **common
    )


@router.post("/admin/login", summary="后台登录")
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    _rl=Depends(login_rate_limit),
) -> Result:
    ip = request.scope.get("client_ip", "unknown")
    vo = await services.login(data.username, data.password, ip=ip)
    _set_session_cookies(response, request, vo)
    return Result.ok(LoginVO(
        roles=vo.roles, permissions=vo.permissions, expires_at=vo.expires_at
    ).model_dump(mode="json"))


@router.post("/admin/logout", summary="登出")
async def logout(
    request: Request,
    response: Response,
) -> Result:
    # 即使 access 已过期也应清理两枚 Cookie；refresh 仍可用于吊销整族会话。
    token = request.cookies.get("access_token") or request.cookies.get("refresh_token")
    if token:
        await services.logout(token)
    # 清除 HttpOnly Cookie（前端 document.cookie 无法清除 HttpOnly，必须由后端下发过期 Cookie）。
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return Result.ok(msg="已登出")


@router.post("/admin/refresh", summary="刷新令牌（无感刷新）")
@audit(action="auth.refresh", resource="token:refresh")
async def refresh_token(request: Request, response: Response) -> Result:
    # 该端点不需要 access token；refresh token 仅从 HttpOnly Cookie 读取。
    # @audit 记录刷新动作的成败（操作人此处为匿名，因端点本身不依赖 access 鉴权）。
    refresh_cookie = request.cookies.get("refresh_token")
    if not refresh_cookie:
        from common.exceptions import BizException, ErrorCode
        raise BizException(ErrorCode.C401001)
    vo = await services.refresh(refresh_cookie)
    _set_session_cookies(response, request, vo)
    return Result.ok(LoginVO(
        roles=vo.roles, permissions=vo.permissions, expires_at=vo.expires_at
    ).model_dump(mode="json"))


@router.get("/admin/roles", summary="角色列表")
async def list_roles(
    _user: AdminUser = Depends(require_permission("role:read")),
) -> Result:
    items = await services.list_roles()
    return Result.ok([i.model_dump(mode="json") for i in items])


@router.post("/admin/roles", summary="创建角色")
@audit(action="role.create", resource="role:{code}")
async def create_role(
    data: RoleCreateRequest,
    request: Request,
    _user: AdminUser = Depends(require_permission("role:create")),
) -> Result:
    vo = await services.create_role(data)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/roles/{role_id}/permissions", summary="绑定角色权限")
@audit(action="role.perm.bind", resource="role:{role_id}")
async def bind_permissions(
    role_id: int,
    data: RolePermRequest,
    request: Request,
    _user: AdminUser = Depends(require_permission("role:update")),
) -> Result:
    vo = await services.bind_permissions(role_id, data)
    return Result.ok(vo.model_dump(mode="json"))


@router.get("/admin/audit-logs", summary="审计日志查询")
async def list_audit_logs(
    req: PageRequest = Depends(),
    _user: AdminUser = Depends(require_permission("audit:read")),
) -> Result:
    items, total = await services.list_audit_logs(req)
    return Result.ok(
        PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump()
    )


@router.get("/admin/profile", summary="获取当前用户信息")
async def get_profile(
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    await _user.fetch_related("role")
    vo = ProfileVO.from_model(_user)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/profile", summary="修改当前用户信息")
async def update_profile(
    data: UpdateProfileRequest,
    request: Request,
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    vo = await services.update_profile(_user, data)
    return Result.ok(vo.model_dump(mode="json"))


@router.get("/admin/users", summary="管理员账号列表（供询盘分配等下拉使用）")
async def list_admin_users(
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    """返回全部启用状态的 AdminUser 列表（仅 id + username），不要求特殊权限。"""
    users = await services.list_admin_users()
    return Result.ok(users)


@router.get("/admin/users/list", summary="Backend user list with roles")
async def list_users_admin(
    _user: AdminUser = Depends(require_permission("admin:login")),
) -> Result:
    users = await services.list_users()
    return Result.ok(users)


@router.post("/admin/users", summary="Create backend user（统一管理员权限）")
async def create_user(
    data: CreateUserRequest,
    _user: AdminUser = Depends(require_permission("admin:login")),
) -> Result:
    result = await services.create_user(data.username, data.password)
    return Result.ok(result)


@router.delete("/admin/users/{user_id}", summary="Delete backend user")
async def delete_user(
    user_id: int,
    _user: AdminUser = Depends(require_permission("admin:login")),
) -> Result:
    await services.delete_user(user_id)
    return Result.ok({"id": user_id})


@router.put("/admin/users/{user_id}/reset-password", summary="Reset user password")
async def reset_user_password(
    user_id: int, data: ResetPasswordRequest,
    _user: AdminUser = Depends(require_permission("admin:login")),
) -> Result:
    result = await services.reset_password(user_id, data.new_password)
    return Result.ok(result)


@router.get("/admin/stats", summary="Dashboard statistics")
async def dashboard_stats(
    _user: AdminUser = Depends(require_permission("admin:login")),
) -> Result:
    data = await services.get_dashboard_stats()
    return Result.ok(data)
