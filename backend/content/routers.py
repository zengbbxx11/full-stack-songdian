"""内容管理路由（M5，§3.2.M5.2）。

路径前缀 /api/v1。
- 公开：/admin/login、/admin/refresh。
- 需登录：/admin/logout、/admin/roles、/admin/roles/{id}/permissions、/admin/audit-logs，
  并按 RBAC 权限码校验（role:read / role:create / role:update / audit:read）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from common.audit import audit
from common.config import settings
from common.deps import get_current_user, require_permission
from common.ratelimit import login_rate_limit
from common.result import PageRequest, PageResponse, Result
from content import services
from content.models import AdminUser
from content.schemas import (
    LoginRequest,
    ProfileVO,
    RefreshRequest,
    RoleCreateRequest,
    RolePermRequest,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/api/v1", tags=["content"])

_bearer = HTTPBearer(auto_error=False)


@router.post("/admin/login", summary="后台登录")
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    _rl=Depends(login_rate_limit),
) -> Result:
    ip = request.scope.get("client_ip", "unknown")
    vo = await services.login(data.username, data.password, ip=ip)
    # security-audit 认证加固（F-08 相关）：登录同时下发 HttpOnly Cookie（access/refresh），
    # 浏览器自动随同域请求携带、JS 不可读，降低 XSS 窃取令牌风险（前端仍以 Bearer 为主，Cookie 为纵深防御）。
    # Secure 按请求协议判定：https（含反向代理下发的 X-Forwarded-Proto）才置 Secure，
    # 否则 http://localhost 开发环境浏览器会拒绝存储该 Cookie 导致守卫失效。
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    secure = request.url.scheme == "https" or forwarded_proto == "https"
    response.set_cookie(
        "access_token", vo.access_token, max_age=settings.access_token_ttl,
        httponly=True, secure=secure, samesite="lax",
    )
    response.set_cookie(
        "refresh_token", vo.refresh_token, max_age=settings.refresh_token_ttl,
        httponly=True, secure=secure, samesite="lax",
    )
    return Result.ok(vo.model_dump(mode="json"))


@router.post("/admin/logout", summary="登出")
async def logout(
    request: Request,
    response: Response,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    if creds:
        await services.logout(creds.credentials)
    # 清除 HttpOnly Cookie（前端 document.cookie 无法清除 HttpOnly，必须由后端下发过期 Cookie）。
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return Result.ok(msg="已登出")


@router.post("/admin/refresh", summary="刷新令牌（无感刷新）")
@audit(action="auth.refresh", resource="token:refresh")
async def refresh_token(
    data: RefreshRequest,
    request: Request,
) -> Result:
    # 该端点不需要 access token；仅需传入合法的 refresh token。
    # @audit 记录刷新动作的成败（操作人此处为匿名，因端点本身不依赖 access 鉴权）。
    vo = await services.refresh(data.refresh_token)
    return Result.ok(vo.model_dump(mode="json"))


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


@router.get("/admin/stats", summary="仪表盘统计数据")
async def dashboard_stats(
    _user: AdminUser = Depends(get_current_user),
) -> Result:
    """返回产品/新闻/询盘计数 + 询盘趋势（近 30 天）+ 国家分布。"""
    data = await services.get_dashboard_stats()
    return Result.ok(data)
