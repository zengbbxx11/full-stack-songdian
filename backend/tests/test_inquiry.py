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
from inquiry.models import Inquiry


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
    assert d["received"] is True
    assert d["status"] == "RECEIVED"
    # 公开回执必须最小化：不得暴露提交明细或内部 CRM 字段
    for leaked in (
        "id", "email", "message", "smtp_status", "tags", "follow_notes",
        "assigned_user_id", "assigned_user_name", "last_contact_time",
    ):
        assert leaked not in d, f"公开回执不应包含内部字段 {leaked}"

    # 无 SMTP 配置 → 仅持久化，保持 PENDING（BD-02/MOCK），CRM 状态为 NEW
    async def _stored():
        row = await Inquiry.get(biz_req_no=biz)
        return row.smtp_status, row.status

    smtp_status, crm_status = client.portal.call(_stored)
    assert smtp_status == "PENDING"
    assert crm_status == "NEW"


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
    # 公开回执最小化：归属/明细字段不再随匿名提交返回，需经后台接口核对。
    assert submitted["data"]["biz_req_no"] == biz
    for leaked in ("follow_notes", "assigned_user_id", "tags", "country", "utm_source", "landing_page"):
        assert leaked not in submitted["data"], f"公开回执不应包含 {leaked}"

    async def _fetch_id():
        return (await Inquiry.get(biz_req_no=biz)).id

    inquiry_id = client.portal.call(_fetch_id)

    login = client.post(
        "/api/v1/admin/login",
        json={"username": "admin", "password": "Songdian@2026"},
    )
    assert login.json()["code"] in (0, "0")

    detail = client.get(f"/api/v1/admin/inquiries/{inquiry_id}").json()
    assert detail["code"] in (0, "0"), detail
    record = detail["data"]
    assert record["country"] == "Germany"
    assert record["source_product"] == "dc312x"
    assert record["utm_source"] == "linkedin"
    assert record["landing_page"].startswith("/products/")

    db_path = settings.database_url.removeprefix("sqlite://")
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """UPDATE t_inquiry
               SET created_time = datetime('now', '-2 days'),
                   smtp_status = 'FAILED', smtp_retry = 1
               WHERE id = ?""",
            (inquiry_id,),
        )
        connection.commit()

    filtered = client.get(
        "/api/v1/admin/inquiries",
        params={"country": "germ", "source_product": "312", "utm_source": "link"},
    ).json()
    assert filtered["code"] in (0, "0"), filtered
    assert [item["id"] for item in filtered["data"]["list"]] == [inquiry_id]

    notifications = client.get("/api/v1/admin/notifications").json()
    assert notifications["code"] in (0, "0"), notifications
    inquiry_notices = [
        item for item in notifications["data"]["list"]
        if item["inquiry_id"] == inquiry_id
    ]
    assert {item["type"] for item in inquiry_notices} == {
        "NEW_INQUIRY", "FOLLOW_UP_OVERDUE", "SMTP_FAILED"
    }
    notice = next(
        item for item in inquiry_notices
        if item["key"] == f"inquiry:new:{inquiry_id}"
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
    """同一 biz_req_no：内容一致返回同一回执；内容不一致被拒绝且不重复落库。"""
    biz = f"qa-inq-idem-{uuid.uuid4().hex[:8]}"
    p1 = _base("zhang@example.com", "首次留言", biz)
    d1 = client.post("/api/v1/inquiries", json=p1).json()["data"]
    assert d1["biz_req_no"] == biz
    assert d1["received"] is True
    # 完全相同内容重试 → 返回同结构回执（幂等，不重复落库）
    d2 = client.post("/api/v1/inquiries", json=p1).json()["data"]
    assert d2["biz_req_no"] == biz
    assert d2["received"] is True

    # 不同内容复用同一 biz_req_no → 拒绝，且不回显既有询盘内容
    p3 = _base("zhang@example.com", "第二次不同的留言", biz)
    rejected = client.post("/api/v1/inquiries", json=p3).json()
    assert rejected["code"] == "C400001", rejected
    assert not (rejected.get("data") or {}).get("message")

    async def _count():
        return await Inquiry.filter(biz_req_no=biz).count()

    assert client.portal.call(_count) == 1


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
