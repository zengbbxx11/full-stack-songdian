"""M4 询盘服务测试（§3.2.M4 / §6.3 / BD-02）。

覆盖：
- 提交成功返回 InquiryVO；smtp_status=PENDING（无 SMTP 配置，BD-02 降级）。
- biz_req_no 重复提交返回**首次结果**（幂等）。
- 邮箱非法 → 设计契约 A040001（HTTP 200 业务码）。
- 留言缺失 / 超长 → 设计契约 A040002。
- 留言为空串 / 纯空白 → A040002（服务端业务校验路径）。

注：邮箱格式与留言长度在源码中以 pydantic field_validator 拦截，
会先触发 HTTP 层校验错误（C400001 / 400）；而设计 §3.5.1 明确要求
A040001 / A040002（HTTP 200 业务码）。本文件按**设计契约**断言，
若实际返回 C400001 即暴露源码与契约不符（详见测试报告 → 路由 Engineer）。
"""
from __future__ import annotations

import sqlite3
import uuid

from common.config import settings


def _base(email: str, message: str, biz: str, **extra) -> dict:
    payload = {
        "name": "张三",
        "email": email,
        "message": message,
        "biz_req_no": biz,
    }
    payload.update(extra)
    return payload


def test_submit_inquiry_success(client):
    biz = f"qa-inq-ok-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/inquiries", json=_base("zhang@example.com", "我想采购一批相机", biz))
    body = r.json()
    assert body["code"] in (0, "0"), body
    d = body["data"]
    assert d["biz_req_no"] == biz
    assert d["email"] == "zhang@example.com"
    assert d["status"] == "NEW"
    # 无 SMTP 配置 → 仅持久化，保持 PENDING（BD-02/MOCK）
    assert d["smtp_status"] == "PENDING", d


def test_inquiry_attribution_filters_and_notifications(client):
    biz = f"qa-inq-source-{uuid.uuid4().hex[:8]}"
    payload = _base(
        "buyer@example.com",
        "Please quote this camera project",
        biz,
        country="Germany",
        product_interest="compact-digital-cameras",
        source_page="/contact?product=dc312x",
        landing_page="/products/compact-camera/dc312x?utm_source=linkedin",
        source_product="dc312x",
        referrer="https://www.linkedin.com/",
        utm_source="linkedin",
        utm_medium="paid-social",
        utm_campaign="summer-camera",
    )
    submitted = client.post("/api/v1/inquiries", json=payload).json()
    assert submitted["code"] in (0, "0"), submitted
    inquiry = submitted["data"]
    assert inquiry["country"] == "Germany"
    assert inquiry["source_product"] == "dc312x"
    assert inquiry["utm_source"] == "linkedin"
    assert inquiry["landing_page"].startswith("/products/")

    login = client.post(
        "/api/v1/admin/login",
        json={"username": "admin", "password": "Songdian@2026"},
    )
    assert login.json()["code"] in (0, "0")

    db_path = settings.database_url.removeprefix("sqlite://")
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """UPDATE t_inquiry
               SET created_time = datetime('now', '-2 days'),
                   smtp_status = 'FAILED', smtp_retry = 1
               WHERE id = ?""",
            (inquiry["id"],),
        )
        connection.commit()

    filtered = client.get(
        "/api/v1/admin/inquiries",
        params={"country": "germ", "source_product": "312", "utm_source": "link"},
    ).json()
    assert filtered["code"] in (0, "0"), filtered
    assert [item["id"] for item in filtered["data"]["list"]] == [inquiry["id"]]

    notifications = client.get("/api/v1/admin/notifications").json()
    assert notifications["code"] in (0, "0"), notifications
    inquiry_notices = [
        item for item in notifications["data"]["list"]
        if item["inquiry_id"] == inquiry["id"]
    ]
    assert {item["type"] for item in inquiry_notices} == {
        "NEW_INQUIRY", "FOLLOW_UP_OVERDUE", "SMTP_FAILED"
    }
    notice = next(
        item for item in inquiry_notices
        if item["key"] == f"inquiry:new:{inquiry['id']}"
    )
    assert notice["read"] is False

    marked = client.post(
        "/api/v1/admin/notifications/read",
        json={"notification_keys": [notice["key"]]},
    ).json()
    assert marked["code"] in (0, "0"), marked
    updated = next(item for item in marked["data"]["list"] if item["key"] == notice["key"])
    assert updated["read"] is True


