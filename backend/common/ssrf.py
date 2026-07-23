"""SSRF 防护（security-audit F-03）。

迁移流程需要服务端主动向 WordPress 源站发起 HTTP 请求（拉取 REST 数据与图片）。
为防止被诱导访问内网/元数据服务等内部地址，统一在此校验目标 URL：
- 仅允许 http/https；
- 显式 ``allowed_hosts`` 非空时，仅放行这些主机（最安全）；
- 未显式白名单时，拒绝任何解析到私网/回环/链路本地/云元数据段的主机。
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

# 云元数据 / 保留地址段（一律拒绝，含 169.254.169.254 等云元数据）
_BLOCKED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _host_is_blocked(host: str) -> bool:
    """解析主机名并判断是否命中内网/回环/元数据段（解析失败保守拒绝）。"""
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:  # noqa: BLE001
        return True
    for info in infos:
        addr_str = info[4][0]
        try:
            addr = ipaddress.ip_address(addr_str)
        except ValueError:
            continue
        for net in _BLOCKED_NETS:
            if addr in net:
                return True
    return False


def is_safe_http_url(url: str, allowed_hosts: list[str] | None = None) -> bool:
    """是否允许本服务发起的对外请求（迁移源站 / 图片下载）。

    - 仅 http/https；
    - ``allowed_hosts`` 非空 → 仅放行其中的主机（netloc 或 hostname）；
    - ``allowed_hosts`` 为空 → 拒绝任何命中内网/回环/元数据的主机（fail-safe）。
    """
    allowed = [h for h in (allowed_hosts or []) if h]
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    if allowed:
        return parsed.netloc in allowed or parsed.hostname in allowed
    # 无显式白名单：拒绝内网/回环/元数据主机
    if _host_is_blocked(parsed.hostname or ""):
        return False
    return True
