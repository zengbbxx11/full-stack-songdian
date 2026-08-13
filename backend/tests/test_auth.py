"""M5 鉴权 / RBAC / 审计测试（§3.2.M5 / §6.6）。

覆盖：
- 未带 token 访问 /admin/* → C401001（401）。
- 错误密码 → A050002。
- 连续 5 次错误密码 → 账号锁定（第 6 次正确密码仍失败，msg 含「锁定」）。
- 登录成功拿 access_token；roles 含 admin；permissions 含 product:create。
- 用该 token 访问需权限接口成功。
- 创建产品后 t_audit_log 应有对应审计记录（审计装饰器生效）。
"""
from __future__ import annotations

import uuid

ADMIN = ("admin", "Songdian@2026")


def _admin_headers(client) -> dict:
    resp = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("code") in (0, "0"), body
    return {}


def test_admin_endpoint_requires_token_C401001(client):
    r = client.get("/api/v1/admin/roles")
    assert r.status_code == 401, r.text
    assert r.json()["code"] == "C401001", r.json()


def test_login_wrong_password_A050002(client):
    r = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": "wrong-password"})
    assert r.status_code == 200
    assert r.json()["code"] == "A050002", r.json()


def test_login_success_sets_httponly_cookie_and_claims(client):
    r = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    body = r.json()
    assert body["code"] in (0, "0"), body
    d = body["data"]
    assert "access_token" not in d
    assert "refresh_token" not in d
    assert client.cookies.get("access_token")
    assert client.cookies.get("refresh_token")
    assert "admin" in d["roles"]
    assert "product:create" in d["permissions"]


def test_protected_endpoint_with_valid_token(client):
    h = _admin_headers(client)
    r = client.get("/api/v1/admin/roles", headers=h)
    assert r.status_code == 200
    assert r.json()["code"] in (0, "0"), r.json()


def test_profile_can_update_username(client):
    _admin_headers(client)
    updated = client.put("/api/v1/admin/profile", json={"username": "  account-owner  "})
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["username"] == "account-owner"

    profile = client.get("/api/v1/admin/profile")
    assert profile.status_code == 200, profile.text
    assert profile.json()["data"]["username"] == "account-owner"


def test_profile_password_update_checks_current_password(client):
    _admin_headers(client)
    rejected = client.put(
        "/api/v1/admin/profile",
        json={"current_password": "incorrect", "new_password": "NewStrongPassword1"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["code"] != "0"


def test_profile_rejects_password_shorter_than_ui_minimum(client):
    _admin_headers(client)
    rejected = client.put(
        "/api/v1/admin/profile",
        json={"current_password": ADMIN[1], "new_password": "short"},
    )
    assert rejected.status_code == 400, rejected.text
    assert rejected.json()["code"] == "C400001"


def test_refresh_rotates_cookie_pair_and_logout_revokes_session(client):
    _admin_headers(client)
    old_access = client.cookies.get("access_token")
    old_refresh = client.cookies.get("refresh_token")

    refreshed = client.post("/api/v1/admin/refresh")
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["code"] in (0, "0"), refreshed.json()
    assert "access_token" not in refreshed.json()["data"]
    assert client.cookies.get("access_token") != old_access
    assert client.cookies.get("refresh_token") != old_refresh

    logged_out = client.post("/api/v1/admin/logout")
    assert logged_out.status_code == 200, logged_out.text
    assert client.get("/api/v1/admin/profile").status_code == 401


def test_admin_write_rejects_untrusted_browser_origin(client):
    r = client.post(
        "/api/v1/admin/login",
        headers={"Origin": "https://attacker.example"},
        json={"username": ADMIN[0], "password": ADMIN[1]},
    )
    assert r.status_code == 403, r.text
    assert r.json()["code"] == "C403001", r.json()


def test_admin_settings_are_initialized_lazily(client):
    h = _admin_headers(client)
    r = client.get("/api/v1/admin/settings", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert {"ga_id", "google_verification", "smtp_host", "smtp_password"} <= set(data)


def test_account_lock_after_five_failures(client):
    """连续 5 次错误密码 → 锁定；第 6 次正确密码仍失败（status=LOCKED，再次登录失败）。"""
    # 1~5 次错误密码
    for i in range(5):
        r = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": f"wrong-{i}"})
        assert r.json()["code"] == "A050002", r.json()
    # 第 6 次正确密码 → 仍失败（已锁定），msg 含「锁定」
    r = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
    body = r.json()
    assert body["code"] == "A050002", body
    assert "锁定" in body["msg"], f"锁定态应提示账号已锁定，实际 msg={body['msg']}"


def test_audit_log_after_create_product(client):
    """创建产品（@audit product.create）后，审计日志应有对应记录。"""
    h = _admin_headers(client)
    cat = client.get("/api/v1/product-categories").json()["data"][0]["id"]
    slug = f"qa-audit-{uuid.uuid4().hex[:8]}"
    client.post(
        "/api/v1/admin/products",
        headers=h,
        json={
            "title": "QA Audit Product", "slug": slug, "summary": "s",
            "content_html": "<p>x</p>", "category_id": cat, "status": "PUBLISHED",
        },
    )
    r = client.get("/api/v1/admin/audit-logs", headers=h)
    body = r.json()
    assert body["code"] in (0, "0"), body
    actions = [a["action"] for a in body["data"]["list"]]
    assert "product.create" in actions, f"审计日志缺少 product.create，实际：{actions}"