def test_submit_inquiry_idempotent(client):
    """biz_req_no 重复提交返回首次结果（不重复落库）。"""
    biz = f"qa-inq-idem-{uuid.uuid4().hex[:8]}"
    p1 = _base("zhang@example.com", "首次留言", biz)
    r1 = client.post("/api/v1/inquiries", json=p1)
    d1 = r1.json()["data"]
    # 第二次用相同 biz_req_no 但不同留言
    p2 = _base("zhang@example.com", "第二次不同的留言", biz)
    r2 = client.post("/api/v1/inquiries", json=p2)
    d2 = r2.json()["data"]
    assert d2["id"] == d1["id"], "幂等应返回首次结果（同 id）"
    assert d2["biz_req_no"] == biz
    assert d2["message"] == d1["message"], "幂等应返回首次留言内容"


def test_submit_inquiry_invalid_email_A040001(client):
    """邮箱非法 → 设计契约 A040001（HTTP 200 业务码）。

    源码当前行为：field_validator 抛 ValueError → RequestValidationError →
    异常处理器序列化 exc.errors() 时因含 ValueError 对象而 500 崩溃（源码 Bug A）；
    即便修复崩溃，仍返回 C400001/400 而非设计要求的 A040001/200（源码 Bug B）。
    """
    biz = f"qa-inq-email-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/inquiries", json=_base("not-an-email", "留言内容", biz))
    # 校验失败绝不应 500 崩溃（源码 Bug A）
    assert r.status_code != 500, (
        f"非法邮箱导致服务端校验处理器 500 崩溃（源码 Bug A）：{r.text[:300]}"
    )
    # 设计 §3.5.1：非法邮箱 → A040001（HTTP 200 业务码），而非 C400001/400（源码 Bug B）
    assert r.status_code == 200, (
        f"设计 §3.5.1 要求非法邮箱返回 A040001(HTTP 200)；"
        f"实际 HTTP={r.status_code} body={r.text[:300]}"
    )
    body = r.json()
    assert body["code"] == "A040001", (
        f"设计 §3.5.1 要求邮箱非法返回 A040001，实际 code={body.get('code')} "
        f"HTTP={r.status_code} body={body}"
    )


def test_submit_inquiry_empty_message_A040002(client):
    """留言为空白 → 服务端业务校验应返回 A040002（HTTP 200）。"""
    biz = f"qa-inq-empty-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/inquiries", json=_base("a@b.com", "   ", biz))
    body = r.json()
    assert body["code"] == "A040002", (
        f"空白留言应返回 A040002，实际 code={body.get('code')} HTTP={r.status_code} body={body}"
    )


def test_submit_inquiry_missing_message_A040002(client):
    """留言必填缺失 → 设计契约 A040002（HTTP 200 业务码）。

    源码当前以 pydantic 必填校验拦截 → C400001/400，违背 §3.5.1（源码 Bug B）。
    """
    biz = f"qa-inq-miss-{uuid.uuid4().hex[:8]}"
    payload = {"name": "张三", "email": "a@b.com", "biz_req_no": biz}
    r = client.post("/api/v1/inquiries", json=payload)
    assert r.status_code != 500, (
        f"缺失留言不应导致 500 崩溃：{r.text[:300]}"
    )
    assert r.status_code == 200, (
        f"设计 §3.5.1 要求必填缺失返回 A040002(HTTP 200)；"
        f"实际 HTTP={r.status_code} body={r.text[:300]}"
    )
    body = r.json()
    assert body["code"] == "A040002", (
        f"设计 §3.5.1 要求必填缺失返回 A040002，实际 code={body.get('code')} "
        f"HTTP={r.status_code} body={body}"
    )


def test_submit_inquiry_too_long_message_A040002(client):
    """留言超长（>2000）→ 设计契约 A040002（HTTP 200 业务码）。

    源码当前以 pydantic max_length 校验拦截 → C400001/400，违背 §3.5.1（源码 Bug B）。
    """
    biz = f"qa-inq-long-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/inquiries", json=_base("a@b.com", "x" * 2001, biz))
    assert r.status_code != 500, (
        f"超长留言不应导致 500 崩溃：{r.text[:300]}"
    )
    assert r.status_code == 200, (
        f"设计 §3.5.1 要求留言过长返回 A040002(HTTP 200)；"
        f"实际 HTTP={r.status_code} body={r.text[:300]}"
    )
    body = r.json()
    assert body["code"] == "A040002", (
        f"设计 §3.5.1 要求留言过长返回 A040002，实际 code={body.get('code')} "
        f"HTTP={r.status_code} body={body}"
    )
