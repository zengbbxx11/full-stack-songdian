"""询盘域服务（M4，§3.2.M4 / §6.3 / §6.5）。

设计约束：
- 提交：幂等（biz_req_no，Redis SETNX 24h），重复提交返回首次结果。
- 持久化后置 smtp_status=PENDING，触发 SMTP；未配置 SMTP 保持 PENDING（BD-02/MOCK）。
- 状态机（2026-07-31 CRM 升级）：
  NEW → CONTACTING / LOST
  CONTACTING → QUOTED / LOST
  QUOTED → DEAL / LOST
  LOST 为终态，不可再流转。
"""
from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta

from common.enums import InquiryStatus, SmtpStatus
from common.exceptions import BizException, ErrorCode
from common.idempotency import acquire_idempotency
from common.result import PageRequest
from content.models import AdminUser, NotificationReadState
from inquiry.models import Inquiry
from inquiry.schemas import (
    FollowNoteRequest,
    InquiryAssignRequest,
    InquiryDetailVO,
    InquiryStatusRequest,
    InquirySubmitRequest,
    InquiryVO,
)
from inquiry.smtp_mailer import send_inquiry_mail
from tortoise.expressions import Q

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_MESSAGE = 2000


def _validate_inquiry_request(data: InquirySubmitRequest) -> None:
    """询盘业务校验（§3.5.1，下沉 service 层以确保非法输入走业务码而非 500/400）。

    - 邮箱格式非法 → A040001（HTTP 200）
    - 留言缺失/纯空白/超长(>2000) → A040002（HTTP 200）
    """
    if not _EMAIL_RE.match(data.email or ""):
        raise BizException(ErrorCode.A040001)
    if not data.message or not data.message.strip():
        raise BizException(ErrorCode.A040002)
    if len(data.message) > _MAX_MESSAGE:
        raise BizException(ErrorCode.A040002)


async def submit_inquiry(data: InquirySubmitRequest) -> InquiryVO:
    # 业务校验先行：非法输入直接走 A040001/A040002（HTTP 200），不污染幂等键。
    _validate_inquiry_request(data)

    # 幂等：biz_req_no 占位；重复提交返回首次结果
    first = await acquire_idempotency(f"inquiry:{data.biz_req_no}")
    if not first:
        existing = await Inquiry.get_or_none(biz_req_no=data.biz_req_no)
        if existing is not None:
            return InquiryVO.from_model(existing)
        # 极端情况：键存在但行未落库，继续创建（兜底）

    inquiry = await Inquiry.create(
        name=data.name, email=data.email, phone=data.phone, company=data.company,
        country=data.country, product_interest=data.product_interest,
        message=data.message, source_page=data.source_page,
        landing_page=data.landing_page, source_product=data.source_product,
        referrer=data.referrer, utm_source=data.utm_source,
        utm_medium=data.utm_medium, utm_campaign=data.utm_campaign,
        utm_term=data.utm_term, utm_content=data.utm_content,
        biz_req_no=data.biz_req_no, status=InquiryStatus.NEW.value,
        smtp_status=SmtpStatus.PENDING.value, smtp_retry=0,
    )

    # 触发 SMTP（未配置则保持 PENDING，不报错）
    extra = {
        "company": data.company or "", "country": data.country or "",
        "phone": data.phone or "", "product_interest": data.product_interest or "",
        "source_page": data.source_page or "", "landing_page": data.landing_page or "",
        "source_product": data.source_product or "", "referrer": data.referrer or "",
        "utm_source": data.utm_source or "", "utm_medium": data.utm_medium or "",
        "utm_campaign": data.utm_campaign or "",
    }
    smtp_status = await send_inquiry_mail(data.name, data.email, data.message, extra=extra)
    inquiry.smtp_status = smtp_status.value
    if smtp_status == SmtpStatus.FAILED:
        inquiry.smtp_retry = (inquiry.smtp_retry or 0) + 1
    await inquiry.save()
    return InquiryVO.from_model(inquiry)


