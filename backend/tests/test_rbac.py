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
from content.models import AdminUser, Role
from main import app
from seed.seed_data import run_seed

ADMIN = ("admin", "Songdian@2026")


def _admin_headers(client) -> dict:
    resp = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    body = resp.json()
    assert body.get("code") in (0, "0"), body
    return {"Authorization": f"Bearer {body['data']['access_token']}"}


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
            token = lbody["data"]["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # operator 无 role:read → 访问角色列表应 403 C403001
            r1 = await ac.get("/api/v1/admin/roles", headers=headers)
            assert r1.status_code == 403, r1.text
            assert r1.json()["code"] == "C403001", r1.json()

            # operator 有 product:create → 创建产品应成功
            cats = (await ac.get("/api/v1/product-categories")).json()["data"]
            cid = cats[0]["id"]
            # slug 必须匹配 ^[a-z0-9-]+$（不可含下划线），否则触发校验
            slug = "qa-op-prod-" + uuid.uuid4().hex[:8]
            r2 = await ac.post(
                "/api/v1/admin/products", headers=headers,
                json={
                    "title": "Op Product", "slug": slug, "summary": "s",
                    "content_html": "<p>x</p>", "category_id": cid, "status": "PUBLISHED",
                },
            )
            assert r2.status_code == 200, r2.text
            assert r2.json()["code"] in (0, "0"), r2.json()

        await close_db()

    asyncio.run(_run())
