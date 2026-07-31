"""内容管理域 DTO/VO（M5，§3.2.M5.3）。

设计约束：字段与 §3.2.M5.3 / §4.2 DDL 对齐。
- LoginVO：access_token / refresh_token / roles / permissions。
- RoleVO：含权限码列表。
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class LoginVO(BaseModel):
    access_token: str
    refresh_token: str
    roles: list[str] = []
    permissions: list[str] = []
    # access token 过期的 epoch 秒级时间戳；前端据此计算剩余有效期并触发无感刷新。
    expires_at: int = 0


class RefreshRequest(BaseModel):
    """刷新令牌请求（T01：无感刷新）。"""

    refresh_token: str = Field(..., min_length=1, description="登录时签发的 refresh token")


class RoleCreateRequest(BaseModel):
    name: str = Field(..., max_length=100)
    code: str = Field(..., max_length=100, pattern=r"^[a-z0-9_]+$")
    remark: str | None = Field(default=None, max_length=200)


class RolePermRequest(BaseModel):
    permission_codes: list[str] = Field(default_factory=list)


class UpdateProfileRequest(BaseModel):
    """修改当前登录用户信息。至少提供一个字段。"""
    username: str | None = Field(default=None, max_length=64)
    current_password: str | None = Field(default=None, min_length=1, max_length=128)
    new_password: str | None = Field(default=None, min_length=1, max_length=128)


class ProfileVO(BaseModel):
    id: int
    username: str
    email: str | None = None
    role_name: str | None = None

    @classmethod
    def from_model(cls, user) -> ProfileVO:
        role_name = None
        try:
            role = user.role
            # Tortoise 未 prefetch 时返回 QuerySet，已 prefetch 时返回 Role 对象
            if role is not None and not hasattr(role, "_query"):
                role_name = role.name if hasattr(role, "name") else None
        except Exception:
            pass
        return cls(
            id=user.id, username=user.username, email=user.email,
            role_name=role_name,
        )


class RoleVO(BaseModel):
    id: int
    name: str
    code: str
    remark: str | None = None
    permissions: list[str] = []

    @classmethod
    def from_model(cls, role, permissions: list[str] | None = None) -> RoleVO:
        return cls(
            id=role.id, name=role.name, code=role.code, remark=role.remark,
            permissions=permissions or [],
        )


class AuditPageVO(BaseModel):
    id: int
    user_id: int
    username: str
    action: str
    resource: str
    result: str
    ip: str | None = None
    created_time: datetime | None = None

    @classmethod
    def from_model(cls, m) -> AuditPageVO:
        return cls(
            id=m.id, user_id=m.user_id, username=m.username, action=m.action,
            resource=m.resource, result=m.result, ip=m.ip, created_time=m.created_time,
        )


class CreateUserRequest(BaseModel):
    """新建用户请求 — 所有账号统一管理员权限。"""
    username: str = Field(..., max_length=64)
    password: str = Field(..., max_length=100)


class ResetPasswordRequest(BaseModel):
    """重置密码请求。"""
    new_password: str = Field(..., min_length=4, max_length=100)