async def list_inquiries(
    req: PageRequest,
    status: str | None = None,
    country: str | None = None,
    source_product: str | None = None,
    utm_source: str | None = None,
) -> tuple[list[InquiryVO], int]:
    q = Inquiry.all()
    if status is not None:
        q = q.filter(status=status)
    if country:
        q = q.filter(country__icontains=country.strip())
    if source_product:
        q = q.filter(source_product__icontains=source_product.strip())
    if utm_source:
        q = q.filter(utm_source__icontains=utm_source.strip())
    total = await q.count()
    # Inquiry 模型无 sort_order 字段（那是 product/category 拖拽排序用的），
    # 必须约束为真实存在的字段，否则 Tortoise order_by 抛 FieldError → 500。
    order_by = req.order_by or "-created_time"
    _allowed = {"created_time", "id", "status", "name", "email", "company"}
    if order_by.lstrip("-") not in _allowed:
        order_by = "-created_time"
    rows = await q.order_by(order_by).offset(req.offset).limit(req.limit).select_related("assigned_user")
    return [InquiryVO.from_model(r) for r in rows], total


async def get_inquiry(inquiry_id: int) -> InquiryDetailVO:
    inquiry = await Inquiry.filter(id=inquiry_id).select_related("assigned_user").first()
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    return InquiryDetailVO.from_model(inquiry)


# ── 状态机（2026-07-31 CRM 升级为五态管线） ──
_ALLOWED_TRANSITIONS = {
    InquiryStatus.NEW.value: {InquiryStatus.CONTACTING.value, InquiryStatus.LOST.value},
    InquiryStatus.CONTACTING.value: {InquiryStatus.QUOTED.value, InquiryStatus.LOST.value},
    InquiryStatus.QUOTED.value: {InquiryStatus.DEAL.value, InquiryStatus.LOST.value},
    InquiryStatus.DEAL.value: set(),   # 终态
    InquiryStatus.LOST.value: set(),   # 终态
}


async def update_status(inquiry_id: int, data: InquiryStatusRequest) -> InquiryDetailVO:
    inquiry = await Inquiry.filter(id=inquiry_id).select_related("assigned_user").first()
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    allowed = _ALLOWED_TRANSITIONS.get(inquiry.status, set())
    # 同一状态不变时跳过流转校验（仅更新 tags/reply_note）
    if data.status != inquiry.status and data.status not in allowed:
        raise BizException(ErrorCode.C400001, f"非法的状态流转：{inquiry.status} → {data.status}")
    inquiry.status = data.status
    if data.reply_note is not None:
        inquiry.reply_note = data.reply_note
    if data.tags is not None:
        inquiry.tags = data.tags
    if data.country is not None:
        inquiry.country = data.country
    await inquiry.save()
    return InquiryDetailVO.from_model(inquiry)


async def delete_inquiry(inquiry_id: int) -> None:
    """删除询盘记录。"""
    inquiry = await Inquiry.get_or_none(id=inquiry_id)
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    await inquiry.delete()


# ── CRM 新增操作（2026-07-31） ──

async def assign_user(inquiry_id: int, data: InquiryAssignRequest, operator: AdminUser) -> InquiryDetailVO:
    """分配/取消分配销售人员。"""
    inquiry = await Inquiry.filter(id=inquiry_id).select_related("assigned_user").first()
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    if data.assigned_user_id is not None:
        assignee = await AdminUser.get_or_none(id=data.assigned_user_id)
        if assignee is None:
            raise BizException(ErrorCode.C404001, "被分配的账号不存在")
        inquiry.assigned_user = assignee
    else:
        inquiry.assigned_user = None  # type: ignore[assignment]
    await inquiry.save()
    # 自动追加一条跟进记录
    note_text = f"分配给 {assignee.username}" if data.assigned_user_id else "取消分配"
    await _append_follow_note(inquiry_id, note_text, operator.username)
    return InquiryDetailVO.from_model(inquiry)


async def add_follow_note(inquiry_id: int, data: FollowNoteRequest, operator: AdminUser) -> InquiryDetailVO:
    """追加跟进记录，并更新 last_contact_time。"""
    inquiry = await Inquiry.filter(id=inquiry_id).select_related("assigned_user").first()
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    await _append_follow_note(inquiry_id, data.note, operator.username)
    inquiry.last_contact_time = datetime.now(UTC)
    await inquiry.save()
    return InquiryDetailVO.from_model(inquiry)


