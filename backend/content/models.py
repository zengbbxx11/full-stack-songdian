"""内容管理域模型（M5，O-08~O-11）。

设计约束（§4.2 DDL / 蓝图 §3.6）：表名 t_admin_user / t_role / t_role_permission /
t_audit_log。RBAC 通过 ``RolePermission(role_id, permission_code)`` 关联表建模，
**无独立权限实体表**；权限以 ``content/permissions.py`` 字符串常量管理。
"""
from __future__ import annotations

from tortoise import Model, fields

from common.mixins import TimestampedMixin


class AdminUser(TimestampedMixin, Model):
    id = fields.BigIntField(primary_key=True)
    username = fields.CharField(max_length=64, unique=True)
    password_hash = fields.CharField(max_length=100)
    email = fields.CharField(max_length=200, null=True)
    role = fields.ForeignKeyField("models.Role", related_name="users", on_delete=fields.RESTRICT)
    status = fields.CharField(max_length=30, default="ENABLED")  # ENABLED/DISABLED/LOCKED
    last_login = fields.DatetimeField(null=True)
    login_fail = fields.IntField(default=0)

    class Meta:
        table = "t_admin_user"


class Role(Model):
    id = fields.BigIntField(primary_key=True)
    name = fields.CharField(max_length=100)
    code = fields.CharField(max_length=100, unique=True)  # operator / admin
    remark = fields.CharField(max_length=200, null=True)

    users: fields.ReverseRelation[AdminUser]
    role_permissions: fields.ReverseRelation[RolePermission]

    class Meta:
        table = "t_role"


class RolePermission(Model):
    """RBAC 多对多：角色 → 权限码（页面+按钮级）。无独立权限实体表。"""

    id = fields.BigIntField(primary_key=True)
    role = fields.ForeignKeyField(
        "models.Role", related_name="role_permissions", on_delete=fields.CASCADE
    )
    permission_code = fields.CharField(max_length=100)

    class Meta:
        table = "t_role_permission"
        unique_together = (("role", "permission_code"),)


class AuditLog(Model):
    id = fields.BigIntField(primary_key=True)
    user_id = fields.BigIntField()
    username = fields.CharField(max_length=64)
    action = fields.CharField(max_length=100)
    resource = fields.CharField(max_length=200)
    result = fields.CharField(max_length=30)  # SUCCESS/FAIL
    ip = fields.CharField(max_length=64, null=True)
    created_time = fields.DatetimeField(auto_now_add=True, null=True)

    class Meta:
        table = "t_audit_log"
