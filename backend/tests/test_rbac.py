"""M5 角色 / RBAC 权限测试（§3.2.M5.2 / §3.5.1）。

覆盖：
- GET /admin/roles 列出种子角色（admin / operator）。
- POST /admin/roles 创建角色 + PUT /admin/roles/{id}/permissions 绑定权限码。
- **低权限角色**：以 operator 角色（无 role:read）登录 → 访问 /admin/roles 返回
  C403001（403，无权限）；但该角色拥有 product:create → 创建产品成功。
  该用例通过 ASGITransport 自管 Tortoise 生命周期（避免与 TestClient 事件循环冲突），
  并直接落库一个 operator 用户以取得低权限 token。
"""
from __future__ import annotations

import asyncio
import uuid

import httpx
from httpx import ASGITransport

from common.config import close_db, init_db
from common.password import hash_password
from common.settings_model import Setting
from common.settings_router import PUBLIC_SETTING_KEYS, SMTP_PASSWORD_MASK, ensure_admin_settings
from content.models import AdminUser, Role
from news.models import NewsCategory
from product.models import ProductCategory
from main import app
from seed.seed_data import run_seed

ADMIN = ("admin", "Songdian@2026")


def _admin_headers(client) -> dict:
    resp = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    body = resp.json()
    assert body.get("code") in (0, "0"), body
    return {}


def test_roles_list_create_and_bind(client):
    h = _admin_headers(client)
    # 列表含种子角色
    r = client.get("/api/v1/admin/roles", headers=h)
    body = r.json()
    assert body["code"] in (0, "0"), body
    codes = [x["code"] for x in body["data"]]
    assert "admin" in codes and "operator" in codes

    # 创建角色
    code = "qa_role_" + uuid.uuid4().hex[:8]
    r2 = client.post(
        "/api/v1/admin/roles", headers=h,
        json={"name": "QA Role", "code": code, "remark": "qa"},
    )
    b2 = r2.json()
    assert b2["code"] in (0, "0"), b2
    assert b2["data"]["code"] == code
    rid = b2["data"]["id"]

    # 绑定权限码
    r3 = client.put(
        f"/api/v1/admin/roles/{rid}/permissions", headers=h,
        json={"permission_codes": ["product:read", "news:read"]},
    )
    b3 = r3.json()
    assert b3["code"] in (0, "0"), b3
    assert set(b3["data"]["permissions"]) == {"product:read", "news:read"}


def test_low_permission_role_forbidden_but_allowed():
    """低权限（operator）token：无 role:read → /admin/roles 返回 C403001；
    有 product:create → 创建产品成功。验证 RBAC 越权防护与正确放行。"""

    async def _run():
        await init_db()
        await run_seed()
        assert await ProductCategory.all().count() == 0
        assert await NewsCategory.all().count() == 0
        await ProductCategory.create(name="QA Category", slug=f"qa-category-{uuid.uuid4().hex[:8]}")
        op = await Role.get_or_none(code="operator")
        assert op is not None, "种子应含 operator 角色"
        uname = "qa_operator_" + uuid.uuid4().hex[:8]
        await AdminUser.create(
            username=uname,
            password_hash=hash_password("Qa@pass123"),
            role_id=op.id,
            status="ENABLED",
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 以 operator 登录
            lr = await ac.post("/api/v1/admin/login", json={"username": uname, "password": "Qa@pass123"})
            lbody = lr.json()
            assert lbody["code"] in (0, "0"), lbody
            # operator 无 role:read → 访问角色列表应 403 C403001
            r1 = await ac.get("/api/v1/admin/roles")
            assert r1.status_code == 403, r1.text
            assert r1.json()["code"] == "C403001", r1.json()

            # operator 有 product:create → 创建产品应成功
            cats = (await ac.get("/api/v1/product-categories")).json()["data"]
            cid = cats[0]["id"]
            # slug 必须匹配 ^[a-z0-9-]+$（不可含下划线），否则触发校验
            slug = "qa-op-prod-" + uuid.uuid4().hex[:8]
            r2 = await ac.post(
                "/api/v1/admin/products",
                json={
                    "title": "Op Product", "slug": slug, "summary": "s",
                    "content_html": "<p>x</p>", "category_id": cid, "status": "PUBLISHED",
                },
            )
            assert r2.status_code == 200, r2.text
            assert r2.json()["code"] in (0, "0"), r2.json()

        await close_db()

    asyncio.run(_run())


def test_settings_read_is_scoped_for_low_permission_role():
    """方案 C：无 settings:update 的账号只能读到公开白名单项。

    真实缺口：`GET /admin/settings` 过去只校验登录，任何账号都能拿到
    `smtp_host` / `smtp_user` / `inquiry_email_from` / `inquiry_email_to`
    （内部 SMTP 主机与业务收发件箱）。现在读范围随权限收缩。
    """

    async def _run():
        await init_db()
        await run_seed()
        op = await Role.get_or_none(code="operator")
        assert op is not None, "种子应含 operator 角色"
        uname = "qa_settings_op_" + uuid.uuid4().hex[:8]
        await AdminUser.create(
            username=uname,
            password_hash=hash_password("Qa@pass123"),
            role_id=op.id,
            status="ENABLED",
        )
        # 先让设置行惰性创建并写入敏感值，确保"读不到"不是因为行不存在
        await ensure_admin_settings()
        smtp_host = await Setting.get(key="smtp_host")
        smtp_host.value = "smtp.internal.example.com"
        await smtp_host.save()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            login = await ac.post("/api/v1/admin/login", json={"username": uname, "password": "Qa@pass123"})
            assert login.json()["code"] in (0, "0"), login.json()
            scoped = (await ac.get("/api/v1/admin/settings")).json()
            assert scoped["code"] in (0, "0"), scoped
            keys = set(scoped["data"].keys())
            for sensitive in ("smtp_host", "smtp_user", "inquiry_email_from", "inquiry_email_to", "smtp_password"):
                assert sensitive not in keys, f"{sensitive} 不应出现在低权账号的响应里：{sorted(keys)}"
            # 公开项仍可见，保证设置页能正常渲染
            assert "ga_id" in keys
            assert set(keys) <= set(PUBLIC_SETTING_KEYS)

        await close_db()

    asyncio.run(_run())


def test_settings_read_includes_sensitive_keys_for_admin(client):
    """对照组：具备 settings:update 的账号仍能拿到全部设置项（且授权码脱敏）。"""
    _admin_headers(client)
    body = client.get("/api/v1/admin/settings").json()
    assert body["code"] in (0, "0"), body
    data = body["data"]
    assert "smtp_host" in data
    assert "inquiry_email_to" in data
    assert body["code"] in (0, "0")
    if data.get("smtp_password", {}).get("value"):
        assert data["smtp_password"]["value"] == SMTP_PASSWORD_MASK