async def update_tags(inquiry_id: int, tags: list[str]) -> InquiryDetailVO:
    """整体覆盖标签数组。"""
    inquiry = await Inquiry.filter(id=inquiry_id).select_related("assigned_user").first()
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    inquiry.tags = tags
    await inquiry.save()
    return InquiryDetailVO.from_model(inquiry)


async def _append_follow_note(inquiry_id: int, note: str, username: str) -> None:
    """内部公共：逐条追加跟进时间线记录（不重新查 Inquiry，调用方负责）。"""
    entry = {"time": datetime.now(UTC).isoformat(), "user": username, "note": note}
    # 用原生 update 避免并发覆盖 risk
    from tortoise import connections
    conn = connections.get("default")
    await conn.execute_query(
        """UPDATE "t_inquiry"
           SET follow_notes = COALESCE(follow_notes, '[]'::jsonb) || $1::jsonb
           WHERE id = $2""",
        [f"[{json.dumps(entry)}]", inquiry_id],
    )


async def list_notifications(user: AdminUser) -> dict:
    """Build business notifications from current inquiry state."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=24)
    notifications: list[dict] = []

    new_rows = await Inquiry.filter(status=InquiryStatus.NEW.value).order_by("-created_time").limit(50)
    for row in new_rows:
        notifications.append({
            "key": f"inquiry:new:{row.id}",
            "type": "NEW_INQUIRY",
            "title": "新询盘",
            "message": f"{row.name} 提交了新的询盘",
            "inquiry_id": row.id,
            "created_time": row.created_time,
        })

    active_statuses = [
        InquiryStatus.NEW.value,
        InquiryStatus.CONTACTING.value,
        InquiryStatus.QUOTED.value,
    ]
    overdue_rows = await Inquiry.filter(status__in=active_statuses).filter(
        Q(last_contact_time__isnull=True, created_time__lte=cutoff)
        | Q(last_contact_time__lte=cutoff)
    ).order_by("-created_time").limit(50)
    for row in overdue_rows:
        last_activity = row.last_contact_time or row.created_time
        activity_epoch = int(last_activity.timestamp()) if last_activity else 0
        notifications.append({
            "key": f"inquiry:overdue:{row.id}:{activity_epoch}",
            "type": "FOLLOW_UP_OVERDUE",
            "title": "询盘超过 24 小时未跟进",
            "message": f"{row.name} 的询盘需要跟进",
            "inquiry_id": row.id,
            "created_time": last_activity,
        })

    smtp_rows = await Inquiry.filter(smtp_status__in=["FAILED", "ERROR"]).order_by(
        "-updated_time"
    ).limit(50)
    for row in smtp_rows:
        notifications.append({
            "key": f"inquiry:smtp:{row.id}:{row.smtp_retry or 0}",
            "type": "SMTP_FAILED",
            "title": "询盘邮件发送失败",
            "message": f"{row.name} 的询盘通知邮件未发送成功",
            "inquiry_id": row.id,
            "created_time": row.updated_time or row.created_time,
        })

    notifications.sort(
        key=lambda item: item["created_time"] or datetime.min.replace(tzinfo=UTC), reverse=True
    )
    notifications = notifications[:100]
    read_keys = set(await NotificationReadState.filter(user_id=user.id).values_list(
        "notification_key", flat=True
    ))
    for item in notifications:
        item["read"] = item["key"] in read_keys
        if item["created_time"] is not None:
            item["created_time"] = item["created_time"].isoformat()
    return {
        "list": notifications,
        "unread_count": sum(1 for item in notifications if not item["read"]),
    }


async def mark_notifications_read(
    user: AdminUser, notification_keys: list[str], mark_all: bool = False
) -> dict:
    if mark_all:
        current = await list_notifications(user)
        notification_keys = [item["key"] for item in current["list"]]
    for key in notification_keys:
        await NotificationReadState.get_or_create(user_id=user.id, notification_key=key)
    return await list_notifications(user)
