"""询盘 SMTP 发信封装（M4，§6.3 / BD-02/MOCK）。

设计约束：
- 用标准库 ``smtplib`` + ``email`` 连接 ``SMTP_HOST``（默认 smtp.qq.com:587 STARTTLS）。
- **SMTP_HOST 为空时仅持久化，smtp_status 保持 PENDING（MOCK/BD-02），不报错**。
- 发送结果返回 SmtpStatus：SENT / FAILED。
- smtplib 为阻塞调用，经 ``asyncio.to_thread`` 避免阻塞事件循环。
"""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.text import MIMEText

from common.config import settings
from common.enums import SmtpStatus
from common.logger import get_logger

logger = get_logger(__name__)

# 收件人/发件人缺失时也无法发送
def _can_send() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_user
        and settings.inquiry_email_to
        and settings.inquiry_email_from
    )


def _build_message(name: str, email: str, message: str, **extra: str) -> str:
    lines = [
        f"新询盘来自：{name} <{email}>",
        f"公司：{extra.get('company', '-')}",
        f"国家：{extra.get('country', '-')}",
        f"电话：{extra.get('phone', '-')}",
        f"感兴趣产品：{extra.get('product_interest', '-')}",
        f"来源页：{extra.get('source_page', '-')}",
        "",
        "留言内容：",
        message,
    ]
    return "\n".join(lines)


def _send_sync(
    name: str, email: str, message: str, subject: str, extra: dict
) -> SmtpStatus:
    """同步发送（在 to_thread 中执行）。"""
    if not _can_send():
        # BD-02/MOCK：未配置 SMTP，仅持久化
        logger.info("SMTP 未配置（BD-02/MOCK），跳过发信，保持 PENDING")
        return SmtpStatus.PENDING

    body = _build_message(name, email, message, **extra)
    msg = MIMEText(body, _charset="utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.inquiry_email_from
    msg["To"] = settings.inquiry_email_to

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            if settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(
                settings.inquiry_email_from, [settings.inquiry_email_to], msg.as_string()
            )
        return SmtpStatus.SENT
    except Exception as exc:  # noqa: BLE001
        logger.warning("询盘 SMTP 发信失败（BD-02 降级）：%s", exc)
        return SmtpStatus.FAILED


async def send_inquiry_mail(
    name: str,
    email: str,
    message: str,
    subject: str = "【松典官网】新询盘通知",
    extra: dict | None = None,
) -> SmtpStatus:
    """异步发送询盘通知邮件（经线程池），未配置 SMTP 时返回 PENDING。"""
    extra = extra or {}
    return await asyncio.to_thread(_send_sync, name, email, message, subject, extra)
