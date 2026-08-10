"""种子数据（首次部署幂等写入）。

设计约束（§6.5）：
- 产品分类不再由本文件种子：历史种子曾写死 6 个中文产品分类（微单相机/卡片相机/...），
  与 WP 迁移写回的英文分类并存导致前端出现重复选项。产品分类现由 WP 迁移负责，
  故 PRODUCT_CATEGORIES 置空，本文件只负责清理（见 cleanup_categories.py）。
- 2 新闻分类。
- 1 初始 admin（username=admin，bcrypt 密码见 settings.admin_password，角色 admin 绑定全部权限码）。
- admin / operator 角色及其权限映射（来自 content.permissions）。
- 全部基于 get_or_create，已存在则跳过（幂等）。
"""
from __future__ import annotations

import secrets

from common.config import settings
from common.logger import get_logger
from common.password import hash_password, verify_password
from content.models import AdminUser, Role, RolePermission
from content.permissions import (
    DEFAULT_ROLE_PERMISSIONS,
    ROLE_ADMIN,
)
from news.models import NewsCategory
from product.models import ProductCategory

logger = get_logger(__name__)

# 产品分类不再由本文件种子：历史上本列表写死 6 个中文分类，与 WP 迁移写回的
# 英文分类并存，导致前端出现 "Mirrorless Camera" + "微单相机" 等重复选项。
# 现交由 WP 迁移负责；如需一次性清理历史中文分类，请运行 cleanup_categories.py。
# 保留此常量为空列表，_seed_categories 自然跳过产品分类，其余种子逻辑不受影响。
PRODUCT_CATEGORIES: list[dict] = []

NEWS_CATEGORIES: list[dict] = [
    {"name": "企业动态", "slug": "company"},
    {"name": "行业资讯", "slug": "industry"},
]

ADMIN_USERNAME = "admin"
# 初始管理员密码不再硬编码（security-audit F-04）：统一取 settings.admin_password，
# 可由环境变量 ADMIN_PASSWORD 注入；若为空，则生成一次性强随机密码并打印到日志，部署后应立即修改。


def _resolve_admin_password() -> tuple[str, bool]:
    """返回 (密码, 是否本次随机生成)。未配置 ADMIN_PASSWORD 时生成一次性临时密码。"""
    if settings.admin_password:
        return settings.admin_password, False
    return secrets.token_urlsafe(16), True


async def _seed_roles() -> dict:
    role_ids = {}
    for code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role, _ = await Role.get_or_create(
            code=code, defaults={"name": code.capitalize(), "remark": f"种子角色 {code}"}
        )
        # 幂等：全量替换权限
        await RolePermission.filter(role_id=role.id).delete()
        if perms:
            await RolePermission.bulk_create(
                [RolePermission(role_id=role.id, permission_code=p) for p in perms]
            )
        role_ids[code] = role.id
    return role_ids


async def _seed_admin(role_ids: dict) -> None:
    admin_role_id = role_ids.get(ROLE_ADMIN)
    pw, generated = _resolve_admin_password()
    user, created = await AdminUser.get_or_create(
        username=ADMIN_USERNAME,
        defaults={
            "password_hash": hash_password(pw),
            "role_id": admin_role_id,
            "status": "ENABLED",
        },
    )
    if created:
        if generated:
            logger.warning(
                "已创建初始管理员账号 %s，本次使用自动生成的临时密码（请尽快修改）：%s",
                ADMIN_USERNAME, pw,
            )
        else:
            logger.info("已创建初始管理员账号：%s", ADMIN_USERNAME)
    else:
        # 幂等：确保角色与状态正确；并按需修正密码
        user.role_id = admin_role_id
        user.status = "ENABLED"
        if not user.password_hash or verify_password("", user.password_hash):
            # 历史以空密码（或空哈希）播种：补设为一次性随机密码（security-audit F-04）
            user.password_hash = hash_password(pw)
            if generated:
                logger.warning(
                    "管理员账号 %s 密码为空，已重置为自动生成的临时密码（请尽快修改）：%s",
                    ADMIN_USERNAME, pw,
                )
        elif settings.admin_password and not verify_password(settings.admin_password, user.password_hash):
            # 环境变量显式指定了密码且与现有不一致：幂等同步更新
            user.password_hash = hash_password(settings.admin_password)
            logger.info("已按 ADMIN_PASSWORD 同步管理员账号 %s 的密码", ADMIN_USERNAME)
        await user.save()


async def _seed_categories() -> None:
    for c in PRODUCT_CATEGORIES:
        await ProductCategory.get_or_create(
            slug=c["slug"], defaults={"name": c["name"], "sort_order": 0}
        )
    for c in NEWS_CATEGORIES:
        await NewsCategory.get_or_create(
            slug=c["slug"], defaults={"name": c["name"], "sort_order": 0}
        )


async def run_seed() -> None:
    """写入生产最小种子；绝不修改已有产品、新闻或其分类。"""
    role_ids = await _seed_roles()
    await _seed_admin(role_ids)
    if settings.seed_content_categories:
        await _seed_categories()
    logger.info(
        "最小种子写入完成（幂等）：角色 %d / 管理员 %s / 内容分类 %s",
        len(role_ids), ADMIN_USERNAME, "已显式启用" if settings.seed_content_categories else "未写入",
    )


if __name__ == "__main__":
    import asyncio

    from common.config import close_db, init_db

    async def _main() -> None:
        await init_db()
        await run_seed()
        await close_db()

    asyncio.run(_main())
