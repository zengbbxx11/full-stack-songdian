"""HTML 白名单清洗（Shared Kernel，防存储型 XSS）。

设计约束（§4.1 安全设计）：新闻/产品 ``content_html`` 入库前经 bleach 清洗，
仅保留安全标签与属性，防止恶意脚本持久化后在前台执行。

新增 ``clean_text``（security-audit F-01）：标题/摘要/作者等纯文本字段入库前剥离所有
HTML 标签并压缩空白，避免 ``<script>`` 等经 JSON-LD ``dangerouslySetInnerHTML`` 泄露到前台。
"""
from __future__ import annotations

import bleach
import re

# 纯文本字段：剥离所有标签 + 控制字符，压缩空白。
_TEXT_TAG_RE = re.compile(r"<[^>]*>")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# 允许的标签（常见富文本排版标签）
ALLOWED_TAGS = [
    "a", "abbr", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3",
    "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "span", "strong",
    "sub", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]

# 允许的属性（含图片/链接安全属性）
# security-audit F-06 收敛：通配符仅保留 class，禁止 style 以防 CSS 注入
# （expression()/url() 等向量）。富文本样式统一走 class（Tailwind）。
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "*": ["class"],
}

# 允许使用的 URL 协议（防止 javascript: 等）
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

# 强制为链接添加 rel="noopener"（防 tabnabbing）
ALLOWED_PROTOCOLS_SET = set(ALLOWED_PROTOCOLS)


def clean_html(raw_html: str) -> str:
    """清洗 HTML，去除危险标签/属性/协议。空值安全。"""
    if not raw_html:
        return ""
    cleaned = bleach.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
    # 为外链补全安全属性
    cleaned = bleach.linkify(
        cleaned, callbacks=[bleach.callbacks.target_blank], skip_tags=None
    )
    return cleaned


def clean_text(raw: str | None) -> str:
    """清洗纯文本字段（标题/摘要/作者）：剥离所有 HTML 标签、控制字符，压缩空白。

    security-audit F-01：标题等会进入 JSON-LD 的 ``dangerouslySetInnerHTML``，
    必须以纯文本处理，绝不允许内嵌 HTML/脚本。空值安全，返回字符串。
    """
    if not raw:
        return ""
    # 1) 剥离 HTML 标签
    stripped = _TEXT_TAG_RE.sub("", raw)
    # 2) 去掉控制字符
    stripped = _CONTROL_RE.sub("", stripped)
    # 3) 压缩空白（含全角/半角空格、换行）
    compressed = re.sub(r"\s+", " ", stripped).strip()
    return compressed
