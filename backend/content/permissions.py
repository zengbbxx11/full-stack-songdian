"""权限码常量与初始角色→权限映射（M5，§3.2.M5 / §2.2）。

设计约束（§6 RBAC）：
- 权限以**字符串常量**管理（无独立权限实体表）。
- ``RolePermission(role_id, permission_code)`` 多对多建模。
- ``admin`` 角色绑定全部权限码；``operator`` 绑定运营侧读写（不含角色/权限管理）。
"""
from __future__ import annotations

# ── 权限码常量（页面+按钮级）──
PRODUCT_READ = "product:read"
PRODUCT_CREATE = "product:create"
PRODUCT_UPDATE = "product:update"
PRODUCT_DELETE = "product:delete"
PRODUCT_PUBLISH = "product:publish"  # security-audit F-11：发布门禁（operator 不含）

NEWS_READ = "news:read"
NEWS_CREATE = "news:create"
NEWS_UPDATE = "news:update"
NEWS_DELETE = "news:delete"
NEWS_PUBLISH = "news:publish"  # security-audit F-11：发布门禁（operator 不含）

INQUIRY_READ = "inquiry:read"
INQUIRY_UPDATE = "inquiry:update"

ROLE_READ = "role:read"
ROLE_CREATE = "role:create"
ROLE_UPDATE = "role:update"

AUDIT_READ = "audit:read"

ADMIN_LOGIN = "admin:login"

# ── 产品分类（T02）──
CATEGORY_READ = "category:read"
CATEGORY_CREATE = "category:create"
CATEGORY_UPDATE = "category:update"
CATEGORY_DELETE = "category:delete"

# ── 新闻分类（T02）──
NEWS_CATEGORY_READ = "news:category:read"
NEWS_CATEGORY_CREATE = "news:category:create"
NEWS_CATEGORY_UPDATE = "news:category:update"
NEWS_CATEGORY_DELETE = "news:category:delete"

# ── 媒体上传（T03）──
MEDIA_UPLOAD = "media:upload"

# ── 系统设置 ──
SETTINGS_UPDATE = "settings:update"

# 全部权限码
ALL_PERMISSIONS: list[str] = [
    PRODUCT_READ, PRODUCT_CREATE, PRODUCT_UPDATE, PRODUCT_DELETE, PRODUCT_PUBLISH,
    NEWS_READ, NEWS_CREATE, NEWS_UPDATE, NEWS_DELETE, NEWS_PUBLISH,
    INQUIRY_READ, INQUIRY_UPDATE,
    ROLE_READ, ROLE_CREATE, ROLE_UPDATE,
    AUDIT_READ,
    ADMIN_LOGIN,
    CATEGORY_READ, CATEGORY_CREATE, CATEGORY_UPDATE, CATEGORY_DELETE,
    NEWS_CATEGORY_READ, NEWS_CATEGORY_CREATE, NEWS_CATEGORY_UPDATE, NEWS_CATEGORY_DELETE,
    MEDIA_UPLOAD,
    SETTINGS_UPDATE,
]

# 初始角色 → 权限码映射（种子数据使用）
DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(ALL_PERMISSIONS),
    # operator 不含 PUBLISH：创建/编辑后只能落为 DRAFT，由 admin 发布（security-audit F-11）
    "operator": [
        PRODUCT_READ, PRODUCT_CREATE, PRODUCT_UPDATE, PRODUCT_DELETE,
        NEWS_READ, NEWS_CREATE, NEWS_UPDATE, NEWS_DELETE,
        INQUIRY_READ, INQUIRY_UPDATE,
        ADMIN_LOGIN,
        CATEGORY_READ, CATEGORY_CREATE, CATEGORY_UPDATE, CATEGORY_DELETE,
        NEWS_CATEGORY_READ, NEWS_CATEGORY_CREATE, NEWS_CATEGORY_UPDATE, NEWS_CATEGORY_DELETE,
        MEDIA_UPLOAD,
    ],
}

ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
ROLE_SALES = "sales"
