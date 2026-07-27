"""询盘域服务（M4，§3.2.M4 / §6.3 / §6.5）。

设计约束：
- 提交：幂等（biz_req_no，Redis SETNX 24h），重复提交返回首次结果。
- 持久化后置 smtp_status=PENDING，触发 SMTP；未配置 SMTP 保持 PENDING（BD-02/MOCK）。
- 状态机：NEW→REPLIED/ARCHIVED，REPLIED→ARCHIVED。
"""
from __future__ import annotations

import re

from common.enums import InquiryStatus, SmtpStatus
from common.exceptions import BizException, ErrorCode
from common.idempotency import acquire_idempotency
from common.result import PageRequest
from inquiry.models import Inquiry
from inquiry.schemas import (
    InquiryDetailVO,
    InquiryStatusRequest,
    InquirySubmitRequest,
    InquiryVO,
)
from inquiry.smtp_mailer import send_inquiry_mail

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
        biz_req_no=data.biz_req_no, status=InquiryStatus.NEW.value,
        smtp_status=SmtpStatus.PENDING.value, smtp_retry=0,
    )

    # 触发 SMTP（未配置则保持 PENDING，不报错）
    extra = {
        "company": data.company or "", "country": data.country or "",
        "phone": data.phone or "", "product_interest": data.product_interest or "",
        "source_page": data.source_page or "",
    }
    smtp_status = await send_inquiry_mail(data.name, data.email, data.message, extra=extra)
    inquiry.smtp_status = smtp_status.value
    if smtp_status == SmtpStatus.FAILED:
        inquiry.smtp_retry = (inquiry.smtp_retry or 0) + 1
    await inquiry.save()
    return InquiryVO.from_model(inquiry)


async def list_inquiries(
    req: PageRequest, status: str | None = None
) -> tuple[list[InquiryVO], int]:
    q = Inquiry.all()
    if status is not None:
        q = q.filter(status=status)
    total = await q.count()
    # Inquiry 模型无 sort_order 字段（那是 product/category 拖拽排序用的），
    # 必须约束为真实存在的字段，否则 Tortoise order_by 抛 FieldError → 500。
    order_by = req.order_by or "-created_time"
    _allowed = {"created_time", "id", "status", "name", "email", "company"}
    if order_by.lstrip("-") not in _allowed:
        order_by = "-created_time"
    rows = await q.order_by(order_by).offset(req.offset).limit(req.limit)
    return [InquiryVO.from_model(r) for r in rows], total


async def get_inquiry(inquiry_id: int) -> InquiryDetailVO:
    inquiry = await Inquiry.get_or_none(id=inquiry_id)
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    return InquiryDetailVO.from_model(inquiry)


_ALLOWED_TRANSITIONS = {
    InquiryStatus.NEW.value: {InquiryStatus.REPLIED.value, InquiryStatus.ARCHIVED.value},
    InquiryStatus.REPLIED.value: {InquiryStatus.ARCHIVED.value},
    InquiryStatus.ARCHIVED.value: {InquiryStatus.ARCHIVED.value},
}


async def update_status(inquiry_id: int, data: InquiryStatusRequest) -> InquiryDetailVO:
    inquiry = await Inquiry.get_or_none(id=inquiry_id)
    if inquiry is None:
        raise BizException(ErrorCode.C404001, "询盘不存在")
    allowed = _ALLOWED_TRANSITIONS.get(inquiry.status, set())
    if data.status not in allowed:
        raise BizException(ErrorCode.C400001, f"非法的状态流转：{inquiry.status} → {data.status}")
    inquiry.status = data.status
    if data.reply_note is not None:
        inquiry.reply_note = data.reply_note
    await inquiry.save()
    return InquiryDetailVO.from_model(inquiry)
