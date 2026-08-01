"""询盘 SMTP 发信封装（M4，§6.3 / BD-02/MOCK）。

设计约束：
- 用标准库 ``smtplib`` + ``email`` 连接 SMTP（默认 smtp.qq.com:587 STARTTLS）。
- 配置来源：优先 ``t_setting`` 表（管理后台可改，保存即生效），未配置的项回退环境变量 ``SMTP_*``。
- 完全未配置时仅持久化，smtp_status 保持 PENDING（MOCK/BD-02），不报错。
- 发送结果返回 SmtpStatus：SENT / FAILED / PENDING。
- smtplib 为阻塞调用，经 ``asyncio.to_thread`` 避免阻塞事件循环。
"""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.text import MIMEText

from common.config import settings
from common.enums import SmtpStatus
from common.logger import get_logger
from common.settings_model import Setting

logger = get_logger(__name__)

# t_setting 里的配置键（管理后台「邮件通知」面板）
SMTP_SETTING_KEYS = (
    "smtp_host",
    "smtp_port",
    "smtp_user",
    "smtp_password",
    "inquiry_email_from",
    "inquiry_email_to",
)


async def load_smtp_config() -> dict[str, str]:
    """从 t_setting 读取 SMTP 配置（库优先），缺失项回退环境变量，保证向后兼容。

    返回 dict 含 smtp_host / smtp_port / smtp_user / smtp_password /
    inquiry_email_from / inquiry_email_to，全部为 str（可能为空串）。
    """
    # 环境变量兜底（旧部署方式：SMTP_* / INQUIRY_EMAIL_*）
    cfg: dict[str, str] = {
        "smtp_host": settings.smtp_host or "",
        "smtp_port": str(settings.smtp_port or ""),
        "smtp_user": settings.smtp_user or "",
        "smtp_password": settings.smtp_password or "",
        "inquiry_email_from": settings.inquiry_email_from or "",
        "inquiry_email_to": settings.inquiry_email_to or "",
    }
    # 库配置覆盖（t_setting 存在即优先；生产环境管理后台可在线改）
    rows = await Setting.filter(key__in=SMTP_SETTING_KEYS)
    for r in rows:
        cfg[r.key] = r.value or ""
    return cfg


def _can_send(cfg: dict[str, str]) -> bool:
    """收件人/发件人/主机/账号齐备才可发送。"""
    return bool(
        cfg.get("smtp_host")
        and cfg.get("smtp_user")
        and cfg.get("inquiry_email_to")
        and cfg.get("inquiry_email_from")
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
    cfg: dict[str, str],
    name: str,
    email: str,
    message: str,
    subject: str,
    extra: dict,
) -> SmtpStatus:
    """同步发送（在 to_thread 中执行）。"""
    if not _can_send(cfg):
        # BD-02/MOCK：未配置 SMTP，仅持久化
        logger.info("SMTP 未配置（BD-02/MOCK），跳过发信，保持 PENDING")
        return SmtpStatus.PENDING

    body = _build_message(name, email, message, **extra)
    msg = MIMEText(body, _charset="utf-8")
    msg["Subject"] = subject
    msg["From"] = cfg["inquiry_email_from"]
    msg["To"] = cfg["inquiry_email_to"]

    try:
        port = int(cfg.get("smtp_port") or 587)
        with smtplib.SMTP(cfg["smtp_host"], port, timeout=10) as server:
            server.starttls()
            if cfg.get("smtp_password"):
                server.login(cfg["smtp_user"], cfg["smtp_password"])
            server.sendmail(
                cfg["inquiry_email_from"],
                [cfg["inquiry_email_to"]],
                msg.as_string(),
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
    """异步发送询盘通知邮件（经线程池），未配置 SMTP 时返回 PENDING。

    配置实时从 t_setting 读取：管理后台改 SMTP 后无需重启即生效。
    """
    extra = extra or {}
    cfg = await load_smtp_config()
    return await asyncio.to_thread(_send_sync, cfg, name, email, message, subject, extra)


async def send_test_mail() -> SmtpStatus:
    """发送测试邮件（管理后台「测试发送」按钮）——校验 SMTP 配置可用性。"""
    cfg = await load_smtp_config()
    return await asyncio.to_thread(
        _send_sync,
        cfg,
        "系统测试",
        "smtp-test@local",
        "这是一封来自松典官网管理后台的 SMTP 测试邮件。收到即表示邮件通知配置可用。",
        "【松典】SMTP 配置测试",
        {},
    )
