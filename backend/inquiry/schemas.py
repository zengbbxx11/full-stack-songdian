"""询盘域 DTO/VO（M4，§3.2.M4.3）。

设计约束：字段与 §3.2.M4.3 / §4.2 DDL 对齐。
- email 仅做必填/长度约束，*格式*校验下沉到 service 层（非法邮箱 → A040001/HTTP 200）。
- message 仅必填，*空/超长*校验下沉到 service 层（→ A040002/HTTP 200）。
- biz_req_no 为幂等键（必填）。status：NEW/CONTACTING/QUOTED/DEAL/LOST（2026-07-31 CRM 升级）。
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from common.enums import InquiryStatus, SmtpStatus


class InquirySubmitRequest(BaseModel):
    name: str = Field(..., max_length=50)
    email: str = Field(..., max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    company: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    product_interest: str | None = Field(default=None, max_length=200)
    message: str | None = Field(default=None)  # 必填/空白/超长校验下沉 service → A040002
    source_page: str | None = Field(default=None, max_length=500)
    biz_req_no: str = Field(..., max_length=100)


class InquiryStatusRequest(BaseModel):
    status: str
    reply_note: str | None = Field(default=None, max_length=1000)
    tags: list[str] | None = None
    country: str | None = None  # 后台手动标记国家

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in InquiryStatus.values():
            raise ValueError("status 必须为 NEW/CONTACTING/QUOTED/DEAL/LOST")
        return v


class InquiryAssignRequest(BaseModel):
    """分配销售人员（2026-07-31 新增）。"""
    assigned_user_id: int | None = Field(default=None, description="AdminUser id，None 表示取消分配")


class FollowNoteRequest(BaseModel):
    """追加跟进记录（2026-07-31 新增）。"""
    note: str = Field(..., max_length=2000, description="跟进内容")


class InquiryVO(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None = None
    company: str | None = None
    country: str | None = None
    product_interest: str | None = None
    message: str
    source_page: str | None = None
    biz_req_no: str
    status: str = InquiryStatus.NEW.value
    smtp_status: str = SmtpStatus.PENDING.value
    smtp_retry: int = 0
    # CRM 字段（2026-07-31）
    assigned_user_id: int | None = None
    assigned_user_name: str | None = None
    tags: list[str] = []
    follow_notes: list[dict] = []    # 列表也返回，供展开行展示时间线
    last_contact_time: datetime | None = None
    created_time: datetime | None = None
    updated_time: datetime | None = None

    @classmethod
    def from_model(cls, m) -> InquiryVO:
        return cls(
            id=m.id, name=m.name, email=m.email, phone=m.phone, company=m.company,
            country=m.country, product_interest=m.product_interest, message=m.message,
            source_page=m.source_page, biz_req_no=m.biz_req_no, status=m.status,
            smtp_status=m.smtp_status, smtp_retry=m.smtp_retry,
            assigned_user_id=getattr(m, "assigned_user_id", None),
            assigned_user_name=getattr(getattr(m, "assigned_user", None), "username", None),
            tags=m.tags or [],
            follow_notes=m.follow_notes or [],
            last_contact_time=m.last_contact_time,
            created_time=m.created_time, updated_time=m.updated_time,
        )


class InquiryDetailVO(InquiryVO):
    reply_note: str | None = None
    follow_notes: list[dict] = []

    @classmethod
    def from_model(cls, m) -> InquiryDetailVO:
        base = InquiryVO.from_model(m)
        data = base.model_dump()
        data["reply_note"] = m.reply_note
        data["follow_notes"] = m.follow_notes or []
        return cls(**data)


InquiryPageVO = InquiryVO
