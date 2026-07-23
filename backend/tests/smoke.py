"""本地冒烟脚本（SQLite 跑通非搜索接口全链路）。

运行：``python tests/smoke.py``（依赖已激活的 venv）。
覆盖：建表（lifespan）+ 种子 → 登录拿 token → 创建分类/产品/新闻 →
搜索降级路径 → 询盘提交（幂等）→ 后台列表读取。确认全链路无报错。
"""
from __future__ import annotations

import os
import sys

# 本地无 PG / 无 Redis 环境
_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_ROOT))

if os.path.exists(os.path.join(_ROOT, "test.db")):
    try:
        os.remove(os.path.join(_ROOT, "test.db"))
    except OSError:
        pass

os.environ["DATABASE_URL"] = f"sqlite://{os.path.join(_ROOT, 'test.db')}"
os.environ["REDIS_URL"] = ""
os.environ["SEED_ON_START"] = "true"
os.environ["JWT_SECRET"] = "test-secret-for-smoke"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

ADMIN = ("admin", "Songdian@2026")


def _assert_ok(resp, label: str):
    body = resp.json()
    assert body.get("code") in (0, "0"), f"{label} 失败：{body}"
    print(f"  ✓ {label} (HTTP {resp.status_code})")
    return body.get("data")


def _assert_probe(resp, label: str):
    """健康检查探针（liveness/readiness）返回纯状态 dict，不包裹 Result。"""
    assert resp.status_code == 200, f"{label} 失败：HTTP {resp.status_code}"
    body = resp.json()
    assert body.get("status") in ("alive", "ready", "ok"), f"{label} 失败：{body}"
    print(f"  ✓ {label} (HTTP {resp.status_code}, status={body.get('status')})")
    return body


def main() -> None:
    print("== 松典后端本地冒烟（SQLite + Redis 降级）==")
    with TestClient(app) as client:
        # 1) 健康检查（探针返回纯状态，不包裹 Result）
        _assert_probe(client.get("/healthz"), "healthz")
        _assert_probe(client.get("/readyz"), "readyz")

        # 2) 登录
        login = client.post("/api/v1/admin/login", json={"username": ADMIN[0], "password": ADMIN[1]})
        data = _assert_ok(login, "admin login")
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3) 产品分类（种子已注入，取第一个 id）
        cats = _assert_ok(client.get("/api/v1/product-categories"), "list product-categories")
        category_id = cats[0]["id"]

        # 4) 创建产品
        prod = client.post(
            "/api/v1/admin/products",
            headers=headers,
            json={
                "title": "Smoke Test Camera",
                "slug": "smoke-test-camera",
                "summary": "冒烟测试相机",
                "content_html": "<p>hello <script>alert(1)</script> world</p>",
                "category_id": category_id,
                "price": 1999.00,
                "stock_status": "instock",
                "status": "PUBLISHED",
            },
        )
        pdata = _assert_ok(prod, "create product")
        # HTML 清洗断言（script 被去除）
        assert "<script>" not in pdata["content_html"], "content_html 未清洗 XSS"
        slug = pdata["slug"]

        # 5) 产品详情
        _assert_ok(client.get(f"/api/v1/products/{slug}"), "get product detail")

        # 6) 新闻分类 + 创建新闻
        ncats = _assert_ok(client.get("/api/v1/news-categories"), "list news-categories")
        ncategory_id = ncats[0]["id"]
        news = client.post(
            "/api/v1/admin/news",
            headers=headers,
            json={
                "title": "Smoke Test News",
                "slug": "smoke-test-news",
                "summary": "冒烟测试新闻",
                "content_html": "<p>news body</p>",
                "category_id": ncategory_id,
            },
        )
        ndata = _assert_ok(news, "create news")
        nslug = ndata["slug"]
        _assert_ok(client.get(f"/api/v1/news/{nslug}"), "get news detail")

        # 7) 搜索降级路径（SQLite → LIKE）
        sresp = client.get("/api/v1/search", params={"q": "Smoke", "type": "all"})
        sdata = _assert_ok(sresp, "search (degraded LIKE)")
        assert sdata["degraded"] is True, "SQLite 下应标注降级基础检索"
        assert sdata["total"] >= 1, "搜索应至少命中刚创建的产品/新闻"
        print(f"    搜索命中 {sdata['total']} 条，took_ms={sdata['took_ms']}")

        # 8) 询盘提交（幂等）
        inq = client.post(
            "/api/v1/inquiries",
            json={
                "name": "张三",
                "email": "zhangsan@example.com",
                "message": "我想采购一批相机",
                "biz_req_no": "smoke-biz-req-001",
            },
        )
        _assert_ok(inq, "submit inquiry")
        # 幂等：重复 biz_req_no 返回首次结果
        inq2 = client.post(
            "/api/v1/inquiries",
            json={
                "name": "张三",
                "email": "zhangsan@example.com",
                "message": "我想采购一批相机",
                "biz_req_no": "smoke-biz-req-001",
            },
        )
        d2 = _assert_ok(inq2, "submit inquiry (idempotent)")
        assert d2["biz_req_no"] == "smoke-biz-req-001"

        # 9) 后台读取询盘列表（需登录）
        ilist = client.get("/api/v1/admin/inquiries", headers=headers)
        _assert_ok(ilist, "list inquiries (admin)")

        # 10) 角色列表（RBAC 读）
        _assert_ok(client.get("/api/v1/admin/roles", headers=headers), "list roles")

    print("\n✅ 冒烟全部通过：建表/种子/登录/产品/新闻/搜索降级/询盘幂等/后台读取 均无报错。")


if __name__ == "__main__":
    main()
